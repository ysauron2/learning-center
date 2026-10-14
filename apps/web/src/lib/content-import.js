const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Valida a mensagem do conteúdo do curso (vem da própria página, entregue pela extensão). */
export function parseContentMessage(event, selfOrigin, selfWindow) {
  if (event.source !== selfWindow || event.origin !== selfOrigin) return null;
  const d = event.data;
  if (!d || d.type !== 'lc-content-ext' || !d.content || !Array.isArray(d.content.modules)) return null;
  let budget = 3000;
  const modules = d.content.modules
    .slice(0, 200)
    .map((m) => {
      if (!m || typeof m.title !== 'string' || !Array.isArray(m.lessons)) return null;
      const lessons = m.lessons
        .filter((l) => l && typeof l.title === 'string' && l.title.trim())
        .slice(0, Math.min(500, Math.max(0, budget)))
        .map((l) => ({
          title: str(l.title, 200),
          durationMin: Number.isFinite(l.durationMin) ? Math.max(0, Math.round(l.durationMin)) : 0,
          completed: l.completed === true,
        }));
      budget -= lessons.length;
      return { title: str(m.title, 160), lessons };
    })
    .filter((m) => m && m.title && m.lessons.length > 0);
  if (!modules.length) return null;
  return { title: str(d.content.title, 160), url: str(d.content.url, 500), modules };
}

const fold = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const slugOf = (url) => {
  const m = (url || '').match(/\/course\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : null;
};

/** Sugere para qual curso cadastrado o conteúdo vai: endereço, título igual, título contido (se único). */
export function matchCourse(courses, content) {
  const slug = slugOf(content.url);
  if (slug) {
    const bySlug = courses.find((c) => slugOf(c.url) === slug);
    if (bySlug) return bySlug.id;
  }
  const title = fold(content.title);
  if (!title) return null;
  const exact = courses.filter((c) => fold(c.title) === title);
  if (exact.length === 1) return exact[0].id;
  const partial = courses.filter((c) => title.length >= 8 && (fold(c.title).includes(title) || title.includes(fold(c.title))) && fold(c.title).length >= 8);
  return partial.length === 1 ? partial[0].id : null;
}

export const countLessons = (modules) => modules.reduce((n, m) => n + m.lessons.length, 0);
