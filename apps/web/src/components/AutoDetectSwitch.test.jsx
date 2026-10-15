// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('../lib/api.js', () => ({ api: { autoDetect: vi.fn(), setAutoDetect: vi.fn() } }));
import { api } from '../lib/api.js';
import { AutoDetectSwitch } from './AutoDetectSwitch.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const radios = () => [...container.querySelectorAll('[role="radio"]')];
const checked = () => radios().find((r) => r.getAttribute('aria-checked') === 'true')?.textContent;

beforeEach(async () => {
  vi.clearAllMocks();
  api.autoDetect.mockResolvedValue({ mode: 'ask' });
  api.setAutoDetect.mockImplementation(async (mode) => ({ mode }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<AutoDetectSwitch />); });
  await flush();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('Marcar cursos automaticamente', () => {
  it('mostra as três opções em português, com "Perguntar" como padrão', () => {
    expect(container.textContent).toContain('Marcar cursos automaticamente');
    expect(radios().map((r) => r.textContent)).toEqual(['Perguntar', 'Automático', 'Nunca']);
    expect(checked()).toBe('Perguntar');
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull();
  });

  it('escolher uma opção salva na API e marca a escolha', async () => {
    await act(async () => { radios()[1].click(); });
    await flush();
    expect(api.setAutoDetect).toHaveBeenCalledWith('auto');
    expect(checked()).toBe('Automático');
    await act(async () => { radios()[2].click(); });
    await flush();
    expect(api.setAutoDetect).toHaveBeenLastCalledWith('never');
    expect(checked()).toBe('Nunca');
  });

  it('se não salvar, volta à opção anterior e explica em português', async () => {
    api.setAutoDetect.mockRejectedValueOnce(new Error('x'));
    await act(async () => { radios()[2].click(); });
    await flush();
    expect(checked()).toBe('Perguntar');
    expect(container.querySelector('[role="alert"]').textContent).toContain('Não consegui salvar');
  });

  it('sem o servidor, o interruptor não aparece (e nada quebra)', async () => {
    act(() => root.unmount());
    api.autoDetect.mockRejectedValueOnce(new Error('off'));
    root = createRoot(container);
    await act(async () => { root.render(<AutoDetectSwitch />); });
    await flush();
    expect(container.textContent).toBe('');
  });
});
