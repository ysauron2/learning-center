/**
 * Lê a barra lateral de conteúdo do player de um curso da Udemy e devolve
 * { title, url, modules: [{ title, lessons: [{ title, durationMin, completed }] }] }.
 *
 * ATENÇÃO: roda dentro da extensão via `fn.toString()`: precisa ser autocontida.
 * Não depende de nomes de classe (mudam sempre). Usa, em camadas: `data-purpose`, caixas de
 * seleção de "aula vista" e a ordem dos elementos no documento (cabeçalho de seção → aulas).
 */
export function extractUdemyCurriculum(doc) {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const SECTION_WORD = /^(se[cç][aã]o|section|m[oó]dulo|module|parte|part)\b/i;
  const DURATION = /(?:(\d+)\s*h\s*)?(\d+)\s*(?:min|m)\b|\b(\d{1,2}):(\d{2})\b|^(\d+)\s*h\b/i;
  const NOISE = /^(recursos?|resources?|come[cç]ar|iniciar|start|\d+\s*\/\s*\d+|\d+|[\d:.,\s]+)$/i;

  const durationOf = (text) => {
    const m = clean(text).match(DURATION);
    if (!m) return null;
    if (m[3] !== undefined) return Math.round(Number(m[3]) + Number(m[4]) / 60);
    if (m[5] !== undefined) return Number(m[5]) * 60;
    return Number(m[1] || 0) * 60 + Number(m[2]);
  };

  // 1) Linhas de aula
  let rows = Array.from(doc.querySelectorAll('[data-purpose^="curriculum-item"]'));
  if (!rows.length) {
    const boxes = Array.from(doc.querySelectorAll('input[type="checkbox"]'));
    const boxCount = (el) => el.querySelectorAll('input[type="checkbox"],[role="checkbox"]').length;
    rows = Array.from(new Set(boxes.map((b) => b.closest('li,[role="listitem"]') || (b.parentElement && b.parentElement.parentElement)).filter(Boolean)))
      // uma linha de aula tem exatamente uma caixa e não é a página inteira (evita banners e filtros)
      .filter((r) => r !== doc.body && r !== doc.documentElement && boxCount(r) === 1);
    // aulas aparecem em grupo: uma caixa isolada (banner, filtro) não é conteúdo de curso
    if (rows.length < 2) rows = [];
  }
  // se uma linha contém outra (marcação aninhada), fica só a mais interna
  rows = rows.filter((r) => !rows.some((o) => o !== r && r.contains(o)));

  const lessonOf = (row) => {
    const pieces = [];
    const walker = doc.createTreeWalker(row, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = clean(n.nodeValue);
      if (t) pieces.push(t);
    }
    const explicit = row.querySelector('[data-purpose="item-title"]');
    const titlePiece = explicit ? clean(explicit.textContent) : pieces.find((p) => !NOISE.test(p) && durationOf(p) === null);
    if (!titlePiece) return null;
    const durPiece = pieces.find((p) => p !== titlePiece && durationOf(p) !== null && p.length <= 14);
    const box = row.querySelector('input[type="checkbox"]');
    const flagged = row.querySelector('[aria-checked="true"]');
    return {
      title: titlePiece.replace(/^\d+\.\s*/, '').slice(0, 200),
      durationMin: durPiece ? durationOf(durPiece) : 0,
      completed: Boolean((box && box.checked) || flagged || (box && box.getAttribute('aria-checked') === 'true')),
    };
  };

  // 2) Cabeçalhos de seção
  const headerCandidates = Array.from(
    doc.querySelectorAll('[data-purpose*="section-heading"],[data-purpose*="section-title"],h2,h3,button[aria-expanded],[role="heading"]'),
  ).filter((h) => !rows.some((r) => r.contains(h)) && (SECTION_WORD.test(clean(h.textContent)) || /section-(heading|title)/.test(h.getAttribute('data-purpose') || '')));
  const headers = headerCandidates.filter((h) => !headerCandidates.some((o) => o !== h && o.contains(h)));
  const headerTitle = (h) => {
    const named = h.matches('[data-purpose*="section"]') ? h : h.querySelector('[data-purpose*="section-title"],[data-purpose*="section-heading"]');
    return clean((named || h).textContent).replace(/\s*\d+\s*\/\s*\d+.*$/, '').replace(/\s*\|.*$/, '').slice(0, 160);
  };

  // 3) Percorre em ordem de documento: cabeçalho abre módulo, aula entra no módulo aberto
  const nodes = [...headers.map((el) => ({ el, header: true })), ...rows.map((el) => ({ el, header: false }))].sort((a, b) =>
    a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1,
  );
  const modules = [];
  let current = null;
  for (const n of nodes) {
    if (n.header) {
      const title = headerTitle(n.el);
      if (!title) continue;
      current = { title, lessons: [] };
      modules.push(current);
    } else {
      const lesson = lessonOf(n.el);
      if (!lesson) continue;
      if (!current) {
        current = { title: 'Conteúdo', lessons: [] };
        modules.push(current);
      }
      current.lessons.push(lesson);
    }
  }

  const heading = doc.querySelector('[data-purpose="course-header-title"],h1');
  const title = clean((heading && heading.textContent) || doc.title.replace(/\s*[|\-–]\s*Udemy.*$/i, '')).slice(0, 160);
  let url = '';
  try {
    const u = new URL(doc.location ? doc.location.href : 'https://www.udemy.com/');
    url = u.origin + u.pathname.replace(/\/learn\/.*$/, '/');
  } catch { /* ignore */ }
  return { title, url, modules: modules.filter((m) => m.lessons.length > 0) };
}
