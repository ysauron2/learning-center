import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeApp } from './helpers.js';

let ctx;
beforeEach(async () => { ctx = await makeApp('2026-03-11T15:00:00'); });
afterEach(async () => { await ctx.app.close(); });

const MIN = 60 * 1000;

async function courseWithLesson() {
  const c = (await ctx.call('POST', '/courses', { title: 'Redes', platform: 'Udemy' })).body.data;
  const m = (await ctx.call('POST', `/courses/${c.id}/modules`, { title: 'M1' })).body.data;
  const l = (await ctx.call('POST', `/modules/${m.id}/lessons`, { title: 'Aula 1', durationMin: 20 })).body.data;
  return { c, l };
}

describe('sessões de foco', () => {
  it('inicia, pausa, retoma e finaliza descontando pausas', async () => {
    const { c, l } = await courseWithLesson();
    const s = (await ctx.call('POST', '/sessions/start', { courseId: c.id, lessonId: l.id, kind: 'pomodoro', plannedMin: 25 })).body.data;
    expect(s).toMatchObject({ running: true, plannedMin: 25, courseTitle: 'Redes', lessonTitle: 'Aula 1' });

    ctx.clock.advance(10 * MIN);
    await ctx.call('POST', `/sessions/${s.id}/pause`);
    ctx.clock.advance(5 * MIN);
    const paused = (await ctx.call('GET', '/sessions/active')).body.data;
    expect(paused).toMatchObject({ running: false, elapsedSec: 600 });
    await ctx.call('POST', `/sessions/${s.id}/resume`);
    ctx.clock.advance(15 * MIN);
    const done = (await ctx.call('POST', `/sessions/${s.id}/finish`, { notes: 'ok', focusRating: 4, completeLesson: true })).body.data;
    expect(done.durationSec).toBe(25 * 60);
    expect(done.endedAt).not.toBeNull();
    expect((await ctx.call('GET', '/sessions/active')).body.data).toBeNull();
    const course = (await ctx.call('GET', `/courses/${c.id}`)).body.data;
    expect(course.progress).toBe(100);
    expect(course.studiedMinutes).toBe(25);
  });

  it('impede duas sessões simultâneas e devolve a sessão ativa no erro', async () => {
    const first = (await ctx.call('POST', '/sessions/start', { kind: 'stopwatch' })).body.data;
    const second = await ctx.call('POST', '/sessions/start', { kind: 'pomodoro' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SESSION_ALREADY_ACTIVE');
    expect(second.body.error.details.session.id).toBe(first.id);
  });

  it('valida referências e não finaliza duas vezes', async () => {
    expect((await ctx.call('POST', '/sessions/start', { courseId: 999 })).status).toBe(400);
    const s = (await ctx.call('POST', '/sessions/start', {})).body.data;
    await ctx.call('POST', `/sessions/${s.id}/finish`, {});
    expect((await ctx.call('POST', `/sessions/${s.id}/finish`, {})).status).toBe(409);
    expect((await ctx.call('POST', '/sessions/9999/pause')).status).toBe(404);
  });

  it('registra tempo manual e lista o histórico', async () => {
    const r = await ctx.call('POST', '/sessions/manual', { durationMin: 40, notes: 'Aula fora do app' });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ kind: 'manual', durationSec: 2400 });
    const list = (await ctx.call('GET', '/sessions')).body.data;
    expect(list).toHaveLength(1);
  });
});

describe('metas semanais', () => {
  it('usa a meta padrão de 8h e atualiza o progresso', async () => {
    const g = (await ctx.call('GET', '/goals/weekly')).body.data;
    expect(g).toMatchObject({ targetMinutes: 480, studiedMinutes: 0, percent: 0 });
    await ctx.call('POST', '/sessions/manual', { durationMin: 120 });
    const after = (await ctx.call('GET', '/goals/weekly')).body.data;
    expect(after).toMatchObject({ studiedMinutes: 120, percent: 25, remainingMinutes: 360 });
  });

  it('permite meta flexível e recusa valores inválidos', async () => {
    const put = await ctx.call('PUT', '/goals/weekly', { targetMinutes: 240 });
    expect(put.body.data.targetMinutes).toBe(240);
    expect((await ctx.call('PUT', '/goals/weekly', { targetMinutes: 5 })).status).toBe(400);
  });

  it('só conta sessões da semana atual (segunda a domingo)', async () => {
    // Quarta 2026-03-11: segunda = 2026-03-09. Registro de 08/03 (domingo) fica fora.
    await ctx.call('POST', '/sessions/manual', { durationMin: 60, startedAt: new Date('2026-03-08T12:00:00').toISOString() });
    await ctx.call('POST', '/sessions/manual', { durationMin: 30, startedAt: new Date('2026-03-09T12:00:00').toISOString() });
    expect((await ctx.call('GET', '/goals/weekly')).body.data.studiedMinutes).toBe(30);
  });
});

describe('dashboard', () => {
  it('sem cursos sugere cadastrar o primeiro', async () => {
    const d = (await ctx.call('GET', '/dashboard')).body.data;
    expect(d.nextAction.type).toBe('add_course');
    expect(d).toMatchObject({ streakDays: 0, activeCourses: 0 });
    expect(d.week.chart).toHaveLength(7);
    expect(d.week.deltaPercent).toBeNull();
  });

  it('a próxima ação leva a capa do curso (imageUrl), tanto na sugestão quanto na sessão em andamento', async () => {
    const c = (await ctx.call('POST', '/courses', { title: 'Redes', platform: 'Udemy', imageUrl: 'https://img-c.udemycdn.com/course/480x270/1_a.jpg' })).body.data;
    const m = (await ctx.call('POST', `/courses/${c.id}/modules`, { title: 'M1' })).body.data;
    await ctx.call('POST', `/modules/${m.id}/lessons`, { title: 'Aula 1', durationMin: 20 });
    expect((await ctx.call('GET', '/dashboard')).body.data.nextAction.course.imageUrl).toBe('https://img-c.udemycdn.com/course/480x270/1_a.jpg');
    await ctx.call('POST', '/sessions/start', { courseId: c.id });
    const running = (await ctx.call('GET', '/dashboard')).body.data.nextAction;
    expect(running.type).toBe('resume_session');
    expect(running.course.imageUrl).toBe('https://img-c.udemycdn.com/course/480x270/1_a.jpg');
  });

  it('curso sem capa devolve imageUrl nulo', async () => {
    await courseWithLesson();
    expect((await ctx.call('GET', '/dashboard')).body.data.nextAction.course.imageUrl).toBeNull();
  });

  it('sugere a próxima aula do curso ativo e depois a sessão em andamento', async () => {
    const { c, l } = await courseWithLesson();
    const d1 = (await ctx.call('GET', '/dashboard')).body.data;
    expect(d1.nextAction).toMatchObject({ type: 'next_lesson', course: { id: c.id }, lesson: { id: l.id, title: 'Aula 1' } });
    const s = (await ctx.call('POST', '/sessions/start', { courseId: c.id, lessonId: l.id })).body.data;
    const d2 = (await ctx.call('GET', '/dashboard')).body.data;
    expect(d2.nextAction).toMatchObject({ type: 'resume_session', session: { id: s.id } });
  });

  it('calcula sequência, variação semanal e gráfico por dia', async () => {
    // Semana anterior: 60 min. Semana atual: seg 30 + ter 30 + qua 60 (hoje).
    await ctx.call('POST', '/sessions/manual', { durationMin: 60, startedAt: new Date('2026-03-04T12:00:00').toISOString() });
    await ctx.call('POST', '/sessions/manual', { durationMin: 30, startedAt: new Date('2026-03-09T12:00:00').toISOString() });
    await ctx.call('POST', '/sessions/manual', { durationMin: 30, startedAt: new Date('2026-03-10T12:00:00').toISOString() });
    await ctx.call('POST', '/sessions/manual', { durationMin: 60, startedAt: new Date('2026-03-11T10:00:00').toISOString() });
    const d = (await ctx.call('GET', '/dashboard')).body.data;
    expect(d.streakDays).toBe(3);
    expect(d.week).toMatchObject({ studiedMinutes: 120, previousMinutes: 60, deltaPercent: 100 });
    expect(d.week.chart.map((x) => x.minutes)).toEqual([30, 30, 60, 0, 0, 0, 0]);
    expect(d.recentSessions).toHaveLength(4);
  });

  it('mantém a sequência se hoje ainda não houve estudo', async () => {
    await ctx.call('POST', '/sessions/manual', { durationMin: 30, startedAt: new Date('2026-03-10T12:00:00').toISOString() });
    await ctx.call('POST', '/sessions/manual', { durationMin: 30, startedAt: new Date('2026-03-09T12:00:00').toISOString() });
    expect((await ctx.call('GET', '/dashboard')).body.data.streakDays).toBe(2);
  });
});
