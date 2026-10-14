import { startOfWeek, startOfDay, addDays, dayKey } from '../../core/time.js';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function createDashboardService({ db, clock, courses, sessions, goals }) {
  /** Dias consecutivos com estudo. Se hoje ainda não teve, a contagem parte de ontem. */
  function streak(now) {
    const from = addDays(startOfDay(now), -400);
    const days = new Set(
      sessions
        .startTimesBetween(from, addDays(startOfDay(now), 1))
        .filter((s) => s.duration_sec > 0)
        .map((s) => dayKey(s.started_at)),
    );
    let cursor = startOfDay(now);
    if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
    let count = 0;
    while (days.has(dayKey(cursor))) {
      count += 1;
      cursor = addDays(cursor, -1);
    }
    return count;
  }

  function weeklyChart(weekStart) {
    const rows = sessions.startTimesBetween(weekStart, addDays(weekStart, 7));
    const byDay = new Map();
    for (const r of rows) {
      const k = dayKey(r.started_at);
      byDay.set(k, (byDay.get(k) ?? 0) + r.duration_sec);
    }
    return WEEKDAYS.map((label, i) => {
      const d = addDays(weekStart, i);
      return { date: dayKey(d), label, minutes: Math.round((byDay.get(dayKey(d)) ?? 0) / 60) };
    });
  }

  function nextAction() {
    const running = sessions.active();
    if (running) {
      const course = running.courseId ? courses.get(running.courseId) : null;
      return {
        type: 'resume_session',
        session: running,
        course: course && { id: course.id, title: course.title, progress: course.progress },
        lesson: running.lessonId ? { id: running.lessonId, title: running.lessonTitle } : null,
      };
    }
    const last = db
      .prepare(
        `SELECT c.id FROM lc_study_sessions s JOIN lc_courses c ON c.id = s.course_id
         WHERE c.status = 'active' ORDER BY s.started_at DESC LIMIT 1`,
      )
      .get();
    const candidate =
      last?.id ?? db.prepare("SELECT id FROM lc_courses WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1").get()?.id;
    if (!candidate) return { type: 'add_course' };
    const course = courses.get(candidate);
    const lesson = courses.nextLesson(candidate);
    return {
      type: lesson ? 'next_lesson' : 'continue_course',
      course: { id: course.id, title: course.title, progress: course.progress, platform: course.platform },
      lesson,
    };
  }

  function get() {
    const now = clock.now();
    const weekStart = startOfWeek(now);
    const thisWeek = sessions.minutesBetween(weekStart, addDays(weekStart, 7));
    const prevWeek = sessions.minutesBetween(addDays(weekStart, -7), weekStart);
    const summary = courses.summary();
    return {
      generatedAt: now.toISOString(),
      week: {
        studiedMinutes: thisWeek,
        previousMinutes: prevWeek,
        deltaPercent: prevWeek > 0 ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100) : null,
        chart: weeklyChart(weekStart),
      },
      goal: goals.weekly(now),
      streakDays: streak(now),
      activeCourses: summary.active,
      totalCourses: summary.total,
      nextAction: nextAction(),
      recentSessions: sessions.list({ limit: 5 }),
    };
  }

  return { get };
}
