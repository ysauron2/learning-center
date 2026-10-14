export const RANGES = [
  ['7d', '7 dias'],
  ['30d', '30 dias'],
  ['90d', '90 dias'],
  ['all', 'Tudo'],
];

export const PERIOD_LABEL = { madrugada: 'Madrugada', manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
export const PERIOD_HOURS = { madrugada: '0–6h', manha: '6–12h', tarde: '12–18h', noite: '18–24h' };
export const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Alturas (%) das barras. Barras com valor ficam sempre visíveis (mínimo 3%). */
export function barHeights(values, { max, min = 3 } = {}) {
  const top = max ?? Math.max(0, ...values);
  return values.map((v) => (top > 0 ? Math.min(100, Math.max(min, Math.round((v / top) * 100))) : min));
}

/** Intensidade 0–4 do mapa de calor (0 = sem estudo). */
export function heatLevel(minutes, max) {
  if (!minutes || !max) return 0;
  return Math.min(4, Math.max(1, Math.ceil((minutes / max) * 4)));
}

export function deltaText(percent) {
  if (percent === null || percent === undefined) return 'sem período anterior para comparar';
  if (percent === 0) return 'igual ao período anterior';
  return `${percent > 0 ? '+' : '−'}${Math.abs(percent)}% em relação ao período anterior`;
}

/** '2026-03-05' -> '05/03' */
export function shortDate(key) {
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
}

/** Rótulos do eixo: um a cada `every` barras (e sempre o último), o resto vazio. */
export function tickLabels(dates, every) {
  return dates.map((d, i) => (i % every === 0 || i === dates.length - 1 ? shortDate(d) : ''));
}

export function ratingText(avg) {
  return avg === null || avg === undefined ? 'sem notas ainda' : `${String(avg).replace('.', ',')} de 5`;
}

export const hitCount = (goalHistory) => goalHistory.filter((w) => w.hit).length;
