import { addDays, startOfDay, dayKey } from '../../core/time.js';
import { dateKey, rfc3339Local } from './study-events.js';

/** Quantos dias para trás (além de hoje) procuramos blocos perdidos, e quantos mostramos. */
export const MISSED_DAYS_BACK = 3;
export const MISSED_LIMIT = 3;
/** Um dia só conta como "estudado" com uma sessão concluída de pelo menos 5 minutos. */
export const MIN_STUDY_SEC = 5 * 60;

const weekdayOf = (d) => (d.getDay() + 6) % 7; // segunda = 0

/**
 * Blocos do plano (e avulsos) que já terminaram sem estudo no dia: nenhuma sessão concluída (inclusive registro
 * manual) com ao menos 5 min no mesmo dia local, no mesmo curso do bloco (ou em qualquer curso, se o bloco não tem curso).
 */
export function createMissed({ db, clock, study }) {
  function missed() {
    const now = clock.now();
    const today = startOfDay(now);
    const first = addDays(today, -MISSED_DAYS_BACK);

    // dia local -> cursos (null = sessão sem curso) com estudo cumprido
    const studied = new Map();
    const sessions = db.prepare(
      'SELECT course_id, started_at FROM lc_study_sessions WHERE ended_at IS NOT NULL AND duration_sec >= ? AND started_at >= ?',
    ).all(MIN_STUDY_SEC, addDays(first, -1).toISOString());
    for (const s of sessions) {
      const k = dayKey(s.started_at);
      if (!studied.has(k)) studied.set(k, new Set());
      studied.get(k).add(s.course_id);
    }
    const fulfilled = (date, courseId) => {
      const set = studied.get(date);
      if (!set || set.size === 0) return false;
      return courseId == null ? true : set.has(courseId);
    };

    // planos já remarcados (existe avulso criado a partir deles naquele dia)
    const moved = new Set(
      db.prepare('SELECT from_plan_id, from_date FROM lc_study_once WHERE from_plan_id IS NOT NULL AND from_date IS NOT NULL')
        .all().map((r) => `${r.from_plan_id}|${r.from_date}`),
    );

    const out = [];
    const push = (item) => out.push(item);

    const createdAt = new Map(db.prepare('SELECT id, created_at FROM lc_study_plan').all().map((r) => [r.id, r.created_at]));
    for (const p of study.listPlan()) {
      const [hh, mm] = p.startTime.split(':').map(Number);
      const created = createdAt.get(p.id) ? new Date(createdAt.get(p.id)) : null;
      for (let i = 0; i <= MISSED_DAYS_BACK; i += 1) {
        const day = addDays(today, -i);
        if (weekdayOf(day) !== p.weekday) continue;
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
        const end = new Date(start.getTime() + p.durationMin * 60000);
        if (end > now) continue; // ainda não terminou
        if (created && end <= created) continue; // o bloco ainda não existia
        const date = dateKey(day);
        if (moved.has(`${p.id}|${date}`) || fulfilled(date, p.courseId)) continue;
        push({ kind: 'plan', key: `plan-${p.id}-${date}`, planId: p.id, onceId: null, date, start: rfc3339Local(start), end: rfc3339Local(end), startTime: p.startTime, durationMin: p.durationMin, courseId: p.courseId, courseTitle: p.courseTitle, at: start.getTime() });
      }
    }

    for (const o of study.listOnce(dateKey(first))) {
      const [y, mo, d] = o.date.split('-').map(Number);
      const [hh, mm] = o.startTime.split(':').map(Number);
      const start = new Date(y, mo - 1, d, hh, mm);
      const end = new Date(start.getTime() + o.durationMin * 60000);
      if (end > now || o.date > dateKey(today)) continue;
      if (fulfilled(o.date, o.courseId)) continue;
      push({ kind: 'once', key: `once-${o.id}-${o.date}`, planId: null, onceId: o.id, date: o.date, start: rfc3339Local(start), end: rfc3339Local(end), startTime: o.startTime, durationMin: o.durationMin, courseId: o.courseId, courseTitle: o.courseTitle, at: start.getTime() });
    }

    return out.sort((a, b) => b.at - a.at).slice(0, MISSED_LIMIT).map(({ at, ...rest }) => rest);
  }

  return { missed };
}
