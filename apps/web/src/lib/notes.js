/** "Redes, TCP ,redes" -> ['redes', 'tcp'] (mesmas regras da API: até 10 tags de até 30 letras). */
export function parseTags(text) {
  const out = [];
  for (const raw of String(text ?? '').split(',')) {
    const t = raw.trim().toLowerCase();
    if (t && t.length <= 30 && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 10);
}

export const formatTags = (tags) => (tags ?? []).join(', ');

/** Nome mostrado na lista: título, ou o começo do texto, ou "Sem título". */
export function noteLabel(note) {
  return (note.title ?? '').trim() || (note.excerpt ?? '').trim() || 'Sem título';
}

const STATUS = {
  saved: 'Salvo',
  saving: 'Salvando…',
  dirty: 'Alterações ainda não salvas',
  error: 'Não foi possível salvar',
  new: 'Anotação nova (ainda não salva)',
};
export const saveStatusText = (status) => STATUS[status] ?? '';

/** Aulas de um curso (com o módulo ao lado) para escolher a que a anotação pertence. */
export function lessonOptions(course) {
  const out = [];
  for (const m of course?.modules ?? []) {
    for (const l of m.lessons ?? []) out.push({ id: l.id, label: `${m.title} · ${l.title}` });
  }
  return out;
}
