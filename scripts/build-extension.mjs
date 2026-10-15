// Gera a extensão do navegador em apps/extension/dist.
// Uso: node scripts/build-extension.mjs [endereço-do-app]   (padrão http://localhost:3000)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PLATFORMS as REGISTRY } from '../apps/api/src/core/platforms.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(resolve(root, 'apps/extension/src', p), 'utf8');

/** Devolve { arquivo: conteúdo } sem gravar nada (também usado nos testes). */
export function buildFiles(appOrigin = 'http://localhost:3000') {
  const origin = new URL(appOrigin).origin;
  const lib = (name) => readFileSync(resolve(root, 'apps/web/src/lib', name), 'utf8').replace(/^export /m, '');
  const lit = JSON.stringify(origin);
  // inclui o arquivo inteiro da biblioteca (todas as funções), sem o `export` de cada uma
  const wholeLib = (name) => readFileSync(resolve(root, 'apps/web/src/lib', name), 'utf8').replace(/^export /gm, '');
  const wholeRegistry = () => readFileSync(resolve(root, 'apps/api/src/core/platforms.js'), 'utf8').replace(/^export /gm, '');
  const platformScript = (id) => `const LC_PLATFORM_ID = ${JSON.stringify(id)};
` + src('content-platform.js').replace('/*__PLATFORM_LIB__*/', () => wholeLib('platform-courses.js'));
  // Plataformas e domínios vêm do registro da API (nada de lista duplicada).
  // Importar "Meus cursos" só existe para quem não é "só por link"; detectar o curso aberto vale para todas do registro.
  const importDomains = { udemy: 'udemy.com', ...Object.fromEntries(Object.values(REGISTRY).filter((p) => !p.linkOnly).map((p) => [p.id, p.domains[0]])) };
  const visitDomains = Object.fromEntries(Object.values(REGISTRY).map((p) => [p.id, p.domains[0]]));
  const manifest = JSON.parse(src('manifest.json').replaceAll('__APP_ORIGIN__', origin));
  manifest.content_scripts.push({
    matches: Object.values(REGISTRY).flatMap((p) => p.domains.map((d) => `https://*.${d}/*`)),
    js: ['content-visit.js'],
    run_at: 'document_idle',
  });
  return {
    'manifest.json': JSON.stringify(manifest, null, 2) + '\n',
    'background.js': src('background.js').replaceAll('__APP_ORIGIN__', lit).replace('__IMPORT_DOMAINS__', () => JSON.stringify(importDomains)).replace('__VISIT_DOMAINS__', () => JSON.stringify(visitDomains)),
    'content-visit.js': src('content-visit.js').replace('/*__REGISTRY__*/', () => wholeRegistry()),
    'content-app.js': src('content-app.js'),
    'content-alura.js': platformScript('alura'),
    'content-bradesco.js': platformScript('bradesco'),
    'content-udemy.js': src('content-udemy.js')
      .replace('/*__EXTRACTOR__*/', () => lib('udemy-extractor.js'))
      .replace('/*__CURRICULUM__*/', () => lib('udemy-curriculum.js')),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(root, 'apps/extension/dist');
  mkdirSync(out, { recursive: true });
  const files = buildFiles(process.argv[2]);
  for (const [name, content] of Object.entries(files)) writeFileSync(resolve(out, name), content);
  console.log(`Extensão gerada em ${out}`);
}
