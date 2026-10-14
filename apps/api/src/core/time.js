/** Relógio injetável: facilita testes e evita `new Date()` espalhado. */
export const systemClock = { now: () => new Date() };

export function fixedClock(iso) {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    set: (next) => {
      current = new Date(next);
    },
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

/** Início do dia local (00:00). */
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Segunda-feira 00:00 (horário local do servidor — configure TZ no Docker). */
export function startOfWeek(date) {
  const d = startOfDay(date);
  const diff = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - diff);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Chave YYYY-MM-DD no horário local. */
export function dayKey(date) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
