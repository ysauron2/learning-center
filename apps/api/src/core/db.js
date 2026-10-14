import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Abre (e cria, se preciso) um banco SQLite.
 * Use ':memory:' nos testes.
 */
export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

const depths = new WeakMap();

/**
 * Executa `fn` dentro de uma transação; faz rollback se lançar erro.
 * Chamadas aninhadas viram SAVEPOINT, então o rollback desfaz só o trecho interno
 * (e o externo, se o erro continuar subindo).
 */
export function transaction(db, fn) {
  const depth = depths.get(db) ?? 0;
  const savepoint = `lc_sp_${depth}`;
  db.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
  depths.set(db, depth + 1);
  try {
    const result = fn();
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
    return result;
  } catch (err) {
    db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
    throw err;
  } finally {
    depths.set(db, depth);
  }
}
