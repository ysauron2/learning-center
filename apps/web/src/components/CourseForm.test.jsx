// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('../lib/api.js', () => ({ api: { options: vi.fn(), createCourse: vi.fn(), updateCourse: vi.fn() } }));
import { api } from '../lib/api.js';
import { CourseForm } from './CourseForm.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(props = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<CourseForm onClose={() => {}} onSaved={props.onSaved ?? (() => {})} {...props} />); });
  await flush();
}
const q = (sel) => document.body.querySelector(sel);
const setSelect = async (id, value) => {
  const el = q(`#${id}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const setInput = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const submit = async () => { await act(async () => { q('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  api.options.mockResolvedValue({
    platforms: ['Udemy', 'Alura', 'Hotmart', 'Outro'].map((name) => ({ name, count: 0, protected: name === 'Outro' })),
    categories: ['Cibersegurança', 'Design', 'Redes', 'Geral'].map((name) => ({ name, count: 0, protected: name === 'Geral' })),
  });
  api.createCourse.mockResolvedValue({ id: 1 });
  api.updateCourse.mockResolvedValue({ id: 1 });
});

const opts = (id) => [...q(`#${id}`).options].map((o) => o.textContent);

describe('CourseForm · plataforma e categoria', () => {
  it('oferece as sugestões padrão, o que já foi usado e a opção de criar nova', async () => {
    await mount();
    expect(opts('cf-platform')).toContain('Udemy');
    expect(opts('cf-platform')).toContain('Hotmart'); // já usada em outro curso
    expect(opts('cf-platform').at(-1)).toBe('➕ Outra plataforma…');
    expect(opts('cf-category')).toContain('Design');
    expect(opts('cf-category').at(-1)).toBe('➕ Nova categoria…');
    expect(opts('cf-category').filter((o) => o === 'Redes')).toHaveLength(1); // sem repetir
  });

  it('cria o curso com plataforma e categoria novas digitadas pela pessoa', async () => {
    await mount();
    await setInput(q('#cf-title'), 'Ilustração Digital');
    await setSelect('cf-platform', '__new__');
    await setInput(q('input[aria-label="Plataforma (nova)"]'), 'Domestika');
    await setSelect('cf-category', '__new__');
    await setInput(q('input[aria-label="Categoria (nova)"]'), 'Arte');
    await submit();
    expect(api.createCourse).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ilustração Digital', platform: 'Domestika', category: 'Arte' }));
  });

  it('escolher uma já existente envia o nome dela', async () => {
    await mount();
    await setInput(q('#cf-title'), 'X');
    await setSelect('cf-platform', 'Hotmart');
    await setSelect('cf-category', 'Design');
    await submit();
    expect(api.createCourse).toHaveBeenCalledWith(expect.objectContaining({ platform: 'Hotmart', category: 'Design' }));
  });

  it('"Outra…" deixada em branco cai nos valores padrão, em vez de dar erro', async () => {
    await mount();
    await setInput(q('#cf-title'), 'X');
    await setSelect('cf-platform', '__new__');
    await setSelect('cf-category', '__new__');
    await submit();
    expect(api.createCourse).toHaveBeenCalledWith(expect.objectContaining({ platform: 'Outro', category: 'Geral' }));
  });

  it('ao editar, a plataforma/categoria personalizada do curso já vem selecionada', async () => {
    await mount({ course: { id: 5, title: 'Curso', platform: 'Plataforma Rara', category: 'Categoria Rara', status: 'active', tags: [], manualProgress: 0, totalLessons: 0, url: null, imageUrl: null, description: '' } });
    expect(q('#cf-platform').value).toBe('Plataforma Rara');
    expect(q('#cf-category').value).toBe('Categoria Rara');
    await submit();
    expect(api.updateCourse).toHaveBeenCalledWith(5, expect.objectContaining({ platform: 'Plataforma Rara', category: 'Categoria Rara' }));
  });
});
