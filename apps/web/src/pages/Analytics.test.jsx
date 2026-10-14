// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({ api: { analytics: vi.fn() } }));
import { api } from '../lib/api.js';
import Analytics from './Analytics.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const goalHistory = Array.from({ length: 12 }, (_, i) => ({ weekStart: `2026-01-${String(i + 1).padStart(2, '0')}`, minutes: i * 10, target: 60, hit: i > 8 }));
const base = {
  range: '30d', from: '2026-02-10', to: '2026-03-11', granularity: 'day',
  summary: { totalMinutes: 0, sessions: 0, activeDays: 0, avgMinutesPerActiveDay: 0, bestDay: null, previousMinutes: 0, deltaPercent: null, currentStreak: 0, longestStreak: 0 },
  timeline: [{ date: '2026-03-10', minutes: 0 }, { date: '2026-03-11', minutes: 0 }],
  byCourse: [], idleCourses: [],
  weekdayPeriods: { periods: ['madrugada', 'manha', 'tarde', 'noite'], matrix: Array.from({ length: 7 }, () => [0, 0, 0, 0]) },
  focus: { ratedSessions: 0, avgRating: null, byPeriod: [], bestPeriod: null, avgSessionMinutes: 0, kinds: { pomodoro: 0, stopwatch: 0, manual: 0 } },
  goalHistory,
};
const full = {
  ...base,
  summary: { ...base.summary, totalMinutes: 150, sessions: 3, activeDays: 2, avgMinutesPerActiveDay: 75, bestDay: { date: '2026-03-10', minutes: 90 }, previousMinutes: 100, deltaPercent: 50, currentStreak: 2, longestStreak: 4 },
  timeline: [{ date: '2026-03-10', minutes: 90 }, { date: '2026-03-11', minutes: 60 }],
  byCourse: [{ courseId: 7, title: 'Curso <b>X</b>', minutes: 120, percent: 80, progress: 40, status: 'active', daysSince: 0 }, { courseId: null, title: 'Sem curso', minutes: 30, percent: 20, progress: null, status: null, daysSince: null }],
  idleCourses: [{ courseId: 9, title: 'Parado', progress: 0, daysSince: null }],
  weekdayPeriods: { ...base.weekdayPeriods, matrix: base.weekdayPeriods.matrix.map((r, i) => (i === 0 ? [0, 60, 0, 30] : r)) },
  focus: { ratedSessions: 2, avgRating: 3.5, byPeriod: [], bestPeriod: 'manha', avgSessionMinutes: 50, kinds: { pomodoro: 1, stopwatch: 1, manual: 1 } },
};

let container;
async function render(data) {
  api.analytics.mockResolvedValue(data);
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(<MemoryRouter><Analytics /></MemoryRouter>);
  });
}
beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

describe('página Analytics', () => {
  it('sem dados mostra o estado vazio e não quebra (sem NaN)', async () => {
    await render(base);
    expect(container.textContent).toContain('Ainda sem estudo neste período');
    expect(container.textContent).toContain('Sem sessões de foco neste período');
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).toContain('sem notas ainda');
  });

  it('com dados mostra resumo, curso, horário e foco', async () => {
    await render(full);
    const text = container.textContent;
    expect(text).toContain('2h 30min');
    expect(text).toContain('+50% em relação ao período anterior');
    expect(text).toContain('Recorde: 4 dias');
    expect(text).toContain('3,5 de 5');
    expect(text).toContain('Manhã');
    expect(text).toContain('nunca estudado');
    expect(container.querySelector('a[href="/cursos/7"]')).not.toBeNull();
    expect(container.querySelectorAll('.heat-cell[data-level="4"]').length).toBe(1);
  });

  it('título do curso com HTML aparece como texto, sem criar elementos', async () => {
    await render(full);
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('Curso <b>X</b>');
  });

  it('trocar o período busca de novo na API', async () => {
    await render(base);
    expect(api.analytics).toHaveBeenLastCalledWith('30d');
    const btn = [...container.querySelectorAll('button.chip')].find((b) => b.textContent === '7 dias');
    await act(async () => { btn.click(); });
    expect(api.analytics).toHaveBeenLastCalledWith('7d');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('erro da API mostra mensagem em vez de tela em branco', async () => {
    api.analytics.mockRejectedValue(new Error('falhou'));
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => { createRoot(container).render(<MemoryRouter><Analytics /></MemoryRouter>); });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
