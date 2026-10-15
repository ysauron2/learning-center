/** Minúsculas e sem acentos, para comparar/buscar texto em português. */
export const fold = (s) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
