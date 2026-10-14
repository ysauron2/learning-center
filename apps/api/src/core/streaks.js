import { startOfDay, addDays, dayKey } from './time.js';

/** Dias consecutivos com estudo até hoje. Se hoje ainda não teve, a contagem parte de ontem. */
export function currentStreak(days, now) {
  let cursor = startOfDay(now);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

const fromKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Maior sequência de dias consecutivos em `days` (chaves YYYY-MM-DD). */
export function longestStreak(days) {
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of [...days].sort()) {
    run = prev && dayKey(addDays(fromKey(prev), 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}
