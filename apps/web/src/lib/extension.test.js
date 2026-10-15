// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildFiles } from '../../../../scripts/build-extension.mjs';
import { parseExtensionMessage } from './bookmarklet.js';

const APP = 'http://localhost:3000';
const files = buildFiles(APP);

describe('build da extensão', () => {
  it('manifest válido (MV3) com o endereço do app e sem permissões amplas', () => {
    const m = JSON.parse(files['manifest.json']);
    expect(m.manifest_version).toBe(3);
    expect(m.content_scripts[1].matches).toEqual([`${APP}/importar*`]);
    expect(m.permissions).toEqual(['storage']);
    // única permissão de rede: o próprio app local (nada da Udemy nem de terceiros)
    expect(m.host_permissions).toEqual([`${APP}/*`]);
    expect(JSON.stringify(m)).not.toContain('__APP_ORIGIN__');
  });

  it('nenhum placeholder sobra e todo script tem sintaxe válida', () => {
    for (const [name, code] of Object.entries(files)) {
      if (!name.endsWith('.js')) continue;
      expect(code, name).not.toContain('__APP_ORIGIN__');
      expect(code, name).not.toContain('__EXTRACTOR__');
      expect(() => new Function(code), name).not.toThrow();
    }
  });

  it('endereço do app personalizado vale para manifest e background', () => {
    const f = buildFiles('http://192.168.0.5:8080/qualquer/coisa');
    expect(f['manifest.json']).toContain('http://192.168.0.5:8080/importar*');
    expect(f['background.js']).toContain('"http://192.168.0.5:8080"');
  });
});

describe('content-udemy.js (botão na página da Udemy)', () => {
  let sendMessage;
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.querySelectorAll('div[style*="fixed"]').forEach((n) => n.remove());
    document.body.innerHTML = '<div><a href="/course/x/"><h3>Curso X</h3></a><span>30%</span></div>';
    sendMessage = vi.fn();
    globalThis.chrome = { runtime: { sendMessage } };
    window.history.pushState({}, '', '/home/my-courses/learning/');
    new Function(files['content-udemy.js'])();
  });

  const host = () => document.documentElement.querySelector('div[style*="fixed"]');
  const click = () => host().shadowRoot.querySelector('button').click();

  it('mostra o botão em Meus cursos e envia a lista ao clicar', () => {
    expect(host()).not.toBeNull();
    click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'lc-items', items: [expect.objectContaining({ title: 'Curso X', progress: 30 })] });
  });

  it('esconde o botão fora de Meus cursos', () => {
    window.history.pushState({}, '', '/explore/');
    vi.advanceTimersByTime(1100);
    expect(host()).toBeNull();
  });

  it('diagnóstico resume padrões de link e cartões por texto, sem lixo de regex', async () => {
    document.body.innerHTML = `<main><div class="card x y"><a href="/course-dashboard-redirect/?course_id=123">c</a><a href="/user/9/">u</a><span>9% concluído</span></div></main>`;
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    // sem seletor de curso válido não há itens; força o diagnóstico removendo o course_id
    document.querySelector('a').setAttribute('href', '/semcurso/777/');
    click();
    await vi.advanceTimersByTimeAsync(10);
    const d = JSON.parse(writeText.mock.calls[0][0]);
    expect(d.padroesDeLink).toEqual(expect.arrayContaining([['/semcurso/N/', 1], ['/user/N/', 1]]));
    expect(d.cartoesPorTexto).toBe(1);
    expect(d.amostra[0].cadeia[1]).toContain('div.card.x');
  });

  it('sem cursos, copia um diagnóstico e não envia nada', async () => {
    document.body.innerHTML = '<p>vazio</p>';
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    click();
    await vi.advanceTimersByTimeAsync(10);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(JSON.parse(writeText.mock.calls[0][0])).toMatchObject({ path: '/home/my-courses/learning/', linksTotal: 0, cartoesPorTexto: 0 });
  });
});

describe('background.js e content-app.js', () => {
  it('guarda a lista, abre /importar e entrega uma única vez', async () => {
    const store = {};
    let listener;
    globalThis.chrome = {
      runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
      tabs: { create: vi.fn() },
      storage: { session: {
        set: async (o) => Object.assign(store, o),
        get: async (keys) => Object.fromEntries([].concat(keys).map((k) => [k, store[k]])),
        remove: async (keys) => { [].concat(keys).forEach((k) => delete store[k]); },
      } },
    };
    new Function(files['background.js'])();
    const send = (msg) => new Promise((resolve) => { listener(msg, {}, resolve); });
    expect(await send({ type: 'lc-items', items: [{ title: 'A' }] })).toEqual({ ok: true });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `${APP}/importar` });
    expect(await send({ type: 'lc-get' })).toEqual({ items: [{ title: 'A' }], content: null });
    expect(await send({ type: 'lc-get' })).toEqual({ items: null, content: null });
  });

  it('content-app entrega a lista à página quando ela avisa que está pronta', async () => {
    globalThis.chrome = { runtime: { sendMessage: vi.fn().mockResolvedValue({ items: [{ title: 'A' }] }) } };
    const spy = vi.spyOn(window, 'postMessage');
    new Function(files['content-app.js'])();
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-ready' }, source: window, origin: window.location.origin }));
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith({ type: 'lc-import-ext', items: [{ title: 'A' }] }, window.location.origin));
  });
});

describe('parseExtensionMessage', () => {
  const ev = (over) => ({ source: window, origin: 'http://localhost:3000', data: { type: 'lc-import-ext', items: [{ title: 'A', url: 'u', progress: 5 }] }, ...over });
  it('aceita só da própria página', () => {
    expect(parseExtensionMessage(ev(), 'http://localhost:3000', window)).toHaveLength(1);
    expect(parseExtensionMessage(ev({ origin: 'https://evil.com' }), 'http://localhost:3000', window)).toBeNull();
    expect(parseExtensionMessage(ev({ source: {} }), 'http://localhost:3000', window)).toBeNull();
    expect(parseExtensionMessage(ev({ data: { type: 'x' } }), 'http://localhost:3000', window)).toBeNull();
  });
});

describe('modo "conteúdo do curso" (player)', () => {
  const player = `
    <h1 data-purpose="course-header-title">Curso Y</h1>
    <div data-purpose="section-panel-0">
      <button aria-expanded="false"><span data-purpose="section-heading">Seção 1: Início</span></button>
      <ul><li data-purpose="curriculum-item-0-0"><label><input type="checkbox" checked><span>Aula 1</span></label><span>4min</span></li></ul>
    </div>`;
  let sendMessage;
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.querySelectorAll('div[style*="fixed"]').forEach((n) => n.remove());
    document.body.innerHTML = player;
    sendMessage = vi.fn();
    globalThis.chrome = { runtime: { sendMessage } };
    window.history.pushState({}, '', '/course/curso-y/learn/lecture/55');
    new Function(files['content-udemy.js'])();
  });
  const host = () => document.documentElement.querySelector('div[style*="fixed"]');
  const button = () => host().shadowRoot.querySelector('button');

  it('mostra o botão certo no player e envia seções e aulas ao clicar', async () => {
    expect(button().textContent).toBe('Importar conteúdo deste curso');
    const clicks = vi.fn();
    document.querySelector('button[aria-expanded]').addEventListener('click', clicks);
    button().click();
    await vi.advanceTimersByTimeAsync(1500);
    expect(clicks).toHaveBeenCalledTimes(1); // expandiu a seção recolhida
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const msg = sendMessage.mock.calls[0][0];
    expect(msg.type).toBe('lc-content');
    expect(msg.content.title).toBe('Curso Y');
    expect(msg.content.modules).toEqual([{ title: 'Seção 1: Início', lessons: [{ title: 'Aula 1', durationMin: 4, completed: true }] }]);
  });

  it('sem aulas, copia o diagnóstico da estrutura e não envia', async () => {
    document.body.innerHTML = '<div data-purpose="curriculum-section-container"><button aria-expanded="true">x</button><input type="checkbox"></div>';
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    button().click();
    await vi.advanceTimersByTimeAsync(1500);
    expect(sendMessage).not.toHaveBeenCalled();
    const d = JSON.parse(writeText.mock.calls[0][0]);
    expect(d).toMatchObject({ modo: 'player', path: '/course/curso-y/learn/lecture/N', checkboxes: 1, botoesExpansiveis: 1 });
    expect(d.dataPurposeRelevantes).toEqual([['curriculum-section-container', 1]]);
  });

  it('o botão volta ao modo "meus cursos" quando a Udemy navega para lá', () => {
    window.history.pushState({}, '', '/home/my-courses/learning/');
    vi.advanceTimersByTime(1100);
    expect(button().textContent).toBe('Importar para o Learning Center');
  });
});

describe('background/content-app com conteúdo', () => {
  it('guarda o conteúdo, abre /importar-conteudo e entrega uma vez', async () => {
    const store = {};
    let listener;
    globalThis.chrome = {
      runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
      tabs: { create: vi.fn() },
      storage: { session: {
        set: async (o) => Object.assign(store, o),
        get: async (keys) => Object.fromEntries([].concat(keys).map((k) => [k, store[k]])),
        remove: async (keys) => { [].concat(keys).forEach((k) => delete store[k]); },
      } },
    };
    new Function(files['background.js'])();
    const send = (msg) => new Promise((resolve) => { listener(msg, {}, resolve); });
    const content = { title: 'C', url: 'u', modules: [] };
    expect(await send({ type: 'lc-content', content })).toEqual({ ok: true });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `${APP}/importar-conteudo` });
    expect(await send({ type: 'lc-get' })).toEqual({ items: null, content });
    expect(await send({ type: 'lc-get' })).toEqual({ items: null, content: null });
  });

  it('content-app entrega o conteúdo à página', async () => {
    const content = { title: 'C', url: 'u', modules: [] };
    globalThis.chrome = { runtime: { sendMessage: vi.fn().mockResolvedValue({ items: null, content }) } };
    const spy = vi.spyOn(window, 'postMessage');
    new Function(files['content-app.js'])();
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-ready' }, source: window, origin: window.location.origin }));
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith({ type: 'lc-content-ext', content }, window.location.origin));
  });

  it('o manifest cobre /importar-conteudo', () => {
    const m = JSON.parse(files['manifest.json']);
    expect('/importar-conteudo'.startsWith('/importar')).toBe(true);
    expect(m.content_scripts[1].matches[0]).toBe(`${APP}/importar*`);
  });
});
