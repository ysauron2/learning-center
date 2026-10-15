import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  compareVersions, isNewer, isAllowedUrl, summarizeNotes, parseRelease, shouldNotify, checkForUpdate,
  createUpdateController, LATEST_API, RELEASES_PAGE, SNOOZE_MS, FIRST_CHECK_MS, CHECK_EVERY_MS,
} from './updates.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/release-latest.json', import.meta.url), 'utf8'));
const okResponse = (json) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(json) });
const failResponse = (status) => ({ ok: false, status, headers: { get: () => null }, text: async () => '{}' });
const release = (tag, extra = {}) => ({ ...fixture, tag_name: tag, html_url: `https://github.com/ysauron2/learning-center/releases/tag/${tag}`, ...extra });

describe('compareVersions', () => {
  it('compara números e aceita o "v" opcional', () => {
    expect(compareVersions('0.1.1', '0.1.2')).toBe(-1);
    expect(compareVersions('v0.2.0', '0.1.9')).toBe(1);
    expect(compareVersions('1.0.0', 'v1.0.0')).toBe(0);
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions(' 1.2.3 ', '1.2.3')).toBe(0);
  });
  it('pré-lançamento é menor que a versão final', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1);
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1);
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBe(-1);
    expect(compareVersions('1.0.0-beta', '1.0.0-beta.1')).toBe(-1);
    expect(compareVersions('1.0.0+build5', '1.0.0')).toBe(0);
  });
  it('entradas inválidas dão null e nunca contam como atualização', () => {
    for (const bad of ['', 'abc', '1.2', '1.2.3.4', 'latest', null, undefined, 12, {}, '1.2.x', '-1.0.0']) {
      expect(compareVersions(bad, '1.0.0')).toBeNull();
      expect(compareVersions('1.0.0', bad)).toBeNull();
      expect(isNewer(bad, '1.0.0')).toBe(false);
    }
  });
});

describe('isAllowedUrl', () => {
  it('só aceita https em github.com/ysauron2/learning-center', () => {
    expect(isAllowedUrl(RELEASES_PAGE)).toBe(true);
    expect(isAllowedUrl('https://github.com/ysauron2/learning-center/releases/download/v1/Lume.exe')).toBe(true);
    expect(isAllowedUrl('https://github.com/ysauron2/learning-center')).toBe(true);
    expect(isAllowedUrl('http://github.com/ysauron2/learning-center/releases')).toBe(false);
    expect(isAllowedUrl('https://github.com/ysauron2/learning-center-evil/releases')).toBe(false);
    expect(isAllowedUrl('https://github.com/outro/learning-center/releases')).toBe(false);
    expect(isAllowedUrl('https://github.com.evil.com/ysauron2/learning-center/')).toBe(false);
    expect(isAllowedUrl('https://evil.com/github.com/ysauron2/learning-center/')).toBe(false);
    expect(isAllowedUrl('https://user@github.com/ysauron2/learning-center/x')).toBe(false);
    expect(isAllowedUrl('https://github.com:8443/ysauron2/learning-center/x')).toBe(false);
    expect(isAllowedUrl('file:///C:/x.exe')).toBe(false);
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedUrl(undefined)).toBe(false);
  });
});

describe('summarizeNotes', () => {
  it('tira o Markdown, tabelas e limita o tamanho', () => {
    const text = summarizeNotes('## Lume 1.0\n\n**Novidade:** [link](https://x.y) com `código`.\n\n| a | b |\n|---|---|\n- item um\n');
    expect(text).toBe('Lume 1.0\nNovidade: link com código.\n• item um');
    const long = summarizeNotes('palavra '.repeat(200));
    expect(long.length).toBeLessThanOrEqual(500);
    expect(long.endsWith('…')).toBe(true);
    expect(summarizeNotes(null)).toBe('');
  });
});

describe('parseRelease (resposta real da API)', () => {
  it('extrai versão, notas, página e instalador do Windows', () => {
    const r = parseRelease(fixture, { platform: 'win32', arch: 'x64' });
    expect(r.version).toBe('0.1.1');
    expect(r.pageUrl).toBe('https://github.com/ysauron2/learning-center/releases/tag/v0.1.1');
    expect(r.installerUrl).toBe('https://github.com/ysauron2/learning-center/releases/download/v0.1.1/Lume-0.1.1-win-x64.exe');
    expect(r.notes).toContain('Novidade da 0.1.1');
    expect(r.notes).not.toMatch(/[*`|#]/);
    expect(r.notes.length).toBeLessThanOrEqual(500);
  });
  it('escolhe o .dmg da arquitetura do Mac', () => {
    expect(parseRelease(fixture, { platform: 'darwin', arch: 'arm64' }).installerUrl).toMatch(/mac-arm64\.dmg$/);
    expect(parseRelease(fixture, { platform: 'darwin', arch: 'x64' }).installerUrl).toMatch(/mac-x64\.dmg$/);
  });
  it('ignora rascunhos, pré-lançamentos e respostas estranhas', () => {
    expect(parseRelease({ ...fixture, draft: true })).toBeNull();
    expect(parseRelease({ ...fixture, prerelease: true })).toBeNull();
    expect(parseRelease({ ...fixture, tag_name: 'nao-e-versao' })).toBeNull();
    expect(parseRelease({ ...fixture, tag_name: 5 })).toBeNull();
    for (const bad of [null, undefined, 'x', 42, [], {}]) expect(parseRelease(bad)).toBeNull();
  });
  it('descarta link de fora do repositório (usa a página padrão e não o instalador)', () => {
    const r = parseRelease({
      ...fixture,
      html_url: 'https://evil.com/x',
      assets: [{ name: 'Lume-9.9.9-win-x64.exe', browser_download_url: 'https://evil.com/Lume.exe' }],
    }, { platform: 'win32' });
    expect(r.pageUrl).toBe(RELEASES_PAGE);
    expect(r.installerUrl).toBeNull();
  });
});

describe('shouldNotify (adiar por 24 h)', () => {
  const now = 1_000_000;
  it('avisa quando não há adiamento', () => {
    expect(shouldNotify({ version: '1.0.0', snooze: null, now })).toBe(true);
    expect(shouldNotify({ version: '1.0.0', snooze: 'lixo', now })).toBe(true);
  });
  it('não avisa a mesma versão dentro das 24 h e volta a avisar depois', () => {
    const snooze = { version: '1.0.0', until: now + SNOOZE_MS };
    expect(shouldNotify({ version: '1.0.0', snooze, now })).toBe(false);
    expect(shouldNotify({ version: '1.0.0', snooze, now: now + SNOOZE_MS })).toBe(true);
  });
  it('versão ainda mais nova avisa mesmo adiada', () => {
    expect(shouldNotify({ version: '1.1.0', snooze: { version: '1.0.0', until: now + SNOOZE_MS }, now })).toBe(true);
  });
});

describe('checkForUpdate — falhas silenciosas', () => {
  const base = { currentVersion: '0.1.0', platform: 'win32', arch: 'x64' };
  const run = (fetch, extra = {}) => checkForUpdate({ ...base, fetch, log: () => {}, ...extra });

  it('chama a API certa com os cabeçalhos pedidos', async () => {
    const fetch = vi.fn(async () => okResponse(fixture));
    await run(fetch);
    expect(fetch.mock.calls[0][0]).toBe(LATEST_API);
    expect(fetch.mock.calls[0][1].headers).toMatchObject({ 'User-Agent': 'Lume-Updater', Accept: 'application/vnd.github+json' });
  });
  it('acha versão nova, já atualizado e versão local mais nova', async () => {
    expect((await run(async () => okResponse(fixture))).status).toBe('available');
    expect((await run(async () => okResponse(fixture), { currentVersion: '0.1.1' })).status).toBe('current');
    expect((await run(async () => okResponse(fixture), { currentVersion: '0.2.0' })).status).toBe('current');
  });
  it('rede caída, 403, 404, 500, JSON ruim, formato errado: tudo vira "error" sem lançar', async () => {
    expect((await run(async () => { throw new Error('sem rede'); })).status).toBe('error');
    for (const code of [403, 404, 500]) expect((await run(async () => failResponse(code))).status).toBe('error');
    expect((await run(async () => ({ ok: true, headers: { get: () => null }, text: async () => '<html>' }))).status).toBe('error');
    expect((await run(async () => okResponse({ foo: 1 }))).status).toBe('error');
    expect((await run(async () => okResponse([]))).status).toBe('error');
    expect((await run(async () => okResponse(release('v1.0.0', { draft: true })))).status).toBe('error');
  });
  it('recusa resposta grande demais', async () => {
    const big = { ok: true, headers: { get: () => '99999999' }, text: async () => '{}' };
    expect((await run(async () => big)).status).toBe('error');
    const bigText = { ok: true, headers: { get: () => null }, text: async () => 'x'.repeat(1_100_000) };
    expect((await run(async () => bigText)).status).toBe('error');
  });
  it('tempo esgotado vira "error"', async () => {
    const result = await run(() => new Promise(() => {}), { setTimeoutFn: (fn) => { queueMicrotask(fn); return 1; }, clearTimeoutFn: () => {} });
    expect(result.status).toBe('error');
  });
  it('versão instalada inválida não gera aviso', async () => {
    expect((await run(async () => okResponse(fixture), { currentVersion: 'dev' })).status).toBe('error');
  });
});

function setup(over = {}) {
  const calls = { dialogs: [], links: [], snooze: [], progress: [] };
  const answers = [...(over.answers ?? [])];
  const deps = {
    currentVersion: '0.1.0',
    platform: 'win32',
    arch: 'x64',
    fetch: async () => okResponse(fixture),
    now: () => 5_000_000,
    getSnooze: () => over.snooze ?? null,
    setSnooze: (s) => calls.snooze.push(s),
    showDialog: async (o) => { calls.dialogs.push(o); return answers.length ? answers.shift() : 0; },
    openLink: async (u) => { calls.links.push(u); },
    setProgress: (p) => calls.progress.push(p),
    log: () => {},
    updater: null,
    ...over.deps,
  };
  return { calls, controller: createUpdateController(deps) };
}

function fakeUpdater({ failDownload = false } = {}) {
  const handlers = {};
  return {
    handlers,
    checkForUpdates: vi.fn(async () => ({})),
    downloadUpdate: vi.fn(async () => { if (failDownload) throw new Error('falhou'); handlers['download-progress']?.({ percent: 42.4 }); return []; }),
    quitAndInstall: vi.fn(),
    on: (event, fn) => { handlers[event] = fn; },
  };
}

describe('controlador — aviso', () => {
  it('mostra o aviso em português com as novidades e os dois botões', async () => {
    const { controller, calls } = setup({ answers: [1] });
    const result = await controller.checkNow();
    expect(result.status).toBe('available');
    const d = calls.dialogs[0];
    expect(d.title).toBe('Nova versão do Lume');
    expect(d.message).toBe('O Lume 0.1.1 está disponível (você está na 0.1.0).');
    expect(d.detail).toContain('Novidade da 0.1.1');
    expect(d.buttons).toEqual(['Atualizar agora', 'Depois']);
  });
  it('"Depois" adia aquela versão por 24 h; a verificação seguinte fica quieta', async () => {
    const first = setup({ answers: [1] });
    await first.controller.checkNow();
    expect(first.calls.snooze).toEqual([{ version: '0.1.1', until: 5_000_000 + SNOOZE_MS }]);
    const again = setup({ snooze: first.calls.snooze[0] });
    expect((await again.controller.checkNow()).status).toBe('snoozed');
    expect(again.calls.dialogs).toHaveLength(0);
  });
  it('falha ao guardar o adiamento não quebra', async () => {
    const { controller } = setup({ answers: [1], deps: { setSnooze: () => { throw new Error('disco'); } } });
    await expect(controller.checkNow()).resolves.toMatchObject({ status: 'available' });
  });
  it('falhas automáticas não mostram nada', async () => {
    for (const fetch of [async () => { throw new Error('x'); }, async () => failResponse(404), async () => failResponse(403)]) {
      const { controller, calls } = setup({ deps: { fetch } });
      expect((await controller.checkNow()).status).toBe('error');
      expect(calls.dialogs).toHaveLength(0);
    }
  });
  it('nunca abre duas janelinhas ao mesmo tempo', async () => {
    let release_;
    const gate = new Promise((r) => { release_ = r; });
    const { controller, calls } = setup({ deps: { showDialog: async (o) => { calls.dialogs.push(o); await gate; return 1; } } });
    const a = controller.checkNow();
    await new Promise((r) => setTimeout(r, 5));
    expect((await controller.checkNow()).status).toBe('busy');
    expect((await controller.checkNow({ manual: true })).status).toBe('busy');
    release_();
    await a;
    expect(calls.dialogs).toHaveLength(1);
  });
});

describe('controlador — Mac', () => {
  it('"Atualizar agora" explica e abre a página da release (nada é instalado sozinho)', async () => {
    const updater = fakeUpdater();
    const { controller, calls } = setup({ answers: [0, 0], deps: { platform: 'darwin', arch: 'arm64', updater } });
    await controller.checkNow();
    expect(calls.links).toEqual([RELEASES_PAGE]);
    expect(calls.dialogs[1].detail).toBe('Baixe o arquivo do seu Mac e arraste para Aplicativos.');
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });
});

describe('controlador — Windows', () => {
  it('baixa com o atualizador, mostra progresso e pergunta se reinicia', async () => {
    const updater = fakeUpdater();
    const { controller, calls } = setup({ answers: [0, 0], deps: { updater } });
    await controller.checkNow();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(calls.progress).toContain(0.42);
    expect(calls.progress.at(-1)).toBe(-1);
    expect(calls.dialogs[1].message).toBe('O Lume 0.1.1 foi baixado. Reiniciar agora para instalar?');
    expect(calls.dialogs[1].buttons).toEqual(['Reiniciar agora', 'Depois']);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(calls.links).toHaveLength(0);
  });
  it('"Depois" na hora de reiniciar não reinicia', async () => {
    const updater = fakeUpdater();
    const { controller } = setup({ answers: [0, 1], deps: { updater } });
    await controller.checkNow();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
  it('erro no download mostra mensagem clara e oferece a página de download', async () => {
    const updater = fakeUpdater({ failDownload: true });
    const { controller, calls } = setup({ answers: [0, 0], deps: { updater } });
    await controller.checkNow();
    expect(calls.dialogs[1].title).toBe('Não consegui atualizar');
    expect(calls.dialogs[1].buttons).toEqual(['Abrir página de download', 'Fechar']);
    expect(calls.links).toEqual(['https://github.com/ysauron2/learning-center/releases/tag/v0.1.1']);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(calls.progress.at(-1)).toBe(-1);
  });
  it('erro no download e "Fechar" não abre nada', async () => {
    const { controller, calls } = setup({ answers: [0, 1], deps: { updater: fakeUpdater({ failDownload: true }) } });
    await controller.checkNow();
    expect(calls.links).toHaveLength(0);
  });
});

describe('controlador — "Verificar atualizações…" (manual) sempre responde', () => {
  it('versão nova: mostra o aviso mesmo se tinha sido adiada', async () => {
    const { controller, calls } = setup({ answers: [1], snooze: { version: '0.1.1', until: 9e15 } });
    await controller.checkNow({ manual: true });
    expect(calls.dialogs[0].title).toBe('Nova versão do Lume');
  });
  it('já atualizado', async () => {
    const { controller, calls } = setup({ deps: { currentVersion: '0.1.1' } });
    await controller.checkNow({ manual: true });
    expect(calls.dialogs[0].message).toBe('Você já está na versão mais recente (0.1.1).');
  });
  it('falha', async () => {
    const { controller, calls } = setup({ deps: { fetch: async () => failResponse(403) } });
    await controller.checkNow({ manual: true });
    expect(calls.dialogs[0].message).toBe('Não consegui verificar agora. Tente de novo mais tarde.');
  });
});

describe('controlador — só empacotado', () => {
  it('sem estar empacotado não consulta a rede nem agenda nada', async () => {
    const fetch = vi.fn(async () => okResponse(fixture));
    const setTimeoutFn = vi.fn();
    const setIntervalFn = vi.fn();
    const { controller, calls } = setup({ deps: { enabled: false, fetch, setTimeoutFn, setIntervalFn } });
    controller.start();
    expect((await controller.checkNow()).status).toBe('disabled');
    expect(fetch).not.toHaveBeenCalled();
    expect(setTimeoutFn).not.toHaveBeenCalled();
    expect(setIntervalFn).not.toHaveBeenCalled();
    expect(calls.dialogs).toHaveLength(0);
  });
  it('pelo menu, avisa em português que só vale no app instalado (sem consultar a rede)', async () => {
    const fetch = vi.fn();
    const { controller, calls } = setup({ deps: { enabled: false, fetch } });
    await controller.checkNow({ manual: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(calls.dialogs[0].message).toContain('só funciona no Lume instalado');
  });
});

describe('controlador — agenda', () => {
  it('verifica 15 s depois de abrir e a cada 6 h, com timers que não seguram o app', async () => {
    const timers = [];
    const mk = (kind) => (fn, ms) => { const t = { kind, fn, ms, unref: vi.fn(), cleared: false }; timers.push(t); return t; };
    const fetch = vi.fn(async () => okResponse(fixture));
    const { controller } = setup({ answers: [1, 1], deps: { fetch, setTimeoutFn: mk('timeout'), setIntervalFn: mk('interval'), clearTimeoutFn: (t) => { t.cleared = true; }, clearIntervalFn: (t) => { t.cleared = true; } } });
    controller.start();
    controller.start(); // não duplica
    expect(timers.map((t) => [t.kind, t.ms])).toEqual([['timeout', FIRST_CHECK_MS], ['interval', CHECK_EVERY_MS]]);
    expect(FIRST_CHECK_MS).toBe(15_000);
    expect(CHECK_EVERY_MS).toBe(21_600_000);
    timers.forEach((t) => expect(t.unref).toHaveBeenCalled());
    timers[0].fn();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetch).toHaveBeenCalledTimes(1);
    controller.stop();
    expect(timers.every((t) => t.cleared)).toBe(true);
  });
});

describe('estado para o cartão do Início', () => {
  it('antes de verificar o estado é desconhecido; refresh acha a versão nova sem abrir janelinha', async () => {
    const { controller, calls } = setup();
    expect(controller.peek()).toEqual({ status: 'unknown', current: '0.1.0' });
    const s = await controller.refresh();
    expect(s).toMatchObject({ status: 'available', current: '0.1.0', platform: 'win32', version: expect.any(String), pageUrl: expect.stringContaining('github.com/ysauron2/learning-center/') });
    expect(calls.dialogs).toHaveLength(0);
    expect(controller.peek().status).toBe('available');
  });

  it('refresh fica em cache por 10 minutos (não consulta o GitHub toda hora)', async () => {
    let t = 5_000_000;
    const fetch = vi.fn(async () => okResponse(fixture));
    const { controller } = setup({ deps: { fetch, now: () => t } });
    await controller.refresh();
    await controller.refresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    t += 11 * 60 * 1000;
    await controller.refresh();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('sem versão nova: "current"; erro de rede: "error", e erro não apaga um aviso já conhecido', async () => {
    const same = setup({ deps: { currentVersion: '99.0.0' } });
    expect((await same.controller.refresh()).status).toBe('current');
    let fail = false;
    let t = 5_000_000;
    const { controller } = setup({ deps: { fetch: async () => (fail ? failResponse(500) : okResponse(fixture)), now: () => t } });
    expect((await controller.refresh()).status).toBe('available');
    fail = true;
    t += 11 * 60 * 1000;
    expect((await controller.refresh()).status).toBe('available');
    const broken = setup({ deps: { fetch: async () => failResponse(404) } });
    expect((await broken.controller.refresh()).status).toBe('error');
  });

  it('desativado (não instalado/teste): "disabled" e nunca consulta', async () => {
    const fetch = vi.fn();
    const { controller } = setup({ deps: { enabled: false, fetch } });
    expect((await controller.refresh()).status).toBe('disabled');
    expect(controller.install()).toEqual({ status: 'none' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a verificação normal (com janelinha) também atualiza o estado', async () => {
    const { controller } = setup({ answers: [1] });
    await controller.checkNow();
    expect(controller.peek().status).toBe('available');
  });

  it('install sem versão conhecida não faz nada; no Mac abre a página e responde na hora', async () => {
    const mac = setup({ deps: { platform: 'darwin' } });
    expect(mac.controller.install()).toEqual({ status: 'none' });
    await mac.controller.refresh();
    expect(mac.controller.install()).toEqual({ status: 'started', platform: 'darwin' });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(mac.calls.links).toEqual([RELEASES_PAGE]);
  });

  it('install no Windows baixa pelo atualizador e não dispara duas vezes ao mesmo tempo', async () => {
    const updater = fakeUpdater();
    const { controller } = setup({ deps: { updater }, answers: [1] });
    await controller.refresh();
    expect(controller.install().status).toBe('started');
    expect(controller.install().status).toBe('busy');
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  });
});
