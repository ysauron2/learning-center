/**
 * Simulador do Google (OAuth + Calendar API) para os testes: guarda calendários e eventos em memória
 * e responde como a API real nos pontos que o app usa. Nada aqui fala com a internet.
 */
const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body ?? ''),
});

export function createFakeGoogle({ now = () => new Date(), email = 'pessoa@example.com' } = {}) {
  const calendars = new Map([['primary', { id: 'primary', summary: email, timeZone: 'America/Sao_Paulo' }]]);
  const events = new Map([['primary', new Map()]]);
  const state = {
    seq: 1,
    calls: [],
    validAccess: new Set(),
    accessCount: 0,
    refreshToken: 'REFRESH-1',
    authCode: 'good-code',
    tokenCalls: [],
    revoked: false,
    failNext: null, // { status, body } para simular erro na próxima chamada à API
    omitRefreshToken: false,
  };

  const instant = (t) => (t?.dateTime ? new Date(t.dateTime) : t?.date ? new Date(`${t.date}T00:00:00Z`) : null);

  function issueAccess() {
    state.accessCount += 1;
    const token = `ACCESS-${state.accessCount}`;
    state.validAccess.add(token);
    return token;
  }

  function token(form) {
    state.tokenCalls.push(Object.fromEntries(form));
    const grant = form.get('grant_type');
    if (grant === 'authorization_code') {
      if (form.get('code') !== state.authCode) return json(400, { error: 'invalid_grant', error_description: 'Bad code' });
      if (!form.get('code_verifier')) return json(400, { error: 'invalid_request' });
      const body = { access_token: issueAccess(), expires_in: 3600, token_type: 'Bearer', scope: 'x' };
      if (!state.omitRefreshToken) body.refresh_token = state.refreshToken;
      return json(200, body);
    }
    if (grant === 'refresh_token') {
      if (form.get('refresh_token') !== state.refreshToken) return json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      return json(200, { access_token: issueAccess(), expires_in: 3600, token_type: 'Bearer' });
    }
    return json(400, { error: 'unsupported_grant_type' });
  }

  function listEvents(calId, params) {
    const cal = calendars.get(calId);
    if (!cal) return json(404, { error: { code: 404, message: 'Not Found' } });
    const min = params.get('timeMin') ? new Date(params.get('timeMin')) : null;
    const max = params.get('timeMax') ? new Date(params.get('timeMax')) : null;
    const filters = params.getAll('privateExtendedProperty').map((p) => p.split('='));
    let items = [...events.get(calId).values()].filter((e) => e.status !== 'cancelled');
    items = items.filter((e) => {
      const s = instant(e.start);
      const en = instant(e.end) ?? s;
      if (min && en <= min) return false;
      if (max && s >= max) return false;
      return filters.every(([k, v]) => e.extendedProperties?.private?.[k] === v);
    });
    items.sort((a, b) => instant(a.start) - instant(b.start));
    const size = Math.min(Number(params.get('maxResults') ?? 250), state.pageCap ?? Infinity); // pageCap: o Google pode devolver páginas menores
    const offset = Number(params.get('pageToken') ?? 0);
    const page = items.slice(offset, offset + size);
    const body = { kind: 'calendar#events', summary: cal.summary, timeZone: cal.timeZone, items: page.map((e) => structuredClone(e)) };
    if (offset + size < items.length) body.nextPageToken = String(offset + size);
    return json(200, body);
  }

  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const method = (init.method ?? 'GET').toUpperCase();
    state.calls.push({ method, url: `${u.origin}${u.pathname}`, query: Object.fromEntries(u.searchParams), body: init.body });

    if (u.origin === 'https://oauth2.googleapis.com' && u.pathname === '/token') return token(new URLSearchParams(init.body));
    if (u.origin === 'https://oauth2.googleapis.com' && u.pathname === '/revoke') { state.revoked = true; return json(200, {}); }
    if (u.origin !== 'https://www.googleapis.com' || !u.pathname.startsWith('/calendar/v3/')) return json(404, { error: { message: 'rota desconhecida no simulador' } });

    const auth = (init.headers?.Authorization ?? init.headers?.authorization ?? '').replace('Bearer ', '');
    if (!state.validAccess.has(auth)) return json(401, { error: { code: 401, message: 'Invalid Credentials' } });
    if (state.failNext) { const f = state.failNext; state.failNext = null; return json(f.status, f.body ?? { error: { message: 'erro simulado' } }); }

    const path = u.pathname.replace('/calendar/v3', '');
    const body = init.body ? JSON.parse(init.body) : null;

    if (method === 'POST' && path === '/calendars') {
      const id = `cal${state.seq++}@group.calendar.google.com`;
      calendars.set(id, { id, summary: body.summary, timeZone: body.timeZone ?? 'America/Sao_Paulo' });
      events.set(id, new Map());
      return json(200, calendars.get(id));
    }
    const m = path.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (!m) return json(404, { error: { message: 'rota' } });
    const calId = decodeURIComponent(m[1]);
    const evId = m[2] ? decodeURIComponent(m[2]) : null;
    if (!calendars.has(calId)) return json(404, { error: { code: 404, message: 'Not Found' } });
    const store = events.get(calId);

    if (method === 'GET' && !evId) return listEvents(calId, u.searchParams);
    if (method === 'POST' && !evId) {
      const id = `ev${state.seq++}`;
      const ev = { id, status: 'confirmed', htmlLink: `https://calendar.google.com/event?eid=${id}`, ...body };
      store.set(id, ev);
      return json(200, structuredClone(ev));
    }
    if (method === 'PATCH' && evId) {
      const ev = store.get(evId);
      if (!ev) return json(404, { error: { message: 'Not Found' } });
      Object.assign(ev, body);
      return json(200, structuredClone(ev));
    }
    if (method === 'DELETE' && evId) {
      if (!store.has(evId)) return json(410, { error: { message: 'Resource has been deleted' } });
      store.delete(evId);
      return { ok: true, status: 204, json: async () => null, text: async () => '' };
    }
    return json(405, { error: { message: 'método não suportado' } });
  }

  return {
    fetch: fetchImpl,
    state,
    /** Faz os tokens de acesso emitidos até agora serem recusados (simula expiração no Google). */
    expireAccessTokens: () => state.validAccess.clear(),
    revokeRefresh: () => { state.refreshToken = 'REVOKED'; },
    calendars,
    eventsOf: (calId) => [...(events.get(calId) ?? new Map()).values()],
    allEvents: () => [...events.entries()].flatMap(([calId, m]) => [...m.values()].map((e) => ({ ...e, calendarId: calId }))),
    addEvent(calId, ev) {
      const id = `ext${state.seq++}`;
      events.get(calId).set(id, { id, status: 'confirmed', htmlLink: `https://calendar.google.com/event?eid=${id}`, ...ev });
      return id;
    },
    removeCalendar(calId) { calendars.delete(calId); events.delete(calId); },
    callsTo: (re) => state.calls.filter((c) => re.test(`${c.method} ${c.url}`)),
    now,
  };
}
