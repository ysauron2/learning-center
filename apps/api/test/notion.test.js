import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeApp } from './helpers.js';
import { createFakeNotion } from './fake-notion.js';
import { createAutoSync } from '../src/modules/calendar/auto-sync.js';

// Relógio do helper: quarta-feira 2026-03-11 15:00 (local). O plano olha 28 dias à frente.
let ctx;
let notion;
beforeEach(async () => {
  notion = createFakeNotion();
  ctx = await makeApp(undefined, { notionFetch: notion.fetch, notionPauseMs: 0, notionSleep: async () => {} });
});
afterEach(async () => { await ctx.app.close(); });

const get = async (url) => (await ctx.call('GET', url)).body.data;
const mkCourse = async (title) => (await ctx.call('POST', '/courses', { title })).body.data;
const addPlan = (p) => ctx.call('POST', '/calendar/plan', p);
const sync = () => ctx.call('POST', '/notion/sync');
const setToken = (token = 'ntn_good') => ctx.call('PUT', '/notion/token', { token });
const connectTo = (pageId = 'page-1') => ctx.call('POST', '/notion/connect', { pageId });
async function connected() {
  await setToken();
  return connectTo();
}
const rows = (tipo) => notion.liveRows().filter((r) => !tipo || r.properties.Tipo?.select?.name === tipo);
const keys = () => rows().map((r) => notion.text(r, 'Chave')).sort();

describe('notion · conexão', () => {
  it('começa desconectado, com auto-sincronização e registro de sessões ligados', async () => {
    expect(await get('/notion/status')).toMatchObject({ hasToken: false, connected: false, autoSync: true, logSessions: true, planBlocks: 0 });
  });

  it('o código vale: guarda, mostra o nome do robô e nunca devolve o código', async () => {
    const r = await setToken();
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ hasToken: true, botName: 'Learning Center', workspace: 'Meu espaço', connected: false });
    expect(JSON.stringify(r.body)).not.toContain('ntn_good');
    expect(JSON.stringify(await get('/notion/status'))).not.toContain('ntn_good');
  });

  it('código errado: 400 com mensagem em português e nada guardado', async () => {
    const r = await setToken('ntn_errado');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('NOTION_AUTH');
    expect(r.body.error.message).toMatch(/não aceitou/);
    expect((await get('/notion/status')).hasToken).toBe(false);
  });

  it('valida o corpo', async () => {
    expect((await ctx.call('PUT', '/notion/token', {})).status).toBe(400);
    expect((await ctx.call('PUT', '/notion/token', { token: '  ' })).status).toBe(400);
    await setToken();
    expect((await ctx.call('POST', '/notion/connect', {})).status).toBe(400);
  });

  it('lista só as páginas compartilhadas com a integração', async () => {
    await setToken();
    const pages = await get('/notion/pages');
    expect(pages).toEqual([
      { id: 'page-1', title: 'Meus estudos', url: 'https://notion.so/page-1' },
      { id: 'page-2', title: 'Outra página', url: 'https://notion.so/page-2' },
    ]);
  });

  it('sem código, listar páginas ou conectar dá 401', async () => {
    expect((await ctx.call('GET', '/notion/pages')).status).toBe(401);
    expect((await connectTo()).status).toBe(401);
  });

  it('conectar cria a tabela "Learning Center · Estudos" dentro da página escolhida', async () => {
    await setToken();
    const r = await connectTo('page-2');
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ connected: true, databaseUrl: expect.stringContaining('notion.so/db-') });
    const [db] = [...notion.state.databases.values()];
    expect(db.parent.page_id).toBe('page-2');
    expect(db.title[0].text.content).toBe('Learning Center · Estudos');
    expect(Object.keys(db.properties).sort()).toEqual(['Chave', 'Curso', 'Detalhes', 'Nome', 'Quando', 'Tipo']);
    expect(db.properties.Tipo.select.options.map((o) => o.name)).toEqual(['Estudo', 'Sessão feita']);
  });

  it('página que o Notion não enxerga: 400 explicando como compartilhar', async () => {
    await setToken();
    const r = await connectTo('page-que-nao-existe');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('NOTION_PAGE');
    expect(r.body.error.message).toMatch(/Conexões/);
    expect((await get('/notion/status')).connected).toBe(false);
  });

  it('desconectar esquece tudo no app e não apaga nada no Notion', async () => {
    await connected();
    await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45 });
    await sync();
    const before = rows().length;
    expect(before).toBeGreaterThan(0);
    const r = await ctx.call('POST', '/notion/disconnect');
    expect(r.body.data).toMatchObject({ hasToken: false, connected: false, databaseUrl: null, lastSyncAt: null });
    expect(rows()).toHaveLength(before);
    expect((await sync()).status).toBe(401);
  });

  it('o código não entra no backup nem volta a aparecer depois de restaurar', async () => {
    await connected();
    const backup = (await ctx.call('GET', '/backup')).body;
    expect(JSON.stringify(backup)).not.toContain('ntn_good');
    expect(JSON.stringify(backup)).not.toContain('lc_notion');
  });
});

describe('notion · configurações', () => {
  it('liga e desliga a sincronização automática e o registro de sessões', async () => {
    const r = await ctx.call('PATCH', '/notion/settings', { autoSync: false, logSessions: false });
    expect(r.body.data).toMatchObject({ autoSync: false, logSessions: false });
    const r2 = await ctx.call('PATCH', '/notion/settings', { autoSync: true });
    expect(r2.body.data).toMatchObject({ autoSync: true, logSessions: false });
    expect((await ctx.call('PATCH', '/notion/settings', { autoSync: 'sim' })).status).toBe(400);
  });
});

describe('notion · plano de estudo', () => {
  it('sem conexão não sincroniza', async () => {
    expect((await sync()).status).toBe(401);
    await setToken();
    expect((await sync()).status).toBe(401);
  });

  it('cria uma linha por ocorrência nas próximas 4 semanas, com título, curso, horário e chave estável', async () => {
    await connected();
    const c = await mkCourse('Redes');
    await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45, courseId: c.id });
    const r = await sync();
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ planCreated: 4, planUpdated: 0, planDeleted: 0, sessionsCreated: 0 });
    expect(rows('Estudo')).toHaveLength(4);
    const first = rows('Estudo').find((x) => notion.text(x, 'Chave').endsWith('2026-03-11'));
    expect(notion.text(first, 'Nome')).toBe('📚 Estudar: Redes');
    expect(notion.text(first, 'Curso')).toBe('Redes');
    expect(notion.text(first, 'Detalhes')).toContain('Bloco de estudo planejado');
    expect(new Date(first.properties.Quando.date.start).getTime()).toBe(new Date('2026-03-11T20:00:00').getTime());
    expect(new Date(first.properties.Quando.date.end).getTime()).toBe(new Date('2026-03-11T20:45:00').getTime());
    expect(notion.text(first, 'Chave')).toMatch(/^plan-\d+-2026-03-11$/);
  });

  it('sincronizar de novo não duplica nem faz chamadas de escrita', async () => {
    await connected();
    await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45 });
    await sync();
    const writes = () => notion.state.calls.filter((c) => c.method !== 'GET' && !/query|search/.test(c.path)).length;
    const before = writes();
    const r = await sync();
    expect(r.body.data).toMatchObject({ planCreated: 0, planUpdated: 0, planDeleted: 0 });
    expect(writes()).toBe(before);
    expect(rows()).toHaveLength(4);
  });

  it('mudar horário ou duração atualiza as linhas existentes (mesma página, sem duplicar)', async () => {
    await connected();
    const p = (await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45 })).body.data;
    await sync();
    const ids = rows().map((r) => r.id).sort();
    await ctx.call('PATCH', `/calendar/plan/${p.id}`, { startTime: '19:00', durationMin: 60 });
    const r = await sync();
    expect(r.body.data).toMatchObject({ planCreated: 0, planUpdated: 4, planDeleted: 0 });
    expect(rows().map((x) => x.id).sort()).toEqual(ids);
    const first = rows().find((x) => notion.text(x, 'Chave').endsWith('2026-03-11'));
    expect(new Date(first.properties.Quando.date.start).getTime()).toBe(new Date('2026-03-11T19:00:00').getTime());
    expect(new Date(first.properties.Quando.date.end).getTime()).toBe(new Date('2026-03-11T20:00:00').getTime());
  });

  it('trocar o curso do bloco atualiza título e curso', async () => {
    await connected();
    const a = await mkCourse('Redes');
    const b = await mkCourse('Linux');
    const p = (await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45, courseId: a.id })).body.data;
    await sync();
    await ctx.call('PATCH', `/calendar/plan/${p.id}`, { courseId: b.id });
    await sync();
    expect(rows().map((r) => notion.text(r, 'Nome'))).toEqual(Array(4).fill('📚 Estudar: Linux'));
    expect(rows().map((r) => notion.text(r, 'Curso'))).toEqual(Array(4).fill('Linux'));
  });

  it('apagar o bloco arquiva as linhas futuras no Notion', async () => {
    await connected();
    const p = (await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45 })).body.data;
    await sync();
    await ctx.call('DELETE', `/calendar/plan/${p.id}`);
    const r = await sync();
    expect(r.body.data.planDeleted).toBe(4);
    expect(rows()).toHaveLength(0);
    expect(notion.allRows().every((x) => x.archived)).toBe(true);
  });

  it('quem apagou uma linha à mão no Notion a vê voltar na próxima sincronização', async () => {
    await connected();
    await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45 });
    await sync();
    notion.liveRows()[1].archived = true;
    const r = await sync();
    expect(r.body.data.planCreated).toBe(1);
    expect(rows()).toHaveLength(4);
  });

  it('bloco de hoje que já passou não é recriado; o que já existia fica como histórico', async () => {
    await connected();
    await addPlan({ weekday: 2, startTime: '08:00', durationMin: 60 }); // hoje 08:00–09:00, antes das 15:00
    const r = await sync();
    expect(r.body.data.planCreated).toBe(3);
    // depois que o dia avança, a linha que já passou não é arquivada
    ctx.clock.advance(7 * 24 * 3600 * 1000);
    await sync();
    expect(rows().some((x) => notion.text(x, 'Chave').endsWith('2026-03-18'))).toBe(true);
  });

  it('duplicatas da mesma ocorrência (chave repetida) são arquivadas', async () => {
    await connected();
    await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45 });
    await sync();
    const dup = structuredClone(rows()[0]);
    dup.id = 'row-dup';
    notion.state.rows.set(dup.id, dup);
    const r = await sync();
    expect(r.body.data.planDeleted).toBe(1);
    expect(rows()).toHaveLength(4);
  });

  it('linhas que a pessoa criou sem chave do app são deixadas em paz', async () => {
    await connected();
    const [db] = [...notion.state.databases.values()];
    await notion.fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { Authorization: 'Bearer ntn_good' },
      body: JSON.stringify({ parent: { database_id: db.id }, properties: { Nome: { title: [{ text: { content: 'Minha anotação' } }] }, Quando: { date: { start: '2026-03-12T10:00:00-03:00' } } } }),
    });
    await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45 });
    const r = await sync();
    expect(r.body.data.planDeleted).toBe(0);
    expect(rows().some((x) => notion.text(x, 'Nome') === 'Minha anotação')).toBe(true);
  });

  it('com muitas linhas a consulta é paginada e nada se duplica', async () => {
    await connected();
    for (const wd of [0, 1, 2, 3, 4, 5, 6]) await addPlan({ weekday: wd, startTime: '20:00', durationMin: 30 });
    notion.state.pageCap = 5;
    const r = await sync();
    expect(r.body.data.planCreated).toBe(28);
    const again = await sync();
    expect(again.body.data).toMatchObject({ planCreated: 0, planUpdated: 0, planDeleted: 0 });
    expect(rows()).toHaveLength(28);
    expect(new Set(keys()).size).toBe(28);
  });

  it('o Notion pedir calma (429) no meio da sincronização não quebra nada', async () => {
    await connected();
    await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45 });
    notion.state.rateLimit = 2;
    const r = await sync();
    expect(r.status).toBe(200);
    expect(rows()).toHaveLength(4);
  });
});

describe('notion · sessões de foco', () => {
  async function session(minutes, course) {
    const c = course ?? (await mkCourse('Redes'));
    const s = (await ctx.call('POST', '/sessions/start', { courseId: c.id, kind: 'stopwatch' })).body.data;
    ctx.clock.advance(minutes * 60000);
    await ctx.call('POST', `/sessions/${s.id}/finish`, { focusRating: 4 });
    return s;
  }

  it('sessão concluída vira linha "✅ Estudei", uma vez só', async () => {
    await connected();
    const s = await session(45);
    const r = await sync();
    expect(r.body.data.sessionsCreated).toBe(1);
    const [row] = rows('Sessão feita');
    expect(notion.text(row, 'Nome')).toBe('✅ Estudei: Redes (45 min)');
    expect(notion.text(row, 'Chave')).toBe(`session-${s.id}`);
    expect(new Date(row.properties.Quando.date.end).getTime() - new Date(row.properties.Quando.date.start).getTime()).toBe(45 * 60000);
    expect((await sync()).body.data.sessionsCreated).toBe(0);
    expect(rows('Sessão feita')).toHaveLength(1);
  });

  it('com o registro desligado nenhuma sessão vai para o Notion', async () => {
    await connected();
    await session(30);
    await ctx.call('PATCH', '/notion/settings', { logSessions: false });
    expect((await sync()).body.data.sessionsCreated).toBe(0);
    expect(rows()).toHaveLength(0);
  });

  it('ignora sessões abertas, manuais e menores que 1 minuto', async () => {
    await connected();
    const c = await mkCourse('Redes');
    await ctx.call('POST', '/sessions/manual', { courseId: c.id, durationMin: 30 });
    await ctx.call('POST', '/sessions/start', { courseId: c.id, kind: 'stopwatch' });
    expect((await sync()).body.data.sessionsCreated).toBe(0);
  });

  it('sessão sem curso usa o título padrão', async () => {
    await connected();
    const s = (await ctx.call('POST', '/sessions/start', { kind: 'stopwatch' })).body.data;
    ctx.clock.advance(20 * 60000);
    await ctx.call('POST', `/sessions/${s.id}/finish`, {});
    await sync();
    expect(notion.text(rows('Sessão feita')[0], 'Nome')).toBe('✅ Estudei: Sessão de foco (20 min)');
  });
});

describe('notion · quando algo dá errado', () => {
  it('erro do Notion vira 502 com a mensagem e fica registrado para a tela mostrar', async () => {
    await connected();
    notion.state.failNext = { status: 500, message: 'Notion fora do ar' };
    const r = await sync();
    expect(r.status).toBe(502);
    expect(r.body.error).toMatchObject({ code: 'NOTION_ERROR', message: 'Notion fora do ar' });
    expect((await get('/notion/status')).lastError).toBe('Notion fora do ar');
    expect((await sync()).status).toBe(200);
    expect((await get('/notion/status')).lastError).toBeNull();
    expect((await get('/notion/status')).lastSyncAt).toBeTruthy();
  });

  it('código revogado: 401 e pede para colar o código de novo', async () => {
    await connected();
    notion.revokeToken();
    const r = await sync();
    expect(r.status).toBe(401);
    expect((await get('/notion/status')).lastError).toMatch(/recusou o código/);
  });

  it('tabela apagada no Notion: 409, esquece a tabela e mantém o código para escolher a página de novo', async () => {
    await connected();
    notion.deleteDatabase([...notion.state.databases.keys()][0]);
    const r = await sync();
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('NOTION_LOST');
    expect(await get('/notion/status')).toMatchObject({ hasToken: true, connected: false, databaseUrl: null, lastError: expect.stringContaining('Conecte de novo') });
    expect((await connectTo()).status).toBe(200);
    expect((await sync()).status).toBe(200);
  });

  it('sincronizações simultâneas compartilham a mesma execução', async () => {
    await connected();
    await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45 });
    const [a, b] = await Promise.all([sync(), sync()]);
    expect(a.status).toBe(200);
    expect(b.body.data).toEqual(a.body.data);
    expect(rows()).toHaveLength(4);
  });

  it('trocar de código depois de conectado exige escolher a página de novo', async () => {
    await connected();
    notion.state.token = 'ntn_novo';
    await setToken('ntn_novo');
    expect(await get('/notion/status')).toMatchObject({ hasToken: true, connected: false });
  });
});

describe('sincronizador automático com Notion', () => {
  const make = ({ calendar, notion: n }) => createAutoSync({ calendar, notion: n, setTimer: () => ({ unref() {} }), setOnce: () => ({ unref() {} }) });

  it('sincroniza só quem está conectado e com a opção ligada; um erro não impede o outro', async () => {
    const cal = { status: () => ({ connected: true, autoSync: true }), syncNow: vi.fn().mockRejectedValue(new Error('Google fora')) };
    const not = { status: () => ({ connected: true, autoSync: true }), syncNow: vi.fn().mockResolvedValue({}) };
    expect(await make({ calendar: cal, notion: not }).tick()).toBe(true);
    expect(cal.syncNow).toHaveBeenCalledTimes(1);
    expect(not.syncNow).toHaveBeenCalledTimes(1);
  });

  it('desligado ou desconectado não sincroniza', async () => {
    const off = { status: () => ({ connected: true, autoSync: false }), syncNow: vi.fn() };
    const out = { status: () => ({ connected: false, autoSync: true }), syncNow: vi.fn() };
    expect(await make({ calendar: off, notion: out }).tick()).toBe(false);
    expect(off.syncNow).not.toHaveBeenCalled();
    expect(out.syncNow).not.toHaveBeenCalled();
  });

  it('funciona só com o Notion (sem Google)', async () => {
    const not = { status: () => ({ connected: true, autoSync: true }), syncNow: vi.fn().mockResolvedValue({}) };
    expect(await make({ notion: not }).tick()).toBe(true);
  });

  it('o serviço real sincroniza sozinho quando conectado', async () => {
    await connected();
    await addPlan({ weekday: 2, startTime: '20:00', durationMin: 45 });
    const auto = createAutoSync({ notion: ctx.app.db ? (await import('../src/index.js')).createLearningCenter({ db: ctx.app.db, runMigrations: false, clock: ctx.clock, notionFetch: notion.fetch, notionPauseMs: 0, notionSleep: async () => {} }).notion : null });
    expect(await auto.tick()).toBe(true);
    expect(rows()).toHaveLength(4);
  });
});
