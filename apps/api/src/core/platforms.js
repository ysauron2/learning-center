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
};

export const PLATFORM_IDS = Object.keys(PLATFORMS);

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
