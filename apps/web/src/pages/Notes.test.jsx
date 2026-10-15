// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({
  api: {
    notes: vi.fn(), noteTags: vi.fn(), courses: vi.fn(), note: vi.fn(), course: vi.fn(),
    createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
  },
}));
import { api } from '../lib/api.js';
import Notes from './Notes.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const COURSES = [{ id: 3, title: 'Redes' }, { id: 4, title: 'Linux' }];
const LIST = [
  { id: 1, title: 'Modelo OSI', excerpt: 'Sete camadas', courseId: 3, courseTitle: 'Redes', lessonId: null, tags: ['redes'], updatedAt: '2026-03-10T10:00:00.000Z' },
  { id: 2, title: '', excerpt: 'Comandos básicos', courseId: null, courseTitle: null, lessonId: null, tags: [], updatedAt: '2026-03-09T10:00:00.000Z' },
];
const FULL = { id: 1, title: 'Modelo OSI', body: '# Camadas\n\nSete **camadas**', courseId: 3, courseTitle: 'Redes', lessonId: null, tags: ['redes'], updatedAt: 'x', createdAt: 'x' };
const COURSE_DETAIL = { id: 3, title: 'Redes', modules: [{ title: 'M1', lessons: [{ id: 10, title: 'Intro' }] }] };

let container;
let where;
function Spy() { where = useLocation(); return null; }
async function mount(path = '/anotacoes') {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MemoryRouter initialEntries={[path]}>
        <Spy />
        <Routes><Route path="/anotacoes/:id?" element={<Notes />} /></Routes>
      </MemoryRouter>,
    );
  });
  await tick(0);
}
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const q = (sel) => container.querySelector(sel);
const btn = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const setValue = async (el, value) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  vi.clearAllMocks();
  api.notes.mockResolvedValue(LIST);
  api.noteTags.mockResolvedValue([{ tag: 'redes', count: 1 }]);
  api.courses.mockResolvedValue(COURSES);
  api.note.mockResolvedValue(FULL);
  api.course.mockResolvedValue(COURSE_DETAIL);
  api.updateNote.mockResolvedValue({ ...FULL });
  api.createNote.mockResolvedValue({ ...FULL, id: 9 });
  api.deleteNote.mockResolvedValue(null);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Anotações · lista', () => {
  it('mostra as anotações com trecho, curso e tags; sem título usa o trecho', async () => {
    await mount();
    const items = [...container.querySelectorAll('.note-item')];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Modelo OSI');
    expect(items[0].textContent).toContain('Sete camadas');
    expect(items[0].textContent).toContain('Redes');
    expect(items[0].textContent).toContain('redes');
    expect(items[1].querySelector('strong').textContent).toBe('Comandos básicos');
    expect(api.notes).toHaveBeenCalledWith({ q: '', courseId: '', tag: '' });
  });

  it('sem anotações convida a escrever a primeira; com filtro e sem resultado, avisa', async () => {
    api.notes.mockResolvedValue([]);
    await mount();
    expect(container.textContent).toContain('Nenhuma anotação ainda');
    expect(container.querySelector('a[href="/anotacoes/nova"]')).not.toBeNull();
    await setValue(q('.search input'), 'xyz');
    await tick(400);
    expect(container.textContent).toContain('Nenhuma anotação encontrada com esses filtros');
  });

  it('a busca espera a pessoa parar de digitar e pesquisa pelo texto', async () => {
    await mount();
    api.notes.mockClear();
    await setValue(q('.search input'), 'osi');
    await tick(100);
    expect(api.notes).not.toHaveBeenCalled();
    await tick(300);
    expect(api.notes).toHaveBeenLastCalledWith({ q: 'osi', courseId: '', tag: '' });
  });

  it('filtra por curso e por tag (clicar de novo na tag tira o filtro)', async () => {
    await mount();
    await setValue(q('#nf-course'), '3');
    await tick(10);
    expect(api.notes).toHaveBeenLastCalledWith({ q: '', courseId: '3', tag: '' });
    await act(async () => { btn('redes · 1').click(); });
    await tick(10);
    expect(api.notes).toHaveBeenLastCalledWith({ q: '', courseId: '3', tag: 'redes' });
    await act(async () => { btn('redes · 1').click(); });
    await tick(10);
    expect(api.notes).toHaveBeenLastCalledWith({ q: '', courseId: '3', tag: '' });
  });

  it('?curso=ID na lista já abre filtrada por aquele curso', async () => {
    await mount('/anotacoes?curso=4');
    expect(api.notes).toHaveBeenCalledWith({ q: '', courseId: '4', tag: '' });
    expect(q('#nf-course').value).toBe('4');
  });

  it('erro ao carregar mostra aviso com botão para tentar de novo', async () => {
    api.notes.mockRejectedValue(new Error('falhou'));
    await mount();
    expect(q('[role="alert"]')).not.toBeNull();
  });
});

describe('Anotações · editor', () => {
  it('abrir uma anotação carrega título, texto, tags, curso e a lista de aulas do curso', async () => {
    await mount('/anotacoes/1');
    expect(api.note).toHaveBeenCalledWith(1);
    expect(q('#ne-title').value).toBe('Modelo OSI');
    expect(q('#ne-body').value).toContain('Sete **camadas**');
    expect(q('#ne-tags').value).toBe('redes');
    expect(q('#ne-course').value).toBe('3');
    expect(api.course).toHaveBeenCalledWith(3);
    expect([...q('#ne-lesson').options].map((o) => o.textContent)).toEqual(['Sem aula', 'M1 · Intro']);
    expect(container.textContent).toContain('Salvo');
    expect(q('.note-item[aria-current="true"]')).not.toBeNull();
  });

  it('salva sozinha 1,5 s depois de parar de digitar (uma vez só) e mostra o estado', async () => {
    await mount('/anotacoes/1');
    await setValue(q('#ne-body'), 'texto novo');
    expect(container.textContent).toContain('Alterações ainda não salvas');
    await tick(1000);
    expect(api.updateNote).not.toHaveBeenCalled();
    await tick(600);
    expect(api.updateNote).toHaveBeenCalledTimes(1);
    expect(api.updateNote).toHaveBeenCalledWith(1, { title: 'Modelo OSI', body: 'texto novo', tags: ['redes'], courseId: 3, lessonId: null });
    expect(container.textContent).toContain('Salvo');
    await tick(5000);
    expect(api.updateNote).toHaveBeenCalledTimes(1); // não salva à toa
  });

  it('continuar digitando adia o salvamento', async () => {
    await mount('/anotacoes/1');
    await setValue(q('#ne-body'), 'a');
    await tick(1000);
    await setValue(q('#ne-body'), 'ab');
    await tick(1000);
    expect(api.updateNote).not.toHaveBeenCalled();
    await tick(700);
    expect(api.updateNote).toHaveBeenCalledTimes(1);
    expect(api.updateNote.mock.calls[0][1].body).toBe('ab');
  });

  it('tags digitadas viram lista; trocar de curso limpa a aula escolhida', async () => {
    await mount('/anotacoes/1');
    await setValue(q('#ne-tags'), 'Redes, TCP , redes');
    await setValue(q('#ne-course'), '4');
    await tick(1700);
    expect(api.updateNote).toHaveBeenLastCalledWith(1, expect.objectContaining({ tags: ['redes', 'tcp'], courseId: 4, lessonId: null }));
  });

  it('Ctrl+S salva na hora', async () => {
    await mount('/anotacoes/1');
    await setValue(q('#ne-title'), 'Outro título');
    await act(async () => { q('.note-editor').dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })); });
    await tick(0);
    expect(api.updateNote).toHaveBeenCalledTimes(1);
  });

  it('falha ao salvar mostra o aviso e não perde o texto', async () => {
    api.updateNote.mockRejectedValue(Object.assign(new Error('fora do ar'), { details: [{ message: 'Escreva um título ou um texto.' }] }));
    await mount('/anotacoes/1');
    await setValue(q('#ne-body'), 'x');
    await tick(1700);
    expect(container.textContent).toContain('Não foi possível salvar');
    expect(q('[role="alert"]').textContent).toContain('Escreva um título ou um texto.');
    expect(q('#ne-body').value).toBe('x');
  });

  it('"Visualizar" mostra o Markdown formatado e sem executar HTML', async () => {
    await mount('/anotacoes/1');
    await setValue(q('#ne-body'), '# Olá\n\n**forte** <script>alert(1)</script>');
    await act(async () => { btn('Visualizar').click(); });
    expect(q('.note-preview h1').textContent).toBe('Olá');
    expect(q('.note-preview strong').textContent).toBe('forte');
    expect(q('.note-preview script')).toBeNull();
    await act(async () => { btn('Escrever').click(); });
    expect(q('#ne-body')).not.toBeNull();
  });

  it('apagar pede confirmação; ao confirmar, apaga e volta para a lista', async () => {
    await mount('/anotacoes/1');
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await act(async () => { btn('Apagar').click(); });
    expect(api.deleteNote).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    await act(async () => { btn('Apagar').click(); });
    await tick(0);
    expect(api.deleteNote).toHaveBeenCalledWith(1);
    expect(where.pathname).toBe('/anotacoes');
  });
});

describe('Anotações · nova', () => {
  it('abre em branco, já ligada ao curso quando vem de ?curso=', async () => {
    await mount('/anotacoes/nova?curso=3');
    expect(api.note).not.toHaveBeenCalled();
    expect(q('#ne-title').value).toBe('');
    expect(q('#ne-course').value).toBe('3');
    expect(container.textContent).toContain('Anotação nova (ainda não salva)');
    expect(btn('Criar anotação')).toBeDefined();
    expect(btn('Apagar')).toBeUndefined();
  });

  it('só cria ao clicar; depois abre a anotação criada', async () => {
    await mount('/anotacoes/nova?curso=3');
    await setValue(q('#ne-title'), 'Minha nota');
    await tick(3000);
    expect(api.createNote).not.toHaveBeenCalled(); // não cria sozinha
    await act(async () => { btn('Criar anotação').click(); });
    await tick(0);
    expect(api.createNote).toHaveBeenCalledWith({ title: 'Minha nota', body: '', tags: [], courseId: 3, lessonId: null });
    expect(where.pathname).toBe('/anotacoes/9');
    expect(api.note).toHaveBeenCalledWith(9);
  });

  it('anotação vazia: mostra a mensagem da API e continua na tela', async () => {
    api.createNote.mockRejectedValue(Object.assign(new Error('Dados inválidos.'), { details: [{ message: 'Escreva um título ou um texto.' }] }));
    await mount('/anotacoes/nova');
    await act(async () => { btn('Criar anotação').click(); });
    await tick(0);
    expect(q('[role="alert"]').textContent).toContain('Escreva um título ou um texto.');
    expect(where.pathname).toBe('/anotacoes/nova');
  });
});
