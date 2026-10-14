import { startOfDay, startOfWeek, addDays, dayKey } from '../../core/time.js';
import { currentStreak, longestStreak } from '../../core/streaks.js';

export const RANGES = ['7d', '30d', '90d', 'all'];
export const PERIODS = ['madrugada', 'manha', 'tarde', 'noite'];
const DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const GOAL_WEEKS = 12;

const periodOf = (date) => PERIODS[Math.floor(new Date(date).getHours() / 6)];
const weekdayOf = (date) => (new Date(date).getDay() + 6) % 7; // segunda = 0
const minutes = (sec) => Math.round(sec / 60);
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Estatísticas de estudo. Só lê `lc_study_sessions` (sessões encerradas) e usa os mesmos
 * helpers de data do dashboard, então dia/semana/fuso nunca discordam entre as duas telas.
 * Sessões que atravessam a meia-noite contam no dia em que começaram.
 */
export function createAnalyticsService({ db, clock, courses, goals }) {
  const rowsBetween = (from, to) =>
    db
      .prepare(
        `SELECT course_id, kind, started_at, duration_sec, focus_rating
         FROM lc_study_sessions
         WHERE ended_at IS NOT NULL AND duration_sec > 0 AND started_at >= ? AND started_at < ?
         ORDER BY started_at`,
      )
      .all(from.toISOString(), to.toISOString());

  function bounds(range, now) {
    const to = addDays(startOfDay(now), 1);
    if (range === 'all') {
      const first = db
        .prepare('SELECT MIN(started_at) AS s FROM lc_study_sessions WHERE ended_at IS NOT NULL AND duration_sec > 0')
        .get().s;
      return { from: first ? startOfDay(first) : startOfDay(now), to, previous: null };
    }
    const from = addDays(to, -DAYS[range]);
    return { from, to, previous: { from: addDays(from, -DAYS[range]), to: from } };
  }

  function timelineOf(rows, from, to, granularity) {
    const bucket = (d) => dayKey(granularity === 'week' ? startOfWeek(d) : startOfDay(d));
    const sums = new Map();
    for (const r of rows) sums.set(bucket(r.started_at), (sums.get(bucket(r.started_at)) ?? 0) + r.duration_sec);
    const out = [];
    const step = granularity === 'week' ? 7 : 1;
    for (let d = granularity === 'week' ? startOfWeek(from) : from; d < to; d = addDays(d, step)) {
      out.push({ date: dayKey(d), minutes: minutes(sums.get(dayKey(d)) ?? 0) });
    }
    return out;
  }

  function summaryOf(rows, previousRows, now, allDays) {
    const perDay = new Map();
    let total = 0;
    for (const r of rows) {
      total += r.duration_sec;
      const k = dayKey(r.started_at);
      perDay.set(k, (perDay.get(k) ?? 0) + r.duration_sec);
    }
    let best = null;
    for (const [date, sec] of perDay) if (!best || sec > best.sec) best = { date, sec };
    const previous = previousRows ? previousRows.reduce((s, r) => s + r.duration_sec, 0) : null;
    const totalMin = minutes(total);
    const prevMin = previous === null ? null : minutes(previous);
    return {
      totalMinutes: totalMin,
      sessions: rows.length,
      activeDays: perDay.size,
      avgMinutesPerActiveDay: perDay.size ? Math.round(totalMin / perDay.size) : 0,
      bestDay: best ? { date: best.date, minutes: minutes(best.sec) } : null,
      previousMinutes: prevMin,
      deltaPercent: prevMin ? Math.round(((totalMin - prevMin) / prevMin) * 100) : null,
      currentStreak: currentStreak(allDays, now),
      longestStreak: longestStreak(allDays),
    };
  }

  function byCourseOf(rows, now) {
    const sums = new Map();
    for (const r of rows) sums.set(r.course_id ?? null, (sums.get(r.course_id ?? null) ?? 0) + r.duration_sec);
    const total = [...sums.values()].reduce((a, b) => a + b, 0);
    const byId = new Map(courses.list().map((c) => [c.id, c]));
    return [...sums.entries()]
      .map(([id, sec]) => {
        const c = id === null ? null : byId.get(id);
        return {
          courseId: id,
          title: c ? c.title : 'Sem curso',
          minutes: minutes(sec),
          percent: total ? Math.round((sec / total) * 100) : 0,
          progress: c ? c.progress : null,
          status: c ? c.status : null,
          daysSince: c?.lastStudiedAt ? Math.round((startOfDay(now) - startOfDay(c.lastStudiedAt)) / 86400000) : null,
          sec,
        };
      })
      .sort((a, b) => b.sec - a.sec)
      .map(({ sec, ...rest }) => rest);
  }

  function idleCoursesOf(rows, now) {
    const studied = new Set(rows.map((r) => r.course_id));
    return courses
      .list({ status: 'active' })
      .filter((c) => !studied.has(c.id))
      .map((c) => ({
        courseId: c.id,
        title: c.title,
        progress: c.progress,
        daysSince: c.lastStudiedAt ? Math.round((startOfDay(now) - startOfDay(c.lastStudiedAt)) / 86400000) : null,
      }))
      .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity));
  }

  /** Horário e foco só fazem sentido para sessões reais: o início de um registro manual é inventado. */
  function weekdayPeriodsOf(real) {
    const matrix = Array.from({ length: 7 }, () => PERIODS.map(() => 0));
    for (const r of real) matrix[weekdayOf(r.started_at)][PERIODS.indexOf(periodOf(r.started_at))] += r.duration_sec;
    return { periods: PERIODS, matrix: matrix.map((row) => row.map(minutes)) };
  }

  function focusOf(rows, real) {
    const rated = real.filter((r) => r.focus_rating !== null);
    const byPeriod = PERIODS.map((period) => {
      const inPeriod = real.filter((r) => periodOf(r.started_at) === period);
      const ratings = inPeriod.filter((r) => r.focus_rating !== null).map((r) => r.focus_rating);
      return {
        period,
        sessions: inPeriod.length,
        avgRating: ratings.length ? round1(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
      };
    });
    const ranked = byPeriod.filter((p) => p.avgRating !== null).sort((a, b) => b.avgRating - a.avgRating);
    const kinds = { pomodoro: 0, stopwatch: 0, manual: 0 };
    for (const r of rows) kinds[r.kind] += 1;
    return {
      ratedSessions: rated.length,
      avgRating: rated.length ? round1(rated.reduce((s, r) => s + r.focus_rating, 0) / rated.length) : null,
      byPeriod,
      bestPeriod: ranked[0]?.period ?? null,
      avgSessionMinutes: real.length ? Math.round(minutes(real.reduce((s, r) => s + r.duration_sec, 0)) / real.length) : 0,
      kinds,
    };
  }

  function goalHistoryOf(now) {
    const current = startOfWeek(now);
    return Array.from({ length: GOAL_WEEKS }, (_, i) => {
      const start = addDays(current, -7 * (GOAL_WEEKS - 1 - i));
      const g = goals.weekly(start);
      return { weekStart: dayKey(start), minutes: g.studiedMinutes, target: g.targetMinutes, hit: g.targetMinutes > 0 && g.studiedMinutes >= g.targetMinutes };
    });
  }

  function get(range = '30d') {
    const now = clock.now();
    const { from, to, previous } = bounds(range, now);
    const rows = rowsBetween(from, to);
    const real = rows.filter((r) => r.kind !== 'manual');
    const granularity = range === '7d' || range === '30d' ? 'day' : 'week';
    const allDays = new Set(
      db
        .prepare('SELECT started_at FROM lc_study_sessions WHERE ended_at IS NOT NULL AND duration_sec > 0')
        .all()
        .map((r) => dayKey(r.started_at)),
    );
    return {
      range,
      from: dayKey(from),
      to: dayKey(addDays(to, -1)),
      granularity,
      summary: summaryOf(rows, previous && rowsBetween(previous.from, previous.to), now, allDays),
      timeline: timelineOf(rows, from, to, granularity),
      byCourse: byCourseOf(rows, now),
      idleCourses: idleCoursesOf(rows, now),
      weekdayPeriods: weekdayPeriodsOf(real),
      focus: focusOf(rows, real),
      goalHistory: goalHistoryOf(now),
    };
  }

  return { get };
}
