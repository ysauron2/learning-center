// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { preloadFiles } from '../../../scripts/build-desktop.mjs';

const files = preloadFiles();

describe('preloads da Alura e da Fundação Bradesco (build)', () => {
  it('há um preload para cada plataforma, com a leitura certa e o id fixo', () => {
    expect(Object.keys(files).sort()).toEqual(['preload-alura.cjs', 'preload-app.cjs', 'preload-bradesco.cjs', 'preload-udemy.cjs']);
    for (const id of ['alura', 'bradesco']) {
      const code = files[`preload-${id}.cjs`];
      expect(() => new Function('require', code), id).not.toThrow();
      expect(code).toContain(`const LC_PLATFORM_ID = "${id}"`);
      expect(code).toContain('extractPlatformCourses');
      expect(code).toContain('diagnosePlatformCourses');
      expect(code).not.toContain('extractUdemyCourses');
      expect(code).not.toContain('__PLATFORM_LIB__');
      expect(code).not.toMatch(/\bexport\s+(function|const)/);
      expect(code).not.toMatch(/\beval\s*\(|new Function/);
    }
    expect(files['preload-udemy.cjs']).not.toContain('extractPlatformCourses');
    expect(files['preload-app.cjs']).toContain('openPlatform');
  });

  it('o preload do app expõe abrir plataforma só por IPC, com o id como texto', () => {
    const exposed = {};
    const invoke = vi.fn(async () => ({ ok: true }));
    const fakeElectron = { ipcRenderer: { invoke }, contextBridge: { exposeInMainWorld: (n, api) => { exposed[n] = api; } } };
    new Function('require', files['preload-app.cjs'])((name) => (name === 'electron' ? fakeElectron : (() => { throw new Error(name); })()));
    exposed.lcDesktop.openPlatform('alura');
    exposed.lcDesktop.openPlatform({ toString: () => 'bradesco' });
    expect(invoke.mock.calls).toEqual([
      ['lc-msg', { type: 'open-platform', platform: 'alura' }],
      ['lc-msg', { type: 'open-platform', platform: 'bradesco' }],
    ]);
  });
});

describe.each([['alura'], ['bradesco']])('preload da %s rodando de verdade', (id) => {
  let invoke;
  const clip = { writeText: vi.fn(async () => {}) };
  beforeEach(() => {
    document.documentElement.querySelectorAll('div[data-lume]').forEach((n) => n.remove());
    invoke = vi.fn(async () => ({ ok: true }));
    clip.writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true });
    window.history.pushState({}, '', '/dashboard?token=SEGREDO');
  });
  afterEach(() => {
    document.documentElement.querySelectorAll('div[data-lume]').forEach((n) => n.remove());
    delete globalThis.chrome;
  });
  const runPreload = () => {
    const fakeElectron = { ipcRenderer: { invoke }, contextBridge: { exposeInMainWorld: vi.fn() } };
    new Function('require', files[`preload-${id}.cjs`])((name) => (name === 'electron' ? fakeElectron : (() => { throw new Error(`require(${name})`); })()));
  };
  const host = () => document.documentElement.querySelector(`div[data-lume="${id}"]`);
  const click = async (sel) => { host().shadowRoot.querySelector(sel).click(); await new Promise((r) => setTimeout(r, 0)); };
  const course = (slug) => (id === 'alura' ? `https://cursos.alura.com.br/course/${slug}` : `https://www.ev.org.br/cursos/${slug}`);

  it('mostra o botão e o aviso de que a leitura logada não foi verificada', () => {
    document.body.innerHTML = '';
    runPreload();
    expect(host()).not.toBeNull();
    const text = host().shadowRoot.textContent;
    expect(text).toContain(id === 'alura' ? 'Importar meus cursos da Alura' : 'Importar meus cursos da Fundação Bradesco');
    expect(text).toContain('ainda não verificada com conta real');
  });

  it('lê os cursos e entrega por IPC SEM dizer a plataforma (quem recebe decide pela janela)', async () => {
    document.body.innerHTML = `<main><div><a href="${course('python-flask')}"><h3>Python Flask</h3></a><span>30%</span></div></main>`;
    runPreload();
    await click('.main');
    expect(invoke).toHaveBeenCalledTimes(1);
    const [channel, msg] = invoke.mock.calls[0];
    expect(channel).toBe('lc-msg');
    expect(msg).toMatchObject({ type: 'lc-items', items: [{ title: 'Python Flask', progress: 30 }] });
    expect(msg).not.toHaveProperty('platform');
  });

  it('sem cursos na página, copia um diagnóstico sem dados pessoais e não envia nada', async () => {
    document.body.innerHTML = '<header>Olá, Maria Souza maria@email.com</header><main><p>nada</p></main>';
    runPreload();
    await click('.main');
    expect(invoke).not.toHaveBeenCalled();
    expect(clip.writeText).toHaveBeenCalledTimes(1);
    const text = clip.writeText.mock.calls[0][0];
    expect(JSON.parse(text)).toMatchObject({ plataforma: id, cursosLidos: 0 });
    expect(text).not.toMatch(/Maria|maria@|SEGREDO|token/i);
  });

  it('o botão "Copiar diagnóstico" sempre copia', async () => {
    document.body.innerHTML = `<main><a href="${course('x')}"><h3>X</h3></a></main>`;
    runPreload();
    await click('.diag');
    expect(clip.writeText).toHaveBeenCalledTimes(1);
    expect(JSON.parse(clip.writeText.mock.calls[0][0])).toMatchObject({ plataforma: id, cursosLidos: 1 });
    expect(invoke).not.toHaveBeenCalled();
  });
});
