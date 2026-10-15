import { z } from 'zod';
import { HttpError, notFound } from '../../core/errors.js';
import { transaction } from '../../core/db.js';
import { fold } from '../../core/text.js';
import { KINDS, isProtected, syncOptions } from '../../core/options.js';

export const optionName = z.string().trim().min(1, 'Informe um nome.').max(60, 'Use até 60 letras.');

export function createOptionsService(db) {
  const rows = (def) => db.prepare('SELECT name FROM lc_options WHERE kind = ?').all(def.kind).map((r) => r.name);
  const countOf = (def, name) =>
    db.prepare(`SELECT COUNT(*) AS n FROM lc_courses WHERE ${def.column} = ? COLLATE NOCASE`).get(name).n;
  const find = (def, name) => rows(def).find((n) => fold(n) === fold(name));
  const moveCourses = (def, from, to) =>
    Number(db.prepare(`UPDATE lc_courses SET ${def.column} = ? WHERE ${def.column} = ? COLLATE NOCASE`).run(to, from).changes);
  const noChange = (def, name) =>
    new HttpError(400, 'PROTECTED_OPTION', `A ${def.label} "${name}" é a padrão e não pode ser alterada nem apagada.`);

  function list() {
    syncOptions(db);
    const out = {};
    for (const [key, def] of Object.entries(KINDS)) {
      out[key] = rows(def)
        .map((name) => ({ name, count: Number(countOf(def, name)), protected: isProtected(def, name) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }
    return out;
  }

  function create(def, raw) {
    const name = optionName.parse(raw);
    const existing = find(def, name);
    if (existing) return { name: existing, created: false };
    db.prepare('INSERT INTO lc_options (kind, name) VALUES (?, ?)').run(def.kind, name);
    return { name, created: true };
  }

  function rename(def, rawName, rawNew) {
    syncOptions(db);
    const name = find(def, rawName);
    if (!name) throw notFound(def.label === 'categoria' ? 'Categoria' : 'Plataforma');
    if (isProtected(def, name)) throw noChange(def, name);
    const target = optionName.parse(rawNew);
    return transaction(db, () => {
      const other = rows(def).find((n) => fold(n) === fold(target) && n.toLowerCase() !== name.toLowerCase());
      if (other) {
        // já existe uma igual: junta as duas (os cursos vão para a que já existia)
        const moved = moveCourses(def, name, other);
        db.prepare('DELETE FROM lc_options WHERE kind = ? AND name = ?').run(def.kind, name);
        return { name: other, moved, merged: true };
      }
      db.prepare('UPDATE lc_options SET name = ? WHERE kind = ? AND name = ?').run(target, def.kind, name);
      return { name: target, moved: moveCourses(def, name, target), merged: false };
    });
  }

  function remove(def, rawName) {
    syncOptions(db);
    if (!rawName || !String(rawName).trim()) throw new HttpError(400, 'VALIDATION_ERROR', 'Informe o nome.');
    const name = find(def, rawName);
    if (!name) throw notFound(def.label === 'categoria' ? 'Categoria' : 'Plataforma');
    if (isProtected(def, name)) throw noChange(def, name);
    return transaction(db, () => {
      const fallback = find(def, def.fallback) ?? def.fallback;
      const moved = moveCourses(def, name, fallback);
      db.prepare('DELETE FROM lc_options WHERE kind = ? AND name = ?').run(def.kind, name);
      return { moved, movedTo: fallback };
    });
  }

  return { list, create, rename, remove };
}
