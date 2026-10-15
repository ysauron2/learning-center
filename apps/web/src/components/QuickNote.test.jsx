// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({ api: { courses: vi.fn(), createNote: vi.fn() } }));
import { api } from '../lib/api.js';
import { QuickNote, autoTitle } from './QuickNote.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(props = { defaultCourseId: 5 }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><QuickNote {...props} /></MemoryRouter>); });
  await flush();
}
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })); });
const area = () => container.querySelector('#quick-note-text');
const save = () => [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Salvar anotação'));
const type = (v) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area(), v);
  area().dispatchEvent(new Event('input', { bubbles: true }));
});

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.clearAllMocks();
  api.courses.mockResolvedValue([{ id: 5, title: 'Cyber Security' }, { id: 7, title: 'Redes' }]);
  api.createNote.mockResolvedValue({ id: 42 });
});

describe('autoTitle', () => {
  it('usa a primeira linha limpa, com no máximo 80 caracteres', () => {
    expect(autoTitle('## **Aprendi** sobre `DNS`\nresto')).toBe('Aprendi sobre DNS');
    expect(autoTitle('\n\n- item um\n- item dois')).toBe('item um');
    const t = autoTitle('a'.repeat(200));
    expect(t.length).toBeLessThanOrEqual(80);
    expect(t.endsWith('…')).toBe(true);
  });
  it('sem texto aproveitável, usa "Anotação rápida · dd/mm"', () => {
    expect(autoTitle('###\n***', new Date('2026-03-09T10:00:00'))).toBe('Anotação rápida · 09/03');
  });
});

describe('QuickNote', () => {
  it('começa com o botão desabilitado e o curso da próxima ação escolhido', async () => {
    await mount();
    expect(container.textContent).toContain('O que você aprendeu hoje?');
    expect(save().disabled).toBe(true);
    expect(container.querySelector('#quick-note-course').value).toBe('5');
  });

  it('texto só com espaços continua desabilitado', async () => {
    await mount();
    await type('   \n  ');
    expect(save().disabled).toBe(true);
  });

  it('salva pelo módulo de anotações, limpa a caixa, mostra o link e devolve o foco ao campo', async () => {
    await mount();
    await type('# Redes\nAprendi o que é DNS');
    expect(save().disabled).toBe(false);
    await click(save());
    await flush();
    expect(api.createNote).toHaveBeenCalledWith({ title: 'Redes', body: '# Redes\nAprendi o que é DNS', courseId: 5 });
    expect(area().value).toBe('');
    expect(container.querySelector('[role="status"] a').getAttribute('href')).toBe('/anotacoes/42');
    expect(container.querySelector('[role="status"]').textContent).toContain('Anotação salva');
    expect(document.activeElement).toBe(area());
    expect(localStorage.getItem('lume-anotacao-rapida')).toBeNull();
  });

  it('permite escolher outro curso ou nenhum', async () => {
    await mount();
    const sel = container.querySelector('#quick-note-course');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, '');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await type('algo');
    await click(save());
    await flush();
    expect(api.createNote.mock.calls[0][0].courseId).toBeNull();
  });

  it('guarda o rascunho enquanto digita e o recupera ao voltar', async () => {
    await mount();
    await type('meio da frase');
    expect(localStorage.getItem('lume-anotacao-rapida')).toBe('meio da frase');
    document.body.innerHTML = '';
    await mount();
    expect(area().value).toBe('meio da frase');
  });

  it('mostra o erro da API e mantém o texto', async () => {
    api.createNote.mockRejectedValue(Object.assign(new Error('Texto grande demais.'), { status: 400 }));
    await mount();
    await type('minha anotação');
    await click(save());
    await flush();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Texto grande demais.');
    expect(area().value).toBe('minha anotação');
    expect(localStorage.getItem('lume-anotacao-rapida')).toBe('minha anotação');
  });

  it('respeita o limite de tamanho do módulo de anotações', async () => {
    await mount();
    expect(area().maxLength).toBe(100000);
  });

  it('funciona sem armazenamento local e sem a lista de cursos', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio'); });
    api.courses.mockRejectedValue(new Error('x'));
    await mount();
    await type('texto');
    await click(save());
    await flush();
    expect(api.createNote).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
