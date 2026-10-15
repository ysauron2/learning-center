import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBridge, isUdemyHost, senderKind } from './bridge.js';

const API = 'http://127.0.0.1:38250';

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
