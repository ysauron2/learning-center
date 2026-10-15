// Gera apps/desktop/dist: servidor da API num único arquivo, migrações e os scripts de pré-carga
// (preload) que injetam, nas janelas da Udemy, da Alura, da Fundação Bradesco e na do app, a mesma leitura que a extensão faz.
// Uso: node scripts/build-desktop.mjs
import { writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildFiles } from './build-extension.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Os preloads reaproveitam os scripts da extensão. Eles esperam um objeto `chrome`;
 * aqui ele é um adaptador fino que fala com o processo principal por IPC.
 * O código é inserido como texto (nada de eval), então a CSP da página não interfere.
 */
export function preloadFiles() {
  const f = buildFiles('http://127.0.0.1');
  // um preload por plataforma: o mesmo adaptador de IPC em volta do script de conteúdo de cada uma
  const wrap = (code) => `'use strict';
const { ipcRenderer } = require('electron');
const send = (msg) => ipcRenderer.invoke('lc-msg', msg);
globalThis.chrome = {
  runtime: { sendMessage: send },
  storage: { local: { get: (key) => send({ type: 'storage-get', key }), set: (values) => send({ type: 'storage-set', values }) } },
};
const run = () => {
${code}
};
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', run);
else run();
`;
  const app = `'use strict';
const { ipcRenderer, contextBridge } = require('electron');
globalThis.chrome = { runtime: { sendMessage: (msg) => ipcRenderer.invoke('lc-msg', msg) } };
contextBridge.exposeInMainWorld('lcDesktop', {
  isDesktop: true,
  openUdemy: () => ipcRenderer.invoke('lc-msg', { type: 'open-udemy' }),
  openPlatform: (id) => ipcRenderer.invoke('lc-msg', { type: 'open-platform', platform: String(id) }),
  updateState: (refresh) => ipcRenderer.invoke('lc-msg', { type: 'update-state', refresh: refresh === true }),
  installUpdate: () => ipcRenderer.invoke('lc-msg', { type: 'update-install' }),
});
${f['content-app.js']}
`;
  return {
    'preload-udemy.cjs': wrap(f['content-udemy.js']),
    // a detecção automática do curso aberto roda nas janelas da Alura e da Fundação Bradesco (Microsoft Learn etc. não têm janela no app)
    'preload-alura.cjs': wrap(`${f['content-alura.js']}\n${f['content-visit.js']}`),
    'preload-bradesco.cjs': wrap(`${f['content-bradesco.js']}\n${f['content-visit.js']}`),
    'preload-app.cjs': app,
  };
}

async function main() {
  const { build } = await import('esbuild');
  const out = resolve(root, 'apps/desktop/dist');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // Servidor (API + dependências) em um arquivo só, para não depender de node_modules no app instalado.
  await build({
    entryPoints: [resolve(root, 'apps/api/src/app.js')],
    outfile: resolve(out, 'server.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: ['node:*'],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: 'warning',
  });
  cpSync(resolve(root, 'apps/api/migrations'), resolve(out, 'migrations'), { recursive: true });
  for (const [name, code] of Object.entries(preloadFiles())) writeFileSync(resolve(out, name), code);
  console.log(`Desktop gerado em ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
