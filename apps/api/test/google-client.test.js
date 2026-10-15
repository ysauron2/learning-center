import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../src/core/migrate.js';
import { fixedClock } from '../src/core/time.js';
import { createGoogleClient, GoogleError, SCOPES } from '../src/core/google.js';
import { createFakeGoogle } from './fake-google.js';

let db;
let clock;
let google;
let client;
const REDIRECT = 'http://localhost:3000/api/v1/calendar/callback';

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  clock = fixedClock('2026-03-11T15:00:00');
  google = createFakeGoogle();
  client = createGoogleClient({ db, clock, fetchImpl: google.fetch });
  client.saveConfig({ clientId: 'meu-id.apps.googleusercontent.com', clientSecret: 'segredo' });
});

async function connect() {
  const { url } = client.authUrl(REDIRECT);
  const state = new URL(url).searchParams.get('state');
  await client.handleCallback({ code: 'good-code', state });
}

describe('configuração', () => {
  it('guarda o ID e o segredo; o estado público nunca devolve o segredo', () => {
    const s = client.publicState();
    expect(s).toMatchObject({ configured: true, connected: false, clientId: 'meu-id.apps.googleusercontent.com' });
    expect(JSON.stringify(s)).not.toContain('segredo');
  });

  it('sem ID ou segredo não está configurado e não monta o endereço de login', () => {
    expect(() => client.saveConfig({ clientId: ' ', clientSecret: 'x' })).toThrow();
    db.prepare("UPDATE lc_google SET client_id = '', client_secret = ''").run();
    expect(client.publicState().configured).toBe(false);
    expect(() => client.authUrl(REDIRECT)).toThrow(/configure/i);
  });

  it('trocar o ID/segredo de uma conta já conectada desconecta (os tokens eram de outro app)', async () => {
    await connect();
    expect(client.publicState().connected).toBe(true);
    client.saveConfig({ clientId: 'outro-id', clientSecret: 'outro' });
    expect(client.publicState().connected).toBe(false);
  });
});

describe('endereço de login (OAuth com PKCE)', () => {
  it('monta o endereço do Google com permissões mínimas, retorno ao app e desafio PKCE', () => {
    const { url } = client.authUrl(REDIRECT);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const p = u.searchParams;
    expect(p.get('client_id')).toBe('meu-id.apps.googleusercontent.com');
    expect(p.get('redirect_uri')).toBe(REDIRECT);
    expect(p.get('response_type')).toBe('code');
    expect(p.get('access_type')).toBe('offline');
    expect(p.get('prompt')).toBe('consent');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get('state')).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(p.get('scope').split(' ')).toEqual(SCOPES);
    // permissões enxutas: eventos + calendários criados pelo app; nada de e-mail, contatos ou agenda inteira
    expect(SCOPES).toEqual(['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.app.created']);
  });

  it('cada pedido gera um state diferente', () => {
    const a = new URL(client.authUrl(REDIRECT).url).searchParams.get('state');
    const b = new URL(client.authUrl(REDIRECT).url).searchParams.get('state');
    expect(a).not.toBe(b);
  });
});

describe('volta do Google (callback)', () => {
  it('troca o código por tokens (com o verificador PKCE correto) e fica conectado', async () => {
    const { url } = client.authUrl(REDIRECT);
    const challenge = new URL(url).searchParams.get('code_challenge');
    const state = new URL(url).searchParams.get('state');
    await client.handleCallback({ code: 'good-code', state });
    const call = google.state.tokenCalls[0];
    expect(call).toMatchObject({ grant_type: 'authorization_code', code: 'good-code', client_id: 'meu-id.apps.googleusercontent.com', client_secret: 'segredo', redirect_uri: REDIRECT });
    expect(createHash('sha256').update(call.code_verifier).digest('base64url')).toBe(challenge);
    expect(client.publicState()).toMatchObject({ connected: true });
  });

  it('recusa state desconhecido, repetido ou vencido (proteção contra pedido forjado)', async () => {
    await expect(client.handleCallback({ code: 'good-code', state: 'inventado' })).rejects.toThrow(/inválid|expirou/i);
    const { url } = client.authUrl(REDIRECT);
    const state = new URL(url).searchParams.get('state');
    await client.handleCallback({ code: 'good-code', state });
    await expect(client.handleCallback({ code: 'good-code', state })).rejects.toThrow(/inválid|expirou/i); // não vale duas vezes
    const old = new URL(client.authUrl(REDIRECT).url).searchParams.get('state');
    clock.advance(11 * 60 * 1000);
    await expect(client.handleCallback({ code: 'good-code', state: old })).rejects.toThrow(/expirou/i);
  });

  it('código recusado pelo Google vira erro claro e não deixa conectado', async () => {
    const state = new URL(client.authUrl(REDIRECT).url).searchParams.get('state');
    await expect(client.handleCallback({ code: 'ruim', state })).rejects.toBeInstanceOf(GoogleError);
    expect(client.publicState().connected).toBe(false);
  });

  it('sem refresh_token (acesso já concedido antes) pede para remover o acesso e tentar de novo', async () => {
    google.state.omitRefreshToken = true;
    const state = new URL(client.authUrl(REDIRECT).url).searchParams.get('state');
    await expect(client.handleCallback({ code: 'good-code', state })).rejects.toThrow(/remova|tente de novo/i);
    expect(client.publicState().connected).toBe(false);
  });

  it('usuário que negou a permissão: mensagem amigável', async () => {
    await expect(client.handleCallback({ error: 'access_denied', state: 'x' })).rejects.toThrow(/negou|cancel/i);
  });
});

describe('uso da API e renovação do acesso', () => {
  it('chama a API com o token de acesso e devolve o JSON', async () => {
    await connect();
    const r = await client.api('GET', '/calendars/primary/events', { query: { maxResults: 5 } });
    expect(r.summary).toBe('pessoa@example.com');
    const call = google.callsTo(/GET .*events/)[0];
    expect(call.query.maxResults).toBe('5');
  });

  it('renova sozinho quando o token vence (e só uma vez por vencimento)', async () => {
    await connect();
    clock.advance(2 * 60 * 60 * 1000); // passou das 1h de validade
    await client.api('GET', '/calendars/primary/events');
    await client.api('GET', '/calendars/primary/events');
    expect(google.state.tokenCalls.filter((c) => c.grant_type === 'refresh_token')).toHaveLength(1);
  });

  it('se o Google recusar o token (401) renova e tenta de novo, sem a pessoa perceber', async () => {
    await connect();
    google.expireAccessTokens();
    const r = await client.api('GET', '/calendars/primary/events');
    expect(r.items).toEqual([]);
    expect(google.state.tokenCalls.filter((c) => c.grant_type === 'refresh_token')).toHaveLength(1);
  });

  it('várias chamadas ao mesmo tempo com token vencido renovam uma vez só', async () => {
    await connect();
    clock.advance(2 * 60 * 60 * 1000);
    await Promise.all([1, 2, 3].map(() => client.api('GET', '/calendars/primary/events')));
    expect(google.state.tokenCalls.filter((c) => c.grant_type === 'refresh_token')).toHaveLength(1);
  });

  it('acesso revogado no Google (invalid_grant): desconecta e avisa para conectar de novo', async () => {
    await connect();
    google.revokeRefresh();
    google.expireAccessTokens();
    await expect(client.api('GET', '/calendars/primary/events')).rejects.toMatchObject({ code: 'invalid_grant', status: 401 });
    const s = client.publicState();
    expect(s.connected).toBe(false);
    expect(s.lastError).toMatch(/conecte de novo/i);
  });

  it('sem conectar, qualquer chamada falha com mensagem clara e não toca a rede', async () => {
    await expect(client.api('GET', '/calendars/primary/events')).rejects.toMatchObject({ code: 'not_connected' });
    expect(google.state.calls).toHaveLength(0);
  });

  it('erros da API viram GoogleError com a mensagem do Google; 204 devolve null', async () => {
    await connect();
    google.state.failNext = { status: 403, body: { error: { code: 403, message: 'Calendar API has not been used in project' } } };
    await expect(client.api('GET', '/calendars/primary/events')).rejects.toMatchObject({ status: 403, message: expect.stringContaining('Calendar API has not been used') });
    const ev = await client.api('POST', '/calendars/primary/events', { body: { summary: 'x', start: { dateTime: '2026-03-12T10:00:00Z' }, end: { dateTime: '2026-03-12T11:00:00Z' } } });
    expect(await client.api('DELETE', `/calendars/primary/events/${ev.id}`)).toBeNull();
  });

  it('o segredo e os tokens nunca aparecem no estado público', async () => {
    await connect();
    const text = JSON.stringify(client.publicState());
    for (const secret of ['segredo', 'REFRESH-1', 'ACCESS-1']) expect(text).not.toContain(secret);
  });
});

describe('desconectar', () => {
  it('revoga no Google e apaga os tokens, mantendo o ID e o segredo para reconectar', async () => {
    await connect();
    await client.disconnect();
    expect(google.state.revoked).toBe(true);
    const s = client.publicState();
    expect(s).toMatchObject({ connected: false, configured: true });
    expect(db.prepare('SELECT refresh_token, access_token FROM lc_google').get()).toEqual({ refresh_token: null, access_token: null });
  });

  it('mesmo que o Google não responda, desconectar localmente funciona', async () => {
    await connect();
    const broken = createGoogleClient({ db, clock, fetchImpl: async () => { throw new Error('sem rede'); } });
    await broken.disconnect();
    expect(broken.publicState().connected).toBe(false);
  });
});
