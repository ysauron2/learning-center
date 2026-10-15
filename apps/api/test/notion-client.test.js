import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../src/core/migrate.js';
import { fixedClock } from '../src/core/time.js';
import { createNotionClient, NotionError } from '../src/core/notion.js';
import { createFakeNotion } from './fake-notion.js';

let db;
let notion;
let client;
let sleeps;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  notion = createFakeNotion();
  sleeps = [];
  client = createNotionClient({ db, clock: fixedClock('2026-03-11T15:00:00'), fetchImpl: notion.fetch, pauseMs: 0, sleep: async (ms) => { sleeps.push(ms); } });
});

describe('código da integração', () => {
  it('começa sem nada conectado', () => {
    expect(client.publicState()).toMatchObject({ hasToken: false, connected: false, autoSync: true, logSessions: true });
  });

  it('confere o código no Notion, guarda o nome do robô e do espaço e nunca devolve o código', async () => {
    await client.saveToken('  ntn_good  ');
    const s = client.publicState();
    expect(s).toMatchObject({ hasToken: true, botName: 'Learning Center', workspace: 'Meu espaço', connected: false });
    expect(JSON.stringify(s)).not.toContain('ntn_good');
    expect(client.row().token).toBe('ntn_good');
  });

  it('usa a versão fixa da API e o cabeçalho de autorização', async () => {
    await client.saveToken('ntn_good');
    expect(notion.state.calls[0]).toMatchObject({ method: 'GET', path: '/users/me', version: '2022-06-28', auth: 'Bearer ntn_good' });
  });

  it('código errado: erro claro em português e nada é guardado', async () => {
    await expect(client.saveToken('ntn_errado')).rejects.toMatchObject({ status: 401, code: 'bad_token', message: expect.stringContaining('não aceitou') });
    expect(client.publicState().hasToken).toBe(false);
  });

  it('código vazio é rejeitado antes de chamar o Notion', async () => {
    await expect(client.saveToken('   ')).rejects.toMatchObject({ status: 400 });
    expect(notion.state.calls).toHaveLength(0);
  });

  it('trocar de código esquece a tabela escolhida; repetir o mesmo mantém', async () => {
    await client.saveToken('ntn_good');
    client.save({ parent_page_id: 'page-1', database_id: 'db-1', database_url: 'u', connected_at: 'x' });
    await client.saveToken('ntn_good');
    expect(client.publicState().connected).toBe(true);
    notion.state.token = 'ntn_outro';
    await client.saveToken('ntn_outro');
    expect(client.publicState()).toMatchObject({ connected: false, databaseUrl: null });
    expect(client.row().parent_page_id).toBeNull();
  });

  it('pedir algo sem código dá erro de "não conectado"', async () => {
    await expect(client.request('GET', '/users/me')).rejects.toMatchObject({ code: 'not_connected' });
  });
});

describe('pedidos', () => {
  beforeEach(async () => { await client.saveToken('ntn_good'); });

  it('espera e tenta de novo quando o Notion pede calma (429), respeitando o tempo indicado', async () => {
    notion.state.rateLimit = 2;
    const me = await client.request('GET', '/users/me');
    expect(me.name).toBe('Learning Center');
    expect(notion.callsTo(/users\/me/)).toHaveLength(4); // 1 do saveToken + 2 recusadas (429) + 1 que deu certo
    expect(sleeps.filter((s) => s === 0)).toHaveLength(2);
  });

  it('desiste depois de algumas tentativas e devolve o erro do Notion', async () => {
    notion.state.rateLimit = 99;
    await expect(client.request('GET', '/users/me')).rejects.toMatchObject({ status: 429 });
    expect(notion.state.rateLimit).toBe(99 - 4);
  });

  it('erros do Notion viram NotionError com a mensagem e o código', async () => {
    notion.state.failNext = { status: 500, code: 'internal_server_error', message: 'caiu' };
    const err = await client.request('GET', '/users/me').catch((e) => e);
    expect(err).toBeInstanceOf(NotionError);
    expect(err).toMatchObject({ status: 500, code: 'internal_server_error', message: 'caiu' });
  });

  it('código revogado depois de conectar: 401', async () => {
    notion.revokeToken();
    await expect(client.request('GET', '/users/me')).rejects.toMatchObject({ status: 401 });
  });

  it('espaça os pedidos quando há pausa configurada', async () => {
    const spaced = createNotionClient({ db, clock: fixedClock('2026-03-11T15:00:00'), fetchImpl: notion.fetch, pauseMs: 350, sleep: async (ms) => { sleeps.push(ms); } });
    sleeps.length = 0;
    await spaced.request('GET', '/users/me');
    await spaced.request('GET', '/users/me');
    expect(sleeps.some((s) => s > 0 && s <= 350)).toBe(true);
  });
});

describe('simulador', () => {
  it('cria linha só em banco existente e só com propriedades que existem', async () => {
    await client.saveToken('ntn_good');
    const dbRes = await client.request('POST', '/databases', { parent: { type: 'page_id', page_id: 'page-1' }, title: [{ text: { content: 'T' } }], properties: { Nome: { title: {} } } });
    await expect(client.request('POST', '/pages', { parent: { database_id: dbRes.id }, properties: { Outra: { title: [{ text: { content: 'x' } }] } } })).rejects.toMatchObject({ status: 400 });
    const row = await client.request('POST', '/pages', { parent: { database_id: dbRes.id }, properties: { Nome: { title: [{ text: { content: 'Aula' } }] } } });
    expect(notion.text(row, 'Nome')).toBe('Aula');
    await expect(client.request('POST', '/databases', { parent: { type: 'page_id', page_id: 'nao-existe' }, title: [], properties: {} })).rejects.toMatchObject({ status: 404 });
  });
});
