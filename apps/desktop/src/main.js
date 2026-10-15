import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createBridge, senderKind, isAuthHost } from './bridge.js';
import { PLATFORMS, PLATFORM_IDS, platformOfUrl } from './platforms.js';
import { createUpdateController } from './updates.js';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const PREFERRED_PORT = Number(process.env.LC_PORT ?? 38250);
const SMOKE = process.env.LC_SMOKE === '1';

let server;
let base;
let mainWin;
const platformWins = {}; // uma janela por plataforma (Udemy, Alura, Fundação Bradesco)
let bridge;
let updates;

const isHttp = (url) => /^https?:\/\//i.test(url);

/** Identificador de navegador sem "Electron" nem o nome do app (muitos sites recusam esses). */
function browserUserAgent() {
  return app.userAgentFallback
    .replace(/\s?Electron\/\S+/i, '')
    .replace(new RegExp(`\\s?${app.getName().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/\\S+`, 'i'), '');
}

async function startServer(userData) {
  const { buildApp } = await import(pathToFileURL(join(dist, 'server.mjs')).href);
  const webDist = app.isPackaged ? join(process.resourcesPath, 'web') : join(here, '..', '..', 'web', 'dist');
  server = await buildApp({
    databaseFile: process.env.LC_DB ?? join(userData, 'learning-center.db'),
    webDist,
    migrationsDir: join(dist, 'migrations'),
    autoSync: true, // sincroniza o Google Agenda sozinho enquanto o app está aberto
    logger: false,
  });
  try {
    await server.listen({ host: '127.0.0.1', port: PREFERRED_PORT });
  } catch {
    await server.listen({ host: '127.0.0.1', port: 0 }); // porta ocupada: usa qualquer livre
  }
  base = `http://127.0.0.1:${server.server.address().port}`;
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    title: 'Lume',
    show: !SMOKE,
    webPreferences: { preload: join(dist, 'preload-app.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttp(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWin.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(base)) {
      event.preventDefault();
      if (isHttp(url)) shell.openExternal(url);
    }
  });
  mainWin.loadURL(base);
  mainWin.on('closed', () => { mainWin = null; });
}

function openAppPage(path) {
  if (!mainWin) createMainWindow();
  mainWin.show();
  mainWin.focus();
  mainWin.loadURL(`${base}${path}`);
}

function openPlatform(id) {
  const platform = PLATFORMS[id];
  if (!platform) return;
  const existing = platformWins[id];
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    title: `${platform.name} · Lume`,
    show: !SMOKE,
    webPreferences: {
      partition: `persist:${id}`, // mantém o login entre aberturas (uma sessão separada por plataforma)
      preload: join(dist, `preload-${id}.cjs`),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  platformWins[id] = win;
  win.webContents.setUserAgent(browserUserAgent());
  // Links para fora da plataforma abrem no navegador do sistema; os dela ficam nesta janela.
  // Exceção: a janelinha de login (Google/Apple/Facebook/LinkedIn) abre aqui dentro, com a mesma sessão, para o login voltar para a plataforma.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuthHost(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { parent: win, width: 520, height: 720, title: 'Entrar · Lume', autoHideMenuBar: true } };
    }
    if (platformOfUrl(url) === id) win.loadURL(url);
    else if (isHttp(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child) => {
    child.webContents.setUserAgent(browserUserAgent());
  });
  win.loadURL(SMOKE ? 'about:blank' : platform.home);
  win.on('closed', () => { delete platformWins[id]; });
}

const openUdemy = () => openPlatform('udemy');

/** Avisos de versão nova e atualização (só no app instalado; veja updates.js). */
async function setupUpdates(settings, saveSettings) {
  let updater = null;
  if (app.isPackaged && !SMOKE && process.platform === 'win32') {
    try {
      const { default: electronUpdater } = await import('electron-updater');
      updater = electronUpdater.autoUpdater;
      updater.autoDownload = false; // só baixa quando a pessoa clica em "Atualizar agora"
      updater.autoInstallOnAppQuit = false;
      updater.setFeedURL({ provider: 'github', owner: 'ysauron2', repo: 'learning-center' });
    } catch (error) {
      console.error('[atualização] atualizador indisponível:', error?.message ?? error);
    }
  }
  const icon = nativeImage.createFromPath(join(here, '..', 'build', 'icon.png'));
  updates = createUpdateController({
    currentVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    enabled: app.isPackaged && !SMOKE,
    fetch: (url, init) => fetch(url, init),
    getSnooze: () => settings.updateSnooze ?? null,
    setSnooze: (snooze) => {
      settings.updateSnooze = snooze;
      try { saveSettings({ ...settings }); } catch { /* ignora */ }
    },
    showDialog: async ({ title, message, detail, buttons }) => {
      const options = { type: 'info', title, message, detail, buttons, defaultId: 0, cancelId: buttons.length - 1, noLink: true, icon: icon.isEmpty() ? undefined : icon };
      const { response } = mainWin && !mainWin.isDestroyed() && mainWin.isVisible() ? await dialog.showMessageBox(mainWin, options) : await dialog.showMessageBox(options);
      return response;
    },
    openLink: (url) => shell.openExternal(url),
    updater,
    setProgress: (value) => { if (mainWin && !mainWin.isDestroyed()) mainWin.setProgressBar(value); },
    log: (line) => console.log(line),
  });
  updates.start();
}

function buildMenu() {
  const template = [
    { label: 'Lume', submenu: [{ role: 'about' }, { label: 'Verificar atualizações…', click: () => { updates?.checkNow({ manual: true }); } }, { type: 'separator' }, { role: 'quit', label: 'Sair' }] },
    {
      label: 'Plataformas',
      submenu: [
        { label: 'Abrir a Udemy (Meu aprendizado)', accelerator: 'CmdOrCtrl+U', click: () => openPlatform('udemy') },
        { label: 'Abrir a Alura', accelerator: 'CmdOrCtrl+Shift+A', click: () => openPlatform('alura') },
        { label: 'Abrir a Fundação Bradesco', accelerator: 'CmdOrCtrl+Shift+B', click: () => openPlatform('bradesco') },
      ],
    },
    { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Exibir', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
    { label: 'Janela', role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function smokeTest() {
  const win = mainWin;
  await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  const result = await win.webContents.executeJavaScript(
    `(async () => ({ title: document.title, desktop: Boolean(window.lcDesktop && window.lcDesktop.isDesktop), health: await fetch('/api/v1/health').then((r) => r.json()), courses: (await fetch('/api/v1/courses').then((r) => r.json())).data.length, path: location.pathname }))()`,
  );
  const windows = Object.fromEntries(PLATFORM_IDS.map((id) => [id, Boolean(platformWins[id] && !platformWins[id].isDestroyed())]));
  const out = { ...result, base, udemyWindow: windows.udemy, platformWindows: windows, userAgent: browserUserAgent(), userData: app.getPath('userData'), electron: process.versions.electron, node: process.versions.node };
  if (process.env.LC_SMOKE_OUT) writeFileSync(process.env.LC_SMOKE_OUT, JSON.stringify(out, null, 2));
  app.quit();
}

// Só para testes automáticos: pasta de dados própria (assim não esbarra no app aberto da pessoa).
if (process.env.LC_USER_DATA) app.setPath('userData', process.env.LC_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
  });

  app.whenReady().then(async () => {
    const userData = app.getPath('userData');
    mkdirSync(userData, { recursive: true });
    const settingsFile = join(userData, 'settings.json');
    let settings = {};
    try { settings = JSON.parse(readFileSync(settingsFile, 'utf8')); } catch { /* primeira vez */ }

    await startServer(userData);
    bridge = createBridge({
      apiBase: base,
      settings,
      saveSettings: (s) => { try { writeFileSync(settingsFile, JSON.stringify(s)); } catch { /* ignora */ } },
      openAppPage,
      openUdemy,
      openPlatform,
    });

    // Só aceita mensagens do quadro principal de cada janela e confere o endereço de quem enviou.
    ipcMain.handle('lc-msg', (event, msg) => {
      const wc = event.sender;
      const url = event.senderFrame?.url ?? '';
      if (event.senderFrame !== wc.mainFrame) return { ok: false, reason: 'forbidden' };
      let kind = null;
      // cada janela só vale como a plataforma dela: se ela navegar para outro site, deixa de ser aceita
      const platformId = PLATFORM_IDS.find((id) => platformWins[id] && !platformWins[id].isDestroyed() && wc === platformWins[id].webContents);
      if (platformId) kind = senderKind(url, base) === platformId ? platformId : null;
      else if (mainWin && wc === mainWin.webContents) kind = senderKind(url, base) === 'app' ? 'app' : null;
      return bridge.handle(msg, kind);
    });

    buildMenu();
    createMainWindow();
    await setupUpdates(settings, (s) => { try { writeFileSync(settingsFile, JSON.stringify(s)); } catch { /* ignora */ } });
    if (SMOKE) { PLATFORM_IDS.forEach(openPlatform); await smokeTest(); }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { updates?.stop(); server?.close().catch(() => {}); });
}
