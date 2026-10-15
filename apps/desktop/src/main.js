import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createBridge, senderKind, isUdemyHost } from './bridge.js';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const PREFERRED_PORT = Number(process.env.LC_PORT ?? 38250);
const UDEMY_HOME = 'https://www.udemy.com/home/my-courses/learning/';
const SMOKE = process.env.LC_SMOKE === '1';

let server;
let base;
let mainWin;
let udemyWin;
let bridge;

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

function openUdemy() {
  if (udemyWin && !udemyWin.isDestroyed()) {
    udemyWin.show();
    udemyWin.focus();
    return;
  }
  udemyWin = new BrowserWindow({
    width: 1200,
    height: 860,
    title: 'Udemy · Lume',
    show: !SMOKE,
    webPreferences: {
      partition: 'persist:udemy', // mantém o login entre aberturas
      preload: join(dist, 'preload-udemy.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  udemyWin.webContents.setUserAgent(browserUserAgent());
  // Links para fora da Udemy abrem no navegador do sistema; os da Udemy ficam nesta janela.
  udemyWin.webContents.setWindowOpenHandler(({ url }) => {
    if (isUdemyHost(url)) udemyWin.loadURL(url);
    else if (isHttp(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  udemyWin.loadURL(SMOKE ? 'about:blank' : UDEMY_HOME);
  udemyWin.on('closed', () => { udemyWin = null; });
}

function buildMenu() {
  const template = [
    { label: 'Lume', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit', label: 'Sair' }] },
    {
      label: 'Udemy',
      submenu: [{ label: 'Abrir a Udemy (Meu aprendizado)', accelerator: 'CmdOrCtrl+U', click: openUdemy }],
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
  const udemyOk = Boolean(udemyWin && !udemyWin.isDestroyed());
  const out = { ...result, base, udemyWindow: udemyOk, userAgent: browserUserAgent(), userData: app.getPath('userData'), electron: process.versions.electron, node: process.versions.node };
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
    });

    // Só aceita mensagens do quadro principal de cada janela e confere o endereço de quem enviou.
    ipcMain.handle('lc-msg', (event, msg) => {
      const wc = event.sender;
      const url = event.senderFrame?.url ?? '';
      if (event.senderFrame !== wc.mainFrame) return { ok: false, reason: 'forbidden' };
      let kind = null;
      if (udemyWin && !udemyWin.isDestroyed() && wc === udemyWin.webContents) kind = senderKind(url, base) === 'udemy' ? 'udemy' : null;
      else if (mainWin && wc === mainWin.webContents) kind = senderKind(url, base) === 'app' ? 'app' : null;
      return bridge.handle(msg, kind);
    });

    buildMenu();
    createMainWindow();
    if (SMOKE) { openUdemy(); await smokeTest(); }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { server?.close().catch(() => {}); });
}
