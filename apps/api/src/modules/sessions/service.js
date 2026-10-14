import { HttpError, notFound } from '../../core/errors.js';
import { transaction } from '../../core/db.js';

const SESSION_SELECT = `
  SELECT s.*, c.title AS course_title, l.title AS lesson_title
  FROM lc_study_sessions s
  LEFT JOIN lc_courses c ON c.id = s.course_id
  LEFT JOIN lc_lessons l ON l.id = s.lesson_id`;

export function createSessionsService(db, clock) {
  const iso = () => clock.now().toISOString();

  function toSession(r) {
    return {
      id: r.id,
      courseId: r.course_id,
      courseTitle: r.course_title ?? null,
      lessonId: r.lesson_id,
      lessonTitle: r.lesson_title ?? null,
      kind: r.kind,
      plannedMin: r.planned_min,
      startedAt: r.started_at,
      pausedAt: r.paused_at,
      pausedTotalSec: r.paused_total_sec,
      endedAt: r.ended_at,
      durationSec: r.duration_sec,
      focusRating: r.focus_rating,
      notes: r.notes,
      running: r.ended_at === null && r.paused_at === null,
    };
  }

  function getRow(id) {
    const r = db.prepare(`${SESSION_SELECT} WHERE s.id = ?`).get(id);
    if (!r) throw notFound('Sessão');
    return r;
  }

  function assertRefs(courseId, lessonId) {
    if (courseId != null && !db.prepare('SELECT 1 FROM lc_courses WHERE id = ?').get(courseId)) {
      throw new HttpError(400, 'INVALID_COURSE', 'Curso inexistente.');
    }
    if (lessonId != null) {
      const l = db.prepare('SELECT course_id FROM lc_lessons WHERE id = ?').get(lessonId);
      if (!l) throw new HttpError(400, 'INVALID_LESSON', 'Aula inexistente.');
      if (courseId != null && l.course_id !== courseId) {
        throw new HttpError(400, 'INVALID_LESSON', 'A aula não pertence ao curso informado.');
      }
    }
  }

  /** Segundos efetivamente estudados até `at`, descontando pausas. */
  function elapsedSec(row, at) {
    const end = row.paused_at ? new Date(row.paused_at) : at;
    const raw = Math.floor((end.getTime() - new Date(row.started_at).getTime()) / 1000);
    return Math.max(0, raw - row.paused_total_sec);
  }

  function active() {
    const r = db.prepare(`${SESSION_SELECT} WHERE s.ended_at IS NULL ORDER BY s.id DESC LIMIT 1`).get();
    if (!r) return null;
    return { ...toSession(r), elapsedSec: elapsedSec(r, clock.now()) };
  }

  function start({ courseId, lessonId, kind, plannedMin }) {
    const current = active();
    if (current) {
      throw new HttpError(409, 'SESSION_ALREADY_ACTIVE', 'Já existe uma sessão em andamento.', { session: current });
    }
    let course = courseId ?? null;
    if (lessonId != null && course == null) {
      course = db.prepare('SELECT course_id FROM lc_lessons WHERE id = ?').get(lessonId)?.course_id ?? null;
    }
    assertRefs(course, lessonId ?? null);
    const res = db
      .prepare('INSERT INTO lc_study_sessions (course_id, lesson_id, kind, planned_min, started_at) VALUES (?, ?, ?, ?, ?)')
      .run(course, lessonId ?? null, kind, kind === 'pomodoro' ? plannedMin : null, iso());
    return { ...toSession(getRow(Number(res.lastInsertRowid))), elapsedSec: 0 };
  }

  function mustBeOpen(id) {
    const r = getRow(id);
    if (r.ended_at) throw new HttpError(409, 'SESSION_ENDED', 'A sessão já foi finalizada.');
    return r;
  }

  function pause(id) {
    const r = mustBeOpen(id);
    if (r.paused_at) return { ...toSession(r), elapsedSec: elapsedSec(r, clock.now()) };
    db.prepare('UPDATE lc_study_sessions SET paused_at = ? WHERE id = ?').run(iso(), id);
    const next = getRow(id);
    return { ...toSession(next), elapsedSec: elapsedSec(next, clock.now()) };
  }

  function resume(id) {
    const r = mustBeOpen(id);
    if (!r.paused_at) return { ...toSession(r), elapsedSec: elapsedSec(r, clock.now()) };
    const pausedFor = Math.max(0, Math.floor((clock.now().getTime() - new Date(r.paused_at).getTime()) / 1000));
    db.prepare('UPDATE lc_study_sessions SET paused_at = NULL, paused_total_sec = paused_total_sec + ? WHERE id = ?').run(pausedFor, id);
    const next = getRow(id);
    return { ...toSession(next), elapsedSec: elapsedSec(next, clock.now()) };
  }

  function finish(id, { notes, focusRating, completeLesson }) {
    const r = mustBeOpen(id);
    const at = clock.now();
    const duration = elapsedSec(r, at);
    return transaction(db, () => {
      db.prepare(
        'UPDATE lc_study_sessions SET ended_at = ?, paused_at = NULL, duration_sec = ?, notes = ?, focus_rating = ? WHERE id = ?',
      ).run(at.toISOString(), duration, notes ?? '', focusRating ?? null, id);
      if (completeLesson && r.lesson_id) {
        db.prepare('UPDATE lc_lessons SET completed_at = COALESCE(completed_at, ?) WHERE id = ?').run(at.toISOString(), r.lesson_id);
      }
      if (r.course_id) {
        db.prepare('UPDATE lc_courses SET updated_at = ? WHERE id = ?').run(at.toISOString(), r.course_id);
      }
      return toSession(getRow(id));
    });
  }

  function discard(id) {
    mustBeOpen(id);
    db.prepare('DELETE FROM lc_study_sessions WHERE id = ?').run(id);
  }

  /** Registro manual de tempo estudado (ex.: aula assistida fora do app). */
  function logManual({ courseId, lessonId, durationMin, startedAt, notes }) {
    assertRefs(courseId ?? null, lessonId ?? null);
    const start = startedAt ? new Date(startedAt) : new Date(clock.now().getTime() - durationMin * 60000);
    const end = new Date(start.getTime() + durationMin * 60000);
    const res = db
      .prepare(
        `INSERT INTO lc_study_sessions (course_id, lesson_id, kind, started_at, ended_at, duration_sec, notes)
         VALUES (?, ?, 'manual', ?, ?, ?, ?)`,
      )
      .run(courseId ?? null, lessonId ?? null, start.toISOString(), end.toISOString(), durationMin * 60, notes ?? '');
    return toSession(getRow(Number(res.lastInsertRowid)));
  }

  function list({ from, to, courseId, limit = 50 } = {}) {
    const where = ['s.ended_at IS NOT NULL'];
    const params = [];
    if (from) { where.push('s.started_at >= ?'); params.push(from); }
    if (to) { where.push('s.started_at < ?'); params.push(to); }
    if (courseId) { where.push('s.course_id = ?'); params.push(courseId); }
    params.push(limit);
    return db
      .prepare(`${SESSION_SELECT} WHERE ${where.join(' AND ')} ORDER BY s.started_at DESC LIMIT ?`)
      .all(...params)
      .map(toSession);
  }

  /** Soma de minutos estudados (sessões encerradas) no intervalo [from, to). */
  function minutesBetween(from, to) {
    const r = db
      .prepare('SELECT COALESCE(SUM(duration_sec), 0) AS s FROM lc_study_sessions WHERE ended_at IS NOT NULL AND started_at >= ? AND started_at < ?')
      .get(from.toISOString(), to.toISOString());
    return Math.round(r.s / 60);
  }

  function startTimesBetween(from, to) {
    return db
      .prepare('SELECT started_at, duration_sec FROM lc_study_sessions WHERE ended_at IS NOT NULL AND started_at >= ? AND started_at < ?')
      .all(from.toISOString(), to.toISOString());
  }

  return { active, start, pause, resume, finish, discard, logManual, list, minutesBetween, startTimesBetween };
}
