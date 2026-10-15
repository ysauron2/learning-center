const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const STATUS_ORDER = { completed: 0, active: 1, paused: 2, planned: 3 };
const GENERIC = new Set(['geral', 'outro', 'outros', '']);

/**
 * Ordem sugerida para uma trilha: o que já foi concluído primeiro, depois o que está em andamento
 * (o mais avançado antes), depois pausados e planejados, em ordem alfabética.
 */
export function orderCourses(courses) {
  return [...courses].sort((a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (s !== 0) return s;
    if (a.status === 'active' && b.status === 'active' && a.progress !== b.progress) return b.progress - a.progress;
    return a.title.localeCompare(b.title, 'pt-BR');
  });
}

/**
 * Sugestões de trilha a partir dos cursos: uma por categoria que tenha 2 ou mais cursos
 * (ignora categorias genéricas e as que já viraram trilha).
 */
export function suggestTracks(courses, existingTracks = []) {
  const taken = new Set((existingTracks ?? []).map((t) => fold(t.title)));
  const byCategory = new Map();
  for (const course of courses ?? []) {
    const key = fold(course.category);
    if (GENERIC.has(key)) continue;
    if (!byCategory.has(key)) byCategory.set(key, { category: String(course.category).trim(), items: [] });
    byCategory.get(key).items.push(course);
  }
  return [...byCategory.values()]
    .filter((g) => g.items.length >= 2)
    .map((g) => ({
      category: g.category,
      title: `Trilha de ${g.category}`,
      courseIds: orderCourses(g.items).map((c) => c.id),
    }))
    .filter((s) => !taken.has(fold(s.title)))
    .sort((a, b) => b.courseIds.length - a.courseIds.length || a.category.localeCompare(b.category, 'pt-BR'));
}

/** Marca (no fim da lista) ou desmarca um curso, mantendo a ordem dos cliques. */
export const toggleSelection = (ids, id) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

/** id -> posição (1, 2, 3…) na seleção. */
export const selectionNumbers = (ids) => new Map(ids.map((id, i) => [id, i + 1]));
