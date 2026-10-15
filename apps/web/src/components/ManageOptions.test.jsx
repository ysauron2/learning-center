// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('../lib/api.js', () => ({ api: { options: vi.fn(), createOption: vi.fn(), renameOption: vi.fn(), deleteOption: vi.fn() } }));
import { api } from '../lib/api.js';
import { ManageOptions } from './ManageOptions.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DATA = () => ({
  categories: [
    { name: 'Design', count: 2, protected: false },
    { name: 'Geral', count: 1, protected: true },
    { name: 'Redes', count: 0, protected: false },
  ],
  platforms: [
    { name: 'Alura', count: 3, protected: false },
    { name: 'Outro', count: 0, protected: true },
  ],
});

let container;
let onChanged;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount() {
  onChanged = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<ManageOptions onClose={() => {}} onChanged={onChanged} />); });
  await flush();
}
const q = (sel) => document.body.querySelector(sel);
const rows = () => [...document.body.querySelectorAll('.opt-row')];
const btn = (text, root = document.body) => [...root.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const setValue = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  api.options.mockResolvedValue(DATA());
});

describe('ManageOptions', () => {
  it('lista as categorias com a contagem de cursos e marca a padrão', async () => {
    await mount();
    expect(rows().map((r) => r.querySelector('.opt-name').textContent)).toEqual(['Design', 'Geral', 'Redes']);
    expect(rows()[0].textContent).toContain('2 cursos');
    expect(rows()[1].textContent).toContain('1 curso');
    expect(rows()[1].textContent).toContain('padrão');
    expect(rows()[2].textContent).toContain('nenhum curso');
    expect(btn('Excluir', rows()[1]).disabled).toBe(true);
    expect(btn('Renomear', rows()[1]).disabled).toBe(true);
    expect(btn('Excluir', rows()[0]).disabled).toBe(false);
  });

  it('a aba Plataformas mostra as plataformas', async () => {
    await mount();
    await act(async () => { btn('Plataformas').click(); });
    expect(rows().map((r) => r.querySelector('.opt-name').textContent)).toEqual(['Alura', 'Outro']);
  });

  it('excluir pede confirmação dizendo para onde os cursos vão, e avisa o resultado', async () => {
    api.deleteOption.mockResolvedValue({ moved: 2, movedTo: 'Geral' });
    await mount();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await act(async () => { btn('Excluir', rows()[0]).click(); });
    expect(confirm.mock.calls[0][0]).toContain('"Design"');
    expect(confirm.mock.calls[0][0]).toContain('2 cursos');
    expect(confirm.mock.calls[0][0]).toContain('"Geral"');
    expect(api.deleteOption).not.toHaveBeenCalled();

    api.options.mockResolvedValue({ ...DATA(), categories: DATA().categories.slice(1) });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    await act(async () => { btn('Excluir', rows()[0]).click(); });
    await flush();
    expect(api.deleteOption).toHaveBeenCalledWith('categories', 'Design');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(q('[role="status"]').textContent).toContain('Categoria "Design" excluída');
    expect(q('[role="status"]').textContent).toContain('2 cursos foram para "Geral"');
    expect(rows().map((r) => r.querySelector('.opt-name').textContent)).toEqual(['Geral', 'Redes']);
  });

  it('excluir uma sem cursos usa uma confirmação simples', async () => {
    api.deleteOption.mockResolvedValue({ moved: 0, movedTo: 'Geral' });
    await mount();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    await act(async () => { btn('Excluir', rows()[2]).click(); });
    await flush();
    expect(confirm.mock.calls[0][0]).toBe('Excluir a categoria "Redes"?');
    expect(api.deleteOption).toHaveBeenCalledWith('categories', 'Redes');
  });

  it('excluir plataforma usa "plataforma" e manda os cursos para "Outro"', async () => {
    api.deleteOption.mockResolvedValue({ moved: 3, movedTo: 'Outro' });
    await mount();
    await act(async () => { btn('Plataformas').click(); });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    await act(async () => { btn('Excluir', rows()[0]).click(); });
    await flush();
    expect(confirm.mock.calls[0][0]).toContain('plataforma "Alura"');
    expect(confirm.mock.calls[0][0]).toContain('"Outro"');
    expect(api.deleteOption).toHaveBeenCalledWith('platforms', 'Alura');
  });

  it('renomear: abre um campo com o nome atual, salva e avisa se juntou com outra', async () => {
    api.renameOption.mockResolvedValue({ name: 'Redes', moved: 2, merged: true });
    await mount();
    await act(async () => { btn('Renomear', rows()[0]).click(); });
    const input = q('input[aria-label="Novo nome de Design"]');
    expect(input.value).toBe('Design');
    await setValue(input, 'redes');
    await act(async () => { btn('Salvar', rows()[0]).click(); });
    await flush();
    expect(api.renameOption).toHaveBeenCalledWith('categories', 'Design', 'redes');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(q('[role="status"]').textContent).toContain('juntada com "Redes"');
  });

  it('cancelar a renomeação fecha o campo sem chamar a API', async () => {
    await mount();
    await act(async () => { btn('Renomear', rows()[0]).click(); });
    await act(async () => { btn('Cancelar', rows()[0]).click(); });
    expect(q('input[aria-label="Novo nome de Design"]')).toBeNull();
    expect(api.renameOption).not.toHaveBeenCalled();
  });

  it('adicionar cria a opção; nome que já existia avisa em vez de duplicar', async () => {
    api.createOption.mockResolvedValueOnce({ name: 'Arte', created: true }).mockResolvedValueOnce({ name: 'Design', created: false });
    await mount();
    const form = q('form[aria-label="Adicionar categoria"]');
    await setValue(form.querySelector('input'), 'Arte');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(api.createOption).toHaveBeenLastCalledWith('categories', 'Arte');
    expect(q('[role="status"]').textContent).toContain('Categoria "Arte" adicionada');
    expect(form.querySelector('input').value).toBe('');
    await setValue(form.querySelector('input'), 'design');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(q('[role="status"]').textContent).toContain('já existe');
  });

  it('erro da API aparece na tela', async () => {
    api.deleteOption.mockRejectedValue(new Error('A categoria "Geral" é a padrão.'));
    await mount();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => { btn('Excluir', rows()[0]).click(); });
    await flush();
    expect(q('[role="alert"]').textContent).toContain('é a padrão');
  });

  it('se não conseguir carregar a lista, mostra erro com tentar de novo', async () => {
    api.options.mockRejectedValue(new Error('falhou'));
    await mount();
    expect(q('[role="alert"]')).not.toBeNull();
  });
});
