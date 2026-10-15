// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({
  api: { dashboard: vi.fn(), calendarStatus: vi.fn(), calendarUpcoming: vi.fn(), notionStatus: vi.fn(), calendarEvents: vi.fn(), calendarSync: vi.fn(), notionSync: vi.fn(), activeSession: vi.fn(), calendarMissed: vi.fn(), courses: vi.fn(), createNote: vi.fn() },
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
  api.activeSession.mockResolvedValue(null);
  api.calendarMissed.mockResolvedValue([]);
  api.courses.mockResolvedValue([{ id: 5, title: 'Cyber Security' }]);
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

describe('Início · ferramentas rápidas', () => {
  const headings = () => [...container.querySelectorAll('section[aria-label]')].map((x) => x.getAttribute('aria-label'));
  const course = { id: 5, title: 'Cyber Security', progress: 10, imageUrl: null };
  const missed = [{ kind: 'plan', key: 'plan-1-x', planId: 1, onceId: null, date: '2026-03-10', startTime: '20:00', durationMin: 45, courseId: 5, courseTitle: 'Cyber Security' }];

  it('mostra, depois da próxima ação e do resumo: atrasado, foco rápido, agenda e anotação rápida (nessa ordem)', async () => {
    api.dashboard.mockResolvedValue({ ...dash(course), week: { studiedMinutes: 0, previousMinutes: 0, deltaPercent: null, chart: [{ date: '2026-03-11', label: 'Qua', minutes: 0 }] } });
    api.calendarMissed.mockResolvedValue(missed);
    await mount();
    const h = headings();
    const order = ['Próxima ação', 'Resumo da semana', 'Blocos de estudo perdidos', 'Foco rápido', 'Google Agenda', 'Anotação rápida', 'Horas por dia'].map((n) => h.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('sem blocos perdidos, o aviso não aparece', async () => {
    api.dashboard.mockResolvedValue(dash(course));
    await mount();
    expect(headings()).not.toContain('Blocos de estudo perdidos');
    expect(headings()).toContain('Foco rápido');
  });

  it('falha parcial: se as buscas dos cartões novos falham, o resto do Início continua inteiro', async () => {
    api.dashboard.mockResolvedValue(dash(course));
    api.activeSession.mockRejectedValue(new Error('x'));
    api.calendarMissed.mockRejectedValue(new Error('y'));
    api.courses.mockRejectedValue(new Error('z'));
    api.calendarUpcoming.mockRejectedValue(new Error('w'));
    await mount();
    expect(container.querySelector('.hero')).not.toBeNull();
    expect(headings()).toContain('Foco rápido');
    expect(headings()).toContain('Anotação rápida');
    expect(container.textContent).not.toContain('Algo deu errado');
  });

  it('falha ao desenhar um cartão novo não derruba a página', async () => {
    api.dashboard.mockResolvedValue(dash(course));
    api.activeSession.mockResolvedValue({ get courseTitle() { throw new Error('estragou'); } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount();
    spy.mockRestore();
    expect(container.querySelector('.hero')).not.toBeNull();
    expect(headings()).toContain('Anotação rápida');
  });
});

describe('Início · aviso de versão nova', () => {
  it('mostra o cartão quando o app de desktop informa versão nova, antes do resto', async () => {
    api.dashboard.mockResolvedValue(dash({ id: 5, title: 'Cyber Security', progress: 10, imageUrl: null }));
    window.lcDesktop = { isDesktop: true, updateState: vi.fn().mockResolvedValue({ status: 'available', current: '0.1.1', platform: 'win32', version: '0.2.0', notes: '', pageUrl: 'https://github.com/ysauron2/learning-center/releases/tag/v0.2.0' }), installUpdate: vi.fn() };
    try {
      await mount();
      expect(container.textContent).toContain('Lume 0.2.0 disponível');
      const html = container.innerHTML;
      expect(html.indexOf('update-card')).toBeLessThan(html.indexOf('hero'));
    } finally {
      delete window.lcDesktop;
    }
  });
});
