import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeApp } from './helpers.js';

let ctx;
beforeEach(async () => { ctx = await makeApp(); });
afterEach(async () => { await ctx.app.close(); });

const mkTrack = async (extra = {}) => (await ctx.call('POST', '/tracks', { title: 'Cibersegurança', ...extra })).body.data;
const mkCourse = async (title, extra = {}) => (await ctx.call('POST', '/courses', { title, ...extra })).body.data;
const addCourse = (trackId, courseId) => ctx.call('POST', `/tracks/${trackId}/items`, { courseId });
const addStep = (trackId, title) => ctx.call('POST', `/tracks/${trackId}/items`, { title });
const get = async (id) => (await ctx.call('GET', `/tracks/${id}`)).body.data;

async function lessons(courseId, n, done) {
  const m = (await ctx.call('POST', `/courses/${courseId}/modules`, { title: 'M' })).body.data;
  for (let i = 0; i < n; i += 1) {
    const l = (await ctx.call('POST', `/modules/${m.id}/lessons`, { title: `A${i}`, durationMin: 5 })).body.data;
    if (i < done) await ctx.call('PATCH', `/lessons/${l.id}`, { completed: true });
  }
}

describe('trilhas · criar e listar', () => {
  it('cria com título e descrição; trilha nova vem zerada', async () => {
    const r = await ctx.call('POST', '/tracks', { title: '  Redes do zero  ', description: 'Do básico ao CCNA' });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ title: 'Redes do zero', description: 'Do básico ao CCNA', totalItems: 0, doneItems: 0, progress: 0, next: null, items: [] });
  });

  it('cria já com os cursos, na ordem escolhida, de uma vez só', async () => {
    const a = await mkCourse('A');
    const b = await mkCourse('B');
    const c = await mkCourse('C');
    await lessons(b.id, 2, 2); // B concluído
    const r = await ctx.call('POST', '/tracks', { title: 'Minha trilha', courseIds: [c.id, a.id, b.id] });
    expect(r.status).toBe(201);
    expect(r.body.data.items.map((i) => [i.position, i.title])).toEqual([[1, 'C'], [2, 'A'], [3, 'B']]);
    expect(r.body.data).toMatchObject({ totalItems: 3, doneItems: 1, progress: 33, next: { title: 'C' } });
    expect(r.body.data.items.map((i) => i.isNext)).toEqual([true, false, false]);
  });

  it('criar com cursos: repetido é ignorado; curso inexistente recusa tudo e não deixa trilha pela metade', async () => {
    const a = await mkCourse('A');
    const dup = await ctx.call('POST', '/tracks', { title: 'Dup', courseIds: [a.id, a.id] });
    expect(dup.body.data.items).toHaveLength(1);
    const bad = await ctx.call('POST', '/tracks', { title: 'Ruim', courseIds: [a.id, 999] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_COURSE');
    expect((await ctx.call('GET', '/tracks')).body.data.map((t) => t.title)).toEqual(['Dup']);
    expect((await ctx.call('POST', '/tracks', { title: 'x', courseIds: Array.from({ length: 101 }, (_, i) => i + 1) })).status).toBe(400);
    expect((await ctx.call('POST', '/tracks', { title: 'Vazia', courseIds: [] })).body.data.totalItems).toBe(0);
  });

  it('valida título obrigatório e tamanhos', async () => {
    expect((await ctx.call('POST', '/tracks', { title: '   ' })).status).toBe(400);
    expect((await ctx.call('POST', '/tracks', { title: 'x'.repeat(121) })).status).toBe(400);
    expect((await ctx.call('POST', '/tracks', { title: 'ok', description: 'x'.repeat(1001) })).status).toBe(400);
  });

  it('a lista traz o resumo (progresso e próxima etapa), sem os itens', async () => {
    const t = await mkTrack();
    const c = await mkCourse('Redes');
    await addCourse(t.id, c.id);
    await addStep(t.id, 'Prova');
    const l = (await ctx.call('GET', '/tracks')).body.data;
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ id: t.id, totalItems: 2, doneItems: 0, progress: 0, next: { title: 'Redes', courseId: c.id } });
    expect(l[0].items).toBeUndefined();
  });

  it('404 para trilha inexistente e id inválido', async () => {
    for (const [m, u] of [['GET', '/tracks/999'], ['GET', '/tracks/abc'], ['PATCH', '/tracks/999'], ['DELETE', '/tracks/999']]) {
      expect((await ctx.call(m, u, m === 'PATCH' ? { title: 'x' } : undefined)).status, `${m} ${u}`).toBe(404);
    }
  });

  it('edita título e descrição, e apaga a trilha sem apagar os cursos', async () => {
    const t = await mkTrack();
    const c = await mkCourse('Redes');
    await addCourse(t.id, c.id);
    const r = (await ctx.call('PATCH', `/tracks/${t.id}`, { title: 'Novo nome', description: '' })).body.data;
    expect(r).toMatchObject({ title: 'Novo nome', description: '' });
    expect((await ctx.call('DELETE', `/tracks/${t.id}`)).status).toBe(204);
    expect((await ctx.call('GET', `/tracks/${t.id}`)).status).toBe(404);
    expect((await ctx.call('GET', `/courses/${c.id}`)).status).toBe(200);
  });
});

describe('trilhas · etapas', () => {
  it('adiciona curso e etapa livre, em ordem, com os dados do curso', async () => {
    const t = await mkTrack();
    const c = await mkCourse('Redes', { platform: 'Udemy', category: 'Redes' });
    expect((await addCourse(t.id, c.id)).status).toBe(201);
    expect((await addStep(t.id, 'Prova Security+')).status).toBe(201);
    const got = await get(t.id);
    expect(got.items.map((i) => [i.position, i.kind, i.title])).toEqual([[1, 'course', 'Redes'], [2, 'step', 'Prova Security+']]);
    expect(got.items[0].course).toMatchObject({ id: c.id, platform: 'Udemy', category: 'Redes', progress: 0, status: 'active' });
    expect(got.items[1].course).toBeNull();
  });

  it('título do curso acompanha o curso (se for renomeado, a trilha mostra o novo)', async () => {
    const t = await mkTrack();
    const c = await mkCourse('Antigo');
    await addCourse(t.id, c.id);
    await ctx.call('PATCH', `/courses/${c.id}`, { title: 'Novo' });
    expect((await get(t.id)).items[0].title).toBe('Novo');
  });

  it('recusa curso inexistente, repetido na mesma trilha, e pedido sem curso nem título', async () => {
    const t = await mkTrack();
    const c = await mkCourse('Redes');
    expect((await addCourse(t.id, 999)).body.error.code).toBe('INVALID_COURSE');
    expect((await addCourse(t.id, c.id)).status).toBe(201);
    const dup = await addCourse(t.id, c.id);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_IN_TRACK');
    expect((await ctx.call('POST', `/tracks/${t.id}/items`, {})).status).toBe(400);
    expect((await addStep(t.id, '   ')).status).toBe(400);
    expect((await addStep(999, 'x')).status).toBe(404);
  });

  it('o mesmo curso pode estar em trilhas diferentes', async () => {
    const a = await mkTrack({ title: 'A' });
    const b = await mkTrack({ title: 'B' });
    const c = await mkCourse('Redes');
    expect((await addCourse(a.id, c.id)).status).toBe(201);
    expect((await addCourse(b.id, c.id)).status).toBe(201);
  });

  it('limita o tamanho da trilha (100 etapas)', async () => {
    const t = await mkTrack();
    for (let i = 0; i < 100; i += 1) await addStep(t.id, `E${i}`);
    expect((await addStep(t.id, 'E100')).status).toBe(400);
  });

  it('remove etapa e fecha o buraco na ordem', async () => {
    const t = await mkTrack();
    const ids = [];
    for (const n of ['A', 'B', 'C']) ids.push((await addStep(t.id, n)).body.data.items.at(-1).id);
    expect((await ctx.call('DELETE', `/tracks/${t.id}/items/${ids[1]}`)).status).toBe(204);
    expect((await get(t.id)).items.map((i) => [i.position, i.title])).toEqual([[1, 'A'], [2, 'C']]);
    expect((await ctx.call('DELETE', `/tracks/${t.id}/items/${ids[1]}`)).status).toBe(404);
  });

  it('apagar um curso o tira das trilhas; a trilha continua existindo', async () => {
    const t = await mkTrack();
    const c = await mkCourse('Redes');
    await addCourse(t.id, c.id);
    await addStep(t.id, 'Prova');
    await ctx.call('DELETE', `/courses/${c.id}`);
    expect((await get(t.id)).items.map((i) => i.title)).toEqual(['Prova']);
  });
});

describe('trilhas · progresso e próxima etapa', () => {
  it('progresso do curso vem das aulas; a trilha é a média das etapas', async () => {
    const t = await mkTrack();
    const a = await mkCourse('A');
    const b = await mkCourse('B');
    await lessons(a.id, 4, 4); // 100%
    await lessons(b.id, 4, 1); // 25%
    await addCourse(t.id, a.id);
    await addCourse(t.id, b.id);
    await addStep(t.id, 'Prova');
    const got = await get(t.id);
    expect(got.items.map((i) => [i.progress, i.status])).toEqual([[100, 'done'], [25, 'active'], [0, 'todo']]);
    expect(got).toMatchObject({ totalItems: 3, doneItems: 1, progress: 42 }); // (100+25+0)/3
  });

  it('curso concluído manualmente conta como feito', async () => {
    const t = await mkTrack();
    const c = await mkCourse('X');
    await ctx.call('POST', `/courses/${c.id}/status`, { status: 'completed' });
    await addCourse(t.id, c.id);
    const got = await get(t.id);
    expect(got.items[0]).toMatchObject({ progress: 100, status: 'done' });
    expect(got.progress).toBe(100);
  });

  it('próxima etapa é a primeira não concluída; some quando termina tudo', async () => {
    const t = await mkTrack();
    const a = await mkCourse('A');
    await lessons(a.id, 2, 2);
    await addCourse(t.id, a.id);
    const s = (await addStep(t.id, 'Prova')).body.data.items.at(-1);
    let got = await get(t.id);
    expect(got.next).toMatchObject({ title: 'Prova', courseId: null });
    expect(got.items.map((i) => i.isNext)).toEqual([false, true]);
    await ctx.call('PATCH', `/tracks/${t.id}/items/${s.id}`, { done: true });
    got = await get(t.id);
    expect(got.next).toBeNull();
    expect(got).toMatchObject({ progress: 100, doneItems: 2 });
  });

  it('etapa livre: marcar e desmarcar; curso não aceita marcar à mão', async () => {
    const t = await mkTrack();
    const c = await mkCourse('A');
    const ci = (await addCourse(t.id, c.id)).body.data.items[0];
    const si = (await addStep(t.id, 'Prova')).body.data.items[1];
    expect((await ctx.call('PATCH', `/tracks/${t.id}/items/${si.id}`, { done: true })).body.data.items[1]).toMatchObject({ status: 'done', progress: 100 });
    expect((await ctx.call('PATCH', `/tracks/${t.id}/items/${si.id}`, { done: false })).body.data.items[1]).toMatchObject({ status: 'todo', progress: 0 });
    const bad = await ctx.call('PATCH', `/tracks/${t.id}/items/${ci.id}`, { done: true });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('COURSE_ITEM');
  });

  it('renomear etapa livre', async () => {
    const t = await mkTrack();
    const si = (await addStep(t.id, 'Velho')).body.data.items[0];
    expect((await ctx.call('PATCH', `/tracks/${t.id}/items/${si.id}`, { title: 'Novo' })).body.data.items[0].title).toBe('Novo');
    expect((await ctx.call('PATCH', `/tracks/${t.id}/items/${si.id}`, { title: '  ' })).status).toBe(400);
  });
});

describe('trilhas · ordem', () => {
  async function three() {
    const t = await mkTrack();
    const ids = [];
    for (const n of ['A', 'B', 'C']) ids.push((await addStep(t.id, n)).body.data.items.at(-1).id);
    return { t, ids };
  }

  it('reordena e renumera de 1 a n', async () => {
    const { t, ids } = await three();
    const r = await ctx.call('PUT', `/tracks/${t.id}/order`, { itemIds: [ids[2], ids[0], ids[1]] });
    expect(r.status).toBe(200);
    expect(r.body.data.items.map((i) => [i.position, i.title])).toEqual([[1, 'C'], [2, 'A'], [3, 'B']]);
    expect((await get(t.id)).items.map((i) => i.title)).toEqual(['C', 'A', 'B']);
  });

  it('exige exatamente as mesmas etapas: faltando, sobrando, repetida ou de outra trilha', async () => {
    const { t, ids } = await three();
    const other = await mkTrack({ title: 'Outra' });
    const foreign = (await addStep(other.id, 'X')).body.data.items[0].id;
    for (const bad of [[ids[0], ids[1]], [...ids, 999], [ids[0], ids[0], ids[1]], [ids[0], ids[1], foreign], []]) {
      const r = await ctx.call('PUT', `/tracks/${t.id}/order`, { itemIds: bad });
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await get(t.id)).items.map((i) => i.title)).toEqual(['A', 'B', 'C']);
  });
});
