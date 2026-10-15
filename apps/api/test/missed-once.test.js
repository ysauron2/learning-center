import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { makeApp } from './helpers.js';
import { createFakeGoogle } from './fake-google.js';
import { createFakeNotion } from './fake-notion.js';
import { ALL_MIGRATIONS } from './migration-list.js';

// Relógio do helper: quarta-feira 2026-03-11 15:00 (local). Segunda = 0, então terça = 1 e quarta = 2.
let ctx;
let google;
let notion;
beforeEach(async () => {
  google = createFakeGoogle();
  notion = createFakeNotion();
  ctx = await makeApp(undefined, { googleFetch: google.fetch, notionFetch: notion.fetch, notionPauseMs: 0, notionSleep: async () => {} });
});
afterEach(async () => { await ctx.app.close(); });

const NOW = '2026-03-11T15:00:00';
const get = async (url) => (await ctx.call('GET', url)).body.data;
const mkCourse = async (title) => (await ctx.call('POST', '/courses', { title })).body.data;
const addPlan = async (p, createdAt = '2026-03-01T08:00:00') => {
  ctx.clock.set(createdAt);
  const r = await ctx.call('POST', '/calendar/plan', p);
  ctx.clock.set(NOW);
  return r.body.data;
};
const addOnce = (p) => ctx.call('POST', '/calendar/once', p);
const missed = () => get('/calendar/missed');
/** Sessão concluída (ou registro manual) em um dia/hora local, com a duração em minutos. */
async function study(courseId, localIso, min, manual = false) {
  if (manual) {
    return ctx.call('POST', '/sessions/manual', { courseId, durationMin: min, startedAt: new Date(localIso).toISOString() });
  }
  ctx.clock.set(localIso);
  const s = (await ctx.call('POST', '/sessions/start', { courseId, kind: 'pomodoro', plannedMin: 25 })).body.data;
  ctx.clock.advance(min * 60000);
  const r = await ctx.call('POST', `/sessions/${s.id}/finish`, {});
  ctx.clock.set(NOW);
  return r;
}

describe('perdidos · regra', () => {
  it('bloco de ontem sem estudo aparece como perdido, com os dados do bloco', async () => {
    const c = await mkCourse('Cyber Security');
    const p = await addPlan({ weekday: 1, startTime: '20:00', durationMin: 45, courseId: c.id });
    expect(await missed()).toEqual([{
      kind: 'plan', key: `plan-${p.id}-2026-03-10`, planId: p.id, onceId: null, date: '2026-03-10',
      start: expect.stringMatching(/^2026-03-10T20:00:00/), end: expect.stringMatching(/^2026-03-10T20:45:00/),
      startTime: '20:00', durationMin: 45, courseId: c.id, courseTitle: 'Cyber Security',
    }]);
  });

  it('bloco que ainda não terminou hoje não é perdido', async () => {
    const c = await mkCourse('Redes');
    await addPlan({ weekday: 2, startTime: '14:00', durationMin: 120, courseId: c.id }); // termina 16:00
    expect(await missed()).toEqual([]);
    ctx.clock.set('2026-03-11T16:30:00');
    expect(await missed()).toHaveLength(1);
  });

  it('estudo de 5 min ou mais no mesmo dia e curso cumpre o bloco; menos de 5 min não', async () => {
    const c = await mkCourse('Redes');
    await addPlan({ weekday: 1, startTime: '20:00', durationMin: 45, courseId: c.id });
    await study(c.id, '2026-03-10T09:00:00', 4);
    expect(await missed()).toHaveLength(1);
    await study(c.id, '2026-03-10T10:00:00', 5);
    expect(await missed()).toEqual([]);
  });

  it('registro manual conta como estudo', async () => {
    const c = await mkCourse('Redes');
    await addPlan({ weekday: 1, startTime: '20:00', durationMin: 45, courseId: c.id });
    await study(c.id, '2026-03-10T12:00:00', 30, true);
    expect(await missed()).toEqual([]);
  });

  it('estudo de outro curso não cumpre um bloco com curso; bloco sem curso aceita qualquer curso', async () => {
    const a = await mkCourse('A');
    const b = await mkCourse('B');
    const withCourse = await addPlan({ weekday: 1, startTime: '20:00', durationMin: 30, courseId: a.id });
    await addPlan({ weekday: 0, startTime: '20:00', durationMin: 30 }); // segunda, sem curso
    await study(b.id, '2026-03-10T12:00:00', 20); // terça, curso B
    await study(b.id, '2026-03-09T12:00:00', 20); // segunda, curso B
    const list = await missed();
    expect(list.map((m) => m.planId)).toEqual([withCourse.id]);
  });

  it('sessão ainda em andamento não conta', async () => {
    const c = await mkCourse('A');
    await addPlan({ weekday: 1, startTime: '20:00', durationMin: 30, courseId: c.id });
    ctx.clock.set('2026-03-10T21:00:00');
    await ctx.call('POST', '/sessions/start', { courseId: c.id, kind: 'stopwatch' });
    ctx.clock.set(NOW);
    expect(await missed()).toHaveLength(1);
  });

  it('bloco criado depois do horário não conta, nem dias anteriores à criação', async () => {
    const c = await mkCourse('A');
    // criado hoje às 15:00: o bloco de ontem e o de hoje às 08:00 ainda não existiam
    await addPlan({ weekday: 1, startTime: '20:00', durationMin: 30, courseId: c.id }, NOW);
    await addPlan({ weekday: 2, startTime: '08:00', durationMin: 30, courseId: c.id }, NOW);
    expect(await missed()).toEqual([]);
  });

  it('só olha hoje e os 3 dias anteriores', async () => {
    const c = await mkCourse('A');
    await addPlan({ weekday: 6, startTime: '20:00', durationMin: 30, courseId: c.id }); // domingo 08/03 = 3 dias atrás
    await addPlan({ weekday: 5, startTime: '20:00', durationMin: 30, courseId: c.id }); // sábado 07/03 = 4 dias atrás
    const list = await missed();
    expect(list.map((m) => m.date)).toEqual(['2026-03-08']);
  });

  it('devolve no máximo 3, os mais recentes primeiro', async () => {
    const c = await mkCourse('A');
    for (const wd of [6, 0, 1, 2]) await addPlan({ weekday: wd, startTime: '09:00', durationMin: 30, courseId: c.id }); // dom, seg, ter, qua (hoje 09:00)
    const list = await missed();
    expect(list.map((m) => m.date)).toEqual(['2026-03-11', '2026-03-10', '2026-03-09']);
  });

  it('o dia é o dia local: estudo logo depois da meia-noite local não cumpre o dia anterior', async () => {
    const c = await mkCourse('A');
    await addPlan({ weekday: 1, startTime: '22:00', durationMin: 30, courseId: c.id });
    await study(c.id, '2026-03-11T00:10:00', 20); // já é quarta
    expect(await missed()).toHaveLength(1);
  });

  it('avulso que passou sem estudo aparece como perdido; cumprido não', async () => {
    const c = await mkCourse('A');
    ctx.clock.set('2026-03-10T08:00:00');
    await addOnce({ date: '2026-03-10', startTime: '10:00', durationMin: 30, courseId: c.id });
    ctx.clock.set(NOW);
    const first = await missed();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: 'once', planId: null, date: '2026-03-10', courseTitle: 'A' });
    await study(c.id, '2026-03-10T10:05:00', 25);
    expect(await missed()).toEqual([]);
  });

  it('remarcar (avulso criado a partir de planId + data) tira o bloco original da lista', async () => {
    const c = await mkCourse('A');
    const p = await addPlan({ weekday: 1, startTime: '20:00', durationMin: 30, courseId: c.id });
    expect(await missed()).toHaveLength(1);
    const r = await addOnce({ date: '2026-03-11', startTime: '19:00', durationMin: 30, courseId: c.id, fromPlanId: p.id, fromDate: '2026-03-10' });
    expect(r.status).toBe(201);
    expect(await missed()).toEqual([]);
  });
});

describe('avulsos · rotas', () => {
  it('cria, devolve os dados e apaga', async () => {
    const c = await mkCourse('Redes');
    const r = await addOnce({ date: '2026-03-11', startTime: '19:00', durationMin: 30, courseId: c.id });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ date: '2026-03-11', startTime: '19:00', durationMin: 30, courseId: c.id, courseTitle: 'Redes', fromPlanId: null });
    expect((await ctx.call('DELETE', `/calendar/once/${r.body.data.id}`)).status).toBe(204);
    expect((await ctx.call('DELETE', `/calendar/once/${r.body.data.id}`)).status).toBe(404);
    expect((await ctx.call('DELETE', '/calendar/once/abc')).status).toBe(404);
  });

  it('valida data, horário, duração, curso e formato', async () => {
    const ok = { date: '2026-03-11', startTime: '19:00', durationMin: 30 };
    expect((await addOnce({ ...ok, date: '2026-03-10' })).status).toBe(400); // ontem
    expect((await addOnce({ ...ok, date: '2026-04-08' })).status).toBe(400); // além das 4 semanas
    expect((await addOnce({ ...ok, date: '2026-04-07' })).status).toBe(201); // dentro (hoje + 27)
    expect((await addOnce({ ...ok, date: '2026-02-30' })).status).toBe(400); // não existe
    expect((await addOnce({ ...ok, date: '11/03/2026' })).status).toBe(400);
    expect((await addOnce({ ...ok, startTime: '25:00' })).status).toBe(400);
    expect((await addOnce({ ...ok, startTime: '7:00' })).status).toBe(400);
    expect((await addOnce({ ...ok, durationMin: 4 })).status).toBe(400);
    expect((await addOnce({ ...ok, durationMin: 601 })).status).toBe(400);
    expect((await addOnce({ ...ok, courseId: 999 })).status).toBe(400);
    expect((await addOnce({ ...ok, startTime: '14:00', durationMin: 30 })).status).toBe(400); // hoje, já passou
  });

  it('limita a quantidade de avulsos futuros', async () => {
    for (let i = 0; i < 100; i += 1) {
      expect((await addOnce({ date: '2026-03-12', startTime: '10:00', durationMin: 30 })).status).toBe(201);
    }
    const r = await addOnce({ date: '2026-03-12', startTime: '10:00', durationMin: 30 });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('ONCE_FULL');
  });

  it('apagar o curso mantém o avulso, sem curso', async () => {
    const c = await mkCourse('Redes');
    const o = (await addOnce({ date: '2026-03-12', startTime: '10:00', durationMin: 30, courseId: c.id })).body.data;
    await ctx.call('DELETE', `/courses/${c.id}`);
    const up = await get('/calendar/upcoming');
    expect(up.find((e) => e.id === `once:${o.id}|2026-03-12`)).toMatchObject({ courseId: null, title: '📚 Hora de estudar' });
  });
});

describe('avulsos · destinos', () => {
  it('aparecem em "Sua agenda" (upcoming) junto com os do plano', async () => {
    const c = await mkCourse('Redes');
    const o = (await addOnce({ date: '2026-03-11', startTime: '19:00', durationMin: 30, courseId: c.id })).body.data;
    const up = await get('/calendar/upcoming');
    expect(up).toEqual([expect.objectContaining({
      id: `once:${o.id}|2026-03-11`, kind: 'once', calendar: 'study', title: '📚 Estudar: Redes', courseId: c.id, courseTitle: 'Redes',
      start: expect.stringMatching(/^2026-03-11T19:00:00/), end: expect.stringMatching(/^2026-03-11T19:30:00/),
    })]);
    expect(await get('/calendar/upcoming?days=1')).toHaveLength(1);
  });

  it('saem no calendário assinável (.ics) com UID estável', async () => {
    const c = await mkCourse('Redes');
    const o = (await addOnce({ date: '2026-03-12', startTime: '19:00', durationMin: 30, courseId: c.id })).body.data;
    const ics1 = (await ctx.app.inject({ method: 'GET', url: '/api/v1/calendar/feed.ics' })).body;
    expect(ics1).toContain(`UID:once-${o.id}-2026-03-12@learning-center`);
    expect(ics1).toContain('SUMMARY:📚 Estudar: Redes');
    const ics2 = (await ctx.app.inject({ method: 'GET', url: '/api/v1/calendar/feed.ics' })).body;
    expect(ics2.match(/UID:once-[^\r]*/)[0]).toBe(ics1.match(/UID:once-[^\r]*/)[0]);
  });

  describe('Notion', () => {
    const sync = () => ctx.call('POST', '/notion/sync');
    const rows = () => notion.liveRows().filter((r) => notion.text(r, 'Chave').startsWith('once-'));
    async function connected() {
      await ctx.call('PUT', '/notion/token', { token: 'ntn_good' });
      await ctx.call('POST', '/notion/connect', { pageId: 'page-1' });
    }

    it('cria, atualiza e arquiva com a chave once-<id>-<data>', async () => {
      await connected();
      const c = await mkCourse('Redes');
      const o = (await addOnce({ date: '2026-03-12', startTime: '19:00', durationMin: 30, courseId: c.id })).body.data;
      const r = await sync();
      expect(r.body.data).toMatchObject({ planCreated: 1, planUpdated: 0, planDeleted: 0 });
      expect(rows()).toHaveLength(1);
      const row = rows()[0];
      expect(notion.text(row, 'Chave')).toBe(`once-${o.id}-2026-03-12`);
      expect(notion.text(row, 'Nome')).toBe('📚 Estudar: Redes');
      expect(row.properties.Tipo.select.name).toBe('Estudo');
      expect(new Date(row.properties.Quando.date.start).getTime()).toBe(new Date('2026-03-12T19:00:00').getTime());

      // de novo: nada muda
      expect((await sync()).body.data).toMatchObject({ planCreated: 0, planUpdated: 0, planDeleted: 0 });

      // título do curso muda: atualiza a mesma linha
      await ctx.call('PATCH', `/courses/${c.id}`, { title: 'Redes 2' });
      expect((await sync()).body.data).toMatchObject({ planCreated: 0, planUpdated: 1, planDeleted: 0 });
      expect(rows()).toHaveLength(1);
      expect(notion.text(rows()[0], 'Nome')).toBe('📚 Estudar: Redes 2');

      // apagou o avulso: arquiva a linha
      await ctx.call('DELETE', `/calendar/once/${o.id}`);
      expect((await sync()).body.data).toMatchObject({ planDeleted: 1 });
      expect(rows()).toHaveLength(0);
    });

    it('avulso e bloco do plano convivem sem se confundir', async () => {
      await connected();
      const p = await addPlan({ weekday: 3, startTime: '20:00', durationMin: 30 }); // quinta
      const o = (await addOnce({ date: '2026-03-12', startTime: '19:00', durationMin: 30 })).body.data;
      await sync();
      const keys = notion.liveRows().map((r) => notion.text(r, 'Chave'));
      expect(keys).toContain(`once-${o.id}-2026-03-12`);
      expect(keys).toContain(`plan-${p.id}-2026-03-12`);
      expect((await sync()).body.data).toMatchObject({ planCreated: 0, planUpdated: 0, planDeleted: 0 });
      await ctx.call('DELETE', `/calendar/plan/${p.id}`);
      expect((await sync()).body.data).toMatchObject({ planDeleted: 4 });
      expect(rows()).toHaveLength(1);
    });
  });

  describe('Google', () => {
    const inject = (method, url, payload) => ctx.app.inject({ method, url: `/api/v1${url}`, payload, headers: { host: 'localhost:3000' } });
    const studyId = () => [...google.calendars.keys()].find((k) => k !== 'primary');
    const onceEvents = () => google.eventsOf(studyId()).filter((e) => e.extendedProperties?.private?.lcKind === 'once');
    const sync = () => ctx.call('POST', '/calendar/sync');
    async function connect() {
      await ctx.call('PUT', '/calendar/config', { clientId: 'meu-id.apps.googleusercontent.com', clientSecret: 'segredo-super' });
      const state = new URL(JSON.parse((await inject('POST', '/calendar/connect')).body).data.url).searchParams.get('state');
      await inject('GET', `/calendar/callback?code=good-code&state=${state}`);
    }

    it('cria, atualiza e apaga com lcKind "once"', async () => {
      await connect();
      const c = await mkCourse('Redes');
      const o = (await addOnce({ date: '2026-03-12', startTime: '19:00', durationMin: 30, courseId: c.id })).body.data;
      const r = await sync();
      expect(r.body.data).toMatchObject({ planCreated: 1, planUpdated: 0, planDeleted: 0 });
      expect(onceEvents()).toHaveLength(1);
      expect(onceEvents()[0].extendedProperties.private).toMatchObject({ lcKind: 'once', lcOnce: String(o.id), lcDate: '2026-03-12' });
      expect(onceEvents()[0].summary).toBe('📚 Estudar: Redes');

      expect((await sync()).body.data).toMatchObject({ planCreated: 0, planUpdated: 0, planDeleted: 0 });

      await ctx.call('PATCH', `/courses/${c.id}`, { title: 'Redes 2' });
      expect((await sync()).body.data).toMatchObject({ planUpdated: 1 });
      expect(onceEvents()[0].summary).toBe('📚 Estudar: Redes 2');

      await ctx.call('DELETE', `/calendar/once/${o.id}`);
      expect((await sync()).body.data).toMatchObject({ planDeleted: 1 });
      expect(onceEvents()).toHaveLength(0);
    });

    it('não mistura avulso com bloco do plano', async () => {
      await connect();
      await addPlan({ weekday: 3, startTime: '20:00', durationMin: 30 });
      await addOnce({ date: '2026-03-12', startTime: '19:00', durationMin: 30 });
      await sync();
      const plans = google.eventsOf(studyId()).filter((e) => e.extendedProperties?.private?.lcKind === 'plan');
      expect(plans).toHaveLength(4);
      expect(onceEvents()).toHaveLength(1);
      expect((await sync()).body.data).toMatchObject({ planCreated: 0, planUpdated: 0, planDeleted: 0 });
    });
  });
});

describe('avulsos · backup e migração', () => {
  it('entram no backup e voltam na restauração (com a origem)', async () => {
    const c = await mkCourse('Redes');
    const p = await addPlan({ weekday: 1, startTime: '20:00', durationMin: 30, courseId: c.id });
    await addOnce({ date: '2026-03-12', startTime: '19:00', durationMin: 30, courseId: c.id, fromPlanId: p.id, fromDate: '2026-03-10' });
    const bk = (await ctx.call('GET', '/backup')).body.data;
    expect(bk.data.studyOnce).toEqual([expect.objectContaining({ date: '2026-03-12', start_time: '19:00', duration_min: 30, course_id: c.id, from_plan_id: p.id, from_date: '2026-03-10' })]);

    const other = await makeApp();
    try {
      const r = await other.call('POST', '/backup/restore', { confirm: 'substituir-tudo', backup: bk });
      expect(r.status).toBe(200);
      expect(r.body.data.counts.once).toBe(1);
      expect((await other.call('GET', '/backup')).body.data.data.studyOnce).toEqual(bk.data.studyOnce);
    } finally { await other.app.close(); }
  });

  it('backup antigo, sem o campo, continua restaurando (e apaga avulsos existentes)', async () => {
    await addOnce({ date: '2026-03-12', startTime: '19:00', durationMin: 30 });
    const bk = (await ctx.call('GET', '/backup')).body.data;
    delete bk.data.studyOnce;
    const r = await ctx.call('POST', '/backup/restore', { confirm: 'substituir-tudo', backup: bk });
    expect(r.status).toBe(200);
    expect(r.body.data.counts.once).toBe(0);
    expect((await ctx.call('GET', '/backup')).body.data.data.studyOnce).toEqual([]);
  });

  it('recusa avulso com curso inexistente, id repetido ou horário ruim', async () => {
    const c = await mkCourse('Redes');
    await addOnce({ date: '2026-03-12', startTime: '19:00', durationMin: 30, courseId: c.id });
    const base = (await ctx.call('GET', '/backup')).body.data;
    const restore = (studyOnce) => ctx.call('POST', '/backup/restore', { confirm: 'substituir-tudo', backup: { ...base, data: { ...base.data, studyOnce } } });
    const row = base.data.studyOnce[0];
    expect((await restore([{ ...row, course_id: 999 }])).status).toBe(400);
    expect((await restore([row, row])).status).toBe(400);
    expect((await restore([{ ...row, start_time: '99:99' }])).status).toBe(400);
    expect((await restore([{ ...row, duration_min: 1 }])).status).toBe(400);
    expect((await ctx.call('GET', '/backup')).body.data.data.studyOnce).toHaveLength(1); // nada mudou
  });

  it('a migração 009 é aditiva: aplicada sobre um banco antigo mantém os dados', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    const dir = new URL('../migrations/', import.meta.url);
    const upTo008 = ALL_MIGRATIONS.filter((f) => f < '009');
    for (const f of upTo008) db.exec(readFileSync(new URL(f, dir), 'utf8'));
    db.exec("INSERT INTO lc_courses (title, platform, category, created_at, updated_at) VALUES ('X', 'Udemy', 'Geral', 'a', 'a')");
    db.exec("INSERT INTO lc_study_plan (weekday, start_time, duration_min, created_at) VALUES (1, '20:00', 30, 'a')");
    const nine = ALL_MIGRATIONS.find((f) => f.startsWith('009'));
    expect(nine).toBe('009_study_once.sql');
    db.exec(readFileSync(new URL(nine, dir), 'utf8'));
    expect(db.prepare('SELECT COUNT(*) AS n FROM lc_courses').get().n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM lc_study_plan').get().n).toBe(1);
    db.exec("INSERT INTO lc_study_once (date, start_time, duration_min, course_id, created_at) VALUES ('2026-03-12', '19:00', 30, 1, 'a')");
    db.exec('DELETE FROM lc_courses WHERE id = 1');
    expect(db.prepare('SELECT course_id FROM lc_study_once').get().course_id).toBeNull(); // ON DELETE SET NULL
    expect(() => db.exec("INSERT INTO lc_study_once (date, start_time, duration_min, created_at) VALUES ('2026-03-12', '19:00', 2, 'a')")).toThrow();
  });
});
