import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from './errors.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API_BASE = 'https://www.googleapis.com/calendar/v3';
const STATE_TTL_MS = 10 * 60 * 1000;
const EARLY_MS = 60 * 1000; // renova um minuto antes de vencer

/** Permissões mínimas: eventos e os calendários criados por este app. Sem e-mail, contatos nem a agenda toda. */
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.app.created',
];

export class GoogleError extends Error {
  constructor(status, message, code = 'google_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/**
 * Cliente do Google (OAuth 2.0 com PKCE + Calendar API v3).
 * Guarda tudo na linha única de `lc_google`. `fetchImpl` é injetável: os testes usam um simulador.
 */
export function createGoogleClient({ db, clock, fetchImpl = fetch }) {
  const pending = new Map(); // state -> { verifier, redirectUri, expires }
  let refreshing = null;

  const row = () => db.prepare('SELECT * FROM lc_google WHERE id = 1').get();
  const COLUMNS = new Set(['client_id', 'client_secret', 'refresh_token', 'access_token', 'access_expires_at', 'account_email',
    'study_calendar_id', 'connected_at', 'last_sync_at', 'last_error', 'auto_sync', 'log_sessions']);

  function save(patch) {
    const entries = Object.entries(patch).filter(([k]) => COLUMNS.has(k));
    if (!entries.length) return;
    db.prepare(`UPDATE lc_google SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = 1`).run(...entries.map(([, v]) => v));
  }

  const configured = (r = row()) => Boolean(r.client_id && r.client_secret);

  /** O que o resto do app e a tela podem ver. Nunca inclui segredo nem tokens. */
  function publicState() {
    const r = row();
    return {
      configured: configured(r),
      connected: Boolean(r.refresh_token),
      clientId: r.client_id,
      account: r.account_email,
      hasStudyCalendar: Boolean(r.study_calendar_id),
      connectedAt: r.connected_at,
      lastSyncAt: r.last_sync_at,
      lastError: r.last_error,
      autoSync: Boolean(r.auto_sync),
      logSessions: Boolean(r.log_sessions),
    };
  }

  function saveConfig({ clientId, clientSecret }) {
    const id = String(clientId ?? '').trim();
    const secret = String(clientSecret ?? '').trim();
    if (!id || !secret) throw new HttpError(400, 'VALIDATION_ERROR', 'Informe o ID do cliente e o segredo do Google.');
    const r = row();
    const changed = id !== r.client_id || secret !== r.client_secret;
    save({ client_id: id, client_secret: secret });
    // tokens emitidos para outro app do Google não servem mais
    if (changed) save({ refresh_token: null, access_token: null, access_expires_at: null, account_email: null, study_calendar_id: null, connected_at: null, last_error: null });
  }

  function authUrl(redirectUri) {
    const r = row();
    if (!configured(r)) throw new HttpError(400, 'NOT_CONFIGURED', 'Configure o ID e o segredo do Google antes de conectar.');
    const now = clock.now().getTime();
    for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
    const state = b64url(randomBytes(24));
    const verifier = b64url(randomBytes(32));
    pending.set(state, { verifier, redirectUri, expires: now + STATE_TTL_MS });
    const params = new URLSearchParams({
      client_id: r.client_id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: b64url(createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
    });
    return { url: `${AUTH_URL}?${params}`, state };
  }

  async function postForm(url, fields) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  }

  async function handleCallback({ code, state, error }) {
    if (error) {
      throw new GoogleError(400, error === 'access_denied'
        ? 'Você negou a permissão ou cancelou. Para usar o Google Agenda, aceite o acesso.'
        : `O Google recusou a conexão (${error}).`, 'denied');
    }
    const entry = pending.get(state);
    pending.delete(state); // cada state vale uma vez só
    if (!entry) throw new GoogleError(400, 'Pedido de conexão inválido ou já usado. Tente conectar de novo.', 'bad_state');
    if (entry.expires < clock.now().getTime()) throw new GoogleError(400, 'A conexão expirou. Tente conectar de novo.', 'bad_state');
    const r = row();
    const res = await postForm(TOKEN_URL, {
      grant_type: 'authorization_code',
      code,
      client_id: r.client_id,
      client_secret: r.client_secret,
      redirect_uri: entry.redirectUri,
      code_verifier: entry.verifier,
    });
    if (!res.ok) {
      throw new GoogleError(res.status, `O Google não aceitou o código (${res.body?.error_description ?? res.body?.error ?? res.status}). Confira o ID e o segredo e tente de novo.`, 'token_error');
    }
    if (!res.body?.refresh_token) {
      throw new GoogleError(400, 'O Google não enviou a permissão de uso contínuo. Remova o acesso deste app em myaccount.google.com/permissions e tente de novo.', 'no_refresh');
    }
    save({
      refresh_token: res.body.refresh_token,
      access_token: res.body.access_token,
      access_expires_at: new Date(clock.now().getTime() + (res.body.expires_in ?? 3600) * 1000).toISOString(),
      connected_at: clock.now().toISOString(),
      last_error: null,
    });
  }

  async function refresh() {
    const r = row();
    const res = await postForm(TOKEN_URL, {
      grant_type: 'refresh_token',
      refresh_token: r.refresh_token,
      client_id: r.client_id,
      client_secret: r.client_secret,
    });
    if (!res.ok) {
      if (res.body?.error === 'invalid_grant') {
        save({ refresh_token: null, access_token: null, access_expires_at: null, last_error: 'O acesso ao Google Agenda expirou ou foi removido. Conecte de novo.' });
        throw new GoogleError(401, 'O acesso ao Google Agenda expirou ou foi removido. Conecte de novo.', 'invalid_grant');
      }
      throw new GoogleError(res.status, `Não foi possível renovar o acesso ao Google (${res.body?.error_description ?? res.status}).`, 'refresh_error');
    }
    save({
      access_token: res.body.access_token,
      access_expires_at: new Date(clock.now().getTime() + (res.body.expires_in ?? 3600) * 1000).toISOString(),
    });
    return res.body.access_token;
  }

  function accessToken({ force = false } = {}) {
    const r = row();
    if (!r.refresh_token) throw new GoogleError(401, 'O Google Agenda não está conectado.', 'not_connected');
    if (!force && r.access_token && r.access_expires_at && new Date(r.access_expires_at).getTime() - clock.now().getTime() > EARLY_MS) {
      return Promise.resolve(r.access_token);
    }
    refreshing ??= refresh().finally(() => { refreshing = null; }); // várias chamadas juntas renovam uma vez só
    return refreshing;
  }

  async function api(method, path, { query, body } = {}) {
    const url = new URL(`${API_BASE}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v === undefined || v === null) continue;
      for (const item of Array.isArray(v) ? v : [v]) url.searchParams.append(k, String(item));
    }
    const send = async (token) => fetchImpl(url.toString(), {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let res = await send(await accessToken());
    if (res.status === 401) res = await send(await accessToken({ force: true })); // o Google recusou: renova e tenta uma vez
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new GoogleError(res.status, data?.error?.message ?? `Erro ${res.status} do Google Agenda.`, 'api_error');
    return data;
  }

  async function disconnect() {
    const r = row();
    const token = r.refresh_token ?? r.access_token;
    if (token) {
      try {
        await fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      } catch { /* sem rede: desconecta só localmente */ }
    }
    save({ refresh_token: null, access_token: null, access_expires_at: null, account_email: null, study_calendar_id: null, connected_at: null, last_error: null });
  }

  return { publicState, saveConfig, authUrl, handleCallback, api, disconnect, save, row, configured: () => configured() };
}
