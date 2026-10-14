/** 750 -> "12h 30min" · 45 -> "45min" · 120 -> "2h" · 0 -> "0min" */
export function formatMinutes(total) {
  const m = Math.max(0, Math.round(total ?? 0));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}min`;
  return rest === 0 ? `${h}h` : `${h}h ${String(rest).padStart(2, '0')}min`;
}

/** 1500 -> "25:00" · 3725 -> "1:02:05" */
export function formatClock(totalSec) {
  const s = Math.max(0, Math.floor(totalSec ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Quando foi: "hoje", "ontem", "há 3 dias" ou data curta. */
export function relativeDay(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff <= 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff < 7) return `há ${diff} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export const STATUS_LABEL = {
  planned: 'Planejado',
  active: 'Em andamento',
  paused: 'Pausado',
  completed: 'Concluído',
};

export const STATUS_TONE = {
  planned: '',
  active: 'brand',
  paused: 'warning',
  completed: 'success',
};

const THUMBS = [
  'linear-gradient(135deg,#312E81,#6D28D9 60%,#2563EB)',
  'linear-gradient(135deg,#0F172A,#4338CA 65%,#7C3AED)',
  'linear-gradient(135deg,#064E3B,#059669 60%,#2563EB)',
  'linear-gradient(135deg,#1E3A8A,#2563EB 60%,#38BDF8)',
  'linear-gradient(135deg,#4C1D95,#7C3AED 55%,#EC4899)',
  'linear-gradient(135deg,#1F2440,#334155 60%,#10B981)',
];

/** Gradiente estável por curso (derivado do id). */
export const thumbFor = (id) => THUMBS[Math.abs(Number(id) || 0) % THUMBS.length];

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
