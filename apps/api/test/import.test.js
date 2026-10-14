import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeApp } from './helpers.js';
import { udemyKey } from '../src/modules/courses/import.js';

let ctx;
beforeEach(async () => { ctx = await makeApp(); });
afterEach(async () => { await ctx.app.close(); });

const item = (slug, extra = {}) => ({
  title: `Curso ${slug}`,
  url: `https://www.udemy.com/course/${slug}/`,
  progress: 0,
  ...extra,
});

describe('udemyKey', () => {
  it('extrai o slug de variações de link do mesmo curso', () => {
    const k = 'python-completo';
    expect(udemyKey('https://www.udemy.com/course/python-completo/')).toBe(k);
    expect(udemyKey('https://www.udemy.com/course/Python-Completo/learn/lecture/123?src=x#top')).toBe(k);
    expect(udemyKey('https://empresa.udemy.com/course/python-completo')).toBe(k);
  });
  it('aceita o link de painel com course_id e normaliza', () => {
    expect(udemyKey('https://www.udemy.com/course-dashboard-redirect/?course_id=4567')).toBe('id:4567');
    expect(udemyKey('https://www.udemy.com/course-dashboard-redirect/?course_id=4567&x=1#a')).toBe('id:4567');
    expect(udemyKey('https://www.udemy.com/x/?course_id=abc')).toBeNull();
    expect(udemyKey('https://evil.com/x/?course_id=4567')).toBeNull();
  });
  it('rejeita o que não é página de curso da Udemy', () => {
    expect(udemyKey('https://www.udemy.com/user/fulano/')).toBeNull();
    expect(udemyKey('https://evil.com/course/python-completo/')).toBeNull();
    expect(udemyKey('https://notudemy.com/course/x/')).toBeNull();
    expect(udemyKey('javascript:alert(1)')).toBeNull();
    expect(udemyKey('não é url')).toBeNull();
  });
});

describe('importação de cursos da Udemy', () => {
  it('prévia separa novos, existentes e inválidos sem gravar nada', async () => {
    await ctx.call('POST', '/courses', { title: 'Já tenho', url: 'https://www.udemy.com/course/ja-tenho/' });
    const r = await ctx.call('POST', '/courses/import/preview', {
      items: [item('novo-1', { progress: 40 }), item('ja-tenho'), { title: 'X', url: 'https://evil.com/course/x/' }],
    });
    expect(r.status).toBe(200);
    expect(r.body.data.new.map((c) => c.title)).toEqual(['Curso novo-1']);
    expect(r.body.data.new[0]).toMatchObject({ progress: 40, status: 'active' });
    expect(r.body.data.existing).toHaveLength(1);
    expect(r.body.data.invalid).toHaveLength(1);
    const list = (await ctx.call('GET', '/courses')).body.data;
    expect(list).toHaveLength(1);
  });

  it('importa cursos novos como Udemy, com status conforme o progresso', async () => {
    const r = await ctx.call('POST', '/courses/import', {
      items: [item('a', { progress: 0 }), item('b', { progress: 55, instructor: 'Maria' }), item('c', { progress: 100 })],
    });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ created: 3, skipped: 0, invalid: 0 });
    const list = (await ctx.call('GET', '/courses')).body.data;
    const by = Object.fromEntries(list.map((c) => [c.title, c]));
    expect(by['Curso a']).toMatchObject({ platform: 'Udemy', status: 'planned', progress: 0 });
    expect(by['Curso b']).toMatchObject({ status: 'active', progress: 55, description: 'Instrutor: Maria' });
    expect(by['Curso c']).toMatchObject({ status: 'completed', progress: 100 });
    expect(by['Curso a'].url).toBe('https://www.udemy.com/course/a/');
  });

  it('importa e deduplica cursos identificados por course_id', async () => {
    const it1 = { title: 'Painel', url: 'https://www.udemy.com/course-dashboard-redirect/?course_id=99&utm=z', progress: 9 };
    const r = await ctx.call('POST', '/courses/import', { items: [it1] });
    expect(r.body.data.created).toBe(1);
    const c = (await ctx.call('GET', '/courses')).body.data[0];
    expect(c.url).toBe('https://www.udemy.com/course-dashboard-redirect/?course_id=99');
    const again = await ctx.call('POST', '/courses/import', { items: [{ ...it1, url: 'https://www.udemy.com/course-dashboard-redirect/?course_id=99' }] });
    expect(again.body.data).toMatchObject({ created: 0, skipped: 1 });
  });

  it('rodar a importação duas vezes não duplica nem altera cursos existentes', async () => {
    const body = { items: [item('a', { progress: 10 })] };
    await ctx.call('POST', '/courses/import', body);
    const id = (await ctx.call('GET', '/courses')).body.data[0].id;
    await ctx.call('PATCH', `/courses/${id}`, { manualProgress: 70 });
    const again = await ctx.call('POST', '/courses/import', body);
    expect(again.body.data).toMatchObject({ created: 0, skipped: 1 });
    const list = (await ctx.call('GET', '/courses')).body.data;
    expect(list).toHaveLength(1);
    expect(list[0].progress).toBe(70);
  });

  it('ignora duplicados dentro do mesmo envio', async () => {
    const r = await ctx.call('POST', '/courses/import', { items: [item('a'), item('A'), item('a')] });
    expect(r.body.data).toMatchObject({ created: 1, skipped: 2 });
  });

  it('valida o corpo: vazio, grande demais ou progresso fora de 0–100', async () => {
    expect((await ctx.call('POST', '/courses/import', { items: [] })).status).toBe(400);
    const many = Array.from({ length: 501 }, (_, i) => item(`c${i}`));
    expect((await ctx.call('POST', '/courses/import', { items: many })).status).toBe(400);
    expect((await ctx.call('POST', '/courses/import', { items: [item('a', { progress: 150 })] })).status).toBe(400);
  });

  it('título gigante é cortado e texto com HTML é guardado como texto', async () => {
    const r = await ctx.call('POST', '/courses/import', {
      items: [item('a', { title: `<img src=x onerror=alert(1)>${'x'.repeat(300)}` })],
    });
    expect(r.body.data.created).toBe(1);
    const c = (await ctx.call('GET', '/courses')).body.data[0];
    expect(c.title.length).toBe(160);
    expect(c.title.startsWith('<img')).toBe(true);
  });
});

describe('transações aninhadas', () => {
  it('erro no meio da importação desfaz tudo (nada fica pela metade)', async () => {
    const { createLearningCenter } = await import('../src/index.js');
    const lc = createLearningCenter({ db: ctx.app.db, clock: ctx.clock, runMigrations: false });
    const real = lc.courses.create;
    let n = 0;
    const importer = (await import('../src/modules/courses/import.js')).createCourseImporter(ctx.app.db, {
      create: (x) => { if (++n === 2) throw new Error('falha simulada'); return real(x); },
    });
    const items = [item('a'), item('b'), item('c')].map((i) => ({ ...i, progress: 0 }));
    expect(() => importer.run({ items })).toThrow('falha simulada');
    expect((await ctx.call('GET', '/courses')).body.data).toHaveLength(0);
    // e o banco segue utilizável depois do rollback
    expect((await ctx.call('POST', '/courses', { title: 'ok' })).status).toBe(201);
  });
});
