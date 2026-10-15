// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({ api: { activeSession: vi.fn(), calendarUpcoming: vi.fn(), courses: vi.fn() } }));
import { api } from '../lib/api.js';
import { QuickFocus, pickQuickCourse, focusHref } from './QuickFocus.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const next = { type: 'next_lesson', course: { id: 5, title: 'Cyber Security', progress: 10 }, lesson: { id: 9, title: 'Invasores' } };
let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}{l.search}</div>;
}
async function mount(props = { nextAction: next }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<QuickFocus {...props} />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flush();
}
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })); });
const link = (text) => [...container.querySelectorAll('a')].find((a) => a.textContent.includes(text));
const btn = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text));

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  api.activeSession.mockResolvedValue(null);
  api.calendarUpcoming.mockResolvedValue([]);
  api.courses.mockResolvedValue([{ id: 5, title: 'Cyber Security' }, { id: 7, title: 'Redes' }]);
});

describe('pickQuickCourse', () => {
  const now = new Date('2026-03-11T20:10:00');
  const block = (extra) => ({ kind: 'plan', courseId: 7, courseTitle: 'Redes', lessonTitle: 'Camadas', start: '2026-03-11T20:00:00', end: '2026-03-11T20:45:00', ...extra });
  it('prefere o bloco de estudo que está acontecendo agora', () => {
    expect(pickQuickCourse({ upcoming: [block()], nextAction: next, now })).toMatchObject({ courseId: 7, title: 'Redes', lessonTitle: 'Camadas', source: 'block' });
  });
  it('ignora bloco que já passou, que vem depois ou sem curso, e usa a próxima ação', () => {
    const list = [block({ end: '2026-03-11T20:05:00' }), block({ start: '2026-03-11T21:00:00', end: '2026-03-11T21:30:00' }), block({ courseId: null })];
    expect(pickQuickCourse({ upcoming: list, nextAction: next, now })).toMatchObject({ courseId: 5, lessonId: 9, source: 'next' });
  });
  it('sem nada disso, é foco livre', () => {
    expect(pickQuickCourse({ nextAction: { type: 'add_course' }, now })).toMatchObject({ courseId: null, source: 'free' });
  });
  it('monta o endereço da tela de foco', () => {
    expect(focusHref({ courseId: 5, lessonId: 9, min: 15 })).toBe('/foco?course=5&lesson=9&auto=1&min=15');
    expect(focusHref({ courseId: null, min: 45 })).toBe('/foco?auto=1&min=45');
  });
});

describe('QuickFocus', () => {
  it('mostra a pergunta, os três tempos e o curso que será usado', async () => {
    await mount();
    expect(container.textContent).toContain('Quanto tempo você tem agora?');
    expect(['15 min', '25 min', '45 min'].every((t) => link(t))).toBe(true);
    expect(container.textContent).toContain('Cyber Security · Aula: Invasores');
  });

  it('um clique leva para o foco já iniciando no curso, com o tempo escolhido', async () => {
    await mount();
    await click(link('45 min'));
    expect(container.querySelector('[data-testid="where"]').textContent).toBe('/foco?course=5&lesson=9&auto=1&min=45');
  });

  it('usa o bloco de estudo de agora quando existe', async () => {
    const start = new Date(Date.now() - 10 * 60000).toISOString();
    const end = new Date(Date.now() + 30 * 60000).toISOString();
    api.calendarUpcoming.mockResolvedValue([{ kind: 'plan', courseId: 7, courseTitle: 'Redes', lessonTitle: null, start, end }]);
    await mount();
    expect(container.textContent).toContain('Redes');
    await click(link('15 min'));
    expect(container.querySelector('[data-testid="where"]').textContent).toBe('/foco?course=7&auto=1&min=15');
  });

  it('sem curso nenhum, oferece foco livre', async () => {
    await mount({ nextAction: { type: 'add_course' } });
    expect(container.textContent).toContain('Foco livre (sem curso)');
    await click(link('25 min'));
    expect(container.querySelector('[data-testid="where"]').textContent).toBe('/foco?auto=1&min=25');
  });

  it('permite trocar o curso por uma lista de cursos ativos', async () => {
    await mount();
    expect(api.courses).not.toHaveBeenCalled(); // só carrega a lista quando a pessoa pede
    await click(btn('Trocar curso'));
    await flush();
    expect(api.courses).toHaveBeenCalledWith({ status: 'active' });
    const select = container.querySelector('#quick-focus-course');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '7');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Redes');
    await click(link('25 min'));
    expect(container.querySelector('[data-testid="where"]').textContent).toBe('/foco?course=7&auto=1&min=25');
  });

  it('com sessão em andamento, não oferece iniciar outra: só voltar para ela', async () => {
    api.activeSession.mockResolvedValue({ id: 1, courseTitle: 'Redes' });
    await mount();
    expect(container.textContent).toContain('Você tem uma sessão em andamento');
    expect(link('15 min')).toBeUndefined();
    expect(link('Voltar para a sessão').getAttribute('href')).toBe('/foco');
  });

  it('se não conseguir ver a sessão ou a agenda, o cartão continua funcionando', async () => {
    api.activeSession.mockRejectedValue(new Error('x'));
    api.calendarUpcoming.mockRejectedValue(new Error('y'));
    await mount();
    expect(link('25 min')).toBeDefined();
    expect(container.textContent).toContain('Cyber Security');
  });

  it('mostra um esqueleto enquanto carrega', async () => {
    api.activeSession.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
