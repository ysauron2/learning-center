// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({
  api: { dashboard: vi.fn(), calendarStatus: vi.fn(), calendarUpcoming: vi.fn(), notionStatus: vi.fn(), calendarEvents: vi.fn(), calendarSync: vi.fn(), notionSync: vi.fn() },
}));
import { api } from '../lib/api.js';
import Dashboard from './Dashboard.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dash = (course) => ({
  generatedAt: new Date().toISOString(),
  week: { studiedMinutes: 0, previousMinutes: 0, deltaPercent: null, chart: [] },
  goal: { targetMinutes: 480, studiedMinutes: 0, remainingMinutes: 480, percent: 0 },
  streakDays: 0,
  activeCourses: 1,
  recentSessions: [],
  nextAction: { type: 'next_lesson', course, lesson: { id: 1, title: 'Introdução', durationMin: 6 } },
});

let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><Dashboard /></MemoryRouter>); });
  await flush();
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  api.calendarStatus.mockResolvedValue({ configured: false, connected: false });
  api.calendarUpcoming.mockResolvedValue([]);
  api.notionStatus.mockResolvedValue(null);
});

describe('Início · capa do curso na próxima ação', () => {
  it('mostra a capa do curso quando existe', async () => {
    api.dashboard.mockResolvedValue(dash({ id: 5, title: 'Cyber Security', progress: 10, imageUrl: 'https://img-c.udemycdn.com/course/480x270/1_a.jpg' }));
    await mount();
    const art = container.querySelector('.hero-art');
    expect(art.getAttribute('aria-label')).toBe('Capa do curso Cyber Security');
    const img = art.querySelector('img');
    expect(img.getAttribute('src')).toBe('https://img-c.udemycdn.com/course/480x270/1_a.jpg');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('sem capa (ou se a imagem falhar) fica o degradê, sem imagem quebrada', async () => {
    api.dashboard.mockResolvedValue(dash({ id: 5, title: 'Cyber Security', progress: 10, imageUrl: null }));
    await mount();
    expect(container.querySelector('.hero-art img')).toBeNull();
    expect(container.querySelector('.hero-art')).not.toBeNull();
  });

  it('se a imagem não carregar, volta para o degradê', async () => {
    api.dashboard.mockResolvedValue(dash({ id: 5, title: 'Cyber Security', progress: 10, imageUrl: 'https://img-c.udemycdn.com/x.jpg' }));
    await mount();
    await act(async () => { container.querySelector('.hero-art img').dispatchEvent(new Event('error')); });
    expect(container.querySelector('.hero-art img')).toBeNull();
  });
});
