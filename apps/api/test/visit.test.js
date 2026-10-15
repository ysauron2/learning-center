import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeApp } from './helpers.js';
import { migrate } from '../src/core/migrate.js';
import { ALL_MIGRATIONS } from './migration-list.js';
import { parseCourseLink } from '../src/core/platforms.js';
import { cleanTitle } from '../src/modules/courses/visit.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const ALURA = 'https://www.alura.com.br/curso-online-algoritmos-javascript-i-algoritmos-ordenacao';
const AGNO = 'https://www.alura.com.br/curso-online-agno-agente-ia';
const KEY = 'alura:algoritmos-javascript-i-algoritmos-ordenacao';

function site({ down = false } = {}) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    if (down) throw new Error('sem rede');
    const body = url === ALURA ? fixture('alura-curso-algoritmos.html') : url === AGNO ? fixture('alura-curso-agno.html') : null;
    return body ? new Response(body, { status: 200, headers: { 'content-type': 'text/html' } }) : new Response('nada', { status: 404 });
  };
  return { fetch, calls };
}

describe('detecção por endereço (registro)', () => {
  const ok = {
    alura: ['https://www.alura.com.br/curso-online-python-flask', 'https://cursos.alura.com.br/course/python-flask', 'https://cursos.alura.com.br/course/python-flask/task/12345?x=1#y'],
    bradesco: ['https://www.ev.org.br/cursos/atendimento-ao-publico', 'https://www.ev.org.br/cursos/AI900Azure'],
    microsoft: [
      'https://learn.microsoft.com/pt-br/training/paths/microsoft-azure-fundamentals-describe-cloud-concepts/',
      'https://learn.microsoft.com/pt-br/training/modules/intro-to-azure-fundamentals/',
      'https://learn.microsoft.com/pt-br/training/modules/intro-to-azure-fundamentals/what-is-microsoft-azure/',
      'https://learn.microsoft.com/en-us/training/paths/get-started-ai-apps-agents/?wt.mc_id=x',
    ],
    freecodecamp: ['https://www.freecodecamp.org/learn/responsive-web-design-v9/', 'https://www.freecodecamp.org/learn/scientific-computing-with-python/learn-string-manipulation-by-building-a-cipher/step-1'],
    coursera: ['https://www.coursera.org/learn/machine-learning', 'https://www.coursera.org/learn/machine-learning/home/week/1'],
    rocketseat: ['https://www.rocketseat.com.br/formacao/go'],
  };
  const notCourse = [
    'https://www.alura.com.br/', 'https://www.alura.com.br/cursos-online-programacao', 'https://www.alura.com.br/busca?query=js', 'https://cursos.alura.com.br/dashboard',
    'https://www.ev.org.br/', 'https://www.ev.org.br/cursos',
    'https://learn.microsoft.com/pt-br/training/browse/', 'https://learn.microsoft.com/pt-br/', 'https://learn.microsoft.com/pt-br/users/me/',
    'https://www.freecodecamp.org/learn', 'https://www.freecodecamp.org/', 'https://www.coursera.org/', 'https://www.coursera.org/search?query=x', 'https://www.rocketseat.com.br/',
    'http://www.alura.com.br/curso-online-x', 'https://evil.com/curso-online-x', 'https://alura.com.br.evil.com/curso-online-x', 'https://127.0.0.1/cursos/x',
  ];
  it.each(Object.entries(ok))('%s: páginas de curso e de aula são reconhecidas', (id, urls) => {
    for (const u of urls) expect(parseCourseLink(u)?.platform.id, u).toBe(id);
  });
  it('páginas que não são de curso (e hosts falsos) são ignoradas', () => {
    for (const u of notCourse) expect(parseCourseLink(u), u).toBeNull();
  });
  it('limpa o título', () => {
    expect(cleanTitle('Curso de Flask | Alura')).toBe('Curso de Flask');
    expect(cleanTitle('  a\n\tb  ', 'x')).toBe('a b');
    expect(cleanTitle('', 'padrão')).toBe('padrão');
  });
});

describe('POST /courses/visit', () => {
  let ctx;
  afterEach(async () => ctx?.app.close());
  const visit = (body) => ctx.call('POST', '/courses/visit', { platform: 'alura', url: ALURA, ...body });
  const courses = async () => (await ctx.call('GET', '/courses')).body.data;

  it('padrão é perguntar: não cria nada, devolve o título; confirm cria EM ANDAMENTO', async () => {
    const net = site();
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: net.fetch });
    expect((await ctx.call('GET', '/settings/auto-detect')).body.data).toEqual({ mode: 'ask' });
    const r = await visit({ title: 'Algoritmos | Alura' });
    expect(r.body.data).toEqual({ action: 'ask', title: 'Algoritmos', platformName: 'Alura' });
    expect(await courses()).toHaveLength(0);
    expect(net.calls).toHaveLength(0);
    const c = await visit({ confirm: true, progressPercent: 30 });
    expect(c.body.data).toMatchObject({ action: 'created', course: { status: 'active', platform: 'Alura' } });
    expect(c.body.data.undoToken).toBeTruthy();
    const list = await courses();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'active', manualProgress: 30 });
    expect(list[0].lastVisitedAt).toBe(new Date('2026-03-11T15:00:00').toISOString());
  });

  it('modo automático cria sozinho; usa o caminho do importador (sem duplicar)', async () => {
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: site().fetch });
    await ctx.call('PATCH', '/settings/auto-detect', { mode: 'auto' });
    expect((await visit({})).body.data.action).toBe('created');
    // mesma chave por outro endereço (aula): não duplica
    ctx.clock.advance(2 * 3600_000);
    expect((await visit({ url: 'https://cursos.alura.com.br/course/algoritmos-javascript-i-algoritmos-ordenacao/task/9' })).body.data.action).toBe('unchanged');
    expect(await courses()).toHaveLength(1);
  });

  it('modo nunca não faz nada', async () => {
    const net = site();
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: net.fetch });
    await ctx.call('PATCH', '/settings/auto-detect', { mode: 'never' });
    expect((await visit({ confirm: true })).body.data).toEqual({ action: 'unchanged', reason: 'never' });
    expect(await courses()).toHaveLength(0);
    expect(net.calls).toHaveLength(0);
    expect((await ctx.call('PATCH', '/settings/auto-detect', { mode: 'talvez' })).status).toBe(400);
  });

  it('curso planejado ou pausado vai para em andamento; concluído não muda; limite de 1 hora', async () => {
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: site().fetch });
    await ctx.call('PATCH', '/settings/auto-detect', { mode: 'auto' });
    const made = (await visit({})).body.data.course.id;
    await ctx.call('POST', `/courses/${made}/status`, { status: 'paused' });
    // dentro de 1 hora: só a data
    ctx.clock.advance(30 * 60_000);
    expect((await visit({})).body.data.action).toBe('unchanged');
    expect((await ctx.call('GET', `/courses/${made}`)).body.data.status).toBe('paused');
    ctx.clock.advance(31 * 60_000);
    const a = (await visit({})).body.data;
    expect(a).toMatchObject({ action: 'activated', course: { status: 'active' } });
    await ctx.call('POST', `/courses/${made}/status`, { status: 'completed' });
    ctx.clock.advance(2 * 3600_000);
    expect((await visit({ progressPercent: 10 })).body.data.action).toBe('unchanged');
    expect((await ctx.call('GET', `/courses/${made}`)).body.data.status).toBe('completed');
  });

  it('o progresso só sobe', async () => {
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: site().fetch });
    await ctx.call('PATCH', '/settings/auto-detect', { mode: 'auto' });
    const id = (await visit({ progressPercent: 40 })).body.data.course.id;
    const prog = async () => (await ctx.call('GET', `/courses/${id}`)).body.data.manualProgress;
    ctx.clock.advance(2 * 3600_000);
    expect((await visit({ progressPercent: 20 })).body.data.action).toBe('unchanged');
    expect(await prog()).toBe(40);
    ctx.clock.advance(2 * 3600_000);
    expect((await visit({ progressPercent: 55 })).body.data.action).toBe('progress');
    expect(await prog()).toBe(55);
    expect((await visit({ progressPercent: 150 })).status).toBe(400);
  });

  it('"agora não" silencia a pergunta por 7 dias', async () => {
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: site().fetch });
    await visit({ title: 'x' });
    await ctx.call('POST', '/courses/visit/dismiss', { platform: 'alura', url: ALURA });
    expect((await visit({})).body.data).toMatchObject({ action: 'unchanged', reason: 'snoozed' });
    ctx.clock.advance(6 * 86400_000);
    expect((await visit({})).body.data.action).toBe('unchanged');
    ctx.clock.advance(2 * 86400_000);
    expect((await visit({})).body.data.action).toBe('ask');
  });

  it('desfazer: remove o curso criado agora ou volta ao status anterior (uso único)', async () => {
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: site().fetch });
    await ctx.call('PATCH', '/settings/auto-detect', { mode: 'auto' });
    const created = (await visit({})).body.data;
    const u1 = await ctx.call('POST', '/courses/visit/undo', { token: created.undoToken });
    expect(u1.body.data).toMatchObject({ undone: true, action: 'removed' });
    expect(await courses()).toHaveLength(0);
    expect((await ctx.call('POST', '/courses/visit/undo', { token: created.undoToken })).status).toBe(410);

    const again = (await visit({})).body.data;
    await ctx.call('POST', `/courses/${again.course.id}/status`, { status: 'paused' });
    ctx.clock.advance(2 * 3600_000);
    const act = (await visit({})).body.data;
    expect(act.action).toBe('activated');
    expect((await ctx.call('POST', '/courses/visit/undo', { token: act.undoToken })).body.data).toMatchObject({ action: 'status', status: 'paused' });
    expect((await ctx.call('GET', `/courses/${again.course.id}`)).body.data.status).toBe('paused');
    expect((await ctx.call('POST', '/courses/visit/undo', { token: 'qualquer-coisa-invalida' })).status).toBe(410);
  });

  it('não remove curso que já tem estudo registrado', async () => {
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: site().fetch });
    await ctx.call('PATCH', '/settings/auto-detect', { mode: 'auto' });
    const c = (await visit({})).body.data;
    await ctx.call('POST', '/sessions/manual', { courseId: c.course.id, durationMin: 20 });
    const r = await ctx.call('POST', '/courses/visit/undo', { token: c.undoToken });
    expect(r.status).toBe(409);
    expect(await courses()).toHaveLength(1);
  });

  it('recusa host fora da lista, plataforma errada, não-curso, http, IP e SSRF — sem buscar nada', async () => {
    const net = site();
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: net.fetch });
    await ctx.call('PATCH', '/settings/auto-detect', { mode: 'auto' });
    const bad = [
      { url: 'https://evil.com/curso-online-x' },
      { url: 'https://alura.com.br.evil.com/curso-online-x' },
      { url: 'https://www.alura.com.br/' },
      { url: 'http://www.alura.com.br/curso-online-x' },
      { url: 'https://127.0.0.1/curso-online-x' },
      { url: 'https://localhost:3000/curso-online-x' },
      { url: 'https://user:pw@www.alura.com.br/curso-online-x' },
      { url: 'https://evil.com/?u=https://www.alura.com.br/curso-online-x' },
      { platform: 'bradesco' },
      { platform: 'udemy', url: 'https://www.udemy.com/course/x/' },
      { platform: 'inventada' },
    ];
    for (const b of bad) expect((await visit(b)).status, JSON.stringify(b)).toBe(400);
    expect(net.calls).toHaveLength(0);
    expect(await courses()).toHaveLength(0);
  });

  it('falha de rede ao importar não quebra: devolve inalterado e tenta de novo depois', async () => {
    const net = site({ down: true });
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: net.fetch });
    await ctx.call('PATCH', '/settings/auto-detect', { mode: 'auto' });
    const r = await visit({});
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ action: 'unchanged', reason: 'import-failed' });
    expect(await courses()).toHaveLength(0);
  });

  it('o título enviado nunca vira o título do curso (vem da página lida)', async () => {
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: site().fetch });
    await ctx.call('PATCH', '/settings/auto-detect', { mode: 'auto' });
    const r = (await visit({ title: '<img src=x onerror=alert(1)>' })).body.data;
    expect(r.course.title).not.toContain('<img');
  });
});

describe('migração 011 e backup', () => {
  it('aplica sobre banco existente sem perder dados', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lc-mig11-'));
    try {
      for (const f of ALL_MIGRATIONS.filter((x) => x < '011')) copyFileSync(new URL(`../migrations/${f}`, import.meta.url), join(dir, f));
      const db = new DatabaseSync(':memory:');
      migrate(db, dir);
      db.prepare("INSERT INTO lc_courses (title, platform, category, description, status, manual_progress, created_at, updated_at) VALUES ('Antigo','Alura','Geral','', 'active', 30, 'a', 'a')").run();
      expect(migrate(db)).toEqual(ALL_MIGRATIONS.filter((x) => x >= '011'));
      expect(db.prepare('SELECT title, manual_progress, last_visited_at FROM lc_courses').get()).toMatchObject({ title: 'Antigo', manual_progress: 30, last_visited_at: null });
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('backup guarda e restaura a última visita e a configuração; backup antigo sem a coluna é aceito', async () => {
    const a = await makeApp('2026-03-11T15:00:00', { linkFetch: site().fetch });
    const b = await makeApp('2026-03-11T15:00:00', { linkFetch: site().fetch });
    try {
      await a.call('PATCH', '/settings/auto-detect', { mode: 'auto' });
      await a.call('POST', '/courses/visit', { platform: 'alura', url: ALURA });
      const bk = (await a.call('GET', '/backup')).body.data;
      expect(bk.data.courses[0]).toMatchObject({ source_key: KEY });
      expect(bk.data.courses[0].last_visited_at).toBeTruthy();
      expect((await b.call('POST', '/backup/restore', { confirm: 'substituir-tudo', backup: bk })).status).toBe(200);
      expect((await b.call('GET', '/courses')).body.data[0].lastVisitedAt).toBe(bk.data.courses[0].last_visited_at);
      expect((await b.call('GET', '/settings/auto-detect')).body.data.mode).toBe('auto');
      const old = structuredClone(bk);
      delete old.data.courses[0].last_visited_at;
      expect((await b.call('POST', '/backup/restore', { confirm: 'substituir-tudo', backup: old })).status).toBe(200);
      expect((await b.call('GET', '/courses')).body.data[0].lastVisitedAt).toBeNull();
    } finally {
      await a.app.close();
      await b.app.close();
    }
  });
});
