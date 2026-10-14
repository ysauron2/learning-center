/**
 * Lê a página "Meus cursos" da Udemy e devolve [{ title, url, progress, instructor? }].
 *
 * ATENÇÃO: roda dentro do favorito (bookmarklet), via `fn.toString()`. Por isso precisa ser
 * autocontida: não pode referenciar nada de fora dela (imports, constantes, outras funções).
 * Heurística por links de curso (`/course/<slug>` ou `?course_id=<número>`): não depende de nomes de classe do site, que mudam.
 */
export function extractUdemyCourses(doc) {
  const keyOf = (href) => {
    try {
      const u = new URL(href, doc.location ? doc.location.href : 'https://www.udemy.com/');
      const m = u.pathname.match(/^\/course\/([^/]+)/i);
      if (m) return decodeURIComponent(m[1]).toLowerCase();
      const id = u.searchParams.get('course_id');
      return id && /^\d+$/.test(id) ? 'id:' + id : null;
    } catch {
      return null;
    }
  };
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const NOISE = /^(iniciar curso|continuar|continue|start course|resume|ver curso|ver detalhes|compartilhar|share|favoritar|arquivar|mais|more|\d+\s*%.*|[\d.,]+)$/i;

  const SELECTOR = 'a[href*="/course/"],a[href*="course_id="]';
  const anchors = Array.from(doc.querySelectorAll(SELECTOR)).filter((a) => keyOf(a.getAttribute('href')));
  const slugs = (el) => new Set(Array.from(el.querySelectorAll(SELECTOR)).map((a) => keyOf(a.getAttribute('href'))).filter(Boolean));

  const bySlug = new Map();
  for (const a of anchors) {
    const slug = keyOf(a.getAttribute('href'));
    // Sobe até o maior ancestral que ainda contém só este curso: é o "cartão".
    let card = a;
    while (card.parentElement && card.parentElement !== doc.body) {
      const s = slugs(card.parentElement);
      if (s.size === 1 && s.has(slug)) card = card.parentElement;
      else break;
    }
    const entry = bySlug.get(slug) || { slug, url: new URL(a.getAttribute('href'), doc.location ? doc.location.href : 'https://www.udemy.com/').href, titles: [], card };
    if (card.contains(entry.card)) entry.card = card;
    for (const c of [a.getAttribute('aria-label'), a.getAttribute('title'), a.textContent]) {
      const t = clean(c);
      if (t && !NOISE.test(t)) entry.titles.push(t);
    }
    bySlug.set(slug, entry);
  }

  const items = [];
  for (const e of bySlug.values()) {
    let title = '';
    const heading = e.card.querySelector('h1,h2,h3,h4,[data-purpose*="title"]');
    if (heading && !NOISE.test(clean(heading.textContent))) title = clean(heading.textContent);
    if (!title && e.titles.length) title = e.titles.sort((x, y) => y.length - x.length)[0];
    if (!title) continue;

    let progress = 0;
    const bar = e.card.querySelector('[role="progressbar"][aria-valuenow],[aria-valuenow]');
    if (bar) progress = Number(bar.getAttribute('aria-valuenow'));
    else {
      const m = clean(e.card.textContent).match(/(\d{1,3})\s*%/);
      if (m) progress = Number(m[1]);
    }
    if (!Number.isFinite(progress)) progress = 0;
    progress = Math.max(0, Math.min(100, Math.round(progress)));

    const inst = e.card.querySelector('[data-purpose*="instructor"]');
    const instructor = inst ? clean(inst.textContent).slice(0, 120) : '';
    const item = { title: title.slice(0, 160), url: e.url, progress };
    if (instructor) item.instructor = instructor;
    items.push(item);
  }
  return items;
}
