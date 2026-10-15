import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeApp } from './helpers.js';

let a;
let b;
beforeEach(async () => { a = await makeApp(); b = await makeApp(); });
afterEach(async () => { await a.app.close(); await b.app.close(); });

const IMG = 'https://img-c.udemycdn.com/course/240x135/1_a.jpg';

/** Popula um app com cursos, tags, módulos, aulas, sessões e meta. */
async function populate(ctx) {
  const c1 = (await ctx.call('POST', '/courses', { title: 'Curso 1', platform: 'Udemy', tags: ['a', 'b'], imageUrl: IMG, url: 'https://www.udemy.com/course/c1/' })).body.data;
  const c2 = (await ctx.call('POST', '/courses', { title: 'Curso 2', manualProgress: 40 })).body.data;
  const m = (await ctx.call('POST', `/courses/${c1.id}/modules`, { title: 'M1' })).body.data;
  const l1 = (await ctx.call('POST', `/modules/${m.id}/lessons`, { title: 'L1', durationMin: 10 })).body.data;
  await ctx.call('POST', `/modules/${m.id}/lessons`, { title: 'L2', durationMin: 5 });
  await ctx.call('PATCH', `/lessons/${l1.id}`, { completed: true });
  const s = (await ctx.call('POST', '/sessions/start', { courseId: c1.id, lessonId: l1.id, kind: 'pomodoro', plannedMin: 25 })).body.data;
  ctx.clock.advance(25 * 60000);
  await ctx.call('POST', `/sessions/${s.id}/finish`, { notes: 'ok', focusRating: 4 });
  await ctx.call('POST', '/sessions/manual', { courseId: c2.id, durationMin: 30 });
  await ctx.call('PUT', '/goals/weekly', { targetMinutes: 300 });
  await ctx.call('POST', '/notes', { title: 'Nota 1', body: '# Oi', courseId: c1.id, lessonId: l1.id, tags: ['x', 'y'] });
  await ctx.call('POST', '/notes', { title: 'Solta', body: 'sem vínculo' });
  const t = (await ctx.call('POST', '/tracks', { title: 'Trilha', description: 'd' })).body.data;
  await ctx.call('POST', `/tracks/${t.id}/items`, { courseId: c1.id });
  const step = (await ctx.call('POST', `/tracks/${t.id}/items`, { title: 'Prova' })).body.data.items[1];
  await ctx.call('PATCH', `/tracks/${t.id}/items/${step.id}`, { done: true });
  return { c1, c2 };
}
const exportOf = async (ctx) => (await ctx.call('GET', '/backup')).body.data;
const strip = (bk) => ({ ...bk, exportedAt: undefined });
const restore = (ctx, backup, confirm = 'substituir-tudo') => ctx.call('POST', '/backup/restore', { confirm, backup });

describe('backup · exportar', () => {
  it('traz identificação, versão e todas as tabelas, sem a tabela de migrações', async () => {
    await populate(a);
    const bk = await exportOf(a);
    expect(bk).toMatchObject({ app: 'learning-center', version: 1 });
    expect(typeof bk.exportedAt).toBe('string');
    expect(Object.keys(bk.data).sort()).toEqual(['courseTags', 'courses', 'lessons', 'modules', 'noteTags', 'notes', 'options', 'sessions', 'settings', 'studyPlan', 'trackItems', 'tracks']);
    expect(bk.data.notes).toHaveLength(2);
    expect(bk.data.noteTags).toHaveLength(2);
    expect(bk.data.tracks).toHaveLength(1);
    expect(bk.data.trackItems).toHaveLength(2);
    expect(bk.data.courses).toHaveLength(2);
    expect(bk.data.lessons).toHaveLength(2);
    expect(bk.data.sessions).toHaveLength(2);
    expect(bk.data.courseTags).toHaveLength(2);
    expect(bk.data.courses[0].image_url).toBe(IMG);
  });

  it('banco vazio exporta listas vazias (e a meta padrão)', async () => {
    const bk = await exportOf(a);
    expect(bk.data.courses).toEqual([]);
    expect(bk.data.settings.some((s) => s.key === 'weekly_goal_minutes')).toBe(true);
  });
});

describe('backup · restaurar', () => {
  it('ida e volta: restaurar em outro banco reproduz exatamente os mesmos dados', async () => {
    await populate(a);
    const bk = await exportOf(a);
    const r = await restore(b, bk);
    expect(r.status).toBe(200);
    expect(r.body.data.counts).toMatchObject({ courses: 2, lessons: 2, sessions: 2 });
    expect(strip(await exportOf(b))).toEqual(strip(bk));
    // e o app funciona de verdade em cima dos dados restaurados
    const course = (await b.call('GET', '/courses')).body.data.find((c) => c.title === 'Curso 1');
    expect(course).toMatchObject({ progress: 50, doneLessons: 1, imageUrl: IMG, tags: ['a', 'b'] });
    expect((await b.call('GET', '/goals/weekly')).body.data.targetMinutes).toBe(300);
  });

  it('substitui tudo o que existia no destino (nada do antigo sobra)', async () => {
    await populate(a);
    await b.call('POST', '/courses', { title: 'Só existe no destino', tags: ['x'] });
    await restore(b, await exportOf(a));
    const titles = (await b.call('GET', '/courses')).body.data.map((c) => c.title).sort();
    expect(titles).toEqual(['Curso 1', 'Curso 2']);
  });

  it('preserva os ids e o próximo cadastro continua depois do maior id', async () => {
    const { c1 } = await populate(a);
    await restore(b, await exportOf(a));
    expect((await b.call('GET', `/courses/${c1.id}`)).body.data.title).toBe('Curso 1');
    const novo = (await b.call('POST', '/courses', { title: 'Novo' })).body.data;
    expect(novo.id).toBe(3);
  });

  it('restaurar um banco vazio zera o contador de ids', async () => {
    await populate(b);
    await restore(b, await exportOf(a)); // a está vazio
    expect((await b.call('GET', '/courses')).body.data).toEqual([]);
    expect((await b.call('POST', '/courses', { title: 'Primeiro' })).body.data.id).toBe(1);
  });

  it('exige a confirmação explícita', async () => {
    await populate(a);
    const bk = await exportOf(a);
    expect((await restore(b, bk, null)).status).toBe(400);
    expect((await b.call('POST', '/backup/restore', { backup: bk })).status).toBe(400); // sem o campo
    expect((await restore(b, bk, 'sim')).status).toBe(400);
    expect((await b.call('GET', '/courses')).body.data).toEqual([]);
  });

  it('é atômico: arquivo com referência quebrada é recusado e nada muda no banco', async () => {
    await populate(a);
    await b.call('POST', '/courses', { title: 'Meu curso de verdade' });
    const bk = await exportOf(a);
    bk.data.lessons[0].module_id = 9999; // aula apontando para módulo que não existe
    const r = await restore(b, bk);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_BACKUP');
    expect((await b.call('GET', '/courses')).body.data.map((c) => c.title)).toEqual(['Meu curso de verdade']);
  });

  it('recusa arquivo de outro app, versão desconhecida e tabelas faltando', async () => {
    await populate(a);
    const bk = await exportOf(a);
    expect((await restore(b, { ...bk, app: 'outro' })).status).toBe(400);
    expect((await restore(b, { ...bk, version: 99 })).status).toBe(400);
    const semTabela = { ...bk, data: { ...bk.data } };
    delete semTabela.data.lessons;
    expect((await restore(b, semTabela)).status).toBe(400);
    expect((await restore(b, 'texto solto')).status).toBe(400);
  });

  it('valida cada linha: status inválido, nota fora de 1–5, progresso fora de 0–100, id repetido', async () => {
    await populate(a);
    const base = await exportOf(a);
    const clone = () => JSON.parse(JSON.stringify(base));
    const cases = [
      (x) => { x.data.courses[0].status = 'voando'; },
      (x) => { x.data.sessions[0].focus_rating = 6; },
      (x) => { x.data.courses[0].manual_progress = 150; },
      (x) => { x.data.courses[1].id = x.data.courses[0].id; },
      (x) => { x.data.courses[0].image_url = 'javascript:alert(1)'; },
      (x) => { x.data.sessions[0].kind = 'teletransporte'; },
    ];
    for (const mutate of cases) {
      const x = clone();
      mutate(x);
      const r = await restore(b, x);
      expect(r.status).toBe(400);
    }
    expect((await b.call('GET', '/courses')).body.data).toEqual([]);
  });

  it('guarda e restaura o endereço lembrado do curso (slug); repetido é recusado; backup antigo sem ele é aceito', async () => {
    const c = (await a.call('POST', '/courses', { title: 'Python Completo' })).body.data;
    await a.call('POST', '/courses/sync-content', { title: 'Python Completo', url: 'https://www.udemy.com/course/python-completo/learn/lecture/1', modules: [{ title: 'M', lessons: [{ title: 'L', durationMin: 1, completed: false }] }] });
    const bk = await exportOf(a);
    expect(bk.data.courses[0].udemy_slug).toBe('python-completo');
    expect((await restore(b, bk)).status).toBe(200);
    const again = await b.call('POST', '/courses/sync-content', { title: 'nada a ver', url: 'https://www.udemy.com/course/python-completo/', modules: [{ title: 'M', lessons: [{ title: 'L', durationMin: 1, completed: false }] }] });
    expect(again.body.data).toMatchObject({ matched: true, courseId: c.id });
    const dup = JSON.parse(JSON.stringify(bk));
    dup.data.courses.push({ ...dup.data.courses[0], id: 99 });
    expect((await restore(b, dup)).status).toBe(400);
    const old = JSON.parse(JSON.stringify(bk));
    old.data.courses.forEach((x) => { delete x.udemy_slug; });
    expect((await restore(b, old)).status).toBe(200);
  });

  it('ida e volta inclui anotações (com vínculos e tags) e trilhas (com etapas e conclusão)', async () => {
    await populate(a);
    const r = await restore(b, await exportOf(a));
    expect(r.body.data.counts).toMatchObject({ notes: 2, tracks: 1 });
    const notes = (await b.call('GET', '/notes')).body.data;
    expect(notes.map((n) => n.title).sort()).toEqual(['Nota 1', 'Solta']);
    const n1 = notes.find((n) => n.title === 'Nota 1');
    expect(n1).toMatchObject({ courseTitle: 'Curso 1', lessonTitle: 'L1', tags: ['x', 'y'] });
    const t = (await b.call('GET', '/tracks')).body.data[0];
    expect(t).toMatchObject({ title: 'Trilha', totalItems: 2, doneItems: 1 });
    // os contadores continuam depois do maior id
    expect((await b.call('POST', '/notes', { title: 'nova' })).body.data.id).toBe(3);
    expect((await b.call('POST', '/tracks', { title: 'nova' })).body.data.id).toBe(2);
  });

  it('recusa referências quebradas em anotações e trilhas, sem mudar nada', async () => {
    await populate(a);
    await b.call('POST', '/notes', { title: 'Já existia no destino' });
    const base = await exportOf(a);
    const cases = [
      (x) => { x.data.notes[0].course_id = 999; },
      (x) => { x.data.notes[0].lesson_id = 999; },
      (x) => { x.data.noteTags[0].note_id = 999; },
      (x) => { x.data.trackItems[0].track_id = 999; },
      (x) => { x.data.trackItems[0].course_id = 999; },
      (x) => { x.data.trackItems[1].title = ''; },
      (x) => { x.data.trackItems.push({ ...x.data.trackItems[0], id: 99 }); },
    ];
    for (const mutate of cases) {
      const x = JSON.parse(JSON.stringify(base));
      mutate(x);
      const r = await restore(b, x);
      expect(r.status).toBe(400);
    }
    expect((await b.call('GET', '/notes')).body.data.map((n) => n.title)).toEqual(['Já existia no destino']);
  });

  it('backup antigo, sem anotações nem trilhas, é aceito (e as do destino são substituídas por nada)', async () => {
    await populate(a);
    const old = await exportOf(a);
    for (const k of ['notes', 'noteTags', 'tracks', 'trackItems']) delete old.data[k];
    await b.call('POST', '/notes', { title: 'do destino' });
    expect((await restore(b, old)).status).toBe(200);
    expect((await b.call('GET', '/notes')).body.data).toEqual([]);
    expect((await b.call('GET', '/tracks')).body.data).toEqual([]);
  });

  it('aceita backup antigo sem image_url (curso fica sem capa)', async () => {
    await populate(a);
    const bk = await exportOf(a);
    bk.data.courses.forEach((c) => { delete c.image_url; });
    expect((await restore(b, bk)).status).toBe(200);
    expect((await b.call('GET', '/courses')).body.data.every((c) => c.imageUrl === null)).toBe(true);
  });

  it('prévia mostra contagens e não grava nada', async () => {
    await populate(a);
    const bk = await exportOf(a);
    const r = await b.call('POST', '/backup/preview', { backup: bk });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ exportedAt: bk.exportedAt, counts: { courses: 2, modules: 1, lessons: 2, sessions: 2, tags: 2 } });
    expect((await b.call('GET', '/courses')).body.data).toEqual([]);
    expect((await b.call('POST', '/backup/preview', { backup: { app: 'outro' } })).status).toBe(400);
  });

  it('aceita arquivo grande (muitas sessões), acima do limite padrão de 1 MB', async () => {
    const bk = await exportOf(a);
    bk.data.sessions = Array.from({ length: 8000 }, (_, i) => ({
      id: i + 1, course_id: null, lesson_id: null, kind: 'manual', planned_min: null,
      started_at: '2026-01-01T10:00:00.000Z', paused_at: null, paused_total_sec: 0,
      ended_at: '2026-01-01T10:30:00.000Z', duration_sec: 1800, focus_rating: null, notes: 'nota '.repeat(10),
    }));
    expect(JSON.stringify(bk).length).toBeGreaterThan(1024 * 1024);
    const r = await restore(b, bk);
    expect(r.status).toBe(200);
    expect(r.body.data.counts.sessions).toBe(8000);
  });
});
