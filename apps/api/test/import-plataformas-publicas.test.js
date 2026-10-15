import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeApp } from './helpers.js';
import { parseCourseLink, platformsForUi, platformAllowsUrl, PLATFORMS } from '../src/core/platforms.js';
import { fetchText } from '../src/core/course-pages.js';
import { loadCourseFromLink } from '../src/core/course-loader.js';
import { isoMinutes } from '../src/core/course-sources.js';

/**
 * Microsoft Learn, freeCodeCamp, Coursera e Rocketseat.
 * As fixtures em test/fixtures/publicas foram gravadas da rede de verdade (veja "capturedAt") e reduzidas:
 * cada uma tem as respostas, na ordem, que o leitor pediu ao site.
 */
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/publicas/${name}.json`, import.meta.url), 'utf8'));

/** Rede simulada com as respostas gravadas (mais ajustes do teste). */
function fakeNet(names, patch = {}) {
  const routes = {};
  for (const n of [].concat(names)) Object.assign(routes, fixture(n).routes);
  Object.assign(routes, patch);
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const r = routes[url];
    if (!r) return new Response('não achei', { status: 404 });
    if (r instanceof Response) return r.clone();
    return new Response(r.body ?? null, { status: r.status, headers: r.location ? { location: r.location } : { 'content-type': 'text/html' } });
  };
  return { fetch, calls, routes };
}

const CASES = {
  'ms-path-ai': { platform: 'microsoft', key: 'microsoft:path:get-started-ai-apps-agents', title: 'Introdução aos aplicativos e agentes de IA no Azure', modules: 7, lessons: 49, workloadMin: 337, level: 'Iniciante', first: ['Introdução à IA no Azure', 'Introdução', 3] },
  'ms-path-seguranca-ia': { platform: 'microsoft', key: 'microsoft:path:implement-ai-security', title: 'Implement security for AI', modules: 9, lessons: 57, workloadMin: 239, level: 'Intermediário', first: ['Secure access for Microsoft Entra Agent Identity', 'Introduction', 2] },
  'ms-modulo-ia': { platform: 'microsoft', key: 'microsoft:module:get-started-with-ai-in-azure', title: 'Introdução à IA no Azure', modules: 1, lessons: 8, workloadMin: 56, level: 'Iniciante', first: ['Introdução à IA no Azure', 'Introdução', 3] },
  'ms-modulo-seguranca': { platform: 'microsoft', key: 'microsoft:module:describe-security-concepts-methodologies', title: 'Describe security and compliance concepts', modules: 1, lessons: 7, workloadMin: 48, level: 'Iniciante', first: ['Describe security and compliance concepts', 'Introduction', 2] },
  'ms-cert-ai': { platform: 'microsoft', key: 'microsoft:cert:azure-ai-fundamentals', title: 'Microsoft Certificado: conceitos básicos de IA Azure', modules: 1, lessons: 2, workloadMin: 0, level: 'Iniciante', first: ['Guia de estudos', 'Trilha: Conceitos de IA para desenvolvedores e profissionais de tecnologia', 231] },
  'ms-cert-seguranca': { platform: 'microsoft', key: 'microsoft:cert:security-compliance-and-identity-fundamentals', title: 'Microsoft Certified: Security, Compliance, and Identity Fundamentals', modules: 0, lessons: 0, workloadMin: 0, level: 'Iniciante', first: null },
  'fcc-rwd-v9': { platform: 'freecodecamp', key: 'freecodecamp:responsive-web-design-v9', title: 'Responsive Web Design Certification', modules: 29, lessons: 158, workloadMin: 0, level: undefined, first: ['HTML — Basic HTML', 'Build a Curriculum Outline', 0] },
  'fcc-scientific-python': { platform: 'freecodecamp', key: 'freecodecamp:scientific-computing-with-python', title: 'Scientific Computing with Python', modules: 1, lessons: 19, workloadMin: 0, level: undefined, first: ['Blocos do curso', 'Learn String Manipulation by Building a Cipher', 0] },
  'coursera-aprender': { platform: 'coursera', key: 'coursera:learning-how-to-learn', title: 'Aprendendo a aprender: Ferramentas mentais poderosas para ajudá-lo a dominar assuntos difíceis', modules: 4, lessons: 70, workloadMin: 935, level: 'Iniciante', first: ['O que é aprendizado?', 'Introdução aos modos focalizado e difuso', 5] },
  'coursera-python': { platform: 'coursera', key: 'coursera:python', title: 'Programação para todos (Getting Started with Python)', modules: 7, lessons: 49, workloadMin: 1022, level: 'Iniciante', first: ['Capítulo Um - Por que programamos', 'Bem-vindo à classe - Dr. Chuck', 6] },
  'rocketseat-fullstack': { platform: 'rocketseat', key: 'rocketseat:fullstack', title: 'Formação em Full-Stack', modules: 1, lessons: 14, workloadMin: 10860, level: 'Iniciante', first: ['Módulos da formação', 'Fundamentos da Programação Web e Setup (24 aulas)', 0] },
  'rocketseat-go': { platform: 'rocketseat', key: 'rocketseat:go', title: 'Formação em GO', modules: 1, lessons: 8, workloadMin: 3000, level: 'Intermediário', first: ['Módulos da formação', 'Primeiros Passos (37 aulas)', 0] },
};

describe('links aceitos e recusados nas plataformas novas', () => {
  it('reconhece cada plataforma e gera a chave estável', () => {
    expect(parseCourseLink('https://learn.microsoft.com/pt-br/training/paths/get-started-ai-apps-agents/?WT.mc_id=x')).toMatchObject({ key: 'microsoft:path:get-started-ai-apps-agents', kind: 'path', locale: 'pt-br' });
    expect(parseCourseLink('learn.microsoft.com/en-us/training/modules/get-started-with-ai-in-azure/2-what-is-azure')).toMatchObject({ key: 'microsoft:module:get-started-with-ai-in-azure', url: 'https://learn.microsoft.com/en-us/training/modules/get-started-with-ai-in-azure/' });
    expect(parseCourseLink('https://learn.microsoft.com/PT-BR/credentials/certifications/azure-ai-fundamentals/')).toMatchObject({ key: 'microsoft:cert:azure-ai-fundamentals', kind: 'cert' });
    expect(parseCourseLink('https://www.freecodecamp.org/learn/responsive-web-design-v9/workshop-x/step-1')).toMatchObject({ key: 'freecodecamp:responsive-web-design-v9', url: 'https://www.freecodecamp.org/learn/responsive-web-design-v9' });
    expect(parseCourseLink('https://freecodecamp.org/learn/scientific-computing-with-python/')).toMatchObject({ key: 'freecodecamp:scientific-computing-with-python' });
    expect(parseCourseLink('https://www.coursera.org/learn/Learning-How-To-Learn?specialization=x')).toMatchObject({ key: 'coursera:learning-how-to-learn', url: 'https://www.coursera.org/learn/Learning-How-To-Learn' });
    expect(parseCourseLink('https://www.rocketseat.com.br/formacao/fullstack')).toMatchObject({ key: 'rocketseat:fullstack' });
  });

  it('recusa links de outro tipo, outro idioma, hosts parecidos, IPs, portas, http e credenciais', () => {
    for (const u of [
      'https://learn.microsoft.com/', 'https://learn.microsoft.com/pt-br/training/', 'https://learn.microsoft.com/fr-fr/training/paths/x/', 'https://learn.microsoft.com/pt-br/credentials/certifications/exams/ai-900',
      'https://learn.microsoft.com.evil.com/pt-br/training/paths/x/', 'https://evil.com/learn.microsoft.com/pt-br/training/paths/x/', 'http://learn.microsoft.com/pt-br/training/paths/x/',
      'https://user:pw@learn.microsoft.com/pt-br/training/paths/x/', 'https://learn.microsoft.com:8443/pt-br/training/paths/x/', 'https://learn.microsoft.com/pt-br/training/paths/..%2Fadmin/',
      'https://www.freecodecamp.org/', 'https://www.freecodecamp.org/learn', 'https://www.freecodecamp.org/news/algo/', 'https://freecodecamp.org.evil.com/learn/x', 'https://raw.githubusercontent.com/freeCodeCamp/freeCodeCamp/main/x',
      'https://www.coursera.org/', 'https://www.coursera.org/specializations/python', 'https://www.coursera.org/professional-certificates/google-it-support', 'https://www.coursera.org/learn/', 'https://notcoursera.org/learn/python',
      'https://www.rocketseat.com.br/', 'https://www.rocketseat.com.br/nlw', 'https://app.rocketseat.com.br/jornada/x/visao-geral', 'https://rocketseat.com.br.evil.com/formacao/x',
      'https://www.domestika.org/pt/courses/3086-ilustracao-vetorial', 'https://web.dio.me/track/x',
    ]) expect(parseCourseLink(u), u).toBeNull();
  });

  it('a lista para a tela vem do registro e inclui as plataformas novas', () => {
    const list = platformsForUi();
    expect(list.map((p) => p.id)).toEqual(Object.keys(PLATFORMS));
    expect(list.map((p) => p.name)).toEqual(expect.arrayContaining(['Alura', 'Fundação Bradesco', 'Microsoft Learn', 'freeCodeCamp', 'Coursera', 'Rocketseat']));
    expect(list.find((p) => p.id === 'microsoft')).toMatchObject({ hosts: ['learn.microsoft.com'], example: expect.stringContaining('learn.microsoft.com') });
  });
});

describe('segurança de rede das plataformas novas', () => {
  const fcc = () => PLATFORMS.freecodecamp;
  const u = (s) => new URL(s);

  it('só abre o site da plataforma e, para a freeCodeCamp, a pasta do currículo no GitHub', () => {
    expect(platformAllowsUrl(fcc(), u('https://raw.githubusercontent.com/freeCodeCamp/freeCodeCamp/main/client/i18n/locales/english/intro.json'))).toBe(true);
    expect(platformAllowsUrl(fcc(), u('https://raw.githubusercontent.com/evil/repo/main/x.json'))).toBe(false);
    expect(platformAllowsUrl(fcc(), u('https://raw.githubusercontent.com/freeCodeCampEvil/x/main/a.json'))).toBe(false);
    expect(platformAllowsUrl(fcc(), u('http://raw.githubusercontent.com/freeCodeCamp/freeCodeCamp/main/a.json'))).toBe(false);
    // a fonte de dados de uma plataforma não vale para as outras
    expect(platformAllowsUrl(PLATFORMS.microsoft, u('https://raw.githubusercontent.com/freeCodeCamp/freeCodeCamp/main/a.json'))).toBe(false);
    expect(platformAllowsUrl(PLATFORMS.coursera, u('https://learn.microsoft.com/api/catalog/'))).toBe(false);
    for (const bad of ['https://127.0.0.1/', 'https://169.254.169.254/latest', 'https://[::1]/', 'https://localhost/', 'https://learn.microsoft.com:444/api/catalog/']) {
      expect(platformAllowsUrl(PLATFORMS.microsoft, u(bad)), bad).toBe(false);
    }
  });

  it('redirecionamento do catálogo ou da página para fora da plataforma é recusado sem chamar o destino', async () => {
    for (const to of ['https://evil.com/x', 'http://learn.microsoft.com/api/catalog/', 'https://169.254.169.254/latest/meta-data', 'https://www.coursera.org/learn/python', 'https://raw.githubusercontent.com/freeCodeCamp/freeCodeCamp/main/a.json']) {
      const calls = [];
      const f = async (url) => { calls.push(url); return new Response(null, { status: 302, headers: { location: to } }); };
      await expect(fetchText('https://learn.microsoft.com/api/catalog/?uid=x&locale=pt-br', PLATFORMS.microsoft, f, { accept: 'application/json' }), to).rejects.toMatchObject({ code: 'PAGE_ELSEWHERE' });
      expect(calls, to).toHaveLength(1);
    }
  });

  it('pede o catálogo como JSON, em lotes de no máximo 20 identificadores, de um em um', async () => {
    const net = fakeNet('ms-path-seguranca-ia');
    await loadCourseFromLink('https://learn.microsoft.com/en-us/training/paths/implement-ai-security/', net.fetch);
    const catalog = net.calls.filter((c) => c.url.includes('/api/catalog/'));
    expect(catalog.length).toBeGreaterThanOrEqual(3);
    for (const c of catalog) {
      expect(c.init.headers.Accept).toBe('application/json');
      expect(c.init.redirect).toBe('manual');
      expect(new URL(c.url).searchParams.get('uid').split(',').length).toBeLessThanOrEqual(20);
    }
    expect(net.calls.length).toBeLessThanOrEqual(10);
  });
});

describe('leitores (fixtures gravadas da rede real)', () => {
  for (const [name, want] of Object.entries(CASES)) {
    it(`${name}: título, módulos, aulas, duração e chave`, async () => {
      const net = fakeNet(name);
      const page = await loadCourseFromLink(fixture(name).start, net.fetch);
      expect(page).toMatchObject({ platform: want.platform, key: want.key, title: want.title, workloadMin: want.workloadMin });
      expect(page.level).toBe(want.level);
      expect(page.modules).toHaveLength(want.modules);
      expect(page.modules.reduce((n, m) => n + m.lessons.length, 0)).toBe(want.lessons);
      if (want.first) {
        const [mod, title, min] = want.first;
        expect(page.modules[0].title).toBe(mod);
        expect(page.modules[0].lessons[0]).toEqual({ title, durationMin: min });
      }
      expect(page.description.length).toBeGreaterThan(20);
      expect(page.url).toBe(parseCourseLink(page.url).url);
      expect(parseCourseLink(page.url).key).toBe(page.key);
      expect(net.calls.length).toBeLessThanOrEqual(10);
    });
  }

  it('Microsoft Learn: soma das durações das unidades bate com a duração do módulo', async () => {
    const page = await loadCourseFromLink(fixture('ms-modulo-ia').start, fakeNet('ms-modulo-ia').fetch);
    expect(page.modules[0].lessons.reduce((n, l) => n + l.durationMin, 0)).toBe(page.workloadMin);
  });

  it('Microsoft Learn: trilha com endereço antigo (duas trocas de endereço) acaba na trilha certa', async () => {
    const net = fakeNet('ms-path-ai');
    const page = await loadCourseFromLink('https://learn.microsoft.com/pt-br/training/paths/get-started-with-artificial-intelligence-on-azure/', net.fetch);
    expect(page.url).toBe('https://learn.microsoft.com/pt-br/training/paths/get-started-ai-apps-agents/');
    expect(net.calls.slice(0, 3).map((c) => c.url.split('/').at(-2))).toEqual(['get-started-with-artificial-intelligence-on-azure', 'introduction-to-ai-on-azure', 'get-started-ai-apps-agents']);
  });

  it('Coursera: capa só de pasta de imagens da própria Coursera; duração por vídeo em minutos (mínimo 1)', async () => {
    const page = await loadCourseFromLink(fixture('coursera-python').start, fakeNet('coursera-python').fetch);
    expect(page.imageUrl).toMatch(/^https:\/\/s3\.amazonaws\.com\/coursera-course-photos\//);
    expect(page.modules.every((m) => m.lessons.every((l) => Number.isInteger(l.durationMin) && l.durationMin >= 0))).toBe(true);
  });

  it('Rocketseat: link curto leva a outro endereço do site e o curso continua com a chave do link colado', async () => {
    const net = fakeNet('rocketseat-go');
    const page = await loadCourseFromLink('https://www.rocketseat.com.br/formacao/go', net.fetch);
    expect(net.calls).toHaveLength(2);
    expect(page.key).toBe('rocketseat:go');
    expect(page.url).toBe('https://www.rocketseat.com.br/formacao/go');
  });

  it('isoMinutes entende durações ISO', () => {
    expect(isoMinutes('PT15H35M17S')).toBe(935);
    expect(isoMinutes('PT1M15S')).toBe(1);
    expect(isoMinutes('PT45S')).toBe(1);
    expect(isoMinutes('PT')).toBe(0);
    expect(isoMinutes('abc')).toBe(0);
  });
});

describe('erros dos leitores novos (mensagens em português)', () => {
  it('Microsoft Learn: página que não é do tipo do endereço, catálogo vazio, JSON quebrado e catálogo fora do ar', async () => {
    const path = fixture('ms-path-ai');
    const pathUrl = 'https://learn.microsoft.com/pt-br/training/paths/get-started-ai-apps-agents/';
    // endereço de módulo cuja página é de trilha
    const wrongKind = { 'https://learn.microsoft.com/pt-br/training/modules/get-started-ai-apps-agents/': path.routes[pathUrl] };
    await expect(loadCourseFromLink('https://learn.microsoft.com/pt-br/training/modules/get-started-ai-apps-agents/', fakeNet('ms-path-ai', wrongKind).fetch)).rejects.toMatchObject({ status: 422, code: 'COURSE_NOT_FOUND' });
    const catalogUrl = Object.keys(path.routes).find((k) => k.includes('/api/catalog/'));
    await expect(loadCourseFromLink(path.start, fakeNet('ms-path-ai', { [catalogUrl]: { status: 200, body: '{"learningPaths":[]}' } }).fetch)).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' });
    await expect(loadCourseFromLink(path.start, fakeNet('ms-path-ai', { [catalogUrl]: { status: 200, body: 'não é json' } }).fetch)).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' });
    await expect(loadCourseFromLink(path.start, fakeNet('ms-path-ai', { [catalogUrl]: { status: 400, body: '{}' } }).fetch)).rejects.toMatchObject({ status: 502, code: 'PAGE_UNREACHABLE' });
    // página sem os dados de identificação
    await expect(loadCourseFromLink(path.start, fakeNet('ms-path-ai', { [pathUrl]: { status: 200, body: '<html><title>x</title></html>' } }).fetch)).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' });
  });

  it('Microsoft Learn: trilha enorme demais é recusada antes de pedir centenas de lotes', async () => {
    const fx = fixture('ms-modulo-ia');
    const catalogUrl = Object.keys(fx.routes).find((k) => k.includes('learn.wwl.get-started-with-ai-in-azure&'));
    const units = Array.from({ length: 700 }, (_, i) => `learn.wwl.get-started-with-ai-in-azure.u${i}`);
    const body = JSON.stringify({ modules: [{ uid: 'learn.wwl.get-started-with-ai-in-azure', title: 'Grande', units }] });
    const net = fakeNet('ms-modulo-ia', { [catalogUrl]: { status: 200, body } });
    await expect(loadCourseFromLink(fx.start, net.fetch)).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' });
    expect(net.calls.length).toBeLessThanOrEqual(3);
  });

  it('freeCodeCamp: curso que não existe no currículo, e currículo antigo sem arquivo de estrutura', async () => {
    const fx = fixture('fcc-scientific-python');
    const structureUrl = Object.keys(fx.routes).find((k) => k.includes('/structure/'));
    const introUrl = Object.keys(fx.routes).find((k) => k.endsWith('intro.json'));
    await expect(loadCourseFromLink('https://www.freecodecamp.org/learn/curso-que-nao-existe', fakeNet('fcc-scientific-python').fetch)).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' });
    // sem arquivo de estrutura (404): vale a ordem dos blocos do próprio texto do currículo
    const net = fakeNet('fcc-scientific-python', { [structureUrl]: { status: 404 } });
    const page = await loadCourseFromLink(fx.start, net.fetch);
    expect(page.modules).toHaveLength(1);
    expect(page.modules[0].lessons.length).toBeGreaterThan(0);
    // texto do currículo fora do ar
    await expect(loadCourseFromLink(fx.start, fakeNet('fcc-scientific-python', { [introUrl]: { status: 500 } }).fetch)).rejects.toMatchObject({ status: 502, code: 'PAGE_UNREACHABLE' });
    // nunca abre a página do site (ela só carrega por JavaScript)
    expect(net.calls.every((c) => c.url.startsWith('https://raw.githubusercontent.com/freeCodeCamp/freeCodeCamp/'))).toBe(true);
  });

  it('Coursera e Rocketseat: página sem os dados do curso, redirecionada para a inicial ou bloqueada', async () => {
    const co = fixture('coursera-python');
    const coUrl = 'https://www.coursera.org/learn/python';
    await expect(loadCourseFromLink(co.start, fakeNet('coursera-python', { [coUrl]: { status: 200, body: '<html><body>sem estado</body></html>' } }).fetch)).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' });
    await expect(loadCourseFromLink(co.start, fakeNet('coursera-python', { [coUrl]: { status: 403, body: 'bloqueado' } }).fetch)).rejects.toMatchObject({ status: 502, code: 'PAGE_UNREACHABLE' });
    const rk = fixture('rocketseat-go');
    const rkUrl = 'https://www.rocketseat.com.br/formacao/go';
    const home = { status: 302, location: 'https://www.rocketseat.com.br/' };
    await expect(loadCourseFromLink(rk.start, fakeNet('rocketseat-go', { [rkUrl]: home, 'https://www.rocketseat.com.br/': { status: 200, body: '<html><h1>Home</h1></html>' } }).fetch)).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' });
  });

  it('mensagem de link inválido: específica quando o site é conhecido e com a lista quando não é', async () => {
    await expect(loadCourseFromLink('https://learn.microsoft.com/pt-br/training/', async () => { throw new Error('não deveria buscar'); })).rejects.toMatchObject({ status: 400, code: 'LINK_INVALID', message: 'Esse link não parece ser de um curso da Microsoft Learn.' });
    await expect(loadCourseFromLink('https://www.coursera.org/specializations/python', async () => { throw new Error('x'); })).rejects.toMatchObject({ message: 'Esse link não parece ser de um curso da Coursera.' });
    await expect(loadCourseFromLink('https://www.domestika.org/pt/courses/1-x', async () => { throw new Error('x'); })).rejects.toMatchObject({ message: expect.stringMatching(/plataforma aceita\. Aceitamos: Alura, Fundação Bradesco, Microsoft Learn, freeCodeCamp, Coursera e Rocketseat\.$/) });
  });
});

describe('rotas /courses/import-link com as plataformas novas', () => {
  let ctx;
  afterEach(async () => { await ctx?.app.close(); });
  const open = async (names, patch) => {
    const net = fakeNet(names, patch);
    ctx = await makeApp('2026-03-11T15:00:00', { linkFetch: net.fetch });
    return { ...ctx, net };
  };
  const list = async () => (await ctx.call('GET', '/courses')).body.data;

  it('GET /courses/import-link/platforms devolve o registro para a tela', async () => {
    const { call } = await open([]);
    const r = await call('GET', '/courses/import-link/platforms');
    expect(r.status).toBe(200);
    expect(r.body.data.map((p) => p.name)).toEqual(['Alura', 'Fundação Bradesco', 'Microsoft Learn', 'freeCodeCamp', 'Coursera', 'Rocketseat']);
    expect(r.body.data[2]).toMatchObject({ id: 'microsoft', hosts: ['learn.microsoft.com'] });
  });

  it.each([
    ['ms-path-ai', 'Microsoft Learn', 7, 49],
    ['ms-modulo-seguranca', 'Microsoft Learn', 1, 7],
    ['fcc-rwd-v9', 'freeCodeCamp', 29, 158],
    ['coursera-aprender', 'Coursera', 4, 70],
    ['rocketseat-fullstack', 'Rocketseat', 1, 14],
  ])('%s: prévia não grava; importar cria o curso com módulos e aulas; repetir não duplica', async (name, platformName, modules, lessons) => {
    const fx = fixture(name);
    const { call } = await open(name);
    const prev = await call('POST', '/courses/import-link/preview', { url: fx.start });
    expect(prev.status).toBe(200);
    expect(prev.body.data).toMatchObject({ moduleCount: modules, lessonCount: lessons, existing: null, warnings: [] });
    expect(await list()).toEqual([]);

    const out = await call('POST', '/courses/import-link', { url: fx.start, category: 'Programação' });
    expect(out.status).toBe(200);
    expect(out.body.data).toMatchObject({ created: true, lessonsAdded: lessons });
    const course = (await call('GET', `/courses/${out.body.data.courseId}`)).body.data;
    expect(course).toMatchObject({ platform: platformName, category: 'Programação', status: 'planned' });
    expect(course.modules).toHaveLength(modules);
    expect(course.modules.reduce((n, m) => n + m.lessons.length, 0)).toBe(lessons);

    const again = await call('POST', '/courses/import-link', { url: fx.start });
    expect(again.body.data).toMatchObject({ created: false, courseId: out.body.data.courseId, lessonsAdded: 0 });
    expect(await list()).toHaveLength(1);
    const prev2 = await call('POST', '/courses/import-link/preview', { url: fx.start });
    expect(prev2.body.data.existing).toMatchObject({ id: out.body.data.courseId, newLessons: 0 });
  });

  it('a plataforma aparece nas opções da tela (mecanismo existente)', async () => {
    const fx = fixture('ms-modulo-ia');
    const { call } = await open('ms-modulo-ia');
    await call('POST', '/courses/import-link', { url: fx.start });
    const opts = (await call('GET', '/options')).body.data;
    expect(opts.platforms.map((p) => p.name)).toContain('Microsoft Learn');
  });

  it('Microsoft Learn: o mesmo curso em pt-br e en-us não duplica', async () => {
    const fx = fixture('ms-modulo-ia');
    const enRoutes = Object.fromEntries(Object.entries(fx.routes).map(([k, v]) => [k.replace('/pt-br/', '/en-us/').replace('locale=pt-br', 'locale=en-us'), v]));
    const { call } = await open('ms-modulo-ia', enRoutes);
    const a = await call('POST', '/courses/import-link', { url: fx.start });
    const b = await call('POST', '/courses/import-link', { url: fx.start.replace('/pt-br/', '/en-us/') });
    expect(b.body.data).toMatchObject({ created: false, courseId: a.body.data.courseId });
    expect(await list()).toHaveLength(1);
  });

  it('Microsoft Learn: certificação sem lista de aulas é criada só com título e descrição, com aviso', async () => {
    const fx = fixture('ms-cert-seguranca');
    const { call } = await open('ms-cert-seguranca');
    const prev = await call('POST', '/courses/import-link/preview', { url: fx.start });
    expect(prev.body.data).toMatchObject({ lessonCount: 0, moduleCount: 0 });
    expect(prev.body.data.warnings[0]).toMatch(/Colar lista de aulas/);
    const out = await call('POST', '/courses/import-link', { url: fx.start });
    expect(out.body.data).toMatchObject({ created: true, lessonsAdded: 0 });
  });

  it('para plataformas sem duração por aula as aulas ficam com duração 0 e a carga horária vai na descrição', async () => {
    const fx = fixture('rocketseat-fullstack');
    const { call } = await open('rocketseat-fullstack');
    const prev = await call('POST', '/courses/import-link/preview', { url: fx.start });
    expect(prev.body.data.workloadMin).toBe(10860);
    expect(prev.body.data.description).toContain('Carga horária: 181h');
    expect(prev.body.data.modules[0].lessons.every((l) => l.durationMin === 0)).toBe(true);
    const fcc = fixture('fcc-scientific-python');
    const { call: call2 } = await open('fcc-scientific-python');
    const p2 = await call2('POST', '/courses/import-link/preview', { url: fcc.start });
    expect(p2.body.data.workloadMin).toBe(0);
    expect(p2.body.data.description).not.toContain('Carga horária');
  });

  it('texto do site com HTML continua sendo só texto (nada é interpretado no servidor)', async () => {
    const fx = fixture('ms-modulo-ia');
    const catalogUrl = Object.keys(fx.routes).find((k) => k.includes('learn.wwl.get-started-with-ai-in-azure&'));
    const body = JSON.stringify({ modules: [{ uid: 'learn.wwl.get-started-with-ai-in-azure', title: '<img src=x onerror=alert(1)> Módulo', summary: '<script>alert(1)</script> resumo', units: [] }] });
    const { call } = await open('ms-modulo-ia', { [catalogUrl]: { status: 200, body } });
    const prev = await call('POST', '/courses/import-link/preview', { url: fx.start });
    expect(prev.status).toBe(200);
    expect(typeof prev.body.data.title).toBe('string');
    expect(JSON.stringify(prev.body.data)).not.toMatch(/<\/?(?:img|script)\b[^>]*>\s*(?=$)/);
  });

  it('SSRF e allowlist nas rotas: nenhum endereço de fora chega à rede', async () => {
    const { call, net } = await open([]);
    for (const url of [
      'https://learn.microsoft.com.evil.com/pt-br/training/paths/x/', 'https://127.0.0.1/learn/x', 'https://raw.githubusercontent.com/freeCodeCamp/freeCodeCamp/main/a.json',
      'https://www.coursera.org:8443/learn/python', 'http://www.rocketseat.com.br/formacao/go', 'https://user:pw@www.rocketseat.com.br/formacao/go', 'https://www.domestika.org/pt/courses/1-x',
    ]) {
      const r = await call('POST', '/courses/import-link/preview', { url });
      expect(r.status, url).toBe(400);
      expect(r.body.error.code, url).toBe('LINK_INVALID');
    }
    expect(net.calls).toHaveLength(0);
  });
});
