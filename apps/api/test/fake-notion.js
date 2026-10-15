/**
 * Simulador do Notion para os testes: usuários, páginas compartilhadas com a integração, bancos de dados,
 * consulta com filtro de data e paginação, criação, atualização e arquivamento de páginas, e o limite de
 * velocidade (429). Nada aqui fala com a internet.
 */
const headers = (h = {}) => ({ get: (k) => h[k.toLowerCase()] ?? null });
const res = (status, body, h) => ({ ok: status >= 200 && status < 300, status, headers: headers(h), json: async () => body });
const err = (status, code, message, h) => res(status, { object: 'error', status, code, message }, h);

const plain = (arr) => (arr ?? []).map((x) => ({ ...x, plain_text: x.text?.content ?? '' }));
const instant = (d) => (d ? new Date(d).getTime() : null);

export function createFakeNotion({ token = 'ntn_good', botName = 'Learning Center', workspace = 'Meu espaço' } = {}) {
  const state = {
    seq: 1,
    token,
    calls: [],
    pages: new Map([['page-1', { id: 'page-1', object: 'page', archived: false, url: 'https://notion.so/page-1', properties: { title: { type: 'title', title: plain([{ text: { content: 'Meus estudos' } }]) } } }],
                    ['page-2', { id: 'page-2', object: 'page', archived: false, url: 'https://notion.so/page-2', properties: { title: { type: 'title', title: plain([{ text: { content: 'Outra página' } }]) } } }]]),
    databases: new Map(),
    rows: new Map(), // id -> página (linha) de banco de dados
    rateLimit: 0, // quantas respostas 429 dar antes de voltar ao normal
    failNext: null,
    pageCap: null,
  };

  function dbPageMatches(row, filter) {
    if (row.archived) return false;
    const conds = filter?.and ?? (filter ? [filter] : []);
    return conds.every((c) => {
      const start = instant(row.properties[c.property]?.date?.start);
      if (c.date?.on_or_after && !(start >= instant(c.date.on_or_after))) return false;
      if (c.date?.on_or_before && !(start <= instant(c.date.on_or_before))) return false;
      return true;
    });
  }

  function normalizeProps(props) {
    const out = {};
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v.title) out[k] = { type: 'title', title: plain(v.title) };
      else if (v.rich_text) out[k] = { type: 'rich_text', rich_text: plain(v.rich_text) };
      else if (v.select) out[k] = { type: 'select', select: v.select };
      else if (v.date) out[k] = { type: 'date', date: v.date };
      else out[k] = v;
    }
    return out;
  }

  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    state.calls.push({ method, path: u.pathname.replace('/v1', ''), body, version: init.headers?.['Notion-Version'], auth: init.headers?.Authorization });
    if (u.origin !== 'https://api.notion.com') return err(404, 'object_not_found', 'rota desconhecida');
    if (state.rateLimit > 0) { state.rateLimit -= 1; return err(429, 'rate_limited', 'rate limited', { 'retry-after': '0' }); }
    if (init.headers?.Authorization !== `Bearer ${state.token}`) return err(401, 'unauthorized', 'API token is invalid.');
    if (state.failNext) { const f = state.failNext; state.failNext = null; return err(f.status, f.code ?? 'internal_server_error', f.message ?? 'erro simulado'); }
    const path = u.pathname.replace('/v1', '');

    if (method === 'GET' && path === '/users/me') return res(200, { object: 'user', type: 'bot', name: botName, bot: { workspace_name: workspace } });

    if (method === 'POST' && path === '/search') {
      const results = [...state.pages.values()].filter((p) => !p.archived);
      return res(200, { object: 'list', results, has_more: false, next_cursor: null });
    }

    if (method === 'POST' && path === '/databases') {
      const parent = state.pages.get(body.parent?.page_id);
      if (!parent || parent.archived) return err(404, 'object_not_found', 'Could not find page. Make sure the relevant pages are shared with your integration.');
      const id = `db-${state.seq++}`;
      const db = { id, object: 'database', archived: false, url: `https://notion.so/${id}`, parent: body.parent, title: body.title, properties: body.properties };
      state.databases.set(id, db);
      return res(200, db);
    }

    let m = path.match(/^\/databases\/([^/]+)\/query$/);
    if (method === 'POST' && m) {
      const db = state.databases.get(m[1]);
      if (!db || db.archived) return err(404, 'object_not_found', 'Could not find database.');
      const all = [...state.rows.values()].filter((r) => r.parent.database_id === m[1] && dbPageMatches(r, body?.filter));
      const size = Math.min(body?.page_size ?? 100, state.pageCap ?? Infinity);
      const offset = Number(body?.start_cursor ?? 0);
      const page = all.slice(offset, offset + size);
      const more = offset + size < all.length;
      return res(200, { object: 'list', results: structuredClone(page), has_more: more, next_cursor: more ? String(offset + size) : null });
    }

    if (method === 'POST' && path === '/pages') {
      const db = state.databases.get(body.parent?.database_id);
      if (!db || db.archived) return err(404, 'object_not_found', 'Could not find database.');
      for (const prop of Object.keys(body.properties)) if (!db.properties[prop]) return err(400, 'validation_error', `${prop} is not a property that exists.`);
      const id = `row-${state.seq++}`;
      const row = { id, object: 'page', archived: false, url: `https://notion.so/${id}`, parent: body.parent, properties: normalizeProps(body.properties) };
      state.rows.set(id, row);
      return res(200, structuredClone(row));
    }

    m = path.match(/^\/pages\/([^/]+)$/);
    if (method === 'PATCH' && m) {
      const row = state.rows.get(m[1]);
      if (!row) return err(404, 'object_not_found', 'Could not find page.');
      if (body.properties) Object.assign(row.properties, normalizeProps(body.properties));
      if (body.archived !== undefined) row.archived = body.archived;
      return res(200, structuredClone(row));
    }

    return err(404, 'object_not_found', `rota desconhecida no simulador: ${method} ${path}`);
  }

  return {
    fetch: fetchImpl,
    state,
    liveRows: () => [...state.rows.values()].filter((r) => !r.archived),
    allRows: () => [...state.rows.values()],
    /** Texto de uma propriedade (título ou texto) de uma linha. */
    text: (row, prop) => (row.properties[prop]?.title ?? row.properties[prop]?.rich_text ?? []).map((t) => t.plain_text).join(''),
    unsharePage: (id) => { const p = state.pages.get(id); if (p) p.archived = true; },
    deleteDatabase: (id) => { const d = state.databases.get(id); if (d) d.archived = true; },
    revokeToken: () => { state.token = 'REVOGADO'; },
    callsTo: (re) => state.calls.filter((c) => re.test(`${c.method} ${c.path}`)),
  };
}
