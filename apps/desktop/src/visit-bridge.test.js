import { describe, it, expect, vi } from 'vitest';
import vm from 'node:vm';
import { createBridge } from './bridge.js';
import { buildFiles } from '../../../scripts/build-extension.mjs';
import { preloadFiles } from '../../../scripts/build-desktop.mjs';
import { PLATFORMS as REGISTRY } from '../../api/src/core/platforms.js';

const API = 'http://127.0.0.1:38250';
const ALURA_LESSON = 'https://cursos.alura.com.br/course/python-flask/task/123?token=SEGREDO#x';

function setup(responses = {}) {
  const fetchMock = vi.fn(async (url, init) => {
    const path = url.replace(`${API}/api/v1`, '');
    const r = responses[path] ?? { data: {} };
    return { ok: true, json: async () => r };
  });
  const bridge = createBridge({ apiBase: API, fetchImpl: fetchMock, settings: {}, saveSettings: () => {}, openAppPage: () => {} });
  const calls = () => fetchMock.mock.calls.map(([u, i]) => ({ path: u.replace(`${API}/api/v1`, ''), method: i.method, body: JSON.parse(i.body) }));
  return { bridge, fetchMock, calls };
}

describe('bridge · lc-visit', () => {
  it('a plataforma e o endereço vêm da janela (sem busca nem fragmento), nunca da mensagem', async () => {
    const t = setup({ '/courses/visit': { data: { action: 'ask', title: 'Flask', platformName: 'Alura' } } });
    const r = await t.bridge.handle({ type: 'lc-visit', step: 'visit', title: 'Flask | Alura', progressPercent: 33, platform: 'bradesco', url: 'https://evil.com/x' }, 'alura', ALURA_LESSON);
    expect(r).toEqual({ ok: true, notice: { action: 'ask', title: 'Flask' } });
    expect(t.calls()).toEqual([{ path: '/courses/visit', method: 'POST', body: { platform: 'alura', url: 'https://cursos.alura.com.br/course/python-flask/task/123', title: 'Flask | Alura', progressPercent: 33 } }]);
  });

  it('só devolve à página texto de aviso e o código de desfazer; nada de dados do app', async () => {
    const t = setup({ '/courses/visit': { data: { action: 'created', undoToken: 'tok-abcdef123', course: { id: 9, title: 'Flask', platform: 'Alura', status: 'active', progress: 5 } } } });
    const r = await t.bridge.handle({ type: 'lc-visit', step: 'add' }, 'alura', ALURA_LESSON);
    expect(r).toEqual({ ok: true, notice: { action: 'created', title: 'Flask', token: 'tok-abcdef123' } });
    const t2 = setup({ '/courses/visit': { data: { action: 'progress', course: { id: 9, title: 'Flask' } } } });
    expect(await t2.bridge.handle({ type: 'lc-visit', step: 'visit', title: 'x' }, 'bradesco', 'https://www.ev.org.br/cursos/abc')).toEqual({ ok: true });
  });

  it('passos: sempre automático liga o modo e confirma; agora não silencia; desfazer usa o código', async () => {
    const t = setup({ '/courses/visit/undo': { data: { undone: true } } });
    await t.bridge.handle({ type: 'lc-visit', step: 'always' }, 'alura', ALURA_LESSON);
    await t.bridge.handle({ type: 'lc-visit', step: 'later' }, 'alura', ALURA_LESSON);
    const u = await t.bridge.handle({ type: 'lc-visit', step: 'undo', token: 'tok-abcdef123' }, 'alura', ALURA_LESSON);
    expect(u).toEqual({ ok: true, undone: true });
    expect(t.calls().map((c) => `${c.method} ${c.path}`)).toEqual(['PATCH /settings/auto-detect', 'POST /courses/visit', 'POST /courses/visit/dismiss', 'POST /courses/visit/undo']);
    expect(t.calls()[0].body).toEqual({ mode: 'auto' });
    expect(t.calls()[1].body).toMatchObject({ confirm: true, platform: 'alura' });
  });

  it('só janelas de plataforma (não a Udemy, o app nem origem desconhecida); passo inválido é recusado', async () => {
    const t = setup();
    for (const kind of ['udemy', 'app', null, 'microsoft']) {
      const r = await t.bridge.handle({ type: 'lc-visit', step: 'visit' }, kind, 'https://www.alura.com.br/curso-online-x');
      expect(r.ok, String(kind)).toBe(false);
    }
    expect(await t.bridge.handle({ type: 'lc-visit', step: 'apagar-tudo' }, 'alura', ALURA_LESSON)).toEqual({ ok: false, reason: 'bad-request' });
    expect(await t.bridge.handle({ type: 'lc-visit', step: 'visit' }, 'alura', 'não é url')).toEqual({ ok: false, reason: 'bad-request' });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('limite de frequência: a mesma página não vai à API duas vezes em 1 minuto', async () => {
    const t = setup();
    await t.bridge.handle({ type: 'lc-visit', step: 'visit', title: 'a' }, 'alura', ALURA_LESSON);
    await t.bridge.handle({ type: 'lc-visit', step: 'visit', title: 'a' }, 'alura', ALURA_LESSON);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('API fora do ar não quebra: responde ok sem aviso', async () => {
    const bridge = createBridge({ apiBase: API, fetchImpl: async () => { throw new Error('off'); }, settings: {}, saveSettings: () => {}, openAppPage: () => {} });
    expect(await bridge.handle({ type: 'lc-visit', step: 'visit', title: 'x' }, 'alura', ALURA_LESSON)).toEqual({ ok: true });
  });
});

describe('extensão · detecção (build e background)', () => {
  const files = buildFiles('http://localhost:3000');
  const manifest = JSON.parse(files['manifest.json']);

  it('o script de detecção roda só nos domínios do registro, sem permissões novas', () => {
    const entry = manifest.content_scripts.find((c) => c.js[0] === 'content-visit.js');
    expect(entry.matches.sort()).toEqual(Object.values(REGISTRY).flatMap((p) => p.domains.map((d) => `https://*.${d}/*`)).sort());
    expect(entry.matches.some((m) => /udemy/.test(m))).toBe(false);
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.host_permissions).toEqual(['http://localhost:3000/*']);
    expect(manifest.version).toBe('0.3.0');
    expect(() => new vm.Script(files['content-visit.js'])).not.toThrow();
    expect(files['content-visit.js']).not.toMatch(/__REGISTRY__|\bfetch\(|XMLHttpRequest|localStorage|document\.cookie/);
  });

  function load() {
    const listeners = [];
    const chrome = { runtime: { onMessage: { addListener: (fn) => listeners.push(fn) } }, storage: { session: {} }, tabs: { create: vi.fn() } };
    const fetchMock = vi.fn(async (url) => ({ ok: true, json: async () => ({ data: url.endsWith('/courses/visit') ? { action: 'ask', title: 'Flask' } : { undone: true } }) }));
    vm.runInNewContext(files['background.js'], { chrome, fetch: fetchMock, URL, Array, Object, JSON, Promise, Map, Date, Math });
    const send = (msg, url) => new Promise((resolve) => { const r = listeners[0](msg, { url }, resolve); if (!r) resolve('sem-resposta'); });
    return { send, fetchMock, chrome };
  }

  it('usa o endereço da aba (sem busca/fragmento) e a plataforma dele; ignora o que a mensagem afirma', async () => {
    const t = load();
    const r = await t.send({ type: 'lc-visit', step: 'visit', title: 'Flask', platform: 'bradesco', url: 'https://evil.com' }, 'https://learn.microsoft.com/pt-br/training/modules/x/unit/?a=b#c');
    expect(r).toEqual({ ok: true, notice: { action: 'ask', title: 'Flask' } });
    const [url, init] = t.fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/v1/courses/visit');
    expect(JSON.parse(init.body)).toEqual({ platform: 'microsoft', url: 'https://learn.microsoft.com/pt-br/training/modules/x/unit/', title: 'Flask' });
  });

  it('recusa Udemy, o app, domínios parecidos; e nenhuma plataforma nova ganha o canal de importar "Meus cursos"', async () => {
    const t = load();
    for (const url of ['https://www.udemy.com/course/x/', 'http://localhost:3000/importar', 'https://learn.microsoft.com.evil.com/', 'https://evil.com/']) {
      expect(await t.send({ type: 'lc-visit', step: 'visit', title: 'x' }, url), url).toBe('sem-resposta');
    }
    expect(await t.send({ type: 'lc-items', items: [{ title: 'A' }] }, 'https://learn.microsoft.com/pt-br/')).toBe('sem-resposta');
    expect(t.fetchMock).not.toHaveBeenCalled();
    expect(t.chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('desfazer e passo inválido', async () => {
    const t = load();
    expect(await t.send({ type: 'lc-visit', step: 'undo', token: 'tok-abcdef123' }, 'https://www.alura.com.br/curso-online-x')).toEqual({ ok: true, undone: true });
    expect(await t.send({ type: 'lc-visit', step: 'xyz' }, 'https://www.alura.com.br/curso-online-x')).toEqual({ ok: false });
  });
});

describe('preloads do desktop · detecção', () => {
  const files = preloadFiles();
  it('Alura e Fundação Bradesco ganham a detecção; Udemy e app não', () => {
    for (const id of ['alura', 'bradesco']) {
      const code = files[`preload-${id}.cjs`];
      expect(() => new Function('require', code), id).not.toThrow();
      expect(code).toContain("type: 'lc-visit'");
      expect(code).toContain('extractPlatformCourses'); // a importação continua ali
      expect(code).not.toMatch(/\beval\s*\(|new Function|__REGISTRY__/);
    }
    expect(files['preload-udemy.cjs']).not.toContain('lc-visit');
    expect(files['preload-app.cjs']).not.toContain('lc-visit');
  });
});
