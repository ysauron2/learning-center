import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeApp } from './helpers.js';
import { createFakeGoogle } from './fake-google.js';
import { createAutoSync } from '../src/modules/calendar/auto-sync.js';

// Relógio do helper: quarta-feira 2026-03-11 15:00 (local). O plano olha 28 dias à frente.
let ctx;
let google;
beforeEach(async () => {
  google = createFakeGoogle();
  ctx = await makeApp(undefined, { googleFetch: google.fetch });
});
afterEach(async () => { await ctx.app.close(); });

const HOST = { host: 'localhost:3000' };
const inject = (method, url, payload) => ctx.app.inject({ method, url: `/api/v1${url}`, payload, headers: HOST });
const get = async (url) => (await ctx.call('GET', url)).body.data;

async function configure() {
  return ctx.call('PUT', '/calendar/config', { clientId: 'meu-id.apps.googleusercontent.com', clientSecret: 'segredo-super' });
}
async function startConnect() {
  const r = await inject('POST', '/calendar/connect');
  const data = JSON.parse(r.body).data;
  return { ...data, state: new URL(data.url).searchParams.get('state'), status: r.statusCode };
}
async function connect() {
  await configure();
  const { state } = await startConnect();
  return inject('GET', `/calendar/callback?code=good-code&state=${state}`);
}
const studyId = () => [...google.calendars.keys()].find((k) => k !== 'primary');
const studyEvents = (kind) => google.eventsOf(studyId()).filter((e) => e.extendedProperties?.private?.lcKind === kind);
const at = (iso) => new Date(iso).getTime();
const mkCourse = async (title, extra = {}) => (await ctx.call('POST', '/courses', { title, ...extra })).body.data;
const addPlan = (p) => ctx.call('POST', '/calendar/plan', p);
const sync = () => ctx.call('POST', '/calendar/sync');

describe('agenda · configuração e conexão', () => {
  it('começa sem configurar e sem conectar', async () => {
    expect(await get('/calendar/status')).toMatchObject({ configured: false, connected: false, planBlocks: 0, autoSync: true, logSessions: true });
  });

  it('guarda o ID e o segredo e nunca devolve o segredo', async () => {
    const r = await configure();
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ configured: true, connected: false, clientId: 'meu-id.apps.googleusercontent.com' });
    expect(JSON.stringify(r.body)).not.toContain('segredo-super');
    expect(JSON.stringify(await get('/calendar/status'))).not.toContain('segredo-super');
  });

  it('valida o ID e o segredo', async () => {
    expect((await ctx.call('PUT', '/calendar/config', { clientId: '', clientSecret: 'x' })).status).toBe(400);
    expect((await ctx.call('PUT', '/calendar/config', { clientId: 'x' })).status).toBe(400);
  });

  it('conectar sem configurar avisa o que falta', async () => {
    const r = await inject('POST', '/calendar/connect');
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body).error.code).toBe('NOT_CONFIGURED');
  });

  it('o endereço de retorno acompanha o endereço que a pessoa está usando (localhost ou app desktop)', async () => {
    await configure();
    const web = await startConnect();
    expect(web.redirectUri).toBe('http://localhost:3000/api/v1/calendar/callback');
    expect(new URL(web.url).searchParams.get('redirect_uri')).toBe(web.redirectUri);
    const r = await ctx.app.inject({ method: 'POST', url: '/api/v1/calendar/connect', headers: { host: '127.0.0.1:38250' } });
    expect(JSON.parse(r.body).data.redirectUri).toBe('http://127.0.0.1:38250/api/v1/calendar/callback');
  });

  it('a volta do Google conecta, descobre a conta e cria o calendário "Learning Center · Estudos"', async () => {
    const cb = await connect();
    expect(cb.statusCode).toBe(200);
    expect(cb.headers['content-type']).toContain('text/html');
    expect(cb.body).toContain('Conectado!');
    expect(cb.body).toContain('/agenda?conectado=1');
    expect(await get('/calendar/status')).toMatchObject({ connected: true, account: 'pessoa@example.com', hasStudyCalendar: true, lastError: null });
    expect(google.calendars.get(studyId()).summary).toBe('Learning Center · Estudos');
  });

  it('state inventado ou negado pelo usuário mostram página de erro e não conectam', async () => {
    await configure();
    const forged = await inject('GET', '/calendar/callback?code=good-code&state=inventado');
    expect(forged.statusCode).toBe(400);
    expect(forged.body).toContain('Não deu certo');
    const denied = await inject('GET', '/calendar/callback?error=access_denied&state=x');
    expect(denied.statusCode).toBe(400);
    expect(denied.body).toContain('negou');
    expect((await get('/calendar/status')).connected).toBe(false);
  });

  it('texto vindo do Google na página de erro é escapado (sem HTML injetado)', async () => {
    await configure();
    const r = await inject('GET', '/calendar/callback?error=%3Cscript%3Ealert(1)%3C/script%3E&state=x');
    expect(r.body).not.toContain('<script>alert(1)');
    expect(r.body).toContain('&lt;script&gt;');
  });

  it('se faltar ativar a Calendar API no Google Cloud, conecta mas avisa o passo que falta', async () => {
    await configure();
    const { state } = await startConnect();
    google.state.failNext = { status: 403, body: { error: { code: 403, message: 'Google Calendar API has not been used in project 123 before or it is disabled.' } } };
    const cb = await inject('GET', `/calendar/callback?code=good-code&state=${state}`);
    expect(cb.statusCode).toBe(200);
    expect(cb.body).toContain('faltou um passo');
    expect(cb.body).toContain('Calendar API');
    expect(await get('/calendar/status')).toMatchObject({ connected: true, lastError: expect.stringContaining('Calendar API') });
  });

  it('desconectar revoga e apaga os tokens, mas mantém o ID e o segredo', async () => {
    await connect();
    const r = await ctx.call('POST', '/calendar/disconnect');
    expect(r.body.data).toMatchObject({ connected: false, configured: true });
    expect(google.state.revoked).toBe(true);
    expect((await ctx.call('GET', '/calendar/events')).body.data).toMatchObject({ connected: false, events: [] });
  });

  it('as configurações (sincronização automática e registro de sessões) podem ser ligadas e desligadas', async () => {
    const r = await ctx.call('PATCH', '/calendar/settings', { autoSync: false, logSessions: false });
    expect(r.body.data).toMatchObject({ autoSync: false, logSessions: false });
    expect((await ctx.call('PATCH', '/calendar/settings', { autoSync: true })).body.data).toMatchObject({ autoSync: true, logSessions: false });
    expect((await ctx.call('PATCH', '/calendar/settings', { autoSync: 'sim' })).status).toBe(400);
  });
});

describe('agenda · eventos (o que aparece no início)', () => {
  const ev = (summary, startIso, endIso, extra = {}) => ({ summary, start: { dateTime: new Date(startIso).toISOString() }, end: { dateTime: new Date(endIso).toISOString() }, ...extra });

  it('sem conectar devolve lista vazia, sem chamar o Google', async () => {
    const r = await ctx.call('GET', '/calendar/events');
    expect(r.body.data).toMatchObject({ connected: false, events: [] });
    expect(google.state.calls).toHaveLength(0);
  });

  it('junta a agenda principal e a de estudos, em ordem de horário, com tipo e origem', async () => {
    await connect();
    google.addEvent('primary', ev('Reunião', '2026-03-12T10:00:00', '2026-03-12T11:00:00'));
    google.addEvent('primary', ev('Almoço', '2026-03-11T12:00:00', '2026-03-11T13:00:00'));
    google.addEvent(studyId(), ev('📚 Estudar: Redes', '2026-03-11T19:00:00', '2026-03-11T20:00:00', { extendedProperties: { private: { lcKind: 'plan' } } }));
    const d = await get('/calendar/events');
    expect(d).toMatchObject({ connected: true, stale: false, error: null });
    expect(d.events.map((e) => [e.title, e.calendar, e.kind])).toEqual([
      ['Almoço', 'primary', null], ['📚 Estudar: Redes', 'study', 'plan'], ['Reunião', 'primary', null],
    ]);
    expect(d.events[0].allDay).toBe(false);
    expect(d.events[0].url).toContain('calendar.google.com');
  });

  it('eventos de dia inteiro, sem título e cancelados', async () => {
    await connect();
    google.addEvent('primary', { summary: 'Feriado', start: { date: '2026-03-13' }, end: { date: '2026-03-14' } });
    google.addEvent('primary', { start: { dateTime: new Date('2026-03-12T09:00:00').toISOString() }, end: { dateTime: new Date('2026-03-12T10:00:00').toISOString() } });
    google.addEvent('primary', { ...ev('Cancelado', '2026-03-12T11:00:00', '2026-03-12T12:00:00'), status: 'cancelled' });
    const d = await get('/calendar/events');
    expect(d.events.map((e) => e.title)).toEqual(['(sem título)', 'Feriado']);
    const holiday = d.events.find((e) => e.title === 'Feriado');
    expect(holiday).toMatchObject({ allDay: true, start: '2026-03-13' });
  });

  it('respeita a janela de dias (padrão 7) e valida o parâmetro', async () => {
    await connect();
    google.addEvent('primary', ev('Perto', '2026-03-13T10:00:00', '2026-03-13T11:00:00'));
    google.addEvent('primary', ev('Longe', '2026-03-30T10:00:00', '2026-03-30T11:00:00'));
    expect((await get('/calendar/events')).events.map((e) => e.title)).toEqual(['Perto']);
    expect((await get('/calendar/events?days=31')).events.map((e) => e.title)).toEqual(['Perto', 'Longe']);
    expect((await ctx.call('GET', '/calendar/events?days=0')).status).toBe(400);
    expect((await ctx.call('GET', '/calendar/events?days=99')).status).toBe(400);
  });

  it('guarda em memória por 2 minutos (não pede ao Google a cada visita) e "refresh=1" força', async () => {
    await connect();
    google.addEvent('primary', ev('A', '2026-03-12T10:00:00', '2026-03-12T11:00:00'));
    await get('/calendar/events');
    const before = google.callsTo(/GET .*primary\/events/).length;
    await get('/calendar/events');
    expect(google.callsTo(/GET .*primary\/events/).length).toBe(before);
    google.addEvent('primary', ev('B', '2026-03-12T12:00:00', '2026-03-12T13:00:00'));
    expect((await get('/calendar/events')).events).toHaveLength(1); // ainda do cache
    expect((await get('/calendar/events?refresh=1')).events).toHaveLength(2);
    ctx.clock.advance(3 * 60 * 1000);
    google.addEvent('primary', ev('C', '2026-03-12T14:00:00', '2026-03-12T15:00:00'));
    expect((await get('/calendar/events')).events).toHaveLength(3); // cache venceu
  });

  it('se o Google falhar, mostra o último que sabia marcado como desatualizado; sem cache, devolve o erro sem quebrar', async () => {
    await connect();
    google.addEvent('primary', ev('A', '2026-03-12T10:00:00', '2026-03-12T11:00:00'));
    await get('/calendar/events');
    google.state.failNext = { status: 500, body: { error: { message: 'Backend Error' } } };
    const stale = await get('/calendar/events?refresh=1');
    expect(stale).toMatchObject({ stale: true, error: expect.stringContaining('Backend Error') });
    expect(stale.events).toHaveLength(1);

    ctx.clock.advance(5 * 60 * 1000);
    const fresh = await makeApp(undefined, { googleFetch: google.fetch });
    try {
      await fresh.call('PUT', '/calendar/config', { clientId: 'i', clientSecret: 's' });
      expect((await fresh.call('GET', '/calendar/events')).body.data).toMatchObject({ connected: false, events: [] });
    } finally { await fresh.app.close(); }
  });

  it('o calendário de estudos apagado no Google não derruba a lista', async () => {
    await connect();
    google.addEvent('primary', ev('A', '2026-03-12T10:00:00', '2026-03-12T11:00:00'));
    google.removeCalendar(studyId());
    const d = await get('/calendar/events?refresh=1');
    expect(d.error).toBeNull();
    expect(d.events.map((e) => e.title)).toEqual(['A']);
  });
});

describe('agenda · plano de estudo semanal', () => {
  it('cadastra, lista ordenado, edita e apaga blocos, com o nome do curso', async () => {
    const c = await mkCourse('Redes');
    const a = (await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45, courseId: c.id })).body.data;
    const b = (await addPlan({ weekday: 0, startTime: '07:30', durationMin: 30 })).body.data;
    expect(a).toMatchObject({ weekday: 2, startTime: '20:00', durationMin: 45, courseId: c.id, courseTitle: 'Redes' });
    expect((await get('/calendar/plan')).map((p) => p.id)).toEqual([b.id, a.id]); // segunda antes de quarta
    const upd = (await ctx.call('PATCH', `/calendar/plan/${a.id}`, { startTime: '21:00', courseId: null })).body.data;
    expect(upd).toMatchObject({ startTime: '21:00', courseId: null, courseTitle: null, durationMin: 45 });
    expect((await ctx.call('DELETE', `/calendar/plan/${b.id}`)).status).toBe(204);
    expect(await get('/calendar/plan')).toHaveLength(1);
    expect((await get('/calendar/status')).planBlocks).toBe(1);
  });

  it('valida dia, horário, duração e curso', async () => {
    for (const bad of [
      { weekday: 7, startTime: '10:00', durationMin: 30 }, { weekday: -1, startTime: '10:00', durationMin: 30 },
      { weekday: 1, startTime: '25:00', durationMin: 30 }, { weekday: 1, startTime: '9:00', durationMin: 30 }, { weekday: 1, startTime: '10:60', durationMin: 30 },
      { weekday: 1, startTime: '10:00', durationMin: 4 }, { weekday: 1, startTime: '10:00', durationMin: 601 },
      { weekday: 1, startTime: '10:00' },
    ]) expect((await addPlan(bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await addPlan({ weekday: 1, startTime: '10:00', durationMin: 30, courseId: 999 })).body.error.code).toBe('INVALID_COURSE');
    expect((await ctx.call('PATCH', '/calendar/plan/999', { durationMin: 20 })).status).toBe(404);
    expect((await ctx.call('DELETE', '/calendar/plan/999')).status).toBe(404);
  });

  it('limita o plano a 50 blocos', async () => {
    for (let i = 0; i < 50; i += 1) await addPlan({ weekday: i % 7, startTime: '10:00', durationMin: 30 });
    expect((await addPlan({ weekday: 1, startTime: '10:00', durationMin: 30 })).body.error.code).toBe('PLAN_FULL');
  });

  it('apagar o curso mantém o bloco, só sem o nome do curso', async () => {
    const c = await mkCourse('Redes');
    const p = (await addPlan({ weekday: 1, startTime: '10:00', durationMin: 30, courseId: c.id })).body.data;
    await ctx.call('DELETE', `/courses/${c.id}`);
    expect((await get('/calendar/plan')).find((x) => x.id === p.id)).toMatchObject({ courseId: null, courseTitle: null });
  });
});

describe('agenda · sincronização (blocos de estudo no Google Agenda)', () => {
  it('sem conectar, recusa e não chama o Google', async () => {
    const r = await sync();
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('NOT_CONNECTED');
    expect(google.state.calls).toHaveLength(0);
  });

  it('cria os eventos das próximas 4 semanas no dia e hora certos, com o nome do curso e lembrete', async () => {
    await connect();
    const c = await mkCourse('Redes');
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60, courseId: c.id }); // segundas
    const r = await sync();
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ planCreated: 4, planUpdated: 0, planDeleted: 0 });
    const evs = studyEvents('plan');
    expect(evs).toHaveLength(4);
    expect(evs.map((e) => at(e.start.dateTime)).sort()).toEqual(['2026-03-16T09:00:00', '2026-03-23T09:00:00', '2026-03-30T09:00:00', '2026-04-06T09:00:00'].map(at));
    expect(evs.every((e) => at(e.end.dateTime) - at(e.start.dateTime) === 60 * 60000)).toBe(true);
    expect(evs[0].summary).toBe('📚 Estudar: Redes');
    expect(evs[0].reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] });
    expect(evs[0].extendedProperties.private).toMatchObject({ lcKind: 'plan', lcPlan: expect.any(String), lcDate: expect.stringMatching(/^2026-/) });
    expect(await get('/calendar/status')).toMatchObject({ lastError: null, lastSyncAt: expect.any(String) });
  });

  it('bloco sem curso vira "Hora de estudar"; com aulas, a descrição cita a próxima aula', async () => {
    await connect();
    const c = await mkCourse('Python');
    const m = (await ctx.call('POST', `/courses/${c.id}/modules`, { title: 'M' })).body.data;
    await ctx.call('POST', `/modules/${m.id}/lessons`, { title: 'Variáveis', durationMin: 10 });
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 30 });
    await addPlan({ weekday: 1, startTime: '09:00', durationMin: 30, courseId: c.id });
    await sync();
    const evs = studyEvents('plan');
    expect(evs.find((e) => e.summary === '📚 Hora de estudar').description).not.toContain('Próxima aula');
    expect(evs.find((e) => e.summary === '📚 Estudar: Python').description).toContain('Próxima aula: Variáveis');
  });

  it('bloco de hoje que já passou não é criado; o que ainda vai acontecer, sim', async () => {
    await connect();
    await addPlan({ weekday: 2, startTime: '14:00', durationMin: 60 }); // quarta 14–15h: já acabou (agora são 15h)
    await addPlan({ weekday: 2, startTime: '16:00', durationMin: 60 }); // quarta 16h: ainda vai
    await sync();
    const starts = studyEvents('plan').map((e) => at(e.start.dateTime));
    expect(starts).not.toContain(at('2026-03-11T14:00:00'));
    expect(starts).toContain(at('2026-03-11T16:00:00'));
    expect(starts).toContain(at('2026-03-18T14:00:00'));
  });

  it('é idempotente: sincronizar de novo não duplica nada', async () => {
    await connect();
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60 });
    await sync();
    const r = await sync();
    expect(r.body.data).toMatchObject({ planCreated: 0, planUpdated: 0, planDeleted: 0 });
    expect(studyEvents('plan')).toHaveLength(4);
  });

  it('mudou o horário/duração/curso do bloco: atualiza os eventos existentes (sem recriar)', async () => {
    await connect();
    const c = await mkCourse('Redes');
    const p = (await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60 })).body.data;
    await sync();
    const idsBefore = studyEvents('plan').map((e) => e.id).sort();
    await ctx.call('PATCH', `/calendar/plan/${p.id}`, { startTime: '10:30', durationMin: 90, courseId: c.id });
    const r = await sync();
    expect(r.body.data).toMatchObject({ planCreated: 0, planUpdated: 4, planDeleted: 0 });
    const evs = studyEvents('plan');
    expect(evs.map((e) => e.id).sort()).toEqual(idsBefore);
    expect(at(evs.find((e) => e.extendedProperties.private.lcDate === '2026-03-16').start.dateTime)).toBe(at('2026-03-16T10:30:00'));
    expect(evs[0].summary).toBe('📚 Estudar: Redes');
    expect(at(evs[0].end.dateTime) - at(evs[0].start.dateTime)).toBe(90 * 60000);
  });

  it('curso renomeado: o título do evento acompanha', async () => {
    await connect();
    const c = await mkCourse('Antigo');
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60, courseId: c.id });
    await sync();
    await ctx.call('PATCH', `/courses/${c.id}`, { title: 'Novo nome' });
    await sync();
    expect(new Set(studyEvents('plan').map((e) => e.summary))).toEqual(new Set(['📚 Estudar: Novo nome']));
  });

  it('apagar o bloco (ou mudar o dia) remove os eventos antigos do Google', async () => {
    await connect();
    const p = (await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60 })).body.data;
    await sync();
    await ctx.call('PATCH', `/calendar/plan/${p.id}`, { weekday: 4 }); // agora sexta
    const r = await sync();
    expect(r.body.data).toMatchObject({ planCreated: 4, planDeleted: 4 });
    expect(studyEvents('plan').every((e) => new Date(e.start.dateTime).getDay() === 5)).toBe(true);
    await ctx.call('DELETE', `/calendar/plan/${p.id}`);
    expect((await sync()).body.data).toMatchObject({ planDeleted: 4 });
    expect(studyEvents('plan')).toEqual([]);
  });

  it('só mexe nos eventos que o app criou: os da pessoa, na agenda dela, ficam intactos', async () => {
    await connect();
    const mine = google.addEvent('primary', { summary: 'Dentista', start: { dateTime: new Date('2026-03-16T09:00:00').toISOString() }, end: { dateTime: new Date('2026-03-16T10:00:00').toISOString() } });
    const manual = google.addEvent(studyId(), { summary: 'Anotei aqui à mão', start: { dateTime: new Date('2026-03-17T09:00:00').toISOString() }, end: { dateTime: new Date('2026-03-17T10:00:00').toISOString() } });
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60 });
    await sync();
    await ctx.call('DELETE', '/calendar/plan/1');
    await sync();
    expect(google.eventsOf('primary').some((e) => e.id === mine)).toBe(true);
    expect(google.eventsOf(studyId()).some((e) => e.id === manual)).toBe(true);
  });

  it('se o calendário de estudos foi apagado no Google, recria e recoloca os eventos', async () => {
    await connect();
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60 });
    await sync();
    const old = studyId();
    google.removeCalendar(old);
    const r = await sync();
    expect(r.status).toBe(200);
    expect(r.body.data.planCreated).toBe(4);
    expect(studyId()).not.toBe(old);
    expect(studyEvents('plan')).toHaveLength(4);
  });

  it('com muitos blocos (o Google devolve em várias páginas) continua sem duplicar nem apagar à toa', async () => {
    await connect();
    google.state.pageCap = 40; // o Google entrega no máximo 40 por página
    for (let d = 0; d < 7; d += 1) for (const h of ['06:00', '08:00', '12:00', '18:00', '20:00', '22:00', '23:00']) await addPlan({ weekday: d, startTime: h, durationMin: 30 });
    const first = await sync();
    expect(first.body.data.planCreated).toBeGreaterThan(150); // bem mais que uma página
    const second = await sync();
    expect(second.body.data).toMatchObject({ planCreated: 0, planUpdated: 0, planDeleted: 0 });
    expect(studyEvents('plan')).toHaveLength(first.body.data.planCreated);
    expect(google.callsTo(/GET .*events/).some((c) => c.query.pageToken)).toBe(true); // de fato paginou
  });

  it('erro do Google durante a sincronização: devolve 502 com a mensagem e guarda em "lastError"', async () => {
    await connect();
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60 });
    google.state.failNext = { status: 500, body: { error: { message: 'Backend Error' } } };
    const r = await sync();
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('GOOGLE_ERROR');
    expect((await get('/calendar/status')).lastError).toContain('Backend Error');
    expect((await sync()).status).toBe(200); // tentar de novo funciona e limpa o erro
    expect((await get('/calendar/status')).lastError).toBeNull();
  });

  it('acesso revogado no Google: desconecta e pede para conectar de novo', async () => {
    await connect();
    google.revokeRefresh();
    google.expireAccessTokens();
    const r = await sync();
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('NOT_CONNECTED');
    expect(await get('/calendar/status')).toMatchObject({ connected: false, lastError: expect.stringContaining('Conecte de novo') });
  });

  it('dois pedidos de sincronização ao mesmo tempo viram um só (botão + automático)', async () => {
    await connect();
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60 });
    const [a, b] = await Promise.all([sync(), sync()]);
    expect(a.status).toBe(200);
    expect(b.body.data).toEqual(a.body.data);
    expect(studyEvents('plan')).toHaveLength(4);
  });
});

describe('agenda · sessões de foco como eventos', () => {
  async function session(minutes, extra = {}) {
    const c = extra.course ?? (await mkCourse('Redes'));
    const s = (await ctx.call('POST', '/sessions/start', { courseId: c.id, kind: 'stopwatch' })).body.data;
    ctx.clock.advance(minutes * 60000);
    await ctx.call('POST', `/sessions/${s.id}/finish`, { focusRating: 4 });
    return s;
  }

  it('sessão concluída vira evento "✅ Estudei", uma vez só', async () => {
    await connect();
    const s = await session(45);
    const r = await sync();
    expect(r.body.data.sessionsCreated).toBe(1);
    const evs = studyEvents('session');
    expect(evs).toHaveLength(1);
    expect(evs[0].summary).toBe('✅ Estudei: Redes (45 min)');
    expect(at(evs[0].end.dateTime) - at(evs[0].start.dateTime)).toBe(45 * 60000);
    expect(evs[0].extendedProperties.private).toMatchObject({ lcKind: 'session', lcSession: String(s.id) });
    expect((await sync()).body.data.sessionsCreated).toBe(0);
    expect(studyEvents('session')).toHaveLength(1);
  });

  it('não envia registro manual, sessão curta demais nem sessão ainda aberta; ignora as muito antigas', async () => {
    await connect();
    const c = await mkCourse('Redes');
    await ctx.call('POST', '/sessions/manual', { courseId: c.id, durationMin: 30 });
    await session(0, { course: c }); // menos de 1 minuto
    await ctx.call('POST', '/sessions/start', { courseId: c.id, kind: 'stopwatch' }); // aberta
    ctx.app.db.prepare("INSERT INTO lc_study_sessions (course_id, kind, started_at, ended_at, duration_sec) VALUES (?, 'stopwatch', ?, ?, 3600)").run(c.id, new Date('2026-02-01T10:00:00').toISOString(), new Date('2026-02-01T11:00:00').toISOString());
    expect((await sync()).body.data.sessionsCreated).toBe(0);
  });

  it('com o registro de sessões desligado, não envia', async () => {
    await connect();
    await ctx.call('PATCH', '/calendar/settings', { logSessions: false });
    await session(30);
    expect((await sync()).body.data.sessionsCreated).toBe(0);
    expect(studyEvents('session')).toEqual([]);
  });

  it('sessão sem curso usa "Sessão de foco"', async () => {
    await connect();
    const s = (await ctx.call('POST', '/sessions/start', { kind: 'stopwatch' })).body.data;
    ctx.clock.advance(20 * 60000);
    await ctx.call('POST', `/sessions/${s.id}/finish`, {});
    await sync();
    expect(studyEvents('session')[0].summary).toBe('✅ Estudei: Sessão de foco (20 min)');
  });
});

describe('agenda · sincronizador automático', () => {
  const make = (status, syncNow) => {
    const calendar = { status: () => status, syncNow };
    const timers = [];
    const auto = createAutoSync({
      calendar, intervalMs: 1000, firstDelayMs: 50,
      setTimer: (fn, ms) => { const t = { fn, ms, unref() {} }; timers.push(t); return t; },
      clearTimer: (t) => { t.cleared = true; },
      setOnce: (fn, ms) => { const t = { fn, ms, once: true, unref() {} }; timers.push(t); return t; },
      clearOnce: (t) => { t.cleared = true; },
    });
    return { auto, timers, calendar };
  };

  it('sincroniza quando está conectado e com a opção ligada', async () => {
    const syncNow = vi.fn().mockResolvedValue({});
    const { auto } = make({ connected: true, autoSync: true }, syncNow);
    expect(await auto.tick()).toBe(true);
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('não faz nada se desconectado ou com a opção desligada', async () => {
    const syncNow = vi.fn();
    expect(await make({ connected: false, autoSync: true }, syncNow).auto.tick()).toBe(false);
    expect(await make({ connected: true, autoSync: false }, syncNow).auto.tick()).toBe(false);
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('erro na sincronização não derruba nada e não acumula', async () => {
    const { auto } = make({ connected: true, autoSync: true }, vi.fn().mockRejectedValue(new Error('Google fora do ar')));
    await expect(auto.tick()).resolves.toBe(false);
  });

  it('não roda duas vezes ao mesmo tempo', async () => {
    let release;
    const syncNow = vi.fn(() => new Promise((r) => { release = r; }));
    const { auto } = make({ connected: true, autoSync: true }, syncNow);
    const first = auto.tick();
    expect(await auto.tick()).toBe(false);
    release({});
    await first;
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('start agenda a primeira rodada e o intervalo (uma vez só); stop cancela tudo', () => {
    const { auto, timers } = make({ connected: true, autoSync: true }, vi.fn());
    auto.start();
    auto.start(); // idempotente
    expect(timers.map((t) => [t.once ? 'primeira' : 'intervalo', t.ms])).toEqual([['intervalo', 1000], ['primeira', 50]]);
    auto.stop();
    expect(timers.every((t) => t.cleared)).toBe(true);
  });

  it('o app só liga o sincronizador quando pedido (testes e importações não criam timers)', async () => {
    const calls = [];
    const real = await makeApp(undefined, { googleFetch: google.fetch, autoSync: true });
    calls.push(real);
    await real.app.close(); // fechar para os timers: não pode ficar nada pendente
    expect(calls).toHaveLength(1);
  });
});

describe('agenda · segurança e backup', () => {
  it('nenhuma resposta da API devolve o segredo nem os tokens', async () => {
    await connect();
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60 });
    await sync();
    const texts = [];
    for (const url of ['/calendar/status', '/calendar/events', '/calendar/plan']) texts.push(JSON.stringify((await ctx.call('GET', url)).body));
    texts.push(JSON.stringify((await ctx.call('GET', '/backup')).body));
    for (const t of texts) for (const secret of ['segredo-super', 'REFRESH-1', 'ACCESS-']) expect(t).not.toContain(secret);
  });

  it('o backup guarda o plano de estudo, mas não as credenciais; restaurar não desconecta o Google', async () => {
    await connect();
    const c = await mkCourse('Redes');
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60, courseId: c.id });
    const bk = (await ctx.call('GET', '/backup')).body.data;
    expect(bk.data.studyPlan).toEqual([expect.objectContaining({ weekday: 0, start_time: '09:00', duration_min: 60, course_id: c.id })]);
    expect(JSON.stringify(bk)).not.toMatch(/client_secret|refresh_token|access_token/);

    const other = await makeApp(undefined, { googleFetch: google.fetch });
    try {
      expect((await other.call('POST', '/backup/restore', { confirm: 'substituir-tudo', backup: bk })).status).toBe(200);
      expect((await other.call('GET', '/calendar/plan')).body.data).toEqual([expect.objectContaining({ weekday: 0, startTime: '09:00', courseTitle: 'Redes' })]);
      expect((await other.call('GET', '/calendar/status')).body.data.connected).toBe(false); // outro banco: nunca esteve conectado
    } finally { await other.app.close(); }

    // no mesmo banco, restaurar mantém a conexão
    expect((await ctx.call('POST', '/backup/restore', { confirm: 'substituir-tudo', backup: bk })).status).toBe(200);
    expect((await get('/calendar/status')).connected).toBe(true);
  });

  it('backup antigo, sem plano, é aceito e esvazia o plano', async () => {
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60 });
    const bk = (await ctx.call('GET', '/backup')).body.data;
    delete bk.data.studyPlan;
    expect((await ctx.call('POST', '/backup/restore', { confirm: 'substituir-tudo', backup: bk })).status).toBe(200);
    expect(await get('/calendar/plan')).toEqual([]);
  });

  it('backup com plano apontando para curso inexistente é recusado', async () => {
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60 });
    const bk = (await ctx.call('GET', '/backup')).body.data;
    bk.data.studyPlan[0].course_id = 999;
    expect((await ctx.call('POST', '/backup/restore', { confirm: 'substituir-tudo', backup: bk })).status).toBe(400);
  });
});

describe('agenda · calendário para assinar (Mac, iPhone, Outlook)', () => {
  const feed = async (qs = '') => ctx.app.inject({ method: 'GET', url: `/api/v1/calendar/feed.ics${qs}`, headers: HOST });
  const unfold = (text) => text.replace(/\r\n[ \t]/g, '').split('\r\n');
  const field = (lines, name) => lines.filter((l) => l.startsWith(`${name}:`)).map((l) => l.slice(name.length + 1));

  it('funciona sem Google: não pede conexão nem chave, e devolve um calendário válido mesmo vazio', async () => {
    const r = await feed();
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/calendar');
    expect(r.headers['cache-control']).toBe('no-cache');
    expect(r.body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(r.body.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(r.body).not.toContain('BEGIN:VEVENT');
    expect(google.state.calls).toHaveLength(0);
  });

  it('inclui os blocos do plano das próximas 4 semanas, no horário certo (UTC), com lembrete e UID estável', async () => {
    const c = await mkCourse('Redes, TCP; IP');
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60, courseId: c.id });
    const lines = unfold((await feed()).body);
    expect(field(lines, 'SUMMARY')).toEqual(Array(4).fill('📚 Estudar: Redes\\, TCP\\; IP'));
    const starts = field(lines, 'DTSTART').sort();
    const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    expect(starts).toEqual(['2026-03-16T09:00:00', '2026-03-23T09:00:00', '2026-03-30T09:00:00', '2026-04-06T09:00:00'].map(utc));
    expect(field(lines, 'UID').sort()).toEqual(expect.arrayContaining([expect.stringMatching(/^plan-1-2026-03-16@learning-center$/)]));
    expect(lines.filter((l) => l === 'TRIGGER:-PT10M')).toHaveLength(4);
    // o mesmo pedido de novo dá os mesmos UIDs (o Calendário atualiza em vez de duplicar)
    expect(field(unfold((await feed()).body), 'UID').sort()).toEqual(field(lines, 'UID').sort());
  });

  it('mudar o plano muda o calendário assinado; apagar o bloco tira os eventos', async () => {
    const p = (await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60 })).body.data;
    expect((await feed()).body.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    await ctx.call('PATCH', `/calendar/plan/${p.id}`, { startTime: '10:30', durationMin: 90 });
    const lines = unfold((await feed()).body);
    const s = new Date('2026-03-16T10:30:00'); const e = new Date('2026-03-16T12:00:00');
    const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    expect(field(lines, 'DTSTART')).toContain(utc(s));
    expect(field(lines, 'DTEND')).toContain(utc(e));
    await ctx.call('DELETE', `/calendar/plan/${p.id}`);
    expect((await feed()).body).not.toContain('BEGIN:VEVENT');
  });

  it('inclui as sessões de foco concluídas (sem os registros manuais) e respeita a opção de desligar', async () => {
    const c = await mkCourse('Redes');
    const s = (await ctx.call('POST', '/sessions/start', { courseId: c.id, kind: 'stopwatch' })).body.data;
    ctx.clock.advance(45 * 60000);
    await ctx.call('POST', `/sessions/${s.id}/finish`, {});
    await ctx.call('POST', '/sessions/manual', { courseId: c.id, durationMin: 30 });
    const lines = unfold((await feed()).body);
    expect(field(lines, 'SUMMARY')).toEqual(['✅ Estudei: Redes (45 min)']);
    expect(field(lines, 'UID')).toEqual([`session-${s.id}@learning-center`]);
    expect(lines).not.toContain('BEGIN:VALARM');
    await ctx.call('PATCH', '/calendar/settings', { logSessions: false });
    expect((await feed()).body).not.toContain('BEGIN:VEVENT');
  });

  it('"?download=1" baixa como arquivo .ics; sem isso abre como texto (para a assinatura)', async () => {
    expect((await feed('?download=1')).headers['content-disposition']).toBe('attachment; filename="learning-center-estudos.ics"');
    expect((await feed()).headers['content-disposition']).toBeUndefined();
  });

  it('nenhuma linha do arquivo passa de 75 bytes, mesmo com título gigante', async () => {
    const c = await mkCourse(`Curso com um nome bem comprido ${'muito '.repeat(20)}`);
    await addPlan({ weekday: 0, startTime: '09:00', durationMin: 60, courseId: c.id });
    const body = (await feed()).body;
    expect(body.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(unfold(body).find((l) => l.startsWith('SUMMARY:'))).toContain('muito muito');
  });
});

describe('agenda · próximos dias (sem agenda externa)', () => {
  it('sem plano nem sessões devolve lista vazia, sem precisar conectar nada', async () => {
    expect(await get('/calendar/upcoming')).toEqual([]);
  });

  it('mostra os blocos do plano dos próximos 7 dias, em ordem, com curso, próxima aula e horário local', async () => {
    const c = await mkCourse('Redes');
    await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45, courseId: c.id }); // quarta (hoje, 15:00)
    await addPlan({ weekday: 3, startTime: '07:30', durationMin: 30 }); // quinta
    const list = await get('/calendar/upcoming');
    expect(list.map((e) => e.title)).toEqual(['📚 Estudar: Redes', '📚 Hora de estudar']);
    expect(list[0]).toMatchObject({ kind: 'plan', calendar: 'study', allDay: false, courseId: c.id, courseTitle: 'Redes', url: null });
    expect(new Date(list[0].start).getTime()).toBe(new Date('2026-03-11T20:00:00').getTime());
    expect(new Date(list[0].end).getTime()).toBe(new Date('2026-03-11T20:45:00').getTime());
    expect(list[1].courseId).toBeNull();
  });

  it('respeita o número de dias e valida o limite', async () => {
    await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45 });
    expect(await get('/calendar/upcoming?days=1')).toHaveLength(1); // só hoje
    expect(await get('/calendar/upcoming?days=14')).toHaveLength(2); // hoje e quarta que vem
    expect((await ctx.call('GET', '/calendar/upcoming?days=0')).status).toBe(400);
    expect((await ctx.call('GET', '/calendar/upcoming?days=15')).status).toBe(400);
  });

  it('bloco de hoje que já passou não aparece; sessão concluída hoje aparece como "✅ Estudei"', async () => {
    await addPlan({ weekday: 2, startTime: '08:00', durationMin: 60 });
    const c = await mkCourse('Redes');
    const s = (await ctx.call('POST', '/sessions/start', { courseId: c.id, kind: 'stopwatch' })).body.data;
    ctx.clock.advance(25 * 60000);
    await ctx.call('POST', `/sessions/${s.id}/finish`, {});
    const list = await get('/calendar/upcoming?days=1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'session', title: '✅ Estudei: Redes (25 min)', calendar: 'study' });
  });
});
