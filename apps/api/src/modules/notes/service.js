import { HttpError, notFound } from '../../core/errors.js';
import { transaction } from '../../core/db.js';
import { fold } from '../../core/text.js';
import { noteCreate, noteUpdate, hasContent, EMPTY } from './schemas.js';

const SELECT = `
  SELECT n.*, c.title AS course_title, l.title AS lesson_title
  FROM lc_notes n
  LEFT JOIN lc_courses c ON c.id = n.course_id
  LEFT JOIN lc_lessons l ON l.id = n.lesson_id`;

/** Trecho de texto puro (sem marcas de Markdown) para a lista. */
export function excerptOf(body, max = 160) {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    // tabelas: some a linha de separação (|---|---|) e os traços verticais
    .split('\n')
    .filter((l) => !/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l))
    .join('\n')
    .replace(/\|/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+] \[[ xX]\]|[-*+]|\d+\.)\s+/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function createNotesService(db, clock) {
  const iso = () => clock.now().toISOString();

  function tagsFor(ids) {
    if (ids.length === 0) return new Map();
    const marks = ids.map(() => '?').join(',');
    const map = new Map();
    for (const r of db.prepare(`SELECT note_id, tag FROM lc_note_tags WHERE note_id IN (${marks}) ORDER BY tag`).all(...ids)) {
      if (!map.has(r.note_id)) map.set(r.note_id, []);
      map.get(r.note_id).push(r.tag);
    }
    return map;
  }

  const base = (r, tags) => ({
    id: r.id,
    title: r.title,
    courseId: r.course_id,
    courseTitle: r.course_title ?? null,
    lessonId: r.lesson_id,
    lessonTitle: r.lesson_title ?? null,
    tags: tags ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  function setTags(noteId, tags) {
    db.prepare('DELETE FROM lc_note_tags WHERE note_id = ?').run(noteId);
    const insert = db.prepare('INSERT INTO lc_note_tags (note_id, tag) VALUES (?, ?)');
    for (const t of tags) insert.run(noteId, t);
  }

  /** Confere curso/aula e devolve o par coerente (aula sem curso herda o curso da aula). */
  function resolveLinks(courseId, lessonId) {
    let course = courseId ?? null;
    const lesson = lessonId ?? null;
    if (course !== null && !db.prepare('SELECT 1 FROM lc_courses WHERE id = ?').get(course)) {
      throw new HttpError(400, 'INVALID_COURSE', 'Curso inexistente.');
    }
    if (lesson !== null) {
      const l = db.prepare('SELECT course_id FROM lc_lessons WHERE id = ?').get(lesson);
      if (!l) throw new HttpError(400, 'INVALID_LESSON', 'Aula inexistente.');
      if (course !== null && l.course_id !== course) {
        throw new HttpError(400, 'INVALID_LESSON', 'A aula não pertence ao curso informado.');
      }
      course = l.course_id;
    }
    return { courseId: course, lessonId: lesson };
  }

  function getRow(id) {
    const r = db.prepare(`${SELECT} WHERE n.id = ?`).get(id);
    if (!r) throw notFound('Anotação');
    return r;
  }

  function get(id) {
    const r = getRow(id);
    return { ...base(r, tagsFor([id]).get(id)), body: r.body_md };
  }

  function create(raw) {
    const input = noteCreate.parse(raw);
    const links = resolveLinks(input.courseId, input.lessonId);
    const now = iso();
    return transaction(db, () => {
      const res = db
        .prepare('INSERT INTO lc_notes (title, body_md, course_id, lesson_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(input.title, input.body, links.courseId, links.lessonId, now, now);
      const id = Number(res.lastInsertRowid);
      setTags(id, input.tags);
      return get(id);
    });
  }

  function update(id, raw) {
    const input = noteUpdate.parse(raw);
    const current = getRow(id);
    const next = {
      title: input.title ?? current.title,
      body: input.body ?? current.body_md,
    };
    if (!hasContent(next)) throw new HttpError(400, 'VALIDATION_ERROR', 'Dados inválidos.', [{ path: 'title', message: EMPTY }]);

    let courseId = input.courseId !== undefined ? input.courseId : current.course_id;
    let lessonId = input.lessonId !== undefined ? input.lessonId : current.lesson_id;
    // trocar/limpar o curso desfaz a aula que era do curso antigo (a menos que a aula nova tenha vindo junto)
    if (input.courseId !== undefined && input.lessonId === undefined && courseId !== current.course_id) lessonId = null;
    const links = resolveLinks(courseId, lessonId);
    courseId = links.courseId;
    lessonId = links.lessonId;

    return transaction(db, () => {
      db.prepare('UPDATE lc_notes SET title = ?, body_md = ?, course_id = ?, lesson_id = ?, updated_at = ? WHERE id = ?')
        .run(next.title, next.body, courseId, lessonId, iso(), id);
      if (input.tags) setTags(id, input.tags);
      return get(id);
    });
  }

  function remove(id) {
    getRow(id);
    db.prepare('DELETE FROM lc_notes WHERE id = ?').run(id);
  }

  /** Lista (sem o texto completo), da editada mais recentemente para a mais antiga. */
  function list({ q, courseId, lessonId, tag, limit = 200 } = {}) {
    const where = [];
    const params = [];
    if (courseId) { where.push('n.course_id = ?'); params.push(courseId); }
    if (lessonId) { where.push('n.lesson_id = ?'); params.push(lessonId); }
    if (tag) { where.push('EXISTS (SELECT 1 FROM lc_note_tags t WHERE t.note_id = n.id AND t.tag = ?)'); params.push(tag.toLowerCase()); }
    const rows = db.prepare(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY n.updated_at DESC, n.id DESC`).all(...params);
    const tags = tagsFor(rows.map((r) => r.id));
    const needle = fold(q);
    const out = [];
    for (const r of rows) {
      const t = tags.get(r.id) ?? [];
      if (needle && !fold(`${r.title} ${r.body_md} ${t.join(' ')}`).includes(needle)) continue;
      out.push({ ...base(r, t), excerpt: excerptOf(r.body_md) });
      if (out.length >= limit) break;
    }
    return out;
  }

  function tagSummary() {
    return db
      .prepare('SELECT tag, COUNT(*) AS count FROM lc_note_tags GROUP BY tag ORDER BY count DESC, tag ASC')
      .all()
      .map((r) => ({ tag: r.tag, count: Number(r.count) }));
  }

  return { create, get, update, remove, list, tagSummary };
}
