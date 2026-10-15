import { z } from 'zod';
import { HttpError, notFound } from '../../core/errors.js';
import { addDays, startOfDay } from '../../core/time.js';
import { GoogleError, createGoogleClient } from '../../core/google.js';
import { buildIcs } from './ics.js';

import { STUDY_CALENDAR_NAME, WINDOW_DAYS, SESSION_DAYS, rfc3339Local, sessionSummary, createStudyEvents, dateKey } from './study-events.js';
import { createMissed } from './missed.js';

export { STUDY_CALENDAR_NAME, rfc3339Local };
const CACHE_MS = 2 * 60 * 1000;
const MAX_PLAN = 50;
const MAX_ONCE = 100;
/** O avulso precisa cair dentro da janela que as agendas externas enxergam (hoje + 27 dias). */
const ONCE_MAX_DAYS = WINDOW_DAYS - 1;

export const planBody = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM, de 00:00 a 23:59.'),
  durationMin: z.number().int().min(5, 'No mínimo 5 minutos.').max(600, 'No máximo 10 horas.'),
  courseId: z.number().int().positive().nullish(),
});
export const onceBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.'),
  startTime: planBody.shape.startTime,
  durationMin: planBody.shape.durationMin,
  courseId: z.number().int().positive().nullish(),
  fromPlanId: z.number().int().positive().nullish(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.').nullish(),
});
export const planUpdate = planBody.partial();
export const configBody = z.object({ clientId: z.string().trim().min(1, 'Informe o ID do cliente.').max(300), clientSecret: z.string().trim().min(1, 'Informe o segredo.').max(300) });
export const settingsBody = z.object({ autoSync: z.boolean().optional(), logSessions: z.boolean().optional() });

export function createCalendarService({ db, clock, courses, fetchImpl, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone }) {
  const google = createGoogleClient({ db, clock, fetchImpl });
  const study = createStudyEvents({ db, clock, courses });
  const { listPlan, desiredPlanEvents, desiredOnceEvents, recentSessions } = study;
  const missedCalc = createMissed({ db, clock, study });
  const cache = new Map();
  let syncing = null;

  /** Erros do Google viram erros HTTP com mensagem em português. */
  async function guard(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof GoogleError) {
        if (err.code === 'not_connected' || err.code === 'invalid_grant') throw new HttpError(401, 'NOT_CONNECTED', err.message);
        if (['bad_state', 'denied', 'token_error', 'no_refresh'].includes(err.code)) throw new HttpError(400, 'GOOGLE_AUTH', err.message);
        throw new HttpError(502, 'GOOGLE_ERROR', err.message);
      }
      throw err;
    }
  }

  const requireConnected = () => {
    if (!google.publicState().connected) throw new HttpError(401, 'NOT_CONNECTED', 'Conecte o Google Agenda primeiro.');
  };

  // ---------- conexão ----------
  const status = () => ({ ...google.publicState(), planBlocks: db.prepare('SELECT COUNT(*) AS n FROM lc_study_plan').get().n });

  function saveConfig(input) {
    google.saveConfig(configBody.parse(input));
    cache.clear();
    return status();
  }

  const connectUrl = (redirectUri) => ({ url: google.authUrl(redirectUri).url });

  /** Depois de conectar: descobre a conta e cria o calendário "Learning Center · Estudos". Falha aqui não desfaz a conexão. */
  async function prepare() {
    const first = await google.api('GET', '/calendars/primary/events', { query: { maxResults: 1, timeMin: clock.now().toISOString() } });
    google.save({ account_email: first?.summary ?? null });
    await studyCalendarId();
  }

  async function handleCallback(query) {
    await google.handleCallback(query);
    cache.clear();
    try {
      await prepare();
      return { warning: null };
    } catch (err) {
      const message = err instanceof GoogleError ? err.message : 'Não foi possível terminar a configuração.';
      google.save({ last_error: message });
      return { warning: message };
    }
  }

  async function disconnect() {
    await google.disconnect();
    cache.clear();
    return status();
  }

  function setSettings(raw) {
    const s = settingsBody.parse(raw);
    google.save({
      ...(s.autoSync !== undefined ? { auto_sync: s.autoSync ? 1 : 0 } : {}),
      ...(s.logSessions !== undefined ? { log_sessions: s.logSessions ? 1 : 0 } : {}),
    });
    return status();
  }

  // ---------- calendário de estudos ----------
  async function createStudyCalendar() {
    const cal = await google.api('POST', '/calendars', {
      body: { summary: STUDY_CALENDAR_NAME, description: 'Blocos de estudo e sessões de foco do Learning Center.', timeZone },
    });
    google.save({ study_calendar_id: cal.id });
    return cal.id;
  }

  async function studyCalendarId() {
    return google.row().study_calendar_id ?? createStudyCalendar();
  }

  /** Executa `fn(calId)`; se o calendário de estudos foi apagado no Google (404), recria e tenta de novo uma vez. */
  async function withStudyCalendar(fn) {
    const id = await studyCalendarId();
    try {
      return await fn(id);
    } catch (err) {
      if (err instanceof GoogleError && err.status === 404) {
        google.save({ study_calendar_id: null });
        return fn(await createStudyCalendar());
      }
      throw err;
    }
  }

  // ---------- eventos (para o início) ----------
  const instantOf = (ev, which) => {
    const t = ev[which];
    return t?.dateTime ? new Date(t.dateTime) : new Date(`${t?.date}T00:00:00`);
  };

  function normalize(ev, calendar) {
    const priv = ev.extendedProperties?.private ?? {};
    return {
      id: `${calendar}:${ev.id}`,
      title: ev.summary?.trim() || '(sem título)',
      start: ev.start?.dateTime ?? ev.start?.date,
      end: ev.end?.dateTime ?? ev.end?.date,
      allDay: Boolean(ev.start?.date),
      calendar, // 'primary' | 'study'
      kind: priv.lcKind ?? null, // 'plan' | 'session' | null
      url: ev.htmlLink ?? null,
    };
  }

  async function fetchEvents(calId, calendar, from, to) {
    const out = [];
    let pageToken;
    for (let page = 0; page < 5; page += 1) {
      const res = await google.api('GET', `/calendars/${encodeURIComponent(calId)}/events`, {
        query: { timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 250, pageToken },
      });
      for (const ev of res.items ?? []) if (ev.status !== 'cancelled') out.push(ev);
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }
    return out.map((ev) => normalize(ev, calendar));
  }

  async function events({ days = 7, refresh = false } = {}) {
    const st = google.publicState();
    if (!st.connected) return { connected: false, events: [], fetchedAt: null, stale: false, error: null };
    const key = String(days);
    const hit = cache.get(key);
    if (!refresh && hit && clock.now().getTime() - hit.at < CACHE_MS) return hit.payload;
    const from = startOfDay(clock.now());
    const to = addDays(from, days);
    try {
      const calId = google.row().study_calendar_id;
      const [mine, study] = await Promise.all([
        fetchEvents('primary', 'primary', from, to),
        calId ? fetchEvents(calId, 'study', from, to).catch((e) => { if (e instanceof GoogleError && e.status === 404) return []; throw e; }) : [],
      ]);
      const all = [...mine, ...study].sort((a, b) => new Date(a.allDay ? `${a.start}T00:00:00` : a.start) - new Date(b.allDay ? `${b.start}T00:00:00` : b.start));
      const payload = { connected: true, events: all, fetchedAt: clock.now().toISOString(), stale: false, error: null };
      cache.set(key, { at: clock.now().getTime(), payload });
      return payload;
    } catch (err) {
      const message = err instanceof GoogleError ? err.message : 'Não foi possível ler o Google Agenda.';
      if (hit) return { ...hit.payload, stale: true, error: message };
      return { connected: google.publicState().connected, events: [], fetchedAt: null, stale: false, error: message };
    }
  }

  // ---------- plano de estudo semanal ----------
  function checkCourse(courseId) {
    if (courseId && !db.prepare('SELECT 1 FROM lc_courses WHERE id = ?').get(courseId)) {
      throw new HttpError(400, 'INVALID_COURSE', 'Curso inexistente.');
    }
  }

  function addPlan(raw) {
    const p = planBody.parse(raw);
    checkCourse(p.courseId);
    if (db.prepare('SELECT COUNT(*) AS n FROM lc_study_plan').get().n >= MAX_PLAN) {
      throw new HttpError(400, 'PLAN_FULL', `O plano comporta até ${MAX_PLAN} blocos.`);
    }
    const res = db.prepare('INSERT INTO lc_study_plan (weekday, start_time, duration_min, course_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(p.weekday, p.startTime, p.durationMin, p.courseId ?? null, clock.now().toISOString());
    return study.getPlan(Number(res.lastInsertRowid));
  }

  function updatePlan(id, raw) {
    const p = planUpdate.parse(raw);
    const cur = db.prepare('SELECT * FROM lc_study_plan WHERE id = ?').get(id);
    if (!cur) throw notFound('Bloco');
    if (p.courseId !== undefined) checkCourse(p.courseId);
    db.prepare('UPDATE lc_study_plan SET weekday = ?, start_time = ?, duration_min = ?, course_id = ? WHERE id = ?').run(
      p.weekday ?? cur.weekday, p.startTime ?? cur.start_time, p.durationMin ?? cur.duration_min,
      p.courseId !== undefined ? (p.courseId ?? null) : cur.course_id, id,
    );
    return study.getPlan(id);
  }

  function removePlan(id) {
    if (!db.prepare('SELECT 1 FROM lc_study_plan WHERE id = ?').get(id)) throw notFound('Bloco');
    db.prepare('DELETE FROM lc_study_plan WHERE id = ?').run(id);
  }

  // ---------- blocos avulsos (uma ocorrência só) ----------
  function addOnce(raw) {
    const o = onceBody.parse(raw);
    checkCourse(o.courseId);
    const now = clock.now();
    const today = startOfDay(now);
    const [y, mo, d] = o.date.split('-').map(Number);
    const day = new Date(y, mo - 1, d);
    if (Number.isNaN(day.getTime()) || dateKey(day) !== o.date) throw new HttpError(400, 'INVALID_DATE', 'Data inválida.');
    if (day < today) throw new HttpError(400, 'INVALID_DATE', 'Escolha hoje ou um dia que ainda vai chegar.');
    if (day > addDays(today, ONCE_MAX_DAYS)) throw new HttpError(400, 'INVALID_DATE', 'Escolha uma data dentro das próximas 4 semanas.');
    const [hh, mm] = o.startTime.split(':').map(Number);
    const end = new Date(y, mo - 1, d, hh, mm + o.durationMin);
    if (end <= now) throw new HttpError(400, 'INVALID_DATE', 'Esse horário já passou. Escolha um horário mais adiante.');
    if (db.prepare('SELECT COUNT(*) AS n FROM lc_study_once WHERE date >= ?').get(dateKey(today)).n >= MAX_ONCE) {
      throw new HttpError(400, 'ONCE_FULL', `Você já tem ${MAX_ONCE} blocos avulsos marcados. Apague alguns para criar outro.`);
    }
    const res = db.prepare('INSERT INTO lc_study_once (date, start_time, duration_min, course_id, from_plan_id, from_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(o.date, o.startTime, o.durationMin, o.courseId ?? null, o.fromPlanId ?? null, o.fromPlanId ? (o.fromDate ?? null) : null, now.toISOString());
    return study.getOnce(Number(res.lastInsertRowid));
  }

  function removeOnce(id) {
    if (!db.prepare('SELECT 1 FROM lc_study_once WHERE id = ?').get(id)) throw notFound('Bloco avulso');
    db.prepare('DELETE FROM lc_study_once WHERE id = ?').run(id);
  }

  // ---------- sincronização ----------
  async function listManaged(calId, kind, from, to) {
    const out = [];
    let pageToken;
    for (let page = 0; page < 10; page += 1) {
      const res = await google.api('GET', `/calendars/${encodeURIComponent(calId)}/events`, {
        query: { timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: true, maxResults: 250, privateExtendedProperty: [`lcKind=${kind}`], pageToken },
      });
      out.push(...(res.items ?? []).filter((e) => e.status !== 'cancelled'));
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  }

  /** Plano e avulso usam o mesmo formato; muda só o tipo (lcKind) e o identificador. */
  const KINDS = {
    plan: { idProp: 'lcPlan', idOf: (d) => d.planId },
    once: { idProp: 'lcOnce', idOf: (d) => d.onceId },
  };
  const planBodyFor = (d, kind = 'plan') => ({
    summary: d.summary,
    description: d.description,
    start: { dateTime: rfc3339Local(d.start), timeZone },
    end: { dateTime: rfc3339Local(d.end), timeZone },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
    extendedProperties: { private: { lcKind: kind, [KINDS[kind].idProp]: String(KINDS[kind].idOf(d)), lcDate: d.date } },
  });

  async function syncPlan(calId, kind = 'plan', desired = desiredPlanEvents()) {
    const now = clock.now();
    const from = startOfDay(now);
    const to = addDays(from, WINDOW_DAYS);
    const existing = await listManaged(calId, kind, from, to);
    const seen = new Set();
    let created = 0;
    let updated = 0;
    let deleted = 0;
    const evPath = (id) => `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(id)}`;
    for (const ev of existing) {
      const priv = ev.extendedProperties?.private ?? {};
      const key = `${priv[KINDS[kind].idProp]}|${priv.lcDate}`;
      const want = desired.get(key);
      if (!want || seen.has(key)) {
        await google.api('DELETE', evPath(ev.id)).catch((e) => { if (!(e instanceof GoogleError && [404, 410].includes(e.status))) throw e; });
        deleted += 1;
        continue;
      }
      seen.add(key);
      const same = ev.summary === want.summary && (ev.description ?? '') === want.description
        && ev.start?.dateTime && new Date(ev.start.dateTime).getTime() === want.start.getTime()
        && ev.end?.dateTime && new Date(ev.end.dateTime).getTime() === want.end.getTime();
      if (!same) {
        await google.api('PATCH', evPath(ev.id), { body: planBodyFor(want, kind) });
        updated += 1;
      }
    }
    for (const [key, want] of desired) {
      if (seen.has(key)) continue;
      await google.api('POST', `/calendars/${encodeURIComponent(calId)}/events`, { body: planBodyFor(want, kind) });
      created += 1;
    }
    return { created, updated, deleted };
  }

  async function syncSessions(calId) {
    if (!google.row().log_sessions) return { created: 0 };
    const now = clock.now();
    const from = addDays(startOfDay(now), -SESSION_DAYS);
    const rows = recentSessions(from);
    if (!rows.length) return { created: 0 };
    const existing = await listManaged(calId, 'session', from, addDays(startOfDay(now), 1));
    const have = new Set(existing.map((e) => e.extendedProperties?.private?.lcSession));
    let created = 0;
    for (const s of rows) {
      if (have.has(String(s.id))) continue;
      const start = new Date(s.started_at);
      const end = new Date(start.getTime() + s.duration_sec * 1000);
      await google.api('POST', `/calendars/${encodeURIComponent(calId)}/events`, {
        body: {
          summary: sessionSummary(s),
          description: 'Sessão de foco registrada no Learning Center.',
          start: { dateTime: rfc3339Local(start), timeZone },
          end: { dateTime: rfc3339Local(end), timeZone },
          reminders: { useDefault: false },
          extendedProperties: { private: { lcKind: 'session', lcSession: String(s.id) } },
        },
      });
      created += 1;
    }
    return { created };
  }

  async function runSync() {
    requireConnected();
    try {
      const plan = await withStudyCalendar(async (calId) => {
        const a = await syncPlan(calId, 'plan', desiredPlanEvents());
        const b = await syncPlan(calId, 'once', desiredOnceEvents());
        return { created: a.created + b.created, updated: a.updated + b.updated, deleted: a.deleted + b.deleted };
      });
      const sessions = await withStudyCalendar((calId) => syncSessions(calId));
      cache.clear();
      google.save({ last_sync_at: clock.now().toISOString(), last_error: null });
      return { planCreated: plan.created, planUpdated: plan.updated, planDeleted: plan.deleted, sessionsCreated: sessions.created, syncedAt: clock.now().toISOString() };
    } catch (err) {
      if (err instanceof GoogleError && err.code !== 'invalid_grant') google.save({ last_error: err.message });
      throw err;
    }
  }

  /**
   * Próximos dias só com o que o app sabe (plano de estudo + sessões de hoje), sem depender de nenhuma agenda externa.
   * Mesmo formato dos eventos do Google, para o início mostrar do mesmo jeito.
   */
  function upcoming({ days = 7 } = {}) {
    const from = startOfDay(clock.now());
    const to = addDays(from, days);
    const out = [];
    for (const d of desiredPlanEvents().values()) {
      if (d.start >= to) continue;
      out.push({
        id: `plan:${d.planId}|${d.date}`, title: d.summary, courseId: d.courseId ?? null, courseTitle: d.courseTitle ?? null, lessonTitle: d.lessonTitle,
        start: rfc3339Local(d.start), end: rfc3339Local(d.end), allDay: false, calendar: 'study', kind: 'plan', url: null,
      });
    }
    for (const d of desiredOnceEvents().values()) {
      if (d.start >= to) continue;
      out.push({
        id: `once:${d.onceId}|${d.date}`, title: d.summary, courseId: d.courseId ?? null, courseTitle: d.courseTitle ?? null, lessonTitle: d.lessonTitle,
        start: rfc3339Local(d.start), end: rfc3339Local(d.end), allDay: false, calendar: 'study', kind: 'once', url: null,
      });
    }
    for (const s of recentSessions(from)) {
      const start = new Date(s.started_at);
      out.push({
        id: `session:${s.id}`, title: sessionSummary(s), courseId: null, courseTitle: s.course_title ?? null, lessonTitle: null,
        start: rfc3339Local(start), end: rfc3339Local(new Date(start.getTime() + s.duration_sec * 1000)), allDay: false, calendar: 'study', kind: 'session', url: null,
      });
    }
    return out.sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  /**
   * Calendário para ASSINAR (Calendário da Apple, Outlook…): blocos do plano + sessões feitas.
   * Não precisa de conta nem de chave: quem assina busca este endereço de tempos em tempos.
   */
  function feed() {
    const events = [];
    for (const d of desiredPlanEvents().values()) {
      events.push({ uid: `plan-${d.planId}-${d.date}@learning-center`, start: d.start, end: d.end, summary: d.summary, description: d.description, alarmMin: 10 });
    }
    for (const d of desiredOnceEvents().values()) {
      events.push({ uid: `once-${d.onceId}-${d.date}@learning-center`, start: d.start, end: d.end, summary: d.summary, description: d.description, alarmMin: 10 });
    }
    if (google.row().log_sessions) {
      for (const s of recentSessions(addDays(startOfDay(clock.now()), -SESSION_DAYS))) {
        const start = new Date(s.started_at);
        events.push({ uid: `session-${s.id}@learning-center`, start, end: new Date(start.getTime() + s.duration_sec * 1000), summary: sessionSummary(s), description: 'Sessão de foco registrada no Learning Center.', alarmMin: 0 });
      }
    }
    events.sort((a, b) => a.start - b.start);
    return buildIcs({ name: STUDY_CALENDAR_NAME, events, now: clock.now() });
  }

  /** Uma sincronização por vez: pedidos simultâneos (botão + automático) compartilham o mesmo resultado. */
  function syncNow() {
    syncing ??= guard(runSync).finally(() => { syncing = null; });
    return syncing;
  }

  return {
    status, saveConfig, connectUrl, handleCallback, disconnect, setSettings,
    events: (opts) => guard(() => events(opts)),
    listPlan, addPlan, updatePlan, removePlan, addOnce, removeOnce, missed: missedCalc.missed, syncNow, feed, upcoming,
    guard, google,
  };
}
