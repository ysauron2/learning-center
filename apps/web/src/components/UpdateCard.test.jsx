// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { UpdateCard } from './UpdateCard.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const AVAILABLE = { status: 'available', current: '0.1.1', platform: 'win32', version: '0.2.0', notes: 'Alura e Fundação Bradesco\nFoco rápido', pageUrl: 'https://github.com/ysauron2/learning-center/releases/tag/v0.2.0' };

let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<UpdateCard />); });
  await flush();
}
const q = (sel) => container.querySelector(sel);
const btn = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };

function desktop(over = {}) {
  window.lcDesktop = { isDesktop: true, updateState: vi.fn().mockResolvedValue(AVAILABLE), installUpdate: vi.fn().mockResolvedValue({ status: 'started' }), ...over };
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); delete window.lcDesktop; });
afterEach(() => { delete window.lcDesktop; });

describe('UpdateCard · aviso de versão nova no Início', () => {
  it('no navegador (sem o app de desktop) não aparece nem consulta nada', async () => {
    await mount();
    expect(container.innerHTML).toBe('');
  });

  it('mostra a versão nova e a atual quando há atualização', async () => {
    desktop();
    await mount();
    expect(window.lcDesktop.updateState).toHaveBeenCalledWith(true);
    expect(q('[aria-label="Nova versão do Lume"]').textContent).toContain('Lume 0.2.0 disponível');
    expect(container.textContent).toContain('Você está na versão 0.1.1');
  });

  it.each([['current'], ['error'], ['disabled'], ['unknown']])('estado "%s" não mostra nada', async (status) => {
    desktop({ updateState: vi.fn().mockResolvedValue({ status, current: '0.1.1' }) });
    await mount();
    expect(container.innerHTML).toBe('');
  });

  it('falha ao consultar não quebra nem aparece', async () => {
    desktop({ updateState: vi.fn().mockRejectedValue(new Error('x')) });
    await mount();
    expect(container.innerHTML).toBe('');
  });

  it('"Atualizar agora" no Windows avisa que está baixando e trava o botão', async () => {
    desktop();
    await mount();
    await click(btn('Atualizar agora'));
    expect(window.lcDesktop.installUpdate).toHaveBeenCalledTimes(1);
    expect(q('[role="status"]').textContent).toContain('Baixando a nova versão');
    expect(btn('Atualizando').disabled).toBe(true);
    expect(btn('Depois')).toBeUndefined();
  });

  it('no Mac explica que abriu a página de download', async () => {
    desktop({ updateState: vi.fn().mockResolvedValue({ ...AVAILABLE, platform: 'darwin' }) });
    await mount();
    await click(btn('Atualizar agora'));
    expect(q('[role="status"]').textContent).toContain('arraste para Aplicativos');
  });

  it('se não conseguir iniciar, mostra o erro com o link da página (só do repositório do Lume)', async () => {
    desktop({ installUpdate: vi.fn().mockResolvedValue({ status: 'none' }) });
    await mount();
    await click(btn('Atualizar agora'));
    expect(q('[role="alert"]').textContent).toContain('Não consegui iniciar');
    expect(q('[role="alert"] a').getAttribute('href')).toBe(AVAILABLE.pageUrl);
  });

  it('link fora do repositório do Lume nunca vira link na tela', async () => {
    desktop({ updateState: vi.fn().mockResolvedValue({ ...AVAILABLE, pageUrl: 'https://evil.example/x' }), installUpdate: vi.fn().mockRejectedValue(new Error('x')) });
    await mount();
    await click(btn('Atualizar agora'));
    expect(q('[role="alert"] a')).toBeNull();
  });

  it('"Depois" esconde por 24 h aquela versão; uma versão mais nova volta a aparecer', async () => {
    desktop();
    await mount();
    await click(btn('Depois'));
    expect(container.innerHTML).toBe('');
    document.body.innerHTML = '';
    await mount();
    expect(container.innerHTML).toBe('');
    document.body.innerHTML = '';
    desktop({ updateState: vi.fn().mockResolvedValue({ ...AVAILABLE, version: '0.3.0' }) });
    await mount();
    expect(container.textContent).toContain('Lume 0.3.0 disponível');
  });

  it('depois de 24 h o aviso volta', async () => {
    localStorage.setItem('lume-update-hidden', JSON.stringify({ version: '0.2.0', until: Date.now() - 1000 }));
    desktop();
    await mount();
    expect(container.textContent).toContain('Lume 0.2.0 disponível');
  });

  it('as novidades aparecem como texto, só quando a pessoa pede', async () => {
    desktop({ updateState: vi.fn().mockResolvedValue({ ...AVAILABLE, notes: '<img src=x onerror=alert(1)> Novidade' }) });
    await mount();
    expect(container.textContent).not.toContain('Novidade');
    await click(btn('Ver novidades'));
    expect(container.textContent).toContain('<img src=x onerror=alert(1)> Novidade');
    expect(container.querySelector('img')).toBeNull();
    await click(btn('Esconder novidades'));
    expect(container.textContent).not.toContain('Novidade');
  });

  it('preload antigo sem updateState não quebra', async () => {
    window.lcDesktop = { isDesktop: true };
    await mount();
    expect(container.innerHTML).toBe('');
  });
});
