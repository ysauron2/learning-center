import { HttpError } from './errors.js';
import { PLATFORMS, platformAllowsUrl, platformAllowsImage } from './platforms.js';

/**
 * Base da leitura de páginas PÚBLICAS de curso (sem login): texto, busca segura e os leitores da Alura e da
 * Fundação Bradesco (Escola Virtual). As outras plataformas ficam em course-sources.js; a escolha em course-loader.js.
 * Os parsers foram escritos contra páginas reais (veja test/fixtures) e dão preferência a dados
 * estruturados (JSON-LD, estado embutido do Next.js) antes de seletores de HTML.
 * Tudo que vem do site é tratado como TEXTO: nada de HTML vai para a interface.
 */

const MAX_BYTES = 6_000_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const err = (status, code, message) => new HttpError(status, code, message);

export const MESSAGES = {
  unreachable: 'A página não abriu. Confira o link e a sua conexão com a internet e tente de novo.',
  notFound: 'Essa página não existe ou saiu do ar. Confira o link.',
  elsewhere: 'Esse link leva para fora do site da plataforma, então não foi aberto.',
  tooBig: 'A página veio grande demais para ser lida.',
  notCourse: 'Não encontrei os dados de um curso nessa página. Confira se o link é de um curso.',
};

/* ---------- texto ---------- */

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…' };

/** Decodifica entidades HTML (nomeadas comuns e numéricas, como &#250;). */
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Texto puro de um trecho de HTML. */
export function textOfHtml(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|h\d|br)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export const oneLine = (s, max) => decodeEntities(String(s ?? '')).replace(/\s+/g, ' ').trim().slice(0, max);

export function metaContent(html, key) {
  const re = new RegExp(`<meta\\s[^>]*(?:property|name)=["']${key}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0];
  return tag ? oneLine(/content=["']([^"']*)["']/i.exec(tag)?.[1], 2000) : '';
}

/** Só imagem https de um domínio da própria plataforma (ou de uma pasta de imagens dela, listada no registro). */
export function platformImage(raw, platformId) {
  try {
    const u = new URL(String(raw ?? ''));
    if (u.href.length > 500) return null;
    return platformAllowsImage(PLATFORMS[platformId], u) ? u.href : null;
  } catch {
    return null;
  }
}

/** "PT8H30M" → 510; "8h", "04h" ou "1h30" → minutos. */
export function workloadMinutes(raw) {
  const s = String(raw ?? '').trim();
  const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(s);
  if (iso && (iso[1] || iso[2])) return Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0);
  const h = /^(\d{1,3})\s*h(?:\s*(\d{1,2}))?/i.exec(s);
  if (h) return Number(h[1]) * 60 + Number(h[2] ?? 0);
  return 0;
}

export function formatWorkload(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`) : `${m} min`;
}

/* ---------- Alura ---------- */

function ldCourse(html) {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const list = Array.isArray(data) ? data : [data];
      const found = list.find((d) => d && typeof d === 'object' && d['@type'] === 'Course');
      if (found) return found;
    } catch { /* ignora este bloco */ }
  }
  return null;
}

/** Junta o texto dos blocos `self.__next_f.push([1,"..."])` (dados embutidos do Next.js). */
function nextFlight(html) {
  let all = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      all += JSON.parse(m[1]);
    } catch { /* bloco que não é texto */ }
    if (all.length > MAX_BYTES) break;
  }
  return all;
}

function readJsonArray(src, start) {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i += 1;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '[') depth += 1;
    else if (c === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(src.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Capítulos (módulos) e seções (aulas) da "Ementa". Primeiro no estado embutido; depois, só os títulos dos capítulos no HTML. */
function aluraModules(html) {
  const all = nextFlight(html);
  const at = all.indexOf('"chapters":[');
  const chapters = at >= 0 ? readJsonArray(all, at + '"chapters":'.length) : null;
  const fromState = (Array.isArray(chapters) ? chapters : [])
    .map((c) => ({
      title: oneLine(c?.capitulo, 160),
      lessons: (Array.isArray(c?.secoes) ? c.secoes : []).map((t) => oneLine(t, 200)).filter(Boolean).map((title) => ({ title, durationMin: 0 })),
    }))
    .filter((m) => m.title);
  if (fromState.length) return fromState;
  // plano B: títulos dos capítulos no HTML (cada capítulo vira uma aula de um módulo só)
  const titles = [...html.matchAll(/aria-label=["']Expandir cap[ií]tulo:\s*([^"']+)["']/gi)].map((m) => oneLine(m[1], 200)).filter(Boolean);
  return titles.length ? [{ title: 'Capítulos', lessons: titles.map((title) => ({ title, durationMin: 0 })) }] : [];
}

export function parseAluraPage(html, ref) {
  const ld = ldCourse(html);
  const h1 = oneLine(textOfHtml(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]), 160);
  const ogTitle = metaContent(html, 'og:title').replace(/\s*\|\s*Alura\s*$/i, '');
  const title = h1 || oneLine(ld?.name, 160).replace(/^Curso\s+/i, '') || ogTitle;
  if (!ld && !h1) throw err(422, 'COURSE_NOT_FOUND', MESSAGES.notCourse);
  if (!title) throw err(422, 'COURSE_NOT_FOUND', MESSAGES.notCourse);
  const instance = Array.isArray(ld?.hasCourseInstance) ? ld.hasCourseInstance[0] : ld?.hasCourseInstance;
  const workloadMin = workloadMinutes(instance?.courseWorkload);
  const stats = /(\d{1,3})\s*h\s*Carga hor[aá]ria/i.exec(textOfHtml(html).replace(/\n/g, ' '));
  const workload = workloadMin || (stats ? Number(stats[1]) * 60 : 0);
  return {
    platform: 'alura',
    key: ref.key,
    url: ref.url,
    title,
    description: oneLine(ld?.description || metaContent(html, 'og:description') || metaContent(html, 'description'), 1500),
    instructor: oneLine(ld?.creator?.name, 120),
    workloadMin: workload,
    imageUrl: platformImage(ld?.image || metaContent(html, 'og:image'), 'alura') ?? platformImage(ld?.thumbnailUrl, 'alura'),
    modules: aluraModules(html),
  };
}

/* ---------- Fundação Bradesco (Escola Virtual) ---------- */

export function parseBradescoPage(html, ref) {
  const h1 = oneLine(textOfHtml(/<h1[^>]*class=["'][^"']*o-internal-desc_title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]), 160);
  if (!h1) throw err(422, 'COURSE_NOT_FOUND', MESSAGES.notCourse);
  const area = oneLine(textOfHtml(/<p[^>]*class=["'][^"']*m-head-title_title[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(html)?.[1]), 120);
  const duration = /Dura[cç][aã]o\s*<strong>\s*([^<]+?)\s*<\/strong>/i.exec(html)?.[1] ?? '';
  const level = oneLine(/N[ií]vel\s*<strong>\s*([^<]+?)\s*<\/strong>/i.exec(html)?.[1], 40);
  const descBlock = /<div[^>]*class=["'][^"']*o-internal-desc_txt["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i.exec(html)?.[1]
    ?? /<div[^>]*class=["'][^"']*o-internal-desc_txt["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
  const description = descBlock ? textOfHtml(descBlock).replace(/\n+/g, ' ').slice(0, 1500) : metaContent(html, 'og:description').slice(0, 1500);

  // Lista de módulos: o primeiro <ul> dentro do bloco de conteúdo (`data-course-content-ctx`).
  const ctx = html.indexOf('data-course-content-ctx');
  const ul = ctx >= 0 ? /<ul[^>]*>([\s\S]*?)<\/ul>/i.exec(html.slice(ctx))?.[1] : null;
  const items = ul ? [...ul.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => oneLine(textOfHtml(m[1]), 200)).filter(Boolean) : [];
  return {
    platform: 'bradesco',
    key: ref.key,
    url: ref.url,
    title: h1,
    description,
    instructor: 'Fundação Bradesco',
    area,
    level,
    workloadMin: workloadMinutes(duration),
    // a página usa a mesma imagem genérica em todos os cursos: não serve de capa
    imageUrl: null,
    modules: items.length ? [{ title: 'Conteúdo do curso', lessons: items.map((title) => ({ title, durationMin: 0 })) }] : [],
  };
}

/** Descrição final do curso: texto da página + carga horária, instrutor e área. */
export function describeCourse(page) {
  const facts = [];
  if (page.instructor && page.platform === 'alura') facts.push(`Instrutor(a): ${page.instructor}`);
  if (page.area) facts.push(`Área: ${page.area}`);
  if (page.level) facts.push(`Nível: ${page.level}`);
  if (page.workloadMin) facts.push(`Carga horária: ${formatWorkload(page.workloadMin)}`);
  return [page.description, facts.join(' · ')].filter(Boolean).join('\n\n').slice(0, 2000);
}

/* ---------- rede ---------- */

async function readLimited(res) {
  const declared = Number(res.headers?.get?.('content-length'));
  if (declared > MAX_BYTES) throw err(422, 'PAGE_TOO_BIG', MESSAGES.tooBig);
  if (res.body?.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        reader.cancel().catch(() => {});
        throw err(422, 'PAGE_TOO_BIG', MESSAGES.tooBig);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const text = await res.text();
  if (text.length > MAX_BYTES) throw err(422, 'PAGE_TOO_BIG', MESSAGES.tooBig);
  return text;
}

/**
 * Baixa a página pública. Só https de domínios da lista, sem IP, sem porta; os redirecionamentos
 * são seguidos um a um e cada destino é conferido de novo (nunca sai da plataforma).
 */
export async function fetchCoursePage(ref, fetchImpl = fetch) {
  const { text, finalUrl } = await fetchText(ref.url, ref.platform, fetchImpl);
  return { html: text, finalUrl };
}

/** Baixa um texto público (página ou JSON) de um endereço que a plataforma permite; mesmas regras de segurança. */
export async function fetchText(startUrl, platform, fetchImpl = fetch, { accept = 'text/html,application/xhtml+xml' } = {}) {
  let current = new URL(startUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!platformAllowsUrl(platform, current)) throw err(422, 'PAGE_ELSEWHERE', MESSAGES.elsewhere);
    let res;
    try {
      res = await fetchImpl(current.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'pt-BR,pt;q=0.9', Accept: accept },
      });
    } catch {
      throw err(502, 'PAGE_UNREACHABLE', MESSAGES.unreachable);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers?.get?.('location');
      let next;
      try {
        next = new URL(loc ?? '', current);
      } catch {
        throw err(502, 'PAGE_UNREACHABLE', MESSAGES.unreachable);
      }
      res.body?.cancel?.().catch(() => {});
      current = next;
      continue;
    }
    if (res.status === 404 || res.status === 410) throw err(404, 'PAGE_NOT_FOUND', MESSAGES.notFound);
    if (!res.ok) throw err(502, 'PAGE_UNREACHABLE', MESSAGES.unreachable);
    try {
      return { text: await readLimited(res), finalUrl: current.href };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw err(502, 'PAGE_UNREACHABLE', MESSAGES.unreachable);
    }
  }
  throw err(502, 'PAGE_UNREACHABLE', MESSAGES.unreachable);
}
