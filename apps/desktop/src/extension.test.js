import { describe, it, expect, vi } from 'vitest';
import vm from 'node:vm';
import { buildFiles } from '../../../scripts/build-extension.mjs';
import { PLATFORMS } from './platforms.js';

const files = buildFiles('http://localhost:3000');
const manifest = JSON.parse(files['manifest.json']);

describe('extensão do navegador · manifesto', () => {
  it('cada plataforma tem o script de conteúdo só nos domínios dela (sem "<all_urls>")', () => {
    const byFile = Object.fromEntries(manifest.content_scripts.map((c) => [c.js[0], c.matches]));
    expect(byFile['content-udemy.js']).toEqual(['https://*.udemy.com/*']);
    for (const id of ['alura', 'bradesco']) {
      expect(byFile[`content-${id}.js`], id).toEqual(PLATFORMS[id].domains.map((d) => `https://*.${d}/*`));
    }
    expect(JSON.stringify(manifest)).not.toMatch(/all_urls|\*:\/\/\*\/\*|http:\/\/\*/);
    // a extensão só fala com o app local: nenhuma permissão de acesso às plataformas
    expect(manifest.host_permissions).toEqual(['http://localhost:3000/*']);
    expect(manifest.permissions).toEqual(['storage']);
  });

  it('os arquivos gerados têm sintaxe válida e nenhum marcador sobrando', () => {
    for (const [name, code] of Object.entries(files)) {
      if (name.endsWith('.json')) continue;
      expect(() => new vm.Script(code, { filename: name }), name).not.toThrow();
      expect(code, name).not.toMatch(/__APP_ORIGIN__|__EXTRACTOR__|__CURRICULUM__|__PLATFORM_LIB__/);
    }
    expect(files['content-alura.js']).toContain('const LC_PLATFORM_ID = "alura"');
    expect(files['content-bradesco.js']).toContain('const LC_PLATFORM_ID = "bradesco"');
  });
});

describe('extensão do navegador · background.js', () => {
  function load() {
    const listeners = [];
    const session = {};
    const chrome = {
      runtime: { onMessage: { addListener: (fn) => listeners.push(fn) } },
      storage: {
        session: {
          set: vi.fn(async (v) => Object.assign(session, v)),
          get: vi.fn(async (keys) => Object.fromEntries(keys.map((k) => [k, session[k]]))),
          remove: vi.fn(async (keys) => keys.forEach((k) => delete session[k])),
        },
      },
      tabs: { create: vi.fn() },
    };
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) }));
    vm.runInNewContext(files['background.js'], { chrome, fetch: fetchMock, URL, Array, Object, JSON, Promise });
    const send = (msg, url) => new Promise((resolve) => {
      const r = listeners[0](msg, { url }, resolve);
      if (!r) resolve('sem-resposta');
    });
    return { send, chrome, fetchMock, session };
  }

  it('a plataforma vem do endereço da aba que enviou, nunca da mensagem', async () => {
    const t = load();
    expect(await t.send({ type: 'lc-items', items: [{ title: 'A' }], platform: 'udemy' }, 'https://cursos.alura.com.br/dashboard')).toEqual({ ok: true });
    expect(t.chrome.tabs.create).toHaveBeenCalledWith({ url: 'http://localhost:3000/importar/alura' });
    expect(t.session.platform).toBe('alura');
    const got = await t.send({ type: 'lc-get' }, 'http://localhost:3000/importar/alura');
    expect(got).toEqual({ items: [{ title: 'A' }], content: null, platform: 'alura' });
    await t.send({ type: 'lc-items', items: [{ title: 'B' }] }, 'https://www.ev.org.br/');
    expect(t.chrome.tabs.create).toHaveBeenLastCalledWith({ url: 'http://localhost:3000/importar/bradesco' });
    await t.send({ type: 'lc-items', items: [{ title: 'C' }] }, 'https://www.udemy.com/home/my-courses/');
    expect(t.chrome.tabs.create).toHaveBeenLastCalledWith({ url: 'http://localhost:3000/importar' });
  });

  it('origens que não são plataforma e domínios parecidos são ignorados', async () => {
    const t = load();
    for (const url of ['https://alura.com.br.evil.com/', 'https://evil.com/', 'https://notev.org.br/', 'não é url']) {
      expect(await t.send({ type: 'lc-items', items: [{ title: 'A' }] }, url), url).toBe('sem-resposta');
    }
    expect(t.chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('Alura e Bradesco não disparam sincronização da Udemy nem enviam conteúdo de aulas', async () => {
    const t = load();
    const content = { modules: [{ title: 'M', lessons: [] }] };
    for (const url of ['https://cursos.alura.com.br/', 'https://www.ev.org.br/']) {
      expect(await t.send({ type: 'lc-sync', kind: 'courses', items: [{}] }, url)).toBe('sem-resposta');
      expect(await t.send({ type: 'lc-sync', kind: 'content', content }, url)).toBe('sem-resposta');
      expect(await t.send({ type: 'lc-content', content }, url)).toBe('sem-resposta');
    }
    expect(t.fetchMock).not.toHaveBeenCalled();
    expect(await t.send({ type: 'lc-sync', kind: 'courses', items: [{}] }, 'https://www.udemy.com/')).toEqual({ ok: true, data: {} });
  });
});
