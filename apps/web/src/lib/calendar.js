export const WEEKDAYS_FULL = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const weekdayShort = (i) => WEEKDAYS_FULL[i].slice(0, 3);

const pad = (n) => String(n).padStart(2, '0');
const SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']; // Date#getDay()

const dayKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Dia local (YYYY-MM-DD) em que o evento começa. */
export function eventDayKey(ev) {
  return ev.allDay ? ev.start.slice(0, 10) : dayKeyOf(new Date(ev.start));
}

/** "Hoje · qua 11/03", "Amanhã · qui 12/03", "sáb 14/03". */
export function dayLabel(key, now = new Date()) {
  const d = parseKey(key);
  const base = `${SHORT[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const today = parseKey(dayKeyOf(now));
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return `Hoje · ${base}`;
  if (diff === 1) return `Amanhã · ${base}`;
  return base;
}

const hhmm = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function timeRange(ev) {
  if (ev.allDay) return 'Dia inteiro';
  return ev.end ? `${hhmm(ev.start)}–${hhmm(ev.end)}` : hhmm(ev.start);
}

export const eventIcon = (ev) => (ev.kind === 'plan' ? '📚' : ev.kind === 'session' ? '✅' : '');

/** Agrupa os eventos por dia (em ordem); no dia, os de dia inteiro vêm primeiro. */
export function groupByDay(events, now = new Date()) {
  const days = new Map();
  for (const ev of events ?? []) {
    const key = eventDayKey(ev);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(ev);
  }
  return [...days.keys()].sort().map((key) => ({
    key,
    label: dayLabel(key, now),
    events: [...days.get(key)].sort((a, b) => Number(b.allDay) - Number(a.allDay)),
  }));
}

/** Os próximos `n` dias a partir de hoje: chave local, dia da semana curto e dd/mm. */
export function nextDays(n = 7, now = new Date()) {
  const today = parseKey(dayKeyOf(now));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    return { key: dayKeyOf(d), weekday: SHORT[d.getDay()], date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, isToday: i === 0 };
  });
}

/** "acontecendo agora", "começa em 35 min", "começa em 2 h 10 min" ou o dia ("Amanhã · qui 12/03"). */
export function startsIn(ev, now = new Date()) {
  const start = new Date(ev.start);
  const end = ev.end ? new Date(ev.end) : start;
  if (start <= now && now < end) return 'acontecendo agora';
  const min = Math.round((start - now) / 60000);
  if (min >= 0 && min < 60) return `começa em ${Math.max(min, 1)} min`;
  if (min >= 60 && min < 24 * 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `começa em ${h} h${m ? ` ${m} min` : ''}`;
  }
  return dayLabel(dayKeyOf(start), now);
}

/** "agora há pouco", "há 5 min", "há 3 h", "ontem", "há 4 dias". */
export function relativeSync(iso, now = new Date()) {
  if (!iso) return 'ainda não sincronizado';
  const min = Math.floor((now - new Date(iso)) / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
  const days = Math.round((parseKey(dayKeyOf(now)) - parseKey(dayKeyOf(new Date(iso)))) / 86400000);
  return days <= 1 ? 'ontem' : `há ${days} dias`;
}
