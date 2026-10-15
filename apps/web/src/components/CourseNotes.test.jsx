// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({ api: { notes: vi.fn() } }));
import { api } from '../lib/api.js';
import { CourseNotes } from './CourseNotes.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><CourseNotes courseId={7} /></MemoryRouter>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const note = (id, title, extra = {}) => ({ id, title, excerpt: '', tags: [], updatedAt: '2026-03-10T10:00:00.000Z', ...extra });
beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

describe('CourseNotes', () => {
  it('busca só as anotações do curso e mostra as mais recentes com link', async () => {
    api.notes.mockResolvedValue([note(1, 'Primeira'), note(2, '', { excerpt: 'Só texto' })]);
    await mount();
    expect(api.notes).toHaveBeenCalledWith({ courseId: 7 });
    expect(container.querySelector('a[href="/anotacoes/1"]').textContent).toContain('Primeira');
    expect(container.querySelector('a[href="/anotacoes/2"]').textContent).toContain('Só texto');
    expect(container.querySelector('a[href="/anotacoes/nova?curso=7"]')).not.toBeNull();
  });

  it('sem anotações, convida a escrever a primeira (já ligada ao curso)', async () => {
    api.notes.mockResolvedValue([]);
    await mount();
    expect(container.textContent).toContain('Nenhuma anotação neste curso ainda');
    expect(container.querySelector('a[href="/anotacoes/nova?curso=7"]')).not.toBeNull();
  });

  it('mostra 5 e oferece "ver todas" quando há mais', async () => {
    api.notes.mockResolvedValue(Array.from({ length: 8 }, (_, i) => note(i + 1, `N${i + 1}`)));
    await mount();
    expect(container.querySelectorAll('a[href^="/anotacoes/"]:not([href*="nova"]):not([href$="curso=7"])').length).toBeGreaterThanOrEqual(5);
    expect(container.querySelectorAll('li')).toHaveLength(5);
    expect(container.querySelector('a[href="/anotacoes?curso=7"]').textContent).toContain('Ver todas (8)');
  });

  it('se não conseguir carregar, avisa sem derrubar a página do curso', async () => {
    api.notes.mockRejectedValue(new Error('falhou'));
    await mount();
    expect(container.textContent).toContain('Não foi possível carregar as anotações');
    expect(container.querySelector('a[href="/anotacoes/nova?curso=7"]')).not.toBeNull();
  });
});
