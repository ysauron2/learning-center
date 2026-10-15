import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeApp } from './helpers.js';
import { migrate } from '../src/core/migrate.js';
import { ALL_MIGRATIONS } from './migration-list.js';
import { parseCourseLink, hostMatches, isSafePublicUrl } from '../src/core/platforms.js';
import { parseAluraPage, parseBradescoPage, workloadMinutes, decodeEntities, fetchCoursePage } from '../src/core/course-pages.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const ALURA_URL = 'https://www.alura.com.br/curso-online-algoritmos-javascript-i-algoritmos-ordenacao';
const AGNO_URL = 'https://www.alura.com.br/curso-online-agno-agente-ia';
const EV_URL = 'https://www.ev.org.br/cursos/atendimento-ao-publico';
const POWERBI_URL = 'https://www.ev.org.br/cursos/analise-de-dados-no-power-bi';

const page = (body, init = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' }, ...init });
const redirect = (to, status = 302) => new Response(null, { status, headers: { location: to } });

/** Simulador de rede: devolve as páginas reais (reduzidas) guardadas em test/fixtures. */
function fakeSite(routes) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const hit = routes[url];
    if (hit === undefined) return new Response('não achei', { status: 404 });
    return typeof hit === 'function' ? hit() : hit.clone();
  };
  return { fetch, calls };
}

const routes = () => ({
  [ALURA_URL]: page(fixture('alura-curso-algoritmos.html')),
  [AGNO_URL]: page(fixture('alura-curso-agno.html')),
  [EV_URL]: page(fixture('bradesco-curso-atendimento.html')),
  [POWERBI_URL]: page(fixture('bradesco-curso-powerbi.html')),
  // endereço antigo da Alura: redireciona para o novo (comportamento do site real)
  'https://cursos.alura.com.br/course/algoritmos-javascript-i-algoritmos-ordenacao': redirect(ALURA_URL),
  // curso que não existe: o site manda para a página inicial
  'https://www.alura.com.br/curso-online-nao-existe': redirect('https://www.alura.com.br/'),
  'https://www.alura.com.br/': page('<html><head><title>Alura | Cursos Online de Tecnologia</title></head><body><h1>Home</h1></body></html>'),
});

describe('links aceitos', () => {
  it('reconhece os formatos de curso da Alura e da Escola Virtual e gera a chave', () => {
    expect(parseCourseLink(ALURA_URL)).toMatchObject({ key: 'alura:algoritmos-javascript-i-algoritmos-ordenacao', url: ALURA_URL });
    expect(parseCourseLink('https://cursos.alura.com.br/course/python-flask/task/123?x=1')).toMatchObject({ key: 'alura:python-flask', url: 'https://www.alura.com.br/curso-online-python-flask' });
    expect(parseCourseLink('alura.com.br/curso-online-python-flask')).toMatchObject({ key: 'alura:python-flask' });
    expect(parseCourseLink(EV_URL)).toMatchObject({ key: 'bradesco:atendimento-ao-publico', url: EV_URL });
    expect(parseCourseLink('https://ev.org.br/cursos/AI900Azure')).toMatchObject({ key: 'bradesco:ai900azure', url: 'https://www.ev.org.br/cursos/AI900Azure' });
    expect(parseCourseLink('https://www.ev.org.br/cursos/Analise-de-Balan%C3%A7os')).toMatchObject({ key: 'bradesco:analise-de-balanços' });
  });

  it('recusa outros sites, hosts parecidos, IPs, portas, http e páginas que não são de curso', () => {
    for (const u of [
      '', 'oi', 'https://evil.com/curso-online-x', 'https://alura.com.br.evil.com/curso-online-x', 'https://evil.com/alura.com.br/curso-online-x',
      'https://notalura.com.br/curso-online-x', 'https://www.alura.com.br@evil.com/curso-online-x', 'https://evil.com/?u=https://www.alura.com.br/curso-online-x',
      'http://www.alura.com.br/curso-online-x', 'https://user:pw@www.alura.com.br/curso-online-x', 'https://www.alura.com.br:8443/curso-online-x',
      'https://127.0.0.1/curso-online-x', 'https://[::1]/cursos/x', 'https://localhost/cursos/x', 'https://169.254.169.254/cursos/x',
      'javascript:alert(1)', 'file:///etc/passwd', 'ftp://www.alura.com.br/curso-online-x',
      'https://www.alura.com.br/', 'https://www.alura.com.br/formacao-python', 'https://www.ev.org.br/', 'https://www.ev.org.br/cursos', 'https://www.ev.org.br/cursos/<x>',
      'https://cursos.alura.com.br/course/', 'https://www.udemy.com/course/python/',
    ]) expect(parseCourseLink(u), u).toBeNull();
  });

  it('hostMatches compara o domínio inteiro, nunca "contém"', () => {
    expect(hostMatches('cursos.alura.com.br', 'alura.com.br')).toBe(true);
    expect(hostMatches('alura.com.br', 'alura.com.br')).toBe(true);
    expect(hostMatches('xalura.com.br', 'alura.com.br')).toBe(false);
    expect(hostMatches('alura.com.br.evil.com', 'alura.com.br')).toBe(false);
    expect(isSafePublicUrl(new URL('https://10.0.0.1/'))).toBe(false);
  });
});

describe('parser da Alura (página real reduzida)', () => {
  it('lê título, descrição, instrutora, carga horária, capa e a ementa inteira', () => {
    const c = parseAluraPage(fixture('alura-curso-algoritmos.html'), parseCourseLink(ALURA_URL));
    expect(c).toMatchObject({
      platform: 'alura',
      key: 'alura:algoritmos-javascript-i-algoritmos-ordenacao',
      title: 'JavaScript I: algoritmos de ordenação',
      instructor: 'Juliana Amoasei',
      workloadMin: 480,
      imageUrl: 'https://www.alura.com.br/assets/api/share/curso-algoritmos-javascript-i-algoritmos-ordenacao.png',
    });
    expect(c.description).toMatch(/algoritmos/i);
    expect(c.modules.length).toBe(5);
    expect(c.modules[0]).toEqual({
      title: 'Pensando em algoritmos',
      lessons: ['Apresentação', 'Nosso primeiro problema', 'Do papel para o código', 'Exibindo os livros'].map((title) => ({ title, durationMin: 0 })),
    });
    expect(c.modules[1].lessons.map((l) => l.title)).toEqual(['Ordenar para organizar', 'Reaproveitando código', 'Selection Sort']);
  });

  it('funciona também com outro curso real (Agno)', () => {
    const c = parseAluraPage(fixture('alura-curso-agno.html'), parseCourseLink(AGNO_URL));
    expect(c.title).toBe('Agno: criando agentes e sistemas multiagente');
    expect(c.modules[0].title).toBe('Criando seu primeiro agente com Agno');
    expect(c.modules[1].lessons).toHaveLength(5);
  });

  it('sem o estado embutido, cai para os títulos dos capítulos no HTML', () => {
    const html = '<html><h1>Curso X</h1><button aria-label="Expandir capítulo: Primeiros passos"></button><button aria-label="Expandir capítulo: Avançando"></button></html>';
    const c = parseAluraPage(html, parseCourseLink('https://www.alura.com.br/curso-online-x'));
    expect(c.modules).toEqual([{ title: 'Capítulos', lessons: [{ title: 'Primeiros passos', durationMin: 0 }, { title: 'Avançando', durationMin: 0 }] }]);
  });

  it('só o título e nada de aulas: devolve o curso sem módulos; página que não é de curso é erro', () => {
    const c = parseAluraPage('<html><body><h1>Curso Y</h1></body></html>', parseCourseLink('https://www.alura.com.br/curso-online-y'));
    expect(c).toMatchObject({ title: 'Curso Y', modules: [] });
    expect(() => parseAluraPage('<html><body><p>oi</p></body></html>', parseCourseLink('https://www.alura.com.br/curso-online-y'))).toThrow(/dados de um curso/);
  });

  it('imagem de outro domínio é ignorada e HTML no título vira texto', () => {
    const html = '<html><head><meta property="og:image" content="https://evil.com/x.png"></head><body><h1>&lt;img src=x onerror=alert(1)&gt; Curso</h1></body></html>';
    const c = parseAluraPage(html, parseCourseLink('https://www.alura.com.br/curso-online-z'));
    expect(c.imageUrl).toBeNull();
    expect(c.title).toBe('<img src=x onerror=alert(1)> Curso'); // texto puro; a interface nunca o interpreta como HTML
  });
});

describe('parser da Fundação Bradesco (página real reduzida)', () => {
  it('lê título, área, carga horária, descrição e os módulos', () => {
    const c = parseBradescoPage(fixture('bradesco-curso-atendimento.html'), parseCourseLink(EV_URL));
    expect(c).toMatchObject({ platform: 'bradesco', key: 'bradesco:atendimento-ao-publico', title: 'Atendimento ao Público', area: 'Desenvolvimento Pessoal e Profissional', level: 'Iniciante', workloadMin: 600, imageUrl: null });
    expect(c.description).toMatch(/^O objetivo deste curso é apresentar noções de atendimento/);
    expect(c.description).not.toMatch(/<|&#/);
    expect(c.modules).toEqual([{
      title: 'Conteúdo do curso',
      lessons: ['Módulo 1 – As ferramentas', 'Módulo 2 – O público e os problemas', 'Módulo 3 – Como sou e como posso me comportar', 'Módulo 4 – O atendimento e a sua importância'].map((title) => ({ title, durationMin: 0 })),
    }]);
  });

  it('outro curso real: acentos em entidades numéricas e "04h"', () => {
    const c = parseBradescoPage(fixture('bradesco-curso-powerbi.html'), parseCourseLink(POWERBI_URL));
    expect(c).toMatchObject({ title: 'Análise de Dados no Power BI', workloadMin: 240 });
    expect(c.modules[0].lessons).toHaveLength(2);
  });

  it('sem título não é curso', () => {
    expect(() => parseBradescoPage('<html><body><h1></h1></body></html>', parseCourseLink(EV_URL))).toThrow(/dados de um curso/);
  });
});

describe('ajudantes de texto', () => {
  it('carga horária e entidades', () => {
    expect(workloadMinutes('PT8H')).toBe(480);
    expect(workloadMinutes('PT1H30M')).toBe(90);
    expect(workloadMinutes('10h')).toBe(600);
    expect(workloadMinutes('04h')).toBe(240);
    expect(workloadMinutes('algo')).toBe(0);
    expect(decodeEntities('Funda&#231;&#227;o &amp; Cia &#x41; &#999999999;')).toBe('Fundação & Cia A ');
  });
});

describe('busca da página (segurança de rede)', () => {
  const ref = () => parseCourseLink(ALURA_URL);

  it('manda User-Agent de navegador, idioma pt-BR e nunca segue redirecionamento sozinho', async () => {
    const site = fakeSite(routes());
    await fetchCoursePage(ref(), site.fetch);
    expect(site.calls[0].init.redirect).toBe('manual');
    expect(site.calls[0].init.headers['Accept-Language']).toMatch(/^pt-BR/);
    expect(site.calls[0].init.headers['User-Agent']).toMatch(/Mozilla\/5\.0/);
    expect(site.calls[0].init.signal).toBeDefined();
  });

  it('segue redirecionamento dentro da mesma plataforma, conferindo cada destino', async () => {
    const site = fakeSite({ ...routes(), [ALURA_URL]: redirect(AGNO_URL) });
    const r = await fetchCoursePage(ref(), site.fetch);
    expect(r.finalUrl).toBe(AGNO_URL);
    expect(site.calls.map((c) => c.url)).toEqual([ALURA_URL, AGNO_URL]);
  });

  it('recusa redirecionamento para outro domínio, http, IP interno ou outra plataforma', async () => {
    for (const to of ['https://evil.com/x', 'http://www.alura.com.br/x', 'https://169.254.169.254/latest/meta-data', 'https://127.0.0.1/x', 'https://www.ev.org.br/cursos/x', 'file:///etc/passwd', 'https://alura.com.br.evil.com/']) {
      const site = fakeSite({ [ALURA_URL]: redirect(to) });
      await expect(fetchCoursePage(ref(), site.fetch), to).rejects.toMatchObject({ code: 'PAGE_ELSEWHERE' });
      expect(site.calls, to).toHaveLength(1); // nada além da primeira chamada
    }
  });

  it('laço de redirecionamentos termina com erro claro', async () => {
    const site = fakeSite({ [ALURA_URL]: redirect(ALURA_URL) });
    await expect(fetchCoursePage(ref(), site.fetch)).rejects.toMatchObject({ code: 'PAGE_UNREACHABLE' });
    expect(site.calls.length).toBeLessThanOrEqual(6);
  });

  it('404, erro de servidor, falha de rede e página gigante viram mensagens em português', async () => {
    await expect(fetchCoursePage(ref(), async () => new Response('x', { status: 404 }))).rejects.toMatchObject({ status: 404, code: 'PAGE_NOT_FOUND' });
    await expect(fetchCoursePage(ref(), async () => new Response('x', { status: 503 }))).rejects.toMatchObject({ status: 502, code: 'PAGE_UNREACHABLE', message: expect.stringMatching(/não abriu/) });
    await expect(fetchCoursePage(ref(), async () => { throw new TypeError('fetch failed'); })).rejects.toMatchObject({ code: 'PAGE_UNREACHABLE' });
    await expect(fetchCoursePage(ref(), async () => page('x'.repeat(6_100_000)))).rejects.toMatchObject({ code: 'PAGE_TOO_BIG' });
  });
});

describe('rotas /courses/import-link', () => {
  let ctx;
  afterEach(async () => { await ctx?.app.close(); });
  const open = async (r = routes()) => {
    const site = fakeSite(r);
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: site.fetch });
    return { ...ctx, site };
  };
  const courses = async () => (await ctx.call('GET', '/courses')).body.data;

  it('prévia mostra o curso e não grava nada', async () => {
    const { call } = await open();
    const r = await call('POST', '/courses/import-link/preview', { url: ALURA_URL });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ platform: 'alura', title: 'JavaScript I: algoritmos de ordenação', moduleCount: 5, lessonCount: 17, workloadMin: 480, existing: null, warnings: [] });
    expect(r.body.data.description).toContain('Carga horária: 8h');
    expect(r.body.data.description).toContain('Instrutor(a): Juliana Amoasei');
    expect(await courses()).toEqual([]);
  });

  it('cria o curso da Alura com módulos e aulas na ordem, plataforma, categoria e capa', async () => {
    const { call } = await open();
    const r = await call('POST', '/courses/import-link', { url: ALURA_URL, category: 'Desenvolvimento' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ created: true, lessonsAdded: 17, warnings: [] });
    const c = (await call('GET', `/courses/${r.body.data.courseId}`)).body.data;
    expect(c).toMatchObject({ title: 'JavaScript I: algoritmos de ordenação', platform: 'Alura', category: 'Desenvolvimento', url: ALURA_URL, status: 'planned', totalLessons: 17 });
    expect(c.imageUrl).toMatch(/^https:\/\/www\.alura\.com\.br\/assets\//);
    expect(c.modules.map((m) => m.title)).toEqual(['Pensando em algoritmos', 'Carregamento de arquivos', 'Capturando links', 'Usando a linha de comando', 'Validando links']);
    expect(c.modules[0].lessons.map((l) => l.title)).toEqual(['Apresentação', 'Nosso primeiro problema', 'Do papel para o código', 'Exibindo os livros']);
    const row = ctx.app.db.prepare('SELECT source_key FROM lc_courses').get();
    expect(row.source_key).toBe('alura:algoritmos-javascript-i-algoritmos-ordenacao');
  });

  it('cria o curso da Fundação Bradesco (plataforma nova entra na lista de opções)', async () => {
    const { call } = await open();
    const r = await call('POST', '/courses/import-link', { url: EV_URL });
    expect(r.body.data).toMatchObject({ created: true, lessonsAdded: 4 });
    const c = (await call('GET', `/courses/${r.body.data.courseId}`)).body.data;
    expect(c).toMatchObject({ title: 'Atendimento ao Público', platform: 'Fundação Bradesco', category: 'Geral', imageUrl: null });
    expect(c.description).toContain('Carga horária: 10h');
    const opts = (await call('GET', '/options')).body.data;
    expect(opts.platforms.map((p) => p.name)).toContain('Fundação Bradesco');
  });

  it('importar de novo (inclusive pelo endereço antigo) não duplica: reaproveita o mesmo curso', async () => {
    const { call } = await open();
    const first = (await call('POST', '/courses/import-link', { url: ALURA_URL })).body.data;
    const again = await call('POST', '/courses/import-link', { url: 'https://cursos.alura.com.br/course/algoritmos-javascript-i-algoritmos-ordenacao' });
    expect(again.body.data).toMatchObject({ created: false, courseId: first.courseId, lessonsAdded: 0 });
    const prev = await call('POST', '/courses/import-link/preview', { url: ALURA_URL });
    expect(prev.body.data.existing).toMatchObject({ id: first.courseId, newLessons: 0 });
    expect(await courses()).toHaveLength(1);
  });

  it('reimportar acrescenta só as aulas novas e preserva o que a pessoa já marcou', async () => {
    const r = routes();
    const { call } = await open(r);
    const first = (await call('POST', '/courses/import-link', { url: ALURA_URL })).body.data;
    const lesson = (await call('GET', `/courses/${first.courseId}`)).body.data.modules[0].lessons[0];
    await call('PATCH', `/lessons/${lesson.id}`, { completed: true });
    // o site ganhou uma aula nova no fim do primeiro capítulo
    r[ALURA_URL] = page(fixture('alura-curso-algoritmos.html').replace('Exibindo os livros', 'Exibindo os livros\\",\\"Aula extra'));
    const out = await call('POST', '/courses/import-link', { url: ALURA_URL });
    expect(out.body.data).toMatchObject({ created: false, lessonsAdded: 1 });
    const c = (await call('GET', `/courses/${first.courseId}`)).body.data;
    expect(c.totalLessons).toBe(18);
    expect(c.modules[0].lessons.find((l) => l.title === 'Apresentação').completed).toBe(true);
  });

  it('reconhece curso já cadastrado à mão com o mesmo endereço e completa capa e descrição vazias', async () => {
    const { call } = await open();
    const mine = (await call('POST', '/courses', { title: 'Meu nome para o curso', platform: 'Alura', url: 'https://cursos.alura.com.br/course/algoritmos-javascript-i-algoritmos-ordenacao' })).body.data;
    const prev = await call('POST', '/courses/import-link/preview', { url: ALURA_URL });
    expect(prev.body.data.existing).toMatchObject({ id: mine.id, title: 'Meu nome para o curso', newLessons: 17 });
    const out = await call('POST', '/courses/import-link', { url: ALURA_URL });
    expect(out.body.data).toMatchObject({ created: false, courseId: mine.id, title: 'Meu nome para o curso', lessonsAdded: 17 });
    const c = (await call('GET', `/courses/${mine.id}`)).body.data;
    expect(c.title).toBe('Meu nome para o curso'); // nunca renomeia
    expect(c.imageUrl).toMatch(/alura/);
    expect(c.description).toMatch(/Carga horária/);
    expect(await courses()).toHaveLength(1);
  });

  it('curso sem lista de aulas na página é criado sem aulas, com aviso claro', async () => {
    const { call } = await open({ ...routes(), [EV_URL]: page('<html><body><h1 class="o-internal-desc_title">Curso Sem Módulos</h1></body></html>') });
    const prev = await call('POST', '/courses/import-link/preview', { url: EV_URL });
    expect(prev.body.data).toMatchObject({ lessonCount: 0, moduleCount: 0 });
    expect(prev.body.data.warnings[0]).toMatch(/Não encontrei as aulas nessa página/);
    const out = await call('POST', '/courses/import-link', { url: EV_URL });
    expect(out.body.data).toMatchObject({ created: true, lessonsAdded: 0 });
    expect(out.body.data.warnings[0]).toMatch(/Colar lista de aulas/);
  });

  it('erros em português: link inválido, página que não abre, curso que não existe, validação', async () => {
    const { call } = await open({ ...routes(), 'https://www.alura.com.br/curso-online-fora-do-ar': new Response('x', { status: 500 }) });
    const bad = await call('POST', '/courses/import-link/preview', { url: 'https://evil.com/curso' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: 'LINK_INVALID', message: 'Esse link não parece ser de um curso da Alura ou da Fundação Bradesco.' });
    const down = await call('POST', '/courses/import-link/preview', { url: 'https://www.alura.com.br/curso-online-fora-do-ar' });
    expect(down.status).toBe(502);
    expect(down.body.error.message).toMatch(/A página não abriu/);
    const gone = await call('POST', '/courses/import-link/preview', { url: 'https://www.alura.com.br/curso-online-nao-existe' });
    expect(gone.status).toBe(422);
    expect(gone.body.error.code).toBe('COURSE_NOT_FOUND');
    expect((await call('POST', '/courses/import-link', {})).body.error.code).toBe('VALIDATION_ERROR');
    expect((await call('POST', '/courses/import-link', { url: ALURA_URL, category: '' })).status).toBe(400);
    expect(await courses()).toEqual([]);
  });

  it('SSRF: links para IPs internos, localhost e outros esquemas nunca chegam à rede', async () => {
    const { call, site } = await open();
    for (const url of ['https://127.0.0.1/cursos/x', 'https://169.254.169.254/cursos/x', 'http://www.alura.com.br/curso-online-x', 'file:///etc/passwd', 'https://localhost:3000/cursos/x', 'https://www.alura.com.br.evil.com/curso-online-x']) {
      const r = await call('POST', '/courses/import-link/preview', { url });
      expect(r.status, url).toBe(400);
    }
    expect(site.calls).toHaveLength(0);
  });
});

describe('leitura de "Meus cursos" da Alura e da Fundação Bradesco (rota existente com platform)', () => {
  let ctx;
  afterEach(async () => { await ctx?.app.close(); });
  const items = [
    { title: 'Curso A', url: 'https://cursos.alura.com.br/course/python-flask', progress: 40, imageUrl: 'https://www.alura.com.br/assets/api/cursos/512/x.png' },
    { title: 'Curso B', url: 'https://cursos.alura.com.br/course/java-basico/task/9', progress: 0 },
    { title: 'Intruso', url: 'https://www.udemy.com/course/python/', progress: 10 },
  ];

  it('importa só links da plataforma indicada, com nome, capa, progresso e chave', async () => {
    ctx = await makeApp();
    const prev = await ctx.call('POST', '/courses/import/preview', { platform: 'alura', items });
    expect(prev.body.data.new.map((c) => c.title)).toEqual(['Curso A', 'Curso B']);
    expect(prev.body.data.invalid).toEqual([{ title: 'Intruso', reason: 'Link não é de um curso da Alura.' }]);
    const r = await ctx.call('POST', '/courses/import', { platform: 'alura', items, updateProgress: true });
    expect(r.body.data).toMatchObject({ created: 2, invalid: 1 });
    const list = (await ctx.call('GET', '/courses')).body.data;
    const a = list.find((c) => c.title === 'Curso A');
    expect(a).toMatchObject({ platform: 'Alura', progress: 40, status: 'active', url: 'https://www.alura.com.br/curso-online-python-flask' });
    expect(a.imageUrl).toMatch(/alura\.com\.br/);
    expect(ctx.app.db.prepare('SELECT source_key FROM lc_courses WHERE title = ?').get('Curso A').source_key).toBe('alura:python-flask');
  });

  it('não duplica ao importar de novo e sobe o progresso (nunca desce); a Udemy segue igual', async () => {
    ctx = await makeApp();
    await ctx.call('POST', '/courses/import', { platform: 'alura', items });
    const again = await ctx.call('POST', '/courses/import', { platform: 'alura', updateProgress: true, items: [{ ...items[0], progress: 70 }, { ...items[1], progress: 0 }] });
    expect(again.body.data).toMatchObject({ created: 0, skipped: 2, progressUpdated: 1 });
    const down = await ctx.call('POST', '/courses/import', { platform: 'alura', updateProgress: true, items: [{ ...items[0], progress: 10 }] });
    expect(down.body.data.progressUpdated).toBe(0);
    // sem `platform` continua sendo Udemy
    const u = await ctx.call('POST', '/courses/import', { items: [{ title: 'Py', url: 'https://www.udemy.com/course/python/', progress: 5 }] });
    expect(u.body.data.created).toBe(1);
    expect((await ctx.call('GET', '/courses')).body.data).toHaveLength(3);
  });

  it('Fundação Bradesco: reconhece o curso criado por link e a imagem de fora é descartada', async () => {
    const site = fakeSite(routes());
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: site.fetch });
    const made = (await ctx.call('POST', '/courses/import-link', { url: EV_URL })).body.data;
    const r = await ctx.call('POST', '/courses/import', {
      platform: 'bradesco',
      updateProgress: true,
      items: [{ title: 'Atendimento ao Público', url: 'https://www.ev.org.br/cursos/Atendimento-ao-Publico', progress: 50, imageUrl: 'https://evil.com/x.png' }],
    });
    expect(r.body.data).toMatchObject({ created: 0, skipped: 1, imagesFilled: 0 });
    expect((await ctx.call('GET', `/courses/${made.courseId}`)).body.data.platform).toBe('Fundação Bradesco');
  });

  it('plataforma desconhecida é recusada', async () => {
    ctx = await makeApp();
    expect((await ctx.call('POST', '/courses/import', { platform: 'coursera', items })).status).toBe(400);
  });
});

describe('migração 010 (chave de importação) e backup', () => {
  it('aplica sobre banco existente sem perder dados e impede chave repetida', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lc-mig10-'));
    try {
      for (const f of ALL_MIGRATIONS.filter((x) => x < '010')) copyFileSync(new URL(`../migrations/${f}`, import.meta.url), join(dir, f));
      const db = new DatabaseSync(':memory:');
      db.exec('PRAGMA foreign_keys = ON;');
      migrate(db, dir);
      db.prepare("INSERT INTO lc_courses (title, platform, category, description, status, manual_progress, created_at, updated_at) VALUES ('Antigo','Alura','Geral','', 'active', 30, 'a', 'a')").run();
      expect(migrate(db)).toEqual(ALL_MIGRATIONS.filter((x) => x >= '010'));
      expect(db.prepare('SELECT title, manual_progress, source_key FROM lc_courses').get()).toMatchObject({ title: 'Antigo', manual_progress: 30, source_key: null });
      db.prepare("UPDATE lc_courses SET source_key = 'alura:x'").run();
      db.prepare("INSERT INTO lc_courses (title, platform, category, description, status, manual_progress, created_at, updated_at) VALUES ('Outro','Alura','Geral','', 'active', 0, 'a', 'a')").run();
      expect(() => db.prepare("UPDATE lc_courses SET source_key = 'alura:x' WHERE title = 'Outro'").run()).toThrow();
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('backup guarda e restaura a chave; repetida é recusada; backup antigo sem ela é aceito', async () => {
    const site = fakeSite(routes());
    const a = await makeApp('2026-03-11T15:00:00', { linkFetch: site.fetch });
    const b = await makeApp('2026-03-11T15:00:00', { linkFetch: site.fetch });
    try {
      const made = (await a.call('POST', '/courses/import-link', { url: ALURA_URL })).body.data;
      const bk = (await a.call('GET', '/backup')).body.data;
      expect(bk.data.courses[0].source_key).toBe('alura:algoritmos-javascript-i-algoritmos-ordenacao');
      const restore = (x) => b.call('POST', '/backup/restore', { confirm: 'substituir-tudo', backup: x });
      expect((await restore(bk)).status).toBe(200);
      const again = await b.call('POST', '/courses/import-link', { url: ALURA_URL });
      expect(again.body.data).toMatchObject({ created: false, courseId: made.courseId, lessonsAdded: 0 });
      const dup = JSON.parse(JSON.stringify(bk));
      dup.data.courses.push({ ...dup.data.courses[0], id: 99, udemy_slug: null });
      expect((await restore(dup)).status).toBe(400);
      const old = JSON.parse(JSON.stringify(bk));
      old.data.courses.forEach((x) => { delete x.source_key; });
      expect((await restore(old)).status).toBe(200);
    } finally {
      await a.app.close();
      await b.app.close();
    }
  });
});
