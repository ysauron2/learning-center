import { addDays, startOfDay } from '../../core/time.js';

/**
 * O que o app quer colocar em qualquer agenda externa (Google, Notion, calendário assinável):
 * os blocos do plano de estudo (próximas 4 semanas) e as sessões de foco concluídas (últimas 2 semanas).
 * Cada destino só traduz isso para o seu formato.
 */
export const WINDOW_DAYS = 28;
export const SESSION_DAYS = 14;
export const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const STUDY_CALENDAR_NAME = 'Learning Center · Estudos';

const pad = (n) => String(n).padStart(2, '0');
const weekdayOf = (d) => (d.getDay() + 6) % 7; // segunda = 0

/** Data/hora local com o deslocamento explícito (ex.: 2026-03-16T09:00:00-03:00): não depende do fuso do destino. */
export function rfc3339Local(d) {
  const off = -d.getTimezoneOffset();
  const a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${off >= 0 ? '+' : '-'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export const sessionSummary = (s) => `✅ Estudei: ${s.course_title ?? 'Sessão de foco'} (${Math.round(s.duration_sec / 60)} min)`;

export function createStudyEvents({ db, clock, courses }) {
  const planRow = (r) => ({ id: r.id, weekday: r.weekday, startTime: r.start_time, durationMin: r.duration_min, courseId: r.course_id, courseTitle: r.course_title ?? null });
  const PLAN_SELECT = 'SELECT p.*, c.title AS course_title FROM lc_study_plan p LEFT JOIN lc_courses c ON c.id = p.course_id';

  const listPlan = () => db.prepare(`${PLAN_SELECT} ORDER BY p.weekday, p.start_time, p.id`).all().map(planRow);
  const getPlan = (id) => {
    const r = db.prepare(`${PLAN_SELECT} WHERE p.id = ?`).get(id);
    return r ? planRow(r) : null;
  };

  /** Blocos do plano que ainda vão acontecer nas próximas 4 semanas. Chave: "<id do bloco>|<AAAA-MM-DD>". */
  function desiredPlanEvents() {
    const now = clock.now();
    const today = startOfDay(now);
    const out = new Map();
    for (const p of listPlan()) {
      const [hh, mm] = p.startTime.split(':').map(Number);
      const lesson = p.courseId ? courses.nextLesson(p.courseId) : null;
      for (let i = 0; i < WINDOW_DAYS; i += 1) {
        const day = addDays(today, i);
        if (weekdayOf(day) !== p.weekday) continue;
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
        const end = new Date(start.getTime() + p.durationMin * 60000);
        if (end <= now) continue; // bloco de hoje que já passou
        const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
        out.set(`${p.id}|${date}`, {
          planId: p.id,
          courseId: p.courseId,
          lessonTitle: lesson?.title ?? null,
          date,
          start,
          end,
          courseTitle: p.courseTitle,
          summary: p.courseTitle ? `📚 Estudar: ${p.courseTitle}` : '📚 Hora de estudar',
          description: `Bloco de estudo planejado no Learning Center.${lesson ? `\nPróxima aula: ${lesson.title}` : ''}`,
        });
      }
    }
    return out;
  }

  const onceRow = (r) => ({ id: r.id, date: r.date, startTime: r.start_time, durationMin: r.duration_min, courseId: r.course_id, courseTitle: r.course_title ?? null, fromPlanId: r.from_plan_id ?? null, fromDate: r.from_date ?? null });
  const ONCE_SELECT = 'SELECT o.*, c.title AS course_title FROM lc_study_once o LEFT JOIN lc_courses c ON c.id = o.course_id';
  const getOnce = (id) => {
    const r = db.prepare(`${ONCE_SELECT} WHERE o.id = ?`).get(id);
    return r ? onceRow(r) : null;
  };
  /** Blocos avulsos com data de `fromDate` (AAAA-MM-DD) em diante. */
  const listOnce = (fromDate = '0000-00-00') => db.prepare(`${ONCE_SELECT} WHERE o.date >= ? ORDER BY o.date, o.start_time, o.id`).all(fromDate).map(onceRow);

  /** Blocos avulsos que ainda vão acontecer (hoje, depois de agora, até daqui a 4 semanas). Chave: "<id>|<AAAA-MM-DD>". */
  function desiredOnceEvents() {
    const now = clock.now();
    const today = startOfDay(now);
    const out = new Map();
    for (const o of listOnce(dateKey(today))) {
      const [y, mo, d] = o.date.split('-').map(Number);
      const [hh, mm] = o.startTime.split(':').map(Number);
      const start = new Date(y, mo - 1, d, hh, mm);
      const end = new Date(start.getTime() + o.durationMin * 60000);
      if (end <= now || start >= addDays(today, WINDOW_DAYS)) continue;
      const lesson = o.courseId ? courses.nextLesson(o.courseId) : null;
      out.set(`${o.id}|${o.date}`, {
        onceId: o.id,
        courseId: o.courseId,
        lessonTitle: lesson?.title ?? null,
        date: o.date,
        start,
        end,
        courseTitle: o.courseTitle,
        summary: o.courseTitle ? `📚 Estudar: ${o.courseTitle}` : '📚 Hora de estudar',
        description: `Bloco de estudo marcado no Lume.${lesson ? `\nPróxima aula: ${lesson.title}` : ''}`,
      });
    }
    return out;
  }

  /** Sessões de foco recentes (reais, com pelo menos 1 minuto). */
  function recentSessions(from) {
    return db.prepare(
      `SELECT s.id, s.started_at, s.duration_sec, c.title AS course_title
       FROM lc_study_sessions s LEFT JOIN lc_courses c ON c.id = s.course_id
       WHERE s.ended_at IS NOT NULL AND s.kind <> 'manual' AND s.duration_sec >= 60 AND s.started_at >= ?
       ORDER BY s.started_at DESC LIMIT 100`,
    ).all(from.toISOString());
  }

  return { listPlan, getPlan, desiredPlanEvents, listOnce, getOnce, desiredOnceEvents, recentSessions };
}
