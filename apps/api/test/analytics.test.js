import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeApp } from './helpers.js';

// Relógio do helper: quarta-feira 2026-03-11 15:00 (local). Semana atual começa em 2026-03-09.
let ctx;
beforeEach(async () => { ctx = await makeApp(); });
afterEach(async () => { await ctx.app.close(); });

const at = (local) => new Date(local).toISOString();
function seed({ start, min, kind = 'stopwatch', rating = null, courseId = null }) {
  const s = new Date(start);
  const e = new Date(s.getTime() + min * 60000);
  ctx.app.db
    .prepare('INSERT INTO lc_study_sessions (course_id, kind, started_at, ended_at, duration_sec, focus_rating) VALUES (?, ?, ?, ?, ?, ?)')
    .run(courseId, kind, s.toISOString(), e.toISOString(), min * 60, rating);
}
const get = (range) => ctx.call('GET', `/analytics${range ? `?range=${range}` : ''}`);
const course = async (title, extra = {}) => (await ctx.call('POST', '/courses', { title, ...extra })).body.data;

describe('analytics · validação e vazio', () => {
  it('período inválido devolve 400 e o padrão é 30d', async () => {
    expect((await get('1y')).status).toBe(400);
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.data.range).toBe('30d');
  });

  it('banco vazio: zeros, listas vazias e nenhum NaN', async () => {
    for (const range of ['7d', '30d', '90d', 'all']) {
      const d = (await get(range)).body.data;
      expect(d.summary).toMatchObject({ totalMinutes: 0, sessions: 0, activeDays: 0, avgMinutesPerActiveDay: 0, bestDay: null, currentStreak: 0, longestStreak: 0, deltaPercent: null });
      expect(d.byCourse).toEqual([]);
      expect(d.focus).toMatchObject({ ratedSessions: 0, avgRating: null, bestPeriod: null, avgSessionMinutes: 0 });
      expect(d.goalHistory).toHaveLength(12);
      expect(JSON.stringify(d)).not.toContain('NaN');
    }
  });
});

describe('analytics · resumo e evolução', () => {
  it('soma total, sessões, dias ativos, média e melhor dia', async () => {
    seed({ start: '2026-03-09T09:00:00', min: 60 });
    seed({ start: '2026-03-09T20:00:00', min: 30 });
    seed({ start: '2026-03-11T10:00:00', min: 30 });
    const { summary } = (await get('7d')).body.data;
    expect(summary).toMatchObject({ totalMinutes: 120, sessions: 3, activeDays: 2, avgMinutesPerActiveDay: 60 });
    expect(summary.bestDay).toEqual({ date: '2026-03-09', minutes: 90 });
  });

  it('timeline diária cobre todos os dias do período, com zeros', async () => {
    seed({ start: '2026-03-10T09:00:00', min: 45 });
    const { timeline, granularity } = (await get('7d')).body.data;
    expect(granularity).toBe('day');
    expect(timeline).toHaveLength(7);
    expect(timeline[0].date).toBe('2026-03-05');
    expect(timeline.at(-1).date).toBe('2026-03-11');
    expect(timeline.find((t) => t.date === '2026-03-10').minutes).toBe(45);
    expect(timeline.filter((t) => t.minutes === 0)).toHaveLength(6);
  });

  it('90d agrupa por semana (começando na segunda)', async () => {
    seed({ start: '2026-03-08T09:00:00', min: 10 }); // domingo → semana de 02/03
    seed({ start: '2026-03-09T09:00:00', min: 20 }); // segunda → semana de 09/03
    const { timeline, granularity } = (await get('90d')).body.data;
    expect(granularity).toBe('week');
    expect(timeline.find((t) => t.date === '2026-03-02').minutes).toBe(10);
    expect(timeline.find((t) => t.date === '2026-03-09').minutes).toBe(20);
  });

  it('compara com o período anterior e ignora sessões abertas', async () => {
    seed({ start: '2026-03-10T09:00:00', min: 60 }); // período atual (7d)
    seed({ start: '2026-03-01T09:00:00', min: 30 }); // 7d anteriores
    ctx.app.db.prepare("INSERT INTO lc_study_sessions (kind, started_at) VALUES ('stopwatch', ?)").run(at('2026-03-11T09:00:00'));
    const { summary } = (await get('7d')).body.data;
    expect(summary.totalMinutes).toBe(60);
    expect(summary.previousMinutes).toBe(30);
    expect(summary.deltaPercent).toBe(100);
    expect(summary.sessions).toBe(1);
  });

  it('limite do dia: 23:59 e 00:00 caem em dias diferentes; fora do período não conta', async () => {
    seed({ start: '2026-03-10T23:59:00', min: 1 });
    seed({ start: '2026-03-11T00:00:00', min: 2 });
    seed({ start: '2026-03-04T23:59:00', min: 99 }); // antes da janela de 7d (começa 03-05)
    const d = (await get('7d')).body.data;
    expect(d.timeline.find((t) => t.date === '2026-03-10').minutes).toBe(1);
    expect(d.timeline.find((t) => t.date === '2026-03-11').minutes).toBe(2);
    expect(d.summary.totalMinutes).toBe(3);
  });

  it('"all" começa na primeira sessão e não tem período anterior', async () => {
    seed({ start: '2026-02-20T09:00:00', min: 30 });
    const d = (await get('all')).body.data;
    expect(d.summary.totalMinutes).toBe(30);
    expect(d.summary.previousMinutes).toBeNull();
    expect(d.summary.deltaPercent).toBeNull();
  });
});

describe('analytics · sequências', () => {
  it('sequência atual e maior sequência, com buraco no meio', async () => {
    for (const d of ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04']) seed({ start: `${d}T09:00:00`, min: 10 });
    for (const d of ['2026-03-10', '2026-03-11']) seed({ start: `${d}T09:00:00`, min: 10 });
    const { summary } = (await get('30d')).body.data;
    expect(summary.currentStreak).toBe(2);
    expect(summary.longestStreak).toBe(4);
  });

  it('a maior sequência considera todo o histórico, mesmo fora do período', async () => {
    for (const d of ['2025-12-01', '2025-12-02', '2025-12-03']) seed({ start: `${d}T09:00:00`, min: 10 });
    expect((await get('7d')).body.data.summary.longestStreak).toBe(3);
  });
});

describe('analytics · por curso', () => {
  it('agrupa por curso, calcula % e junta "Sem curso" com curso excluído', async () => {
    const a = await course('Curso A', { manualProgress: 40 });
    const b = await course('Curso B');
    seed({ start: '2026-03-10T09:00:00', min: 90, courseId: a.id });
    seed({ start: '2026-03-10T11:00:00', min: 30, courseId: b.id });
    seed({ start: '2026-03-10T12:00:00', min: 60 }); // sem curso
    await ctx.call('DELETE', `/courses/${b.id}`);
    const { byCourse } = (await get('7d')).body.data;
    expect(byCourse).toHaveLength(2);
    const semCurso = byCourse.find((c) => c.courseId === null);
    expect(semCurso).toMatchObject({ title: 'Sem curso', minutes: 90, progress: null });
    const cursoA = byCourse.find((c) => c.title === 'Curso A');
    expect(cursoA).toMatchObject({ minutes: 90, percent: 50, progress: 40, status: 'active' });
    expect(byCourse.reduce((s, c) => s + c.percent, 0)).toBe(100);
  });

  it('ordena do que mais estudou para o que menos estudou', async () => {
    const a = await course('Pouco');
    const b = await course('Muito');
    seed({ start: '2026-03-10T09:00:00', min: 10, courseId: a.id });
    seed({ start: '2026-03-10T10:00:00', min: 50, courseId: b.id });
    const { byCourse } = (await get('7d')).body.data;
    expect(byCourse.map((c) => c.title)).toEqual(['Muito', 'Pouco']);
  });

  it('lista cursos ativos parados (sem estudo no período), há quantos dias', async () => {
    const parado = await course('Parado');
    const novo = await course('Nunca estudado');
    const estudando = await course('Estudando');
    seed({ start: '2026-03-01T09:00:00', min: 30, courseId: parado.id }); // 10 dias atrás
    seed({ start: '2026-03-10T09:00:00', min: 30, courseId: estudando.id });
    const { idleCourses } = (await get('7d')).body.data;
    expect(idleCourses.map((c) => c.title)).toEqual(['Nunca estudado', 'Parado']);
    expect(idleCourses.find((c) => c.courseId === parado.id).daysSince).toBe(10);
    expect(idleCourses.find((c) => c.courseId === novo.id).daysSince).toBeNull();
  });
});

describe('analytics · quando estudo e foco', () => {
  it('matriz dia da semana × faixa do dia, só com sessões não manuais', async () => {
    seed({ start: '2026-03-09T07:00:00', min: 30 }); // seg, manhã
    seed({ start: '2026-03-09T23:30:00', min: 20 }); // seg, noite
    seed({ start: '2026-03-10T03:00:00', min: 10 }); // ter, madrugada
    seed({ start: '2026-03-11T14:00:00', min: 40, kind: 'pomodoro' }); // qua, tarde
    seed({ start: '2026-03-11T09:00:00', min: 500, kind: 'manual' }); // ignorada
    const { weekdayPeriods } = (await get('7d')).body.data;
    expect(weekdayPeriods.periods).toEqual(['madrugada', 'manha', 'tarde', 'noite']);
    expect(weekdayPeriods.matrix).toHaveLength(7);
    expect(weekdayPeriods.matrix[0]).toEqual([0, 30, 0, 20]);
    expect(weekdayPeriods.matrix[1]).toEqual([10, 0, 0, 0]);
    expect(weekdayPeriods.matrix[2]).toEqual([0, 0, 40, 0]);
  });

  it('foco: nota média ignora sessões sem nota; melhor faixa; tipos e duração média', async () => {
    seed({ start: '2026-03-10T08:00:00', min: 30, rating: 5 });
    seed({ start: '2026-03-10T09:00:00', min: 30, rating: 3 });
    seed({ start: '2026-03-10T21:00:00', min: 60, rating: 2 });
    seed({ start: '2026-03-10T22:30:00', min: 60 }); // sem nota
    seed({ start: '2026-03-09T10:00:00', min: 30, kind: 'manual' });
    const { focus } = (await get('7d')).body.data;
    expect(focus.ratedSessions).toBe(3);
    expect(focus.avgRating).toBe(3.3);
    expect(focus.bestPeriod).toBe('manha');
    expect(focus.byPeriod.find((p) => p.period === 'manha')).toMatchObject({ avgRating: 4, sessions: 2 });
    expect(focus.byPeriod.find((p) => p.period === 'noite')).toMatchObject({ avgRating: 2, sessions: 2 }); // a sem nota conta como sessão, mas não entra na média
    expect(focus.kinds).toMatchObject({ stopwatch: 4, manual: 1, pomodoro: 0 });
    expect(focus.avgSessionMinutes).toBe(45);
  });
});

describe('analytics · metas', () => {
  it('histórico das últimas 12 semanas com acerto da meta', async () => {
    await ctx.call('PUT', '/goals/weekly', { targetMinutes: 60 });
    seed({ start: '2026-03-02T09:00:00', min: 90 }); // semana anterior: bateu
    seed({ start: '2026-03-10T09:00:00', min: 30 }); // semana atual: 30/60
    const { goalHistory } = (await get('30d')).body.data;
    expect(goalHistory).toHaveLength(12);
    expect(goalHistory.at(-1)).toMatchObject({ weekStart: '2026-03-09', minutes: 30, target: 60, hit: false });
    expect(goalHistory.at(-2)).toMatchObject({ weekStart: '2026-03-02', minutes: 90, hit: true });
    expect(goalHistory[0].weekStart).toBe('2025-12-22');
  });
});
