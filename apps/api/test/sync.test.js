import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeApp } from './helpers.js';
import { migrate } from '../src/core/migrate.js';
import { ALL_MIGRATIONS } from './migration-list.js';

let ctx;
beforeEach(async () => { ctx = await makeApp(); });
afterEach(async () => { await ctx.app.close(); });

const lesson = (title, durationMin = 5, completed = false) => ({ title, durationMin, completed });
const content = (extra = {}) => ({
  title: 'Python Completo',
  url: 'https://www.udemy.com/course/python-completo/learn/lecture/1',
  modules: [{ title: 'Seção 1', lessons: [lesson('A', 3, true), lesson('B', 5), lesson('C', 7)] }],
  ...extra,
});
const mk = async (title, extra = {}) => (await ctx.call('POST', '/courses', { title, ...extra })).body.data;
const sync = (body) => ctx.call('POST', '/courses/sync-content', body);
const get = async (id) => (await ctx.call('GET', `/courses/${id}`)).body.data;

describe('sincronização automática do conteúdo', () => {
  it('acha o curso pelo título, importa e já lembra o endereço (slug)', async () => {
    const c = await mk('Python Completo', { url: 'https://www.udemy.com/course-dashboard-redirect/?course_id=7' });
    const r = await sync(content());
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ matched: true, courseId: c.id, courseTitle: 'Python Completo' });
    expect(r.body.data.summary).toMatchObject({ lessonsCreated: 3, lessonsCompleted: 1 });
    expect((await get(c.id)).progress).toBe(33);
    // curso renomeado depois: ainda casa pelo slug que o app lembrou
    await ctx.call('PATCH', `/courses/${c.id}`, { title: 'Nome totalmente diferente' });
    const again = await sync(content({ title: 'Outro título qualquer' }));
    expect(again.body.data).toMatchObject({ matched: true, courseId: c.id });
    expect(again.body.data.summary).toMatchObject({ lessonsCreated: 0, lessonsExisting: 3 });
  });

  it('sincronizar de novo marca só o que mudou (aula nova vista)', async () => {
    const c = await mk('Python Completo');
    await sync(content());
    const updated = content({ modules: [{ title: 'Seção 1', lessons: [lesson('A', 3, true), lesson('B', 5, true), lesson('C', 7)] }] });
    const r = await sync(updated);
    expect(r.body.data.summary).toMatchObject({ lessonsCreated: 0, lessonsCompleted: 1 });
    expect((await get(c.id)).progress).toBe(67);
  });

  it('título repetido em dois cursos é ambíguo: não importa e devolve os candidatos', async () => {
    const a = await mk('Python Completo');
    const b = await mk('python  completo');
    const r = await sync(content());
    expect(r.body.data.matched).toBe(false);
    expect(r.body.data.candidates.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    expect((await get(a.id)).totalLessons).toBe(0);
    expect((await get(b.id)).totalLessons).toBe(0);
  });

  it('curso desconhecido: matched=false, sem candidatos e sem criar nada', async () => {
    await mk('Culinária');
    const r = await sync(content());
    expect(r.body.data).toEqual({ matched: false, candidates: [] });
    expect((await ctx.call('GET', '/courses')).body.data).toHaveLength(1);
  });

  it('título contido em outro só casa se for único', async () => {
    const c = await mk('Python Completo do Zero ao Avançado');
    expect((await sync(content({ title: 'Python Completo', url: '' }))).body.data).toMatchObject({ matched: true, courseId: c.id });
    await mk('Python Completo: Projetos');
    const r = await sync(content({ title: 'Python Completo', url: '' }));
    expect(r.body.data.matched).toBe(false);
    expect(r.body.data.candidates).toHaveLength(2);
  });

  it('dois cursos nunca ficam com o mesmo slug lembrado', async () => {
    const a = await mk('Python Completo');
    await sync(content());
    const b = await mk('Python Completo 2');
    // importação manual de outro curso com o mesmo endereço não rouba o slug de A
    await ctx.call('POST', `/courses/${b.id}/import-content`, { url: content().url, modules: content().modules });
    const next = await sync(content({ title: 'sem relação' }));
    expect(next.body.data).toMatchObject({ matched: true, courseId: a.id });
  });

  it('a importação manual com url também ensina o app a lembrar o curso', async () => {
    const c = await mk('Título que a Udemy não usa');
    await ctx.call('POST', `/courses/${c.id}/import-content`, { url: content().url, modules: content().modules });
    const r = await sync(content({ title: 'Python Completo' }));
    expect(r.body.data).toMatchObject({ matched: true, courseId: c.id });
  });

  it('valida o corpo e não grava nada em caso de erro', async () => {
    await mk('Python Completo');
    expect((await sync({ title: 'x', url: 'u', modules: [] })).status).toBe(400);
    expect((await sync({ modules: [{ title: '', lessons: [] }] })).status).toBe(400);
  });
});

describe('atualização de progresso na importação de cursos', () => {
  const item = (slug, progress) => ({ title: `Curso ${slug}`, url: `https://www.udemy.com/course/${slug}/`, progress });
  const list = async () => Object.fromEntries((await ctx.call('GET', '/courses')).body.data.map((c) => [c.title, c]));

  it('só quando pedido: sem o flag, cursos existentes ficam como estão', async () => {
    await ctx.call('POST', '/courses/import', { items: [item('a', 10)] });
    const r = await ctx.call('POST', '/courses/import', { items: [item('a', 60)] });
    expect(r.body.data.progressUpdated ?? 0).toBe(0);
    expect((await list())['Curso a'].progress).toBe(10);
  });

  it('com updateProgress sobe o progresso, nunca desce, e acerta o status', async () => {
    await ctx.call('POST', '/courses/import', { items: [item('a', 0), item('b', 40), item('c', 10)] });
    const r = await ctx.call('POST', '/courses/import', { updateProgress: true, items: [item('a', 25), item('b', 20), item('c', 100)] });
    expect(r.body.data.progressUpdated).toBe(2);
    const by = await list();
    expect(by['Curso a']).toMatchObject({ progress: 25, status: 'active' }); // planejado → em andamento
    expect(by['Curso b']).toMatchObject({ progress: 40 }); // menor: mantém
    expect(by['Curso c']).toMatchObject({ progress: 100, status: 'completed' });
  });

  it('cursos que já têm aulas não são tocados (o progresso vem das aulas)', async () => {
    await ctx.call('POST', '/courses/import', { items: [item('a', 10)] });
    const c = (await ctx.call('GET', '/courses')).body.data[0];
    await ctx.call('POST', `/courses/${c.id}/import-content`, { modules: [{ title: 'M', lessons: [lesson('X'), lesson('Y')] }] });
    const r = await ctx.call('POST', '/courses/import', { updateProgress: true, items: [item('a', 90)] });
    expect(r.body.data.progressUpdated).toBe(0);
    expect((await get(c.id)).progress).toBe(0);
  });

  it('a prévia informa quantos progressos seriam atualizados e não grava', async () => {
    await ctx.call('POST', '/courses/import', { items: [item('a', 10)] });
    const r = await ctx.call('POST', '/courses/import/preview', { updateProgress: true, items: [item('a', 50)] });
    expect(r.body.data.progressToUpdate).toBe(1);
    expect((await list())['Curso a'].progress).toBe(10);
  });
});

describe('migração 003 (slug lembrado)', () => {
  it('aplica sobre banco existente sem perder dados e impede slug repetido', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lc-mig3-'));
    try {
      for (const f of ['001_init.sql', '002_course_image.sql']) copyFileSync(new URL(`../migrations/${f}`, import.meta.url), join(dir, f));
      const db = new DatabaseSync(':memory:');
      db.exec('PRAGMA foreign_keys = ON;');
      migrate(db, dir);
      db.prepare("INSERT INTO lc_courses (title, platform, category, description, status, manual_progress, created_at, updated_at) VALUES ('Antigo','Udemy','Geral','', 'active', 30, 'a', 'a')").run();
      expect(migrate(db)).toEqual(ALL_MIGRATIONS.slice(2)); // 003 e as seguintes
      expect(db.prepare('SELECT title, manual_progress, udemy_slug FROM lc_courses').get()).toMatchObject({ title: 'Antigo', manual_progress: 30, udemy_slug: null });
      db.prepare("UPDATE lc_courses SET udemy_slug = 'x'").run();
      db.prepare("INSERT INTO lc_courses (title, platform, category, description, status, manual_progress, created_at, updated_at) VALUES ('Outro','Udemy','Geral','', 'active', 0, 'a', 'a')").run();
      expect(() => db.prepare("UPDATE lc_courses SET udemy_slug = 'x' WHERE title = 'Outro'").run()).toThrow();
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
