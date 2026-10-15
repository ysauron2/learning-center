// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { preloadFiles } from '../../../scripts/build-desktop.mjs';

const files = preloadFiles();

describe('preloads gerados', () => {
  it('têm sintaxe válida, sem eval e sem placeholder sobrando', () => {
    for (const [name, code] of Object.entries(files)) {
      expect(() => new Function('require', code), name).not.toThrow();
      expect(code, name).not.toMatch(/\beval\s*\(|new Function/);
      expect(code, name).not.toContain('__APP_ORIGIN__');
      expect(code, name).not.toContain('__EXTRACTOR__');
      expect(code, name).not.toContain('__CURRICULUM__');
    }
  });

  it('o da Udemy leva a leitura de cursos e de conteúdo; o do app só a ponte de entrega', () => {
    expect(files['preload-udemy.cjs']).toContain('extractUdemyCourses');
    expect(files['preload-udemy.cjs']).toContain('extractUdemyCurriculum');
    expect(files['preload-app.cjs']).not.toContain('extractUdemyCourses');
    expect(files['preload-app.cjs']).toContain("exposeInMainWorld('lcDesktop'");
    expect(files['preload-app.cjs']).toContain("type: 'update-state'");
    expect(files['preload-app.cjs']).toContain("type: 'update-install'");
    for (const other of ['preload-udemy.cjs', 'preload-alura.cjs', 'preload-bradesco.cjs']) {
      expect(files[other], other).not.toContain('update-install');
    }
  });
});

describe('preload da Udemy rodando de verdade (adaptador de IPC)', () => {
  let invoke;
  let listeners;
  let origAdd;
  beforeEach(() => {
    vi.useFakeTimers();
    origAdd = document.addEventListener.bind(document);
    listeners = [];
    document.addEventListener = (t, fn, o) => { listeners.push([t, fn, o]); origAdd(t, fn, o); };
    document.documentElement.querySelectorAll('div[style*="fixed"]').forEach((n) => n.remove());
    invoke = vi.fn(async (_channel, msg) => (msg.type === 'storage-get' ? { autoSync: true } : { ok: true, data: { created: 1 } }));
    document.body.innerHTML = '<div><a href="/course/python/"><h3>Python</h3></a><span>30%</span></div>';
    window.history.pushState({}, '', '/home/my-courses/learning/');
  });
  afterEach(() => {
    for (const [t, fn, o] of listeners) document.removeEventListener(t, fn, o);
    document.addEventListener = origAdd;
    document.documentElement.querySelectorAll('div[style*="fixed"]').forEach((n) => n.remove());
    vi.useRealTimers();
    delete globalThis.chrome;
  });

  const runPreload = () => {
    const fakeElectron = { ipcRenderer: { invoke } , contextBridge: { exposeInMainWorld: vi.fn() } };
    new Function('require', files['preload-udemy.cjs'])((name) => (name === 'electron' ? fakeElectron : (() => { throw new Error(`require(${name})`); })()));
  };

  it('mostra o botão, lê o interruptor pelo IPC e sincroniza sozinho quando está ligado', async () => {
    runPreload();
    expect(document.documentElement.querySelector('div[style*="fixed"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(3500);
    const channels = new Set(invoke.mock.calls.map((c) => c[0]));
    expect([...channels]).toEqual(['lc-msg']);
    const msgs = invoke.mock.calls.map((c) => c[1]);
    expect(msgs[0]).toEqual({ type: 'storage-get', key: 'autoSync' });
    const sync = msgs.find((m) => m.type === 'lc-sync');
    expect(sync).toMatchObject({ kind: 'courses', items: [{ title: 'Python', progress: 30 }] });
  });

  it('o interruptor grava a escolha pelo IPC', async () => {
    runPreload();
    await vi.advanceTimersByTimeAsync(100);
    const host = document.documentElement.querySelector('div[style*="fixed"]');
    const box = host.shadowRoot.querySelector('.auto-box');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(invoke).toHaveBeenCalledWith('lc-msg', { type: 'storage-set', values: { autoSync: false } });
  });
});
