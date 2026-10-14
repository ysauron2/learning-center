import { startOfWeek, addDays } from '../../core/time.js';

const KEY = 'weekly_goal_minutes';

export function createGoalsService(db, clock, sessions) {
  function targetMinutes() {
    const row = db.prepare('SELECT value FROM lc_settings WHERE key = ?').get(KEY);
    return Number.parseInt(row?.value ?? '480', 10);
  }

  function weekly(at = clock.now()) {
    const start = startOfWeek(at);
    const end = addDays(start, 7);
    const target = targetMinutes();
    const studied = sessions.minutesBetween(start, end);
    return {
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
      targetMinutes: target,
      studiedMinutes: studied,
      remainingMinutes: Math.max(0, target - studied),
      percent: target > 0 ? Math.min(100, Math.round((studied / target) * 100)) : 0,
    };
  }

  function setWeekly(minutes) {
    db.prepare(
      'INSERT INTO lc_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(KEY, String(minutes));
    return weekly();
  }

  return { weekly, setWeekly };
}
