import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBridge, isUdemyHost, isAuthHost, senderKind } from './bridge.js';

const API = 'http://127.0.0.1:38250';

describe('isAuthHost', () => {
  it('aceita só as páginas de login do Google, Apple e Facebook, por https', () => {
    expect(isAuthHost('https://accounts.google.com/o/oauth2/auth?x=1')).toBe(true);
    expect(isAuthHost('https://appleid.apple.com/auth/authorize')).toBe(true);
    expect(isAuthHost('https://www.facebook.com/v2.0/dialog/oauth')).toBe(true);
    expect(isAuthHost('http://accounts.google.com/')).toBe(false);
    expect(isAuthHost('https://accounts.google.com.evil.com/')).toBe(false);
    expect(isAuthHost('https://evil.com/accounts.google.com')).toBe(false);
    expect(isAuthHost('https://google.com/')).toBe(false);
    expect(isAuthHost('javascript:alert(1)')).toBe(false);
    expect(isAuthHost(undefined)).toBe(false);
  });
});

describe('isUdemyHost', () => {
  it('aceita só https em udemy.com e subdomínios', () => {
    expect(isUdemyHost('https://www.udemy.com/home/my-courses/learning/')).toBe(true);
    expect(isUdemyHost('https://empresa.udemy.com/x')).toBe(true);
    expect(isUdemyHost('https://udemy.com/')).toBe(true);
    expect(isUdemyHost('http://www.udemy.com/')).toBe(false);
    expect(isUdemyHost('https://udemy.com.evil.com/')).toBe(false);
    expect(isUdemyHost('https://notudemy.com/')).toBe(false);
    expect(isUdemyHost('javascript:alert(1)')).toBe(false);
    expect(isUdemyHost('não é url')).toBe(false);
    expect(isUdemyHost(undefined)).toBe(false);
  });
});

describe('senderKind', () => {
  it('distingue a Udemy, o próprio app e o resto', () => {
    expect(senderKind('https://www.udemy.com/x', API)).toBe('udemy');
    expect(senderKind(`${API}/importar`, API)).toBe('app');
    expect(senderKind('http://127.0.0.1:9999/importar', API)).toBeNull();
    expect(senderKind('https://evil.com/', API)).toBeNull();
    expect(senderKind('', API)).toBeNull();
  });
});

function setup({ fetchImpl, settings = { autoSync: false } } = {}) {
  const saved = [];
  const openAppPage = vi.fn();
  const fetchMock = fetchImpl ?? vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { created: 1 } }) });
  const bridge = createBridge({ apiBase: API, fetchImpl: fetchMock, settings: { ...settings }, saveSettings: (s) => saved.push({ ...s }), openAppPage });
  return { bridge, fetchMock, saved, openAppPage };
}

describe('bridge · sincronização', () => {
  it('cursos: chama a API local com updateProgress e devolve os dados', async () => {
    const { bridge, fetchMock } = setup();
    const r = await bridge.handle({ type: 'lc-sync', kind: 'courses', items: [{ title: 'A', url: 'u', progress: 1 }] }, 'udemy');
    expect(r).toEqual({ ok: true, data: { created: 1 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/api/v1/courses/import`);
    expect(JSON.parse(init.body)).toEqual({ updateProgress: true, items: [{ title: 'A', url: 'u', progress: 1 }] });
  });

  it('conteúdo: usa o endpoint de sincronização automática', async () => {
    const { bridge, fetchMock } = setup();
    const content = { title: 'T', url: 'u', modules: [{ title: 'M', lessons: [] }] };
    await bridge.handle({ type: 'lc-sync', kind: 'content', content }, 'udemy');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/v1/courses/sync-content`);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(content);
  });

  it('limita a 500 itens e rejeita pedidos malformados sem chamar a API', async () => {
    const { bridge, fetchMock } = setup();
    await bridge.handle({ type: 'lc-sync', kind: 'courses', items: Array.from({ length: 900 }, () => ({})) }, 'udemy');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).items).toHaveLength(500);
    fetchMock.mockClear();
    expect(await bridge.handle({ type: 'lc-sync', kind: 'courses' }, 'udemy')).toEqual({ ok: false, reason: 'bad-request' });
    expect(await bridge.handle({ type: 'lc-sync', kind: 'content', content: { modules: 'x' } }, 'udemy')).toEqual({ ok: false, reason: 'bad-request' });
    expect(await bridge.handle({ type: 'lc-sync', kind: 'outro' }, 'udemy')).toEqual({ ok: false, reason: 'bad-request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('API fora do ar vira "offline"; erro HTTP vira "http" com o código', async () => {
    const down = setup({ fetchImpl: vi.fn().mockRejectedValue(new TypeError('fetch failed')) });
    expect(await down.bridge.handle({ type: 'lc-sync', kind: 'courses', items: [{}] }, 'udemy')).toEqual({ ok: false, reason: 'offline' });
    const err = setup({ fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 503 }) });
    expect(await err.bridge.handle({ type: 'lc-sync', kind: 'courses', items: [{}] }, 'udemy')).toEqual({ ok: false, reason: 'http', status: 503 });
  });
});

describe('bridge · importação manual (botões da janela da Udemy)', () => {
  it('guarda a lista, abre a página certa do app e entrega uma única vez', async () => {
    const { bridge, openAppPage } = setup();
    expect(await bridge.handle({ type: 'lc-items', items: [{ title: 'A' }] }, 'udemy')).toEqual({ ok: true });
    expect(openAppPage).toHaveBeenCalledWith('/importar');
    expect(await bridge.handle({ type: 'lc-get' }, 'app')).toEqual({ items: [{ title: 'A' }], content: null });
    expect(await bridge.handle({ type: 'lc-get' }, 'app')).toEqual({ items: null, content: null });
  });

  it('conteúdo do curso abre /importar-conteudo', async () => {
    const { bridge, openAppPage } = setup();
    const content = { title: 'C', url: 'u', modules: [] };
    await bridge.handle({ type: 'lc-content', content }, 'udemy');
    expect(openAppPage).toHaveBeenCalledWith('/importar-conteudo');
    expect((await bridge.handle({ type: 'lc-get' }, 'app')).content).toEqual(content);
  });

  it('lista vazia ou malformada é recusada e não abre nada', async () => {
    const { bridge, openAppPage } = setup();
    expect(await bridge.handle({ type: 'lc-items' }, 'udemy')).toEqual({ ok: false, reason: 'bad-request' });
    expect(await bridge.handle({ type: 'lc-content' }, 'udemy')).toEqual({ ok: false, reason: 'bad-request' });
    expect(openAppPage).not.toHaveBeenCalled();
  });
});

describe('bridge · permissões por origem', () => {
  it('cada origem só pode o que lhe cabe', async () => {
    const { bridge, fetchMock, openAppPage } = setup();
    // a Udemy não consegue ler o que está pendente nem pedir para o app abrir páginas por 'lc-get'
    expect(await bridge.handle({ type: 'lc-get' }, 'udemy')).toEqual({ ok: false, reason: 'forbidden' });
    // o app não dispara sincronização nem grava configuração
    expect(await bridge.handle({ type: 'lc-sync', kind: 'courses', items: [{}] }, 'app')).toEqual({ ok: false, reason: 'forbidden' });
    expect(await bridge.handle({ type: 'storage-set', values: { autoSync: true } }, 'app')).toEqual({ ok: false, reason: 'forbidden' });
    // origem desconhecida não pode nada
    for (const t of ['lc-sync', 'lc-items', 'lc-content', 'lc-get', 'storage-get', 'storage-set', 'open-udemy']) {
      expect(await bridge.handle({ type: t }, null)).toEqual({ ok: false, reason: 'forbidden' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openAppPage).not.toHaveBeenCalled();
  });

  it('tipo de mensagem desconhecido é ignorado', async () => {
    const { bridge } = setup();
    expect(await bridge.handle({ type: 'rm-rf' }, 'udemy')).toEqual({ ok: false, reason: 'unknown' });
    expect(await bridge.handle(null, 'udemy')).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('bridge · configuração (interruptor da sincronização)', () => {
  it('lê e grava só a chave autoSync, como booleano, e persiste', async () => {
    const { bridge, saved } = setup({ settings: { autoSync: false } });
    expect(await bridge.handle({ type: 'storage-get', key: 'autoSync' }, 'udemy')).toEqual({ autoSync: false });
    await bridge.handle({ type: 'storage-set', values: { autoSync: true } }, 'udemy');
    expect(saved.at(-1)).toEqual({ autoSync: true });
    expect(await bridge.handle({ type: 'storage-get', key: 'autoSync' }, 'udemy')).toEqual({ autoSync: true });
    await bridge.handle({ type: 'storage-set', values: { autoSync: 'sim', outra: 1 } }, 'udemy');
    expect(saved.at(-1)).toEqual({ autoSync: true }); // string não vira booleano; chave extra é ignorada
    expect(await bridge.handle({ type: 'storage-get', key: 'qualquer' }, 'udemy')).toEqual({});
  });
});

describe('bridge · abrir a Udemy', () => {
  it('só o app pode pedir', async () => {
    const openUdemy = vi.fn();
    const bridge = createBridge({ apiBase: API, fetchImpl: vi.fn(), settings: {}, saveSettings: () => {}, openAppPage: () => {}, openUdemy });
    expect(await bridge.handle({ type: 'open-udemy' }, 'app')).toEqual({ ok: true });
    expect(openUdemy).toHaveBeenCalledTimes(1);
    expect(await bridge.handle({ type: 'open-udemy' }, 'udemy')).toEqual({ ok: false, reason: 'forbidden' });
    expect(openUdemy).toHaveBeenCalledTimes(1);
  });
});

describe('plataformas: Alura e Fundação Bradesco', () => {
  it('platformOfUrl e senderKind reconhecem só https nos domínios exatos (ou subdomínios)', async () => {
    const { platformOfUrl, PLATFORMS } = await import('./platforms.js');
    expect(platformOfUrl('https://cursos.alura.com.br/dashboard')).toBe('alura');
    expect(platformOfUrl('https://www.alura.com.br/curso-online-x')).toBe('alura');
    expect(platformOfUrl('https://www.ev.org.br/cursos/x')).toBe('bradesco');
    expect(platformOfUrl('https://ev.org.br/')).toBe('bradesco');
    for (const bad of ['http://www.alura.com.br/', 'https://alura.com.br.evil.com/', 'https://evil.com/alura.com.br', 'https://notalura.com.br/', 'https://ev.org.br.evil.com/', 'https://xev.org.br/', 'javascript:alert(1)', '', undefined]) {
      expect(platformOfUrl(bad), String(bad)).toBeNull();
    }
    expect(senderKind('https://cursos.alura.com.br/dashboard', API)).toBe('alura');
    expect(senderKind('https://www.ev.org.br/', API)).toBe('bradesco');
    expect(senderKind('https://alura.com.br.evil.com/', API)).toBeNull();
    // as páginas de "Meus cursos" ficam dentro dos domínios da própria plataforma
    for (const p of Object.values(PLATFORMS)) expect(platformOfUrl(p.home), p.id).toBe(p.id);
  });

  it('o login pelo LinkedIn (usado pela Escola Virtual) abre dentro do app, e só no host exato', () => {
    expect(isAuthHost('https://www.linkedin.com/oauth/v2/authorization?x=1')).toBe(true);
    expect(isAuthHost('https://www.linkedin.com.evil.com/')).toBe(false);
    expect(isAuthHost('https://evil.com/www.linkedin.com')).toBe(false);
  });

  it('a Alura entrega a lista como Alura (a plataforma vem da janela, nunca da mensagem)', async () => {
    const { bridge, fetchMock, openAppPage } = setup();
    const items = [{ title: 'A', url: 'https://cursos.alura.com.br/course/a', progress: 10 }];
    const r = await bridge.handle({ type: 'lc-sync', kind: 'courses', items, platform: 'udemy' }, 'alura');
    expect(r.ok).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ platform: 'alura', updateProgress: true, items });
    await bridge.handle({ type: 'lc-items', items, platform: 'bradesco' }, 'alura');
    expect(openAppPage).toHaveBeenCalledWith('/importar/alura');
    expect(await bridge.handle({ type: 'lc-get' }, 'app')).toEqual({ items, content: null, platform: 'alura' });
    expect(await bridge.handle({ type: 'lc-get' }, 'app')).toEqual({ items: null, content: null });
  });

  it('a Fundação Bradesco abre /importar/bradesco', async () => {
    const { bridge, openAppPage } = setup();
    await bridge.handle({ type: 'lc-items', items: [{ title: 'A' }] }, 'bradesco');
    expect(openAppPage).toHaveBeenCalledWith('/importar/bradesco');
  });

  it('Alura e Bradesco não podem sincronizar conteúdo de aulas nem enviar conteúdo (só a Udemy)', async () => {
    const { bridge, fetchMock, openAppPage } = setup();
    const content = { title: 'C', url: 'u', modules: [{ title: 'M', lessons: [] }] };
    for (const kind of ['alura', 'bradesco']) {
      expect(await bridge.handle({ type: 'lc-sync', kind: 'content', content }, kind)).toEqual({ ok: false, reason: 'bad-request' });
      expect(await bridge.handle({ type: 'lc-content', content }, kind)).toEqual({ ok: false, reason: 'forbidden' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openAppPage).not.toHaveBeenCalled();
  });

  it('as janelas das plataformas nunca recebem nada do app nem mandam abrir janelas', async () => {
    const { bridge, fetchMock } = setup();
    for (const kind of ['alura', 'bradesco', 'udemy']) {
      expect(await bridge.handle({ type: 'lc-get' }, kind)).toEqual({ ok: false, reason: 'forbidden' });
      expect(await bridge.handle({ type: 'open-platform', platform: 'alura' }, kind)).toEqual({ ok: false, reason: 'forbidden' });
      expect(await bridge.handle({ type: 'open-udemy' }, kind)).toEqual({ ok: false, reason: 'forbidden' });
    }
    for (const t of ['lc-sync', 'lc-items', 'storage-get', 'storage-set', 'open-platform']) {
      expect(await bridge.handle({ type: t }, null)).toEqual({ ok: false, reason: 'forbidden' });
      expect(await bridge.handle({ type: t }, 'outra')).toEqual({ ok: false, reason: 'forbidden' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('o app pode pedir para abrir só plataformas conhecidas; as janelas usam o mesmo interruptor de sincronização', async () => {
    const openPlatform = vi.fn();
    const saved = [];
    const bridge = createBridge({ apiBase: API, fetchImpl: vi.fn(), settings: { autoSync: false }, saveSettings: (s) => saved.push(s), openAppPage: () => {}, openPlatform });
    expect(await bridge.handle({ type: 'open-platform', platform: 'alura' }, 'app')).toEqual({ ok: true });
    expect(await bridge.handle({ type: 'open-platform', platform: 'bradesco' }, 'app')).toEqual({ ok: true });
    expect(openPlatform.mock.calls).toEqual([['alura'], ['bradesco']]);
    for (const bad of ['evil', '', undefined, 5, '../x', '__proto__']) {
      expect(await bridge.handle({ type: 'open-platform', platform: bad }, 'app')).toEqual({ ok: false, reason: 'bad-request' });
    }
    expect(openPlatform).toHaveBeenCalledTimes(2);
    expect(await bridge.handle({ type: 'storage-get', key: 'autoSync' }, 'alura')).toEqual({ autoSync: false });
  });

  it('o registro do desktop concorda com o da API (mesmos domínios)', async () => {
    const { PLATFORMS: desk } = await import('./platforms.js');
    const { PLATFORMS: api } = await import('../../api/src/core/platforms.js');
    // plataformas só de link (Microsoft Learn etc.) não têm janela logada no desktop
    for (const id of Object.keys(api).filter((k) => !api[k].linkOnly)) expect(desk[id].domains, id).toEqual(api[id].domains);
    for (const id of Object.keys(api).filter((k) => api[k].linkOnly)) expect(desk[id], id).toBeUndefined();
    expect(desk.alura.home).toBe(api.alura.myCoursesUrl);
    expect(desk.bradesco.home).toBe(api.bradesco.myCoursesUrl);
  });
});

describe('ponte: estado de atualização do cartão do Início', () => {
  const mk = (updates) => createBridge({ apiBase: 'http://x', settings: {}, saveSettings: () => {}, openAppPage: () => {}, getUpdates: () => updates });

  it('só a janela do app consulta e instala', async () => {
    const updates = { peek: vi.fn(() => ({ status: 'available' })), refresh: vi.fn(async () => ({ status: 'current' })), install: vi.fn(() => ({ status: 'started' })) };
    const bridge = mk(updates);
    for (const kind of ['udemy', 'alura', 'bradesco', null]) {
      expect(await bridge.handle({ type: 'update-state' }, kind)).toEqual({ ok: false, reason: 'forbidden' });
      expect(await bridge.handle({ type: 'update-install' }, kind)).toEqual({ ok: false, reason: 'forbidden' });
    }
    expect(updates.install).not.toHaveBeenCalled();
    expect(await bridge.handle({ type: 'update-state' }, 'app')).toEqual({ status: 'available' });
    expect(await bridge.handle({ type: 'update-state', refresh: true }, 'app')).toEqual({ status: 'current' });
    expect(await bridge.handle({ type: 'update-state', refresh: 'sim' }, 'app')).toEqual({ status: 'available' });
    expect(await bridge.handle({ type: 'update-install' }, 'app')).toEqual({ status: 'started' });
  });

  it('sem controlador (modo de teste) responde "disabled"/"none"', async () => {
    const bridge = mk(null);
    expect(await bridge.handle({ type: 'update-state', refresh: true }, 'app')).toEqual({ status: 'disabled' });
    expect(await bridge.handle({ type: 'update-install' }, 'app')).toEqual({ status: 'none' });
  });
});
