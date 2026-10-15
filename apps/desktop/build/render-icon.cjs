// Gera build/icon.png (1024x1024) a partir de build/icon.svg, usando o próprio Electron para desenhar.
// Uso: npx electron apps/desktop/build/render-icon.cjs
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const svg = readFileSync(join(__dirname, 'icon.svg'), 'utf8');
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden"><div style="width:1024px;height:1024px;overflow:hidden;line-height:0">${svg}</div></body></html>`;
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  win.setBackgroundColor('#00000000');
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  writeFileSync(join(__dirname, 'icon.png'), img.toPNG());
  const size = img.getSize();
  console.log(`icon.png ${size.width}x${size.height}`);
  app.quit();
});
