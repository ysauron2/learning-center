import { HttpError } from './errors.js';

const BASE = 'https://api.notion.com/v1';
// Versão da API fixada: assim o Notion não muda o comportamento por baixo dos panos.
const NOTION_VERSION = '2022-06-28';
const MAX_RETRIES = 3;

export class NotionError extends Error {
  constructor(status, message, code = 'notion_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Cliente da API do Notion (token de "integração interna"; sem OAuth).
 * O Notion aceita ~3 pedidos por segundo: o cliente espaça as chamadas e, se mesmo assim
 * responder "muitas requisições" (429), espera o tempo indicado e tenta de novo.
 */
export function createNotionClient({ db, clock, fetchImpl = fetch, pauseMs = 350, sleep = realSleep }) {
  let lastCall = 0;
  const row = () => db.prepare('SELECT * FROM lc_notion WHERE id = 1').get();
  const COLUMNS = new Set(['token', 'bot_name', 'workspace_name', 'parent_page_id', 'database_id', 'database_url', 'connected_at', 'last_sync_at', 'last_error', 'auto_sync', 'log_sessions']);

  function save(patch) {
    const entries = Object.entries(patch).filter(([k]) => COLUMNS.has(k));
    if (!entries.length) return;
    db.prepare(`UPDATE lc_notion SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = 1`).run(...entries.map(([, v]) => v));
  }

  const clearAll = () => save({ token: null, bot_name: null, workspace_name: null, parent_page_id: null, database_id: null, database_url: null, connected_at: null });

  /** O que a tela pode ver. Nunca inclui o código da integração. */
  function publicState() {
    const r = row();
    return {
      hasToken: Boolean(r.token),
      botName: r.bot_name,
      workspace: r.workspace_name,
      connected: Boolean(r.token && r.database_id),
      databaseUrl: r.database_url,
      connectedAt: r.connected_at,
      lastSyncAt: r.last_sync_at,
      lastError: r.last_error,
      autoSync: Boolean(r.auto_sync),
      logSessions: Boolean(r.log_sessions),
    };
  }

  async function request(method, path, body, tokenOverride) {
    const token = tokenOverride ?? row().token;
    if (!token) throw new NotionError(401, 'O Notion não está conectado.', 'not_connected');
    for (let attempt = 0; ; attempt += 1) {
      const wait = lastCall + pauseMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall = Date.now();
      const res = await fetchImpl(`${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const seconds = Number(res.headers?.get?.('retry-after') ?? 1);
        await sleep((Number.isFinite(seconds) ? seconds : 1) * 1000);
        continue;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new NotionError(res.status, data?.message ?? `Erro ${res.status} do Notion.`, data?.code ?? 'api_error');
      return data;
    }
  }

  /** Confere o código com o Notion e só então guarda. Trocar de código zera a tabela escolhida. */
  async function saveToken(raw) {
    const token = String(raw ?? '').trim();
    if (!token) throw new HttpError(400, 'VALIDATION_ERROR', 'Cole o código da integração do Notion.');
    let me;
    try {
      me = await request('GET', '/users/me', null, token);
    } catch (err) {
      if (err instanceof NotionError && err.status === 401) {
        throw new NotionError(401, 'O Notion não aceitou esse código. Confira se copiou o código inteiro (começa com "ntn_" ou "secret_").', 'bad_token');
      }
      throw err;
    }
    const changed = token !== row().token;
    save({ token, bot_name: me?.name ?? null, workspace_name: me?.bot?.workspace_name ?? null, last_error: null });
    if (changed) save({ parent_page_id: null, database_id: null, database_url: null, connected_at: null });
  }

  return { publicState, request, saveToken, save, row, clearAll };
}
