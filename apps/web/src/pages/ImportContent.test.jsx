// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({
  api: { courses: vi.fn(), importContentPreview: vi.fn(), importContent: vi.fn() },
}));
import { api } from '../lib/api.js';
import ImportContent from './ImportContent.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const courses = [
  { id: 1, title: 'Outro Curso', url: null },
  { id: 2, title: 'Python Completo', url: 'https://www.udemy.com/course/python-completo/' },
];
const content = {
  title: 'Python Completo', url: 'https://www.udemy.com/course/python-completo/',
  modules: [{ title: 'Seção 1', lessons: [{ title: 'A', durationMin: 5, completed: true }, { title: 'B', durationMin: 5, completed: false }] }],
};
const previewData = { modulesCreated: 1, modulesExisting: 0, lessonsCreated: 2, lessonsExisting: 0, lessonsCompleted: 1, after: { total: 2, done: 1, progress: 50 } };

let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><ImportContent /></MemoryRouter>); });
  await flush();
}
const send = async (data, over = {}) => {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data, source: window, origin: window.location.origin, ...over }));
  });
  await flush();
};
const msg = { type: 'lc-content-ext', content };

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  api.courses.mockResolvedValue(courses);
  api.importContentPreview.mockResolvedValue(previewData);
  api.importContent.mockResolvedValue({ ...previewData });
});

describe('página Importar conteúdo', () => {
  it('sem nada recebido mostra o passo a passo', async () => {
    await mount();
    expect(container.textContent).toContain('Como importar (um clique por curso)');
    expect(container.querySelector('#dest')).toBeNull();
  });

  it('recebe o conteúdo, sugere o curso certo e mostra a prévia', async () => {
    await mount();
    await send(msg);
    expect(container.querySelector('#dest').value).toBe('2');
    expect(api.importContentPreview).toHaveBeenCalledWith(2, content.modules);
    expect(container.textContent).toContain('Vai criar 1 módulo(s) e 2 aula(s)');
    expect(container.textContent).toContain('1 de 2 aulas concluídas (50%)');
  });

  it('ignora mensagem de outra origem', async () => {
    await mount();
    await send(msg, { origin: 'https://evil.com' });
    expect(container.querySelector('#dest')).toBeNull();
    expect(api.importContentPreview).not.toHaveBeenCalled();
  });

  it('sem curso adivinhado, pede para escolher e só libera o botão depois', async () => {
    await mount();
    await send({ type: 'lc-content-ext', content: { ...content, title: 'Culinária Francesa', url: '' } });
    expect(container.textContent).toContain('Escolha na lista');
    const btn = () => [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Importar conteúdo'));
    expect(btn().disabled).toBe(true);
    const select = container.querySelector('#dest');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, '1');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(api.importContentPreview).toHaveBeenCalledWith(1, content.modules);
    expect(btn().disabled).toBe(false);
  });

  it('confirmar grava e mostra o resultado com link para o curso', async () => {
    await mount();
    await send(msg);
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Importar conteúdo'));
    await act(async () => { btn.click(); });
    await flush();
    expect(api.importContent).toHaveBeenCalledWith(2, content.modules);
    expect(container.textContent).toContain('Pronto!');
    expect(container.querySelector('a[href="/cursos/2"]')).not.toBeNull();
  });

  it('quando já está tudo no curso, avisa e não deixa importar', async () => {
    api.importContentPreview.mockResolvedValue({ ...previewData, modulesCreated: 0, lessonsCreated: 0, lessonsCompleted: 0, lessonsExisting: 2 });
    await mount();
    await send(msg);
    expect(container.textContent).toContain('Nada de novo');
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Importar conteúdo'));
    expect(btn.disabled).toBe(true);
  });

  it('erro da API aparece na tela', async () => {
    api.importContentPreview.mockRejectedValue(new Error('falhou'));
    await mount();
    await send(msg);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
