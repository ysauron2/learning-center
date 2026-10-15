/**
 * Leitura da lista "Meus cursos" da Alura e da Fundação Bradesco (Escola Virtual) e o diagnóstico dela.
 *
 * ATENÇÃO: leitura LOGADA AINDA NÃO VERIFICADA COM CONTA REAL. Os extratores foram escritos com base
 * nas páginas públicas dos sites e de forma tolerante: reconhecem os links de curso pelo padrão do
 * endereço (não por nomes de classe, que mudam) e procuram progresso e capa dentro do "cartão" do curso.
 * Se não funcionar, o botão "Copiar diagnóstico" gera um resumo SEM dados pessoais para o ajuste fino.
 *
 * Este arquivo é inserido (como texto) nos scripts da extensão e do app desktop: não importe nada aqui.
 */

const PLATFORM_SITES = {
  alura: {
    name: 'Alura',
    domains: ['alura.com.br'],
    slugOf(u) {
      const host = u.hostname.toLowerCase();
      if (host === 'cursos.alura.com.br') {
        const m = u.pathname.match(/^\/course\/([^/]+)/i);
        return m ? m[1].toLowerCase() : null;
      }
      const m = u.pathname.match(/^\/curso-online-([^/]+)/i);
      return m ? m[1].toLowerCase() : null;
    },
  },
  bradesco: {
    name: 'Fundação Bradesco',
    domains: ['ev.org.br'],
    slugOf(u) {
      const m = u.pathname.match(/^\/cursos?\/([^/]+)/i);
      if (!m) return null;
      try {
        return decodeURIComponent(m[1]).toLowerCase();
      } catch {
        return null;
      }
    },
  },
};

function pcHostOk(site, host) {
  const h = String(host || '').toLowerCase();
  return site.domains.some((d) => h === d || h.endsWith('.' + d));
}

function pcCourseSlug(site, href, base) {
  try {
    const u = new URL(href, base);
    if (u.protocol !== 'https:' || !pcHostOk(site, u.hostname)) return null;
    const slug = site.slugOf(u);
    return slug && /^[\p{L}\p{N}_-]{1,150}$/u.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

const pcClean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const PC_NOISE = /^(continuar|continue|iniciar|iniciar curso|retomar|come[cç]ar|acessar|acessar curso|ver curso|ver detalhes|saiba mais|mais|compartilhar|favoritar|certificado|baixar certificado|conclu[ií]do|em andamento|\d+\s*%.*|[\d.,]+)$/i;
const PC_SELECTOR_BASE = 'a[href]';

function pcBase(doc) {
  return doc.location ? doc.location.href : 'https://example.invalid/';
}

function pcInChrome(el) {
  return Boolean(el.closest && el.closest('nav,footer,[role="navigation"],[role="contentinfo"]'));
}

/** Lê os cursos da página aberta: [{ title, url, progress, imageUrl?, doneLessons?, totalLessons? }]. */
export function extractPlatformCourses(doc, platformId) {
  const site = PLATFORM_SITES[platformId];
  if (!site) return [];
  const base = pcBase(doc);
  const slugOfEl = (a) => pcCourseSlug(site, a.getAttribute('href'), base);
  const anchors = Array.from(doc.querySelectorAll(PC_SELECTOR_BASE)).filter((a) => slugOfEl(a) && !pcInChrome(a));
  const slugsIn = (el) => new Set(Array.from(el.querySelectorAll(PC_SELECTOR_BASE)).filter((a) => !pcInChrome(a)).map(slugOfEl).filter(Boolean));

  const bySlug = new Map();
  for (const a of anchors) {
    const slug = slugOfEl(a);
    // sobe até o maior ancestral que ainda contém só este curso: é o "cartão"
    let card = a;
    while (card.parentElement && card.parentElement !== doc.body) {
      const s = slugsIn(card.parentElement);
      if (s.size === 1 && s.has(slug)) card = card.parentElement;
      else break;
    }
    const entry = bySlug.get(slug) || { slug, url: new URL(a.getAttribute('href'), base).href, titles: [], card };
    if (card.contains(entry.card)) entry.card = card;
    for (const c of [a.getAttribute('aria-label'), a.getAttribute('title'), a.textContent]) {
      const t = pcClean(c);
      if (t && !PC_NOISE.test(t)) entry.titles.push(t);
    }
    bySlug.set(slug, entry);
  }

  const items = [];
  for (const e of bySlug.values()) {
    let title = '';
    const heading = e.card.querySelector('h1,h2,h3,h4,h5,[class*="title" i],[class*="titulo" i],[class*="nome" i]');
    if (heading && !PC_NOISE.test(pcClean(heading.textContent))) title = pcClean(heading.textContent);
    if (!title && e.titles.length) title = e.titles.sort((x, y) => y.length - x.length)[0];
    if (!title) continue;

    const text = pcClean(e.card.textContent);
    let progress = 0;
    let done;
    let total;
    const bar = e.card.querySelector('[role="progressbar"][aria-valuenow],progress[value],[aria-valuenow]');
    const fraction = text.match(/(\d{1,4})\s*(?:de|\/)\s*(\d{1,4})\s*(?:aulas?|atividades?|m[oó]dulos?|cap[ií]tulos?|se[cç][oõ]es)/i);
    if (fraction && Number(fraction[2]) > 0 && Number(fraction[1]) <= Number(fraction[2])) {
      done = Number(fraction[1]);
      total = Number(fraction[2]);
    }
    if (bar) {
      const raw = bar.getAttribute('aria-valuenow') ?? bar.getAttribute('value');
      const max = Number(bar.getAttribute('aria-valuemax') || bar.getAttribute('max') || 100);
      progress = max > 0 && max !== 100 ? (Number(raw) / max) * 100 : Number(raw);
    } else {
      const m = text.match(/(\d{1,3})\s*%/);
      if (m) progress = Number(m[1]);
      else if (total) progress = (done / total) * 100;
    }
    if (!Number.isFinite(progress)) progress = 0;
    progress = Math.max(0, Math.min(100, Math.round(progress)));

    const item = { title: title.slice(0, 160), url: e.url, progress };
    if (total) { item.doneLessons = done; item.totalLessons = total; }
    const img = e.card.querySelector('img');
    if (img) {
      const srcset = (img.getAttribute('srcset') || '').split(',')[0].trim().split(/\s+/)[0];
      const raw = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || srcset || '';
      if (/^https:\/\//i.test(raw) && raw.length <= 500) item.imageUrl = raw;
    }
    items.push(item);
  }
  return items;
}

/* ---------- diagnóstico (sem dados pessoais) ---------- */

/** Tira de um texto curto tudo o que poderia identificar a pessoa; devolve '' se não der para garantir. */
export function scrubDiagnosticText(raw, max = 40) {
  let t = pcClean(raw);
  if (!t) return '';
  if (/ol[áa],|bem[- ]vind|^oi\b|sair|logout|minha conta|meu perfil|ol[áa]\s+\S/i.test(t)) return '';
  t = t
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '')
    .replace(/[A-Za-z0-9_-]{24,}/g, '')
    .replace(/@\w+/g, '');
  t = pcClean(t);
  return t.length < 3 ? '' : t.slice(0, max);
}

/** `/course/python-flask/task/12` → `/course/*`; nunca guarda parâmetros nem pedaços que pareçam pessoais. */
export function scrubDiagnosticPath(pathname) {
  const first = String(pathname || '/').split('/').filter(Boolean)[0] || '';
  const safe = /^[a-z-]{1,24}$/i.test(first) ? first : '*';
  return first ? '/' + safe + (String(pathname).split('/').filter(Boolean).length > 1 ? '/*' : '') : '/';
}

function pcChain(start) {
  const chain = [];
  for (let el = start, i = 0; el && el.tagName && el.tagName !== 'BODY' && i < 6; el = el.parentElement, i++) {
    const cls = typeof el.className === 'string'
      ? el.className.split(/\s+/).filter((c) => /^[a-z][a-z0-9_-]{1,24}$/i.test(c) && !/\d{4,}/.test(c)).slice(0, 2).join('.')
      : '';
    chain.push(el.tagName.toLowerCase() + (cls ? '.' + cls : ''));
  }
  return chain;
}

/**
 * Resumo da página para ajuste fino: URL (só host e caminho resumido), contagem de elementos candidatos,
 * quais seletores funcionaram e trechos curtos de títulos de curso. NÃO inclui cookies, tokens, e-mails,
 * nomes de usuário, parâmetros de endereço nem textos de menus/cabeçalhos.
 */
export function diagnosePlatformCourses(doc, platformId) {
  const site = PLATFORM_SITES[platformId];
  const base = pcBase(doc);
  let host = '';
  let path = '/';
  try {
    const u = new URL(base);
    host = u.hostname;
    path = u.pathname;
  } catch { /* sem endereço */ }
  const anchors = Array.from(doc.querySelectorAll('a[href]'));
  const patterns = {};
  const courseAnchors = [];
  for (const a of anchors) {
    let u;
    try { u = new URL(a.getAttribute('href'), base); } catch { continue; }
    const mine = site && pcHostOk(site, u.hostname);
    const key = (mine ? '' : '(fora) ') + scrubDiagnosticPath(u.pathname);
    patterns[key] = (patterns[key] || 0) + 1;
    if (site && pcCourseSlug(site, a.getAttribute('href'), base) && !pcInChrome(a)) courseAnchors.push(a);
  }
  const tries = {
    'a[href] que casam com o padrão de curso': courseAnchors.length,
    '[role=progressbar]': doc.querySelectorAll('[role="progressbar"]').length,
    'progress': doc.querySelectorAll('progress').length,
    '[aria-valuenow]': doc.querySelectorAll('[aria-valuenow]').length,
    'img': doc.querySelectorAll('img').length,
    'h1-h5': doc.querySelectorAll('h1,h2,h3,h4,h5').length,
    'texto "NN%"': Array.from(doc.querySelectorAll('*')).filter((el) => el.children.length === 0 && /\b\d{1,3}\s*%/.test(el.textContent || '')).length,
  };
  const items = site ? extractPlatformCourses(doc, platformId) : [];
  const sample = [];
  for (const a of courseAnchors) {
    if (sample.length >= 3) break;
    const text = scrubDiagnosticText(a.textContent || a.getAttribute('aria-label') || '');
    if (text) sample.push({ texto: text, cadeia: pcChain(a) });
  }
  return JSON.stringify({
    modo: 'meus-cursos',
    plataforma: platformId,
    host,
    caminho: scrubDiagnosticPath(path),
    linksTotal: anchors.length,
    padroesDeLink: Object.entries(patterns).sort((x, y) => y[1] - x[1]).slice(0, 12),
    candidatos: tries,
    seletores: {
      funcionaram: Object.keys(tries).filter((k) => tries[k] > 0),
      falharam: Object.keys(tries).filter((k) => tries[k] === 0),
    },
    cursosLidos: items.length,
    comProgresso: items.filter((i) => i.progress > 0).length,
    comCapa: items.filter((i) => i.imageUrl).length,
    amostra: sample,
  }, null, 1);
}
