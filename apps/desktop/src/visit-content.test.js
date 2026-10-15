// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.alura.com.br/curso-online-python-flask"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildFiles } from '../../../scripts/build-extension.mjs';

const code = buildFiles('http://localhost:3000')['content-visit.js'];

let send;
let listeners = [];
const flush = async () => { await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(0); };
const run = (win = window) => {
  globalThis.chrome = { runtime: { sendMessage: send } };
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((t, fn, o) => { listeners.push([t, fn]); add(t, fn, o); });
  new Function('window', code)(win);
};
const host = () => document.documentElement.querySelector('div[data-lume-visit]');
const shadowText = () => host()?.shadowRoot.textContent ?? '';
const clickBtn = async (label) => {
  [...host().shadowRoot.querySelectorAll('button')].find((b) => b.textContent === label).click();
  await flush();
};
const go = async (path) => { window.history.pushState({}, '', path); await vi.advanceTimersByTimeAsync(2100); };

beforeEach(() => {
  vi.useFakeTimers();
  send = vi.fn(async () => ({ ok: true }));
  document.body.innerHTML = '<header>Olá, Maria Souza maria@email.com</header><main><h1>Curso</h1></main>';
  document.title = 'Python Flask | Alura';
  document.cookie = 'sessao=SEGREDO123';
  window.history.pushState({}, '', '/curso-online-python-flask?utm=x#aula-3');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});
afterEach(() => {
  host()?.remove();
  listeners.forEach(([t, fn]) => document.removeEventListener(t, fn));
  listeners = [];
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete globalThis.chrome;
});

describe('content-visit · o que envia', () => {
  it('numa página de curso envia só tipo, passo e título (sem endereço, plataforma nem dados pessoais)', async () => {
    run();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg).toEqual({ type: 'lc-visit', step: 'visit', title: 'Python Flask | Alura' });
    const all = JSON.stringify(send.mock.calls);
    expect(all).not.toMatch(/Maria|maria@|SEGREDO123|utm|aula-3|alura\.com\.br|platform/);
  });

  it('inclui o progresso só quando a página o mostra numa barra identificada; senão nada', async () => {
    document.body.innerHTML = '<div role="progressbar" aria-label="Progresso do curso" aria-valuenow="42" aria-valuemax="100"></div>';
    run();
    await flush();
    expect(send.mock.calls[0][0]).toMatchObject({ progressPercent: 42 });
  });

  it('barra sem identificação (ex.: vídeo) ou mais de uma barra: não inventa porcentagem', async () => {
    document.body.innerHTML = '<div role="progressbar" aria-valuenow="77"></div>';
    run();
    await flush();
    expect(send.mock.calls[0][0]).not.toHaveProperty('progressPercent');
    send.mockClear();
    host()?.remove();
    document.body.innerHTML = '<div role="progressbar" aria-label="progresso" aria-valuenow="10"></div><div role="progressbar" aria-label="progresso" aria-valuenow="20"></div>';
    await go('/curso-online-outro-curso');
    expect(send.mock.calls[0][0]).not.toHaveProperty('progressPercent');
  });

  it('ignora páginas que não são de curso (home, busca, painel)', async () => {
    window.history.pushState({}, '', '/');
    run();
    await flush();
    for (const p of ['/busca?query=js', '/cursos-online-programacao', '/carrinho']) await go(p);
    expect(send).not.toHaveBeenCalled();
  });

  it('ignora aba em segundo plano e só avisa quando ela fica visível', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    run();
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('ignora iframes', async () => {
    run({ top: {}, setInterval });
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).not.toHaveBeenCalled();
  });

  it('o mesmo curso não é reenviado a cada 2 segundos, mas outra página de curso é', async () => {
    run();
    await vi.advanceTimersByTimeAsync(10000);
    expect(send).toHaveBeenCalledTimes(1);
    await go('/curso-online-outro-curso');
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('content-visit · aviso na página', () => {
  const ask = { ok: true, notice: { action: 'ask', title: 'Python <b>Flask</b>' } };

  it('pergunta com os três botões em português; o texto do site nunca vira HTML', async () => {
    send.mockResolvedValueOnce(ask);
    run();
    await flush();
    const root = host().shadowRoot;
    expect(shadowText()).toContain('Lume: adicionar “Python <b>Flask</b>” aos seus cursos?');
    expect(root.querySelector('b')).toBeNull();
    expect([...root.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Adicionar', 'Sempre automático', 'Agora não', '×']);
    expect(root.querySelector('[role="dialog"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Fechar aviso"]')).not.toBeNull();
  });

  it('Adicionar → passo "add"; depois mostra aviso curto com Desfazer, que usa o código recebido', async () => {
    send.mockResolvedValueOnce(ask).mockResolvedValueOnce({ ok: true, notice: { action: 'created', title: 'Flask', token: 'tok-123' } });
    run();
    await flush();
    await clickBtn('Adicionar');
    expect(send.mock.calls[1][0]).toEqual({ type: 'lc-visit', step: 'add' });
    expect(shadowText()).toContain('foi adicionado aos seus cursos');
    send.mockResolvedValueOnce({ ok: true, undone: true });
    await clickBtn('Desfazer');
    expect(send.mock.calls[2][0]).toEqual({ type: 'lc-visit', step: 'undo', token: 'tok-123' });
    expect(shadowText()).toContain('desfeito');
  });

  it('"Sempre automático" e "Agora não" enviam o passo certo; "Agora não" fecha o aviso', async () => {
    send.mockResolvedValueOnce(ask).mockResolvedValueOnce({ ok: true });
    run();
    await flush();
    await clickBtn('Sempre automático');
    expect(send.mock.calls[1][0]).toEqual({ type: 'lc-visit', step: 'always' });
    send.mockResolvedValueOnce(ask);
    await go('/curso-online-outro');
    await clickBtn('Agora não');
    expect(send.mock.calls.at(-1)[0]).toEqual({ type: 'lc-visit', step: 'later' });
    expect(host()).toBeNull();
  });

  it('fecha com o botão × e com Escape; some sozinho o aviso curto', async () => {
    send.mockResolvedValueOnce(ask);
    run();
    await flush();
    host().shadowRoot.querySelector('.x').click();
    expect(host()).toBeNull();
    send.mockResolvedValueOnce({ ok: true, notice: { action: 'activated', title: 'Flask', token: 't' } });
    await go('/curso-online-b');
    expect(shadowText()).toContain('agora está em andamento');
    host().shadowRoot.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host()).toBeNull();
    send.mockResolvedValueOnce({ ok: true, notice: { action: 'activated', title: 'Flask', token: 't' } });
    await go('/curso-online-c');
    await vi.advanceTimersByTimeAsync(13000);
    expect(host()).toBeNull();
  });
});
