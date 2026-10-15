import { fold } from './text.js';

/** Tipos de opção. `key` é o que aparece na URL; `column` é a coluna em lc_courses. */
export const KINDS = {
  categories: { kind: 'category', column: 'category', fallback: 'Geral', label: 'categoria' },
  platforms: { kind: 'platform', column: 'platform', fallback: 'Outro', label: 'plataforma' },
};

export const DEFAULT_OPTIONS = {
  category: ['Cibersegurança', 'Redes', 'Linux', 'Desenvolvimento', 'Certificação', 'Geral'],
  platform: ['Udemy', 'Alura', 'Coursera', 'YouTube', 'Faculdade', 'NetAcad', 'Livro', 'Outro'],
};

export const isProtected = (kindDef, name) => fold(name) === fold(kindDef.fallback);

/** Garante as opções "padrão" que não podem faltar e tudo o que os cursos já usam. */
export function syncOptions(db) {
  for (const def of Object.values(KINDS)) {
    db.prepare('INSERT OR IGNORE INTO lc_options (kind, name) VALUES (?, ?)').run(def.kind, def.fallback);
    db.exec(`INSERT OR IGNORE INTO lc_options (kind, name) SELECT '${def.kind}', TRIM(${def.column}) FROM lc_courses WHERE TRIM(${def.column}) <> ''`);
  }
}

/** Devolve as sugestões padrão à lista (usado ao restaurar backup antigo, que não tinha a lista). */
export function seedDefaultOptions(db) {
  const insert = db.prepare('INSERT OR IGNORE INTO lc_options (kind, name) VALUES (?, ?)');
  for (const [kind, names] of Object.entries(DEFAULT_OPTIONS)) for (const n of names) insert.run(kind, n);
}

export const optionNames = (db, kind) => db.prepare('SELECT name FROM lc_options WHERE kind = ?').all(kind).map((r) => r.name);

/**
 * Nome "oficial" da opção: se já existe uma igual (ignora maiúsculas e acentos), usa a grafia guardada;
 * senão cria. Assim "redes" e "Redes" nunca viram duas categorias.
 */
export function canonicalOption(db, kind, raw) {
  const name = String(raw ?? '').trim();
  if (!name) return null;
  const found = optionNames(db, kind).find((n) => fold(n) === fold(name));
  if (found) return found;
  db.prepare('INSERT INTO lc_options (kind, name) VALUES (?, ?)').run(kind, name);
  return name;
}
