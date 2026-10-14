// Gera a extensão do navegador em apps/extension/dist.
// Uso: node scripts/build-extension.mjs [endereço-do-app]   (padrão http://localhost:3000)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(resolve(root, 'apps/extension/src', p), 'utf8');

/** Devolve { arquivo: conteúdo } sem gravar nada (também usado nos testes). */
export function buildFiles(appOrigin = 'http://localhost:3000') {
  const origin = new URL(appOrigin).origin;
  const extractor = readFileSync(resolve(root, 'apps/web/src/lib/udemy-extractor.js'), 'utf8').replace(/^export /m, '');
  const lit = JSON.stringify(origin);
  return {
    'manifest.json': src('manifest.json').replaceAll('__APP_ORIGIN__', origin),
    'background.js': src('background.js').replaceAll('__APP_ORIGIN__', lit),
    'content-app.js': src('content-app.js'),
    'content-udemy.js': src('content-udemy.js').replace('/*__EXTRACTOR__*/', () => extractor),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(root, 'apps/extension/dist');
  mkdirSync(out, { recursive: true });
  const files = buildFiles(process.argv[2]);
  for (const [name, content] of Object.entries(files)) writeFileSync(resolve(out, name), content);
  console.log(`Extensão gerada em ${out}`);
}
