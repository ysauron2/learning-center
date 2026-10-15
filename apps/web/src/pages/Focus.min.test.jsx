// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({
  api: { activeSession: vi.fn(), startSession: vi.fn(), courses: vi.fn(), course: vi.fn(), weeklyGoal: vi.fn() },
}));
import { api } from '../lib/api.js';
import Focus from './Focus.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const session = (extra = {}) => ({ id: 1, courseId: 5, courseTitle: 'Cyber Security', lessonId: null, lessonTitle: null, kind: 'pomodoro', plannedMin: 25, elapsedSec: 0, running: true, ...extra });
let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(url) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter initialEntries={[url]}><Focus /></MemoryRouter>); });
  await flush();
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  api.activeSession.mockResolvedValue(null);
  api.courses.mockResolvedValue([]);
  api.course.mockResolvedValue({ modules: [] });
  api.startSession.mockImplementation(async (p) => session({ plannedMin: p.plannedMin }));
});

describe('Foco · ?min=', () => {
  it.each([15, 25, 45])('auto=1&min=%i inicia o pomodoro com esse tempo', async (min) => {
    await mount(`/foco?course=5&lesson=9&auto=1&min=${min}`);
    expect(api.startSession).toHaveBeenCalledWith({ courseId: 5, lessonId: 9, kind: 'pomodoro', plannedMin: min });
    expect(container.querySelector('[role="timer"]')).not.toBeNull();
  });

  it('valor fora de 15, 25 e 45 é ignorado (usa 25)', async () => {
    await mount('/foco?course=5&auto=1&min=7');
    expect(api.startSession).toHaveBeenCalledWith({ courseId: 5, lessonId: null, kind: 'pomodoro', plannedMin: 25 });
  });

  it('sem min mantém o comportamento de antes (25 min)', async () => {
    await mount('/foco?course=5&lesson=9&auto=1');
    expect(api.startSession).toHaveBeenCalledWith({ courseId: 5, lessonId: 9, kind: 'pomodoro', plannedMin: 25 });
  });

  it('foco livre: auto=1&min=15 sem curso inicia sem curso', async () => {
    await mount('/foco?auto=1&min=15');
    expect(api.startSession).toHaveBeenCalledWith({ courseId: null, lessonId: null, kind: 'pomodoro', plannedMin: 15 });
  });

  it('auto=1 sem curso e sem min não inicia sozinho (como antes)', async () => {
    await mount('/foco?auto=1');
    expect(api.startSession).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Nova sessão de foco');
  });

  it('se já existe sessão em andamento, retoma essa e não inicia outra', async () => {
    api.activeSession.mockResolvedValue(session({ plannedMin: 45 }));
    await mount('/foco?course=5&auto=1&min=15');
    expect(api.startSession).not.toHaveBeenCalled();
    expect(container.querySelector('[role="timer"]')).not.toBeNull();
  });

  it('erro ao iniciar mostra mensagem clara no formulário', async () => {
    api.startSession.mockRejectedValue(Object.assign(new Error('Curso inexistente.'), { code: 'INVALID_COURSE' }));
    await mount('/foco?course=5&auto=1&min=15');
    expect(container.querySelector('[role="alert"]').textContent).toContain('Curso inexistente.');
  });

  it('corrida: a API diz que já existe sessão e a tela adota a sessão existente', async () => {
    api.startSession.mockRejectedValue(Object.assign(new Error('Já existe uma sessão em andamento.'), { code: 'SESSION_ALREADY_ACTIVE', details: { session: session() } }));
    await mount('/foco?course=5&auto=1&min=15');
    expect(container.querySelector('[role="timer"]')).not.toBeNull();
  });
});
