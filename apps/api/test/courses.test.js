import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeApp } from './helpers.js';
import { createCoursesService } from '../src/modules/courses/service.js';

let ctx;
beforeEach(async () => { ctx = await makeApp(); });
afterEach(async () => { await ctx.app.close(); });

describe('cursos', () => {
  it('cria curso manualmente com valores padrão e tags normalizadas', async () => {
    const r = await ctx.call('POST', '/courses', { title: '  Redes  ', tags: ['Redes', 'redes', 'TCP'] });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ title: 'Redes', platform: 'Outro', status: 'active', progress: 0 });
    expect(r.body.data.tags).toEqual(['redes', 'tcp']);
  });

  it('aplica valores padrão também em chamadas diretas ao serviço (seed / Meu Hub)', async () => {
    const svc = createCoursesService(ctx.app.db, ctx.clock);
    const c = svc.create({ title: 'Direto' });
    expect(c).toMatchObject({ title: 'Direto', platform: 'Outro', category: 'Geral', status: 'active', tags: [] });
  });

  it('rejeita título vazio com erro de validação', async () => {
    const r = await ctx.call('POST', '/courses', { title: '   ' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('calcula progresso pelas aulas concluídas e usa o manual quando não há aulas', async () => {
    const manual = (await ctx.call('POST', '/courses', { title: 'Manual', manualProgress: 35 })).body.data;
    expect(manual.progress).toBe(35);

    const c = (await ctx.call('POST', '/courses', { title: 'Com aulas' })).body.data;
    const m = (await ctx.call('POST', `/courses/${c.id}/modules`, { title: 'M1' })).body.data;
    const l1 = (await ctx.call('POST', `/modules/${m.id}/lessons`, { title: 'A1', durationMin: 10 })).body.data;
    await ctx.call('POST', `/modules/${m.id}/lessons`, { title: 'A2', durationMin: 10 });
    await ctx.call('PATCH', `/lessons/${l1.id}`, { completed: true });
    const got = (await ctx.call('GET', `/courses/${c.id}`)).body.data;
    expect(got.progress).toBe(50);
    expect(got.modules[0].lessons.map((l) => l.completed)).toEqual([true, false]);
  });

  it('filtra por status e busca por texto (com caracteres especiais)', async () => {
    await ctx.call('POST', '/courses', { title: 'Linux 100%', status: 'active', tags: ['sistemas'] });
    await ctx.call('POST', '/courses', { title: 'CCNA', status: 'paused', platform: 'NetAcad' });
    expect((await ctx.call('GET', '/courses?status=paused')).body.data.map((c) => c.title)).toEqual(['CCNA']);
    expect((await ctx.call('GET', '/courses?q=sistemas')).body.data).toHaveLength(1);
    expect((await ctx.call('GET', '/courses?q=100%25')).body.data).toHaveLength(1);
    expect((await ctx.call('GET', '/courses?q=%25')).body.data).toHaveLength(1);
  });

  it('muda status; concluir força 100% quando não há aulas', async () => {
    const c = (await ctx.call('POST', '/courses', { title: 'X', manualProgress: 10 })).body.data;
    const done = (await ctx.call('POST', `/courses/${c.id}/status`, { status: 'completed' })).body.data;
    expect(done).toMatchObject({ status: 'completed', progress: 100 });
    const bad = await ctx.call('POST', `/courses/${c.id}/status`, { status: 'nope' });
    expect(bad.status).toBe(400);
  });

  it('atualiza, apaga e responde 404 para curso inexistente', async () => {
    const c = (await ctx.call('POST', '/courses', { title: 'Velho' })).body.data;
    const up = await ctx.call('PATCH', `/courses/${c.id}`, { title: 'Novo', tags: ['a'] });
    expect(up.body.data).toMatchObject({ title: 'Novo', tags: ['a'] });
    expect((await ctx.call('DELETE', `/courses/${c.id}`)).status).toBe(204);
    expect((await ctx.call('GET', `/courses/${c.id}`)).status).toBe(404);
    expect((await ctx.call('GET', '/courses/abc')).status).toBe(404);
  });

  it('resume contagens por status', async () => {
    await ctx.call('POST', '/courses', { title: 'A', status: 'active' });
    await ctx.call('POST', '/courses', { title: 'B', status: 'completed', platform: 'Alura' });
    const s = (await ctx.call('GET', '/courses/summary')).body.data;
    expect(s).toMatchObject({ total: 2, active: 1, completed: 1, paused: 0 });
    expect(s.platforms).toEqual(['Alura', 'Outro']);
  });
});
