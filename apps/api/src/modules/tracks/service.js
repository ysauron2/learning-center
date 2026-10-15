import { HttpError, notFound } from '../../core/errors.js';
import { transaction } from '../../core/db.js';
import { trackCreate, trackUpdate, itemCreate, itemUpdate, MAX_ITEMS } from './schemas.js';

export function createTracksService(db, clock, courses) {
  const iso = () => clock.now().toISOString();

  function getRow(id) {
    const r = db.prepare('SELECT * FROM lc_tracks WHERE id = ?').get(id);
    if (!r) throw notFound('Trilha');
    return r;
  }

  const touch = (id) => db.prepare('UPDATE lc_tracks SET updated_at = ? WHERE id = ?').run(iso(), id);

  /** Etapas com os dados atuais do curso (título, progresso, status). */
  function itemsOf(trackId, courseMap) {
    const rows = db.prepare('SELECT * FROM lc_track_items WHERE track_id = ? ORDER BY position, id').all(trackId);
    const items = rows.map((r) => {
      if (r.course_id !== null) {
        const c = courseMap.get(r.course_id);
        const progress = c ? c.progress : 0;
        const done = Boolean(c) && (c.status === 'completed' || progress >= 100);
        return {
          id: r.id,
          position: r.position,
          kind: 'course',
          title: c ? c.title : r.title,
          courseId: r.course_id,
          course: c
            ? { id: c.id, title: c.title, platform: c.platform, category: c.category, status: c.status, progress: c.progress, imageUrl: c.imageUrl }
            : null,
          progress: done ? 100 : progress,
          status: done ? 'done' : progress > 0 ? 'active' : 'todo',
          doneAt: null,
        };
      }
      const done = r.done_at !== null;
      return {
        id: r.id, position: r.position, kind: 'step', title: r.title, courseId: null, course: null,
        progress: done ? 100 : 0, status: done ? 'done' : 'todo', doneAt: r.done_at,
      };
    });
    const nextIdx = items.findIndex((i) => i.status !== 'done');
    items.forEach((i, idx) => { i.isNext = idx === nextIdx; });
    return items;
  }

  function summaryOf(row, items) {
    const next = items.find((i) => i.isNext);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      totalItems: items.length,
      doneItems: items.filter((i) => i.status === 'done').length,
      progress: items.length ? Math.round(items.reduce((s, i) => s + i.progress, 0) / items.length) : 0,
      next: next ? { itemId: next.id, title: next.title, courseId: next.courseId } : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  const courseMap = () => new Map(courses.list().map((c) => [c.id, c]));

  function get(id) {
    const row = getRow(id);
    const items = itemsOf(id, courseMap());
    return { ...summaryOf(row, items), items };
  }

  function list() {
    const map = courseMap();
    return db
      .prepare('SELECT * FROM lc_tracks ORDER BY updated_at DESC, id DESC')
      .all()
      .map((row) => summaryOf(row, itemsOf(row.id, map)));
  }

  function create(raw) {
    const input = trackCreate.parse(raw);
    const now = iso();
    // trilha e etapas juntas: se algum curso não existir, nada é criado
    const id = transaction(db, () => {
      const res = db.prepare('INSERT INTO lc_tracks (title, description, created_at, updated_at) VALUES (?, ?, ?, ?)').run(input.title, input.description, now, now);
      const trackId = Number(res.lastInsertRowid);
      const insert = db.prepare('INSERT INTO lc_track_items (track_id, position, course_id, title) VALUES (?, ?, ?, ?)');
      input.courseIds.forEach((courseId, i) => {
        if (!db.prepare('SELECT 1 FROM lc_courses WHERE id = ?').get(courseId)) {
          throw new HttpError(400, 'INVALID_COURSE', 'Curso inexistente.');
        }
        insert.run(trackId, i + 1, courseId, '');
      });
      return trackId;
    });
    return get(id);
  }

  function update(id, raw) {
    const input = trackUpdate.parse(raw);
    const row = getRow(id);
    db.prepare('UPDATE lc_tracks SET title = ?, description = ?, updated_at = ? WHERE id = ?')
      .run(input.title ?? row.title, input.description ?? row.description, iso(), id);
    return get(id);
  }

  function remove(id) {
    getRow(id);
    db.prepare('DELETE FROM lc_tracks WHERE id = ?').run(id);
  }

  function addItem(trackId, raw) {
    const input = itemCreate.parse(raw);
    getRow(trackId);
    const count = db.prepare('SELECT COUNT(*) AS n FROM lc_track_items WHERE track_id = ?').get(trackId).n;
    if (count >= MAX_ITEMS) throw new HttpError(400, 'TRACK_FULL', `Uma trilha comporta até ${MAX_ITEMS} etapas.`);
    const position = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM lc_track_items WHERE track_id = ?').get(trackId).p;
    return transaction(db, () => {
      if (input.courseId) {
        if (!db.prepare('SELECT 1 FROM lc_courses WHERE id = ?').get(input.courseId)) {
          throw new HttpError(400, 'INVALID_COURSE', 'Curso inexistente.');
        }
        if (db.prepare('SELECT 1 FROM lc_track_items WHERE track_id = ? AND course_id = ?').get(trackId, input.courseId)) {
          throw new HttpError(409, 'ALREADY_IN_TRACK', 'Esse curso já está na trilha.');
        }
        db.prepare('INSERT INTO lc_track_items (track_id, position, course_id, title) VALUES (?, ?, ?, ?)').run(trackId, position, input.courseId, '');
      } else {
        db.prepare('INSERT INTO lc_track_items (track_id, position, course_id, title) VALUES (?, ?, NULL, ?)').run(trackId, position, input.title);
      }
      touch(trackId);
      return get(trackId);
    });
  }

  function itemRow(trackId, itemId) {
    getRow(trackId);
    const r = db.prepare('SELECT * FROM lc_track_items WHERE id = ? AND track_id = ?').get(itemId, trackId);
    if (!r) throw notFound('Etapa');
    return r;
  }

  function updateItem(trackId, itemId, raw) {
    const input = itemUpdate.parse(raw);
    const r = itemRow(trackId, itemId);
    if (r.course_id !== null) {
      throw new HttpError(400, 'COURSE_ITEM', 'O progresso de um curso vem do próprio curso; não dá para marcar à mão.');
    }
    if (input.title !== undefined) db.prepare('UPDATE lc_track_items SET title = ? WHERE id = ?').run(input.title, itemId);
    if (input.done !== undefined) db.prepare('UPDATE lc_track_items SET done_at = ? WHERE id = ?').run(input.done ? (r.done_at ?? iso()) : null, itemId);
    touch(trackId);
    return get(trackId);
  }

  function renumber(trackId) {
    const ids = db.prepare('SELECT id FROM lc_track_items WHERE track_id = ? ORDER BY position, id').all(trackId).map((r) => r.id);
    const stmt = db.prepare('UPDATE lc_track_items SET position = ? WHERE id = ?');
    ids.forEach((id, i) => stmt.run(i + 1, id));
  }

  function removeItem(trackId, itemId) {
    itemRow(trackId, itemId);
    transaction(db, () => {
      db.prepare('DELETE FROM lc_track_items WHERE id = ?').run(itemId);
      renumber(trackId);
      touch(trackId);
    });
  }

  function reorder(trackId, itemIds) {
    getRow(trackId);
    const current = db.prepare('SELECT id FROM lc_track_items WHERE track_id = ?').all(trackId).map((r) => r.id).sort((a, b) => a - b);
    const wanted = [...itemIds].sort((a, b) => a - b);
    if (current.length !== wanted.length || current.some((id, i) => id !== wanted[i])) {
      throw new HttpError(400, 'INVALID_ORDER', 'A nova ordem precisa conter exatamente as etapas da trilha, sem repetir nenhuma.');
    }
    transaction(db, () => {
      const stmt = db.prepare('UPDATE lc_track_items SET position = ? WHERE id = ?');
      itemIds.forEach((id, i) => stmt.run(i + 1, id));
      touch(trackId);
    });
    return get(trackId);
  }

  return { list, get, create, update, remove, addItem, updateItem, removeItem, reorder };
}
