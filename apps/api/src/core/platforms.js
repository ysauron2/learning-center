/**
 * Registro das plataformas de cursos com importação própria (além da Udemy, que tem código dedicado).
 * Cada plataforma diz: nome, domínios permitidos, como reconhecer um link de curso e a página inicial
 * de "Meus cursos" (usada pela janela logada do app desktop).
 *
 * Domínios: comparação EXATA do host ou de um subdomínio dele (nunca "contém").
 */

/** `host` é o próprio domínio ou um subdomínio dele? */
export function hostMatches(host, domain) {
  const h = String(host ?? '').toLowerCase();
  return h === domain || h.endsWith(`.${domain}`);
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,150}$/;

function aluraRef(u) {
  const host = u.hostname.toLowerCase();
  const first = u.pathname.split('/').filter(Boolean)[0] ?? '';
  let slug = null;
  if (host === 'cursos.alura.com.br') {
    const m = u.pathname.match(/^\/course\/([^/]+)/i);
    slug = m ? m[1] : null;
  } else if (host === 'www.alura.com.br' || host === 'alura.com.br') {
    const m = first.match(/^curso-online-(.+)$/i);
    slug = m ? m[1] : null;
  }
  slug = slug?.toLowerCase() ?? null;
  if (!slug || !SLUG.test(slug)) return null;
  return { key: `alura:${slug}`, slug, url: `https://www.alura.com.br/curso-online-${slug}` };
}

function bradescoRef(u) {
  const m = u.pathname.match(/^\/cursos?\/([^/]+)/i);
  if (!m) return null;
  let slug;
  try {
    slug = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  if (!/^[\p{L}\p{N}_-]{1,150}$/u.test(slug)) return null;
  // Na Escola Virtual o endereço não diferencia maiúsculas de minúsculas (conferido no site).
  return { key: `bradesco:${slug.toLowerCase()}`, slug: slug.toLowerCase(), url: `https://www.ev.org.br/cursos/${encodeURIComponent(slug)}` };
}

const MS_LOCALES = ['pt-br', 'en-us'];

function microsoftRef(u) {
  const m = u.pathname.match(/^\/([a-z]{2}-[a-z]{2})\/(?:training\/(paths|modules)|credentials\/(certifications))\/([^/]+)/i);
  if (!m) return null;
  const locale = m[1].toLowerCase();
  const slug = m[4].toLowerCase();
  if (!MS_LOCALES.includes(locale) || !SLUG.test(slug)) return null;
  const kind = m[3] ? 'cert' : m[2].toLowerCase() === 'paths' ? 'path' : 'module';
  if (kind === 'cert' && slug === 'exams') return null;
  const dir = kind === 'cert' ? 'credentials/certifications' : `training/${kind}s`;
  return { key: `microsoft:${kind}:${slug}`, slug, kind, locale, url: `https://learn.microsoft.com/${locale}/${dir}/${slug}/` };
}

function freecodecampRef(u) {
  const m = u.pathname.match(/^\/learn\/([^/]+)/i);
  const slug = m?.[1].toLowerCase();
  if (!slug || !SLUG.test(slug)) return null;
  return { key: `freecodecamp:${slug}`, slug, url: `https://www.freecodecamp.org/learn/${slug}` };
}

function courseraRef(u) {
  const m = u.pathname.match(/^\/learn\/([A-Za-z0-9][A-Za-z0-9_-]{0,150})(?:\/|$)/);
  if (!m) return null;
  return { key: `coursera:${m[1].toLowerCase()}`, slug: m[1], url: `https://www.coursera.org/learn/${m[1]}` };
}

function rocketseatRef(u) {
  const m = u.pathname.match(/^\/formacao\/([^/]+)/i);
  const slug = m?.[1].toLowerCase();
  if (!slug || !SLUG.test(slug)) return null;
  return { key: `rocketseat:${slug}`, slug, url: `https://www.rocketseat.com.br/formacao/${slug}` };
}

export const PLATFORMS = {
  alura: {
    id: 'alura',
    name: 'Alura',
    domains: ['alura.com.br'],
    // "Meus cursos" da Alura: exige login (o endereço redireciona para a tela de entrada quando você não está logado).
    myCoursesUrl: 'https://cursos.alura.com.br/dashboard',
    courseRef: aluraRef,
  },
  bradesco: {
    id: 'bradesco',
    name: 'Fundação Bradesco',
    domains: ['ev.org.br'],
    // Área do aluno da Escola Virtual: não foi possível confirmar o endereço exato sem uma conta.
    myCoursesUrl: 'https://www.ev.org.br/',
    courseRef: bradescoRef,
  },
  // Plataformas só com leitura por link público (sem janela logada nem "Meus cursos").
  microsoft: {
    id: 'microsoft',
    name: 'Microsoft Learn',
    domains: ['learn.microsoft.com'],
    myCoursesUrl: null,
    linkOnly: true,
    courseRef: microsoftRef,
    example: 'https://learn.microsoft.com/pt-br/training/paths/…',
    note: 'Aceita trilhas, módulos e certificações, em português ou inglês. Entram o título, o resumo, o nível, a duração de cada unidade e a lista de módulos e unidades.',
  },
  freecodecamp: {
    id: 'freecodecamp',
    name: 'freeCodeCamp',
    domains: ['freecodecamp.org'],
    // a lista de blocos vem do repositório público do currículo no GitHub (a página do site só carrega depois, por JavaScript)
    dataHosts: [{ host: 'raw.githubusercontent.com', prefix: '/freeCodeCamp/freeCodeCamp/' }],
    myCoursesUrl: null,
    linkOnly: true,
    courseRef: freecodecampRef,
    example: 'https://www.freecodecamp.org/learn/…',
    note: 'Entram o título, a descrição e a lista de blocos na ordem do currículo. O site não informa a duração.',
  },
  coursera: {
    id: 'coursera',
    name: 'Coursera',
    domains: ['coursera.org'],
    imageHosts: [{ host: 's3.amazonaws.com', prefix: '/coursera-course-photos/' }],
    myCoursesUrl: null,
    linkOnly: true,
    courseRef: courseraRef,
    example: 'https://www.coursera.org/learn/…',
    note: 'Só cursos (endereços com /learn/). Entram o título, a descrição, a capa e as semanas com as videoaulas e a duração de cada uma.',
  },
  rocketseat: {
    id: 'rocketseat',
    name: 'Rocketseat',
    domains: ['rocketseat.com.br'],
    imageHosts: [{ host: 'storage.googleapis.com', prefix: '/star-lab/' }],
    myCoursesUrl: null,
    linkOnly: true,
    courseRef: rocketseatRef,
    // o site leva /formacao/go para /produtos/desenvolvimento/formacao-em-go: o destino conta como página de curso
    acceptFinal: (u) => /^\/(formacao|produtos)\//i.test(u.pathname),
    example: 'https://www.rocketseat.com.br/formacao/…',
    note: 'Só as páginas públicas de formação (/formacao/…). Entram o título, a descrição, a carga horária e os módulos com a quantidade de aulas; os títulos das aulas ficam de fora.',
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS);

const hostIn = (list, u) => list?.some((d) => u.hostname.toLowerCase() === d.host && u.pathname.startsWith(d.prefix)) ?? false;

/** O servidor pode abrir este endereço para esta plataforma? (site dela, ou fonte de dados públicos listada). */
export function platformAllowsUrl(platform, u) {
  if (!isSafePublicUrl(u)) return false;
  return platformForHost(u.hostname)?.id === platform.id || hostIn(platform.dataHosts, u);
}

/** Imagem de capa aceita: https, do site da plataforma ou de uma pasta de imagens listada. */
export function platformAllowsImage(platform, u) {
  return u.protocol === 'https:' && (platformForHost(u.hostname)?.id === platform.id || hostIn(platform.imageHosts, u));
}

/** Lista para a tela (gerada do registro): nome, endereços reconhecidos, exemplo e o que entra. */
export function platformsForUi() {
  return Object.values(PLATFORMS).map((p) => ({ id: p.id, name: p.name, hosts: p.domains, example: p.example ?? null, note: p.note ?? null }));
}

/** "A, B e C" */
export function joinNames(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : (names[0] ?? '');
}

/** Mensagem de link inválido: específica quando o site é conhecido, com a lista quando não é. */
export function invalidLinkMessage(host) {
  const p = host ? platformForHost(host) : null;
  if (p) return `Esse link não parece ser de um curso da ${p.name}.`;
  return `Esse link não parece ser de um curso de uma plataforma aceita. Aceitamos: ${joinNames(Object.values(PLATFORMS).map((x) => x.name))}.`;
}

/** Plataforma dona deste host (ou null). */
export function platformForHost(host) {
  return Object.values(PLATFORMS).find((p) => p.domains.some((d) => hostMatches(host, d))) ?? null;
}

/** Endereços de página de curso aceitos: só https, sem usuário/senha, sem porta, sem IP. */
export function parseCourseLink(raw) {
  const text = String(raw ?? '').trim();
  if (!text || text.length > 600) return null;
  let u;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!isSafePublicUrl(u)) return null;
  const platform = platformForHost(u.hostname);
  if (!platform) return null;
  const ref = platform.courseRef(u);
  return ref ? { platform, ...ref } : null;
}

/** https, sem credenciais, sem porta, host com nome (nunca IP nem "localhost"). */
export function isSafePublicUrl(u) {
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port) return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host)) return false;
  return true;
}
