import { transaction } from '../../core/db.js';
import { notFound } from '../../core/errors.js';
import { canonicalOption } from '../../core/options.js';
import { courseCreate, courseUpdate } from './schemas.js';

const COURSE_SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM lc_lessons l WHERE l.course_id = c.id) AS total_lessons,
    (SELECT COUNT(*) FROM lc_lessons l WHERE l.course_id = c.id AND l.completed_at IS NOT NULL) AS done_lessons,
    (SELECT COALESCE(SUM(s.duration_sec), 0) FROM lc_study_sessions s
       WHERE s.course_id = c.id AND s.ended_at IS NOT NULL) AS studied_sec,
    (SELECT MAX(s.started_at) FROM lc_study_sessions s WHERE s.course_id = c.id) AS last_studied_at
  FROM lc_courses c`;

export function createCoursesService(db, clock) {
  const iso = () => clock.now().toISOString();

  function tagsFor(ids) {
    if (ids.length === 0) return new Map();
    const marks = ids.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT course_id, tag FROM lc_course_tags WHERE course_id IN (${marks}) ORDER BY tag`)
      .all(...ids);
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.course_id)) map.set(r.course_id, []);
      map.get(r.course_id).push(r.tag);
    }
    return map;
  }

  function toCourse(row, tags) {
    const progress =
      row.total_lessons > 0
        ? Math.round((row.done_lessons / row.total_lessons) * 100)
        : row.manual_progress;
    return {
      id: row.id,
      title: row.title,
      platform: row.platform,
      category: row.category,
      description: row.description,
      url: row.url,
      imageUrl: row.image_url ?? null,
      status: row.status,
      progress,
      manualProgress: row.manual_progress,
      totalLessons: row.total_lessons,
      doneLessons: row.done_lessons,
      studiedMinutes: Math.round(row.studied_sec / 60),
      lastStudiedAt: row.last_studied_at,
      lastVisitedAt: row.last_visited_at ?? null,
      tags: tags ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function setTags(courseId, tags) {
    db.prepare('DELETE FROM lc_course_tags WHERE course_id = ?').run(courseId);
    const insert = db.prepare('INSERT INTO lc_course_tags (course_id, tag) VALUES (?, ?)');
    for (const tag of tags) insert.run(courseId, tag);
  }

  function getRow(id) {
    const row = db.prepare(`${COURSE_SELECT} WHERE c.id = ?`).get(id);
    if (!row) throw notFound('Curso');
    return row;
  }

  function list(filters = {}) {
    const where = [];
    const params = [];
    if (filters.status) {
      where.push('c.status = ?');
      params.push(filters.status);
    }
    if (filters.platform) {
      where.push('c.platform = ?');
      params.push(filters.platform);
    }
    if (filters.category) {
      where.push('c.category = ?');
      params.push(filters.category);
    }
    if (filters.q) {
      where.push(
        `(c.title LIKE ? ESCAPE '\\' OR c.platform LIKE ? ESCAPE '\\' OR EXISTS (
           SELECT 1 FROM lc_course_tags t WHERE t.course_id = c.id AND t.tag LIKE ? ESCAPE '\\'))`,
      );
      const like = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
      params.push(like, like, like);
    }
    const sql = `${COURSE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END,
                          COALESCE(last_studied_at, c.updated_at) DESC`;
    const rows = db.prepare(sql).all(...params);
    const tags = tagsFor(rows.map((r) => r.id));
    return rows.map((r) => toCourse(r, tags.get(r.id)));
  }

  function summary() {
    const counts = Object.fromEntries(
      db.prepare('SELECT status, COUNT(*) AS n FROM lc_courses GROUP BY status').all().map((r) => [r.status, r.n]),
    );
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const platforms = db.prepare('SELECT DISTINCT platform FROM lc_courses ORDER BY platform').all().map((r) => r.platform);
    const categories = db.prepare('SELECT DISTINCT category FROM lc_courses ORDER BY category').all().map((r) => r.category);
    return {
      total,
      planned: counts.planned ?? 0,
      active: counts.active ?? 0,
      paused: counts.paused ?? 0,
      completed: counts.completed ?? 0,
      platforms,
      categories,
    };
  }

  function get(id) {
    const row = getRow(id);
    const course = toCourse(row, tagsFor([id]).get(id));
    const modules = db.prepare('SELECT id, title, position FROM lc_modules WHERE course_id = ? ORDER BY position, id').all(id);
    const lessons = db
      .prepare(
        `SELECT id, module_id, title, duration_min, position, completed_at, last_position_sec
         FROM lc_lessons WHERE course_id = ? ORDER BY position, id`,
      )
      .all(id);
    return {
      ...course,
      modules: modules.map((m) => ({
        id: m.id,
        title: m.title,
        position: m.position,
        lessons: lessons
          .filter((l) => l.module_id === m.id)
          .map((l) => ({
            id: l.id,
            title: l.title,
            durationMin: l.duration_min,
            position: l.position,
            completed: l.completed_at !== null,
            completedAt: l.completed_at,
            lastPositionSec: l.last_position_sec,
          })),
      })),
    };
  }

  function create(raw) {
    // Revalida aqui (idempotente) para que chamadas diretas ao serviço, como o
    // seed ou o Meu Hub, também recebam os valores padrão.
    const input = courseCreate.parse(raw);
    const now = iso();
    return transaction(db, () => {
      // usa o nome "oficial" da plataforma/categoria (e cadastra na lista se for nova)
      const platform = canonicalOption(db, 'platform', input.platform) ?? 'Outro';
      const category = canonicalOption(db, 'category', input.category) ?? 'Geral';
      const res = db
        .prepare(
          `INSERT INTO lc_courses (title, platform, category, description, url, image_url, status, manual_progress, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.title,
          platform,
          category,
          input.description,
          input.url ?? null,
          input.imageUrl ?? null,
          input.status,
          input.status === 'completed' ? 100 : input.manualProgress,
          now,
          now,
        );
      const id = Number(res.lastInsertRowid);
      setTags(id, input.tags);
      return get(id);
    });
  }

  function update(id, raw) {
    const input = courseUpdate.parse(raw);
    getRow(id);
    const map = {
      title: 'title',
      platform: 'platform',
      category: 'category',
      description: 'description',
      url: 'url',
      imageUrl: 'image_url',
      status: 'status',
      manualProgress: 'manual_progress',
    };
    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(map)) {
      if (input[key] !== undefined) {
        sets.push(`${column} = ?`);
        params.push(key === 'url' || key === 'imageUrl' ? (input[key] ?? null) : input[key]);
      }
    }
    return transaction(db, () => {
      if (sets.length || input.tags) {
        // plataforma/categoria alteradas passam pelo nome oficial da lista
        for (const [field, kind] of [['platform', 'platform'], ['category', 'category']]) {
          if (input[field] !== undefined) {
            const i = sets.indexOf(`${field} = ?`);
            params[i] = canonicalOption(db, kind, input[field]) ?? params[i];
          }
        }
        sets.push('updated_at = ?');
        params.push(iso(), id);
        db.prepare(`UPDATE lc_courses SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      }
      if (input.tags) setTags(id, input.tags);
      return get(id);
    });
  }

  function setStatus(id, status) {
    getRow(id);
    const progress = status === 'completed' ? ', manual_progress = 100' : '';
    db.prepare(`UPDATE lc_courses SET status = ?, updated_at = ?${progress} WHERE id = ?`).run(status, iso(), id);
    return get(id);
  }

  function remove(id) {
    getRow(id);
    db.prepare('DELETE FROM lc_courses WHERE id = ?').run(id);
  }

  function addModule(courseId, { title }) {
    getRow(courseId);
    const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM lc_modules WHERE course_id = ?').get(courseId).p;
    const res = db.prepare('INSERT INTO lc_modules (course_id, title, position) VALUES (?, ?, ?)').run(courseId, title, pos);
    db.prepare('UPDATE lc_courses SET updated_at = ? WHERE id = ?').run(iso(), courseId);
    return { id: Number(res.lastInsertRowid), title, position: pos, lessons: [] };
  }

  function addLesson(moduleId, { title, durationMin }) {
    const mod = db.prepare('SELECT id, course_id FROM lc_modules WHERE id = ?').get(moduleId);
    if (!mod) throw notFound('Módulo');
    const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM lc_lessons WHERE module_id = ?').get(moduleId).p;
    const res = db
      .prepare('INSERT INTO lc_lessons (module_id, course_id, title, duration_min, position) VALUES (?, ?, ?, ?, ?)')
      .run(moduleId, mod.course_id, title, durationMin, pos);
    db.prepare('UPDATE lc_courses SET updated_at = ? WHERE id = ?').run(iso(), mod.course_id);
    return getLesson(Number(res.lastInsertRowid));
  }

  function getLesson(id) {
    const l = db.prepare('SELECT * FROM lc_lessons WHERE id = ?').get(id);
    if (!l) throw notFound('Aula');
    return {
      id: l.id,
      moduleId: l.module_id,
      courseId: l.course_id,
      title: l.title,
      durationMin: l.duration_min,
      completed: l.completed_at !== null,
      completedAt: l.completed_at,
      lastPositionSec: l.last_position_sec,
    };
  }

  function updateLesson(id, input) {
    const current = getLesson(id);
    const sets = [];
    const params = [];
    if (input.title !== undefined) { sets.push('title = ?'); params.push(input.title); }
    if (input.durationMin !== undefined) { sets.push('duration_min = ?'); params.push(input.durationMin); }
    if (input.lastPositionSec !== undefined) { sets.push('last_position_sec = ?'); params.push(input.lastPositionSec); }
    if (input.completed !== undefined) {
      sets.push('completed_at = ?');
      params.push(input.completed ? current.completedAt ?? iso() : null);
    }
    if (sets.length) {
      params.push(id);
      db.prepare(`UPDATE lc_lessons SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      db.prepare('UPDATE lc_courses SET updated_at = ? WHERE id = ?').run(iso(), current.courseId);
    }
    return getLesson(id);
  }

  function removeModule(id) {
    const info = db.prepare('DELETE FROM lc_modules WHERE id = ?').run(id);
    if (info.changes === 0) throw notFound('Módulo');
  }

  function removeLesson(id) {
    const info = db.prepare('DELETE FROM lc_lessons WHERE id = ?').run(id);
    if (info.changes === 0) throw notFound('Aula');
  }

  /** Primeira aula não concluída do curso (ordem de módulo e posição). */
  function nextLesson(courseId) {
    const l = db
      .prepare(
        `SELECT l.id, l.title, l.duration_min, l.last_position_sec, m.title AS module_title
         FROM lc_lessons l JOIN lc_modules m ON m.id = l.module_id
         WHERE l.course_id = ? AND l.completed_at IS NULL
         ORDER BY m.position, m.id, l.position, l.id LIMIT 1`,
      )
      .get(courseId);
    return l
      ? { id: l.id, title: l.title, durationMin: l.duration_min, lastPositionSec: l.last_position_sec, moduleTitle: l.module_title }
      : null;
  }

  return {
    list, summary, get, create, update, setStatus, remove,
    addModule, addLesson, getLesson, updateLesson, removeModule, removeLesson, nextLesson,
  };
}
