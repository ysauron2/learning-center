// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({ api: { importPreview: vi.fn(), importCourses: vi.fn(), options: vi.fn().mockResolvedValue({ categories: ['Cibersegurança', 'Design', 'Geral'].map((name) => ({ name, count: 0, protected: false })), platforms: [] }) } }));
import { api } from '../lib/api.js';
import ImportUdemy from './ImportUdemy.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const items = [{ title: 'A', url: 'https://www.udemy.com/course/a/', progress: 5, imageUrl: 'https://img-c.udemycdn.com/a.jpg' }];
let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mountAndReceive(preview) {
  api.importPreview.mockResolvedValue(preview);
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><ImportUdemy /></MemoryRouter>); });
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-import', items }, origin: 'https://www.udemy.com' }));
  });
  await flush();
}
const confirmBtn = () => [...container.querySelectorAll('button.btn-primary')][0];

beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

describe('página Importar da Udemy · botão de confirmar', () => {
  it('com 0 cursos novos mas capas a preencher, o botão fica liberado e diz o que fará', async () => {
    await mountAndReceive({ new: [], existing: [{}, {}, {}, {}, {}], invalid: [], imagesToFill: 5 });
    expect(confirmBtn().disabled).toBe(false);
    expect(confirmBtn().textContent).toBe('Preencher 5 capa(s)');
    expect(container.textContent).toContain('5 capa(s) serão preenchidas');
  });

  it('clicar envia a lista e mostra o resultado com as capas preenchidas', async () => {
    api.importCourses.mockResolvedValue({ created: 0, skipped: 5, invalid: 0, imagesFilled: 5, ids: [] });
    await mountAndReceive({ new: [], existing: [{}], invalid: [], imagesToFill: 5 });
    await act(async () => { confirmBtn().click(); });
    await flush();
    expect(api.importCourses).toHaveBeenCalledWith(items, 'Geral');
    expect(container.textContent).toContain('5 capa(s) preenchida(s)');
  });

  it('sem nada novo e sem capas, o botão fica bloqueado', async () => {
    await mountAndReceive({ new: [], existing: [{}], invalid: [], imagesToFill: 0 });
    expect(confirmBtn().disabled).toBe(true);
    expect(confirmBtn().textContent).toBe('Nada a importar');
  });

  it('com cursos novos, permite escolher a categoria (existente ou nova) e envia junto', async () => {
    api.importCourses.mockResolvedValue({ created: 1, skipped: 0, invalid: 0, ids: [] });
    await mountAndReceive({ new: [{ title: 'A', url: 'u', progress: 5, hasImage: true }], existing: [], invalid: [], imagesToFill: 0 });
    const sel = container.querySelector('#imp-category');
    expect(sel.value).toBe('Geral');
    expect([...sel.options].map((o) => o.textContent)).toEqual(expect.arrayContaining(['Cibersegurança', 'Design', '➕ Nova categoria…']));
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, '__new__');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const input = container.querySelector('input[aria-label="Categoria dos cursos novos (nova)"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Arte');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { confirmBtn().click(); });
    await flush();
    expect(api.importCourses).toHaveBeenCalledWith(items, 'Arte');
  });

  it('sem cursos novos não mostra o seletor de categoria', async () => {
    await mountAndReceive({ new: [], existing: [{}], invalid: [], imagesToFill: 2 });
    expect(container.querySelector('#imp-category')).toBeNull();
  });

  it('com cursos novos mostra o botão de importar', async () => {
    await mountAndReceive({ new: [{ title: 'A', url: 'u', progress: 5, hasImage: true }], existing: [], invalid: [], imagesToFill: 0 });
    expect(confirmBtn().disabled).toBe(false);
    expect(confirmBtn().textContent).toBe('Importar 1 curso(s)');
  });
});
