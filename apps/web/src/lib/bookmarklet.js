import { extractUdemyCourses } from './udemy-extractor.js';

/**
 * Código que roda na aba da Udemy quando você clica no favorito.
 * Autocontido (vira texto via `toString`). Só lê a página aberta, abre o Learning Center
 * e entrega a lista por `postMessage` (sem login, token ou senha, e sem chamadas à Udemy).
 */
function runner(appOrigin, extract) {
  const items = extract(document);
  if (!items.length) {
    alert('Learning Center: não encontrei cursos nesta página. Abra "Meus cursos", role até o fim e tente de novo.');
    return;
  }
  const target = window.open(appOrigin + '/importar', 'lc-import');
  if (!target) {
    alert('Learning Center: o navegador bloqueou a janela. Permita pop-ups para udemy.com e clique de novo.');
    return;
  }
  const onMessage = (e) => {
    if (e.origin !== appOrigin || e.source !== target || !e.data || e.data.type !== 'lc-ready') return;
    target.postMessage({ type: 'lc-import', items }, appOrigin);
    window.removeEventListener('message', onMessage);
  };
  window.addEventListener('message', onMessage);
}

/** Monta o endereço `javascript:` do favorito para o endereço do app informado. */
export function buildBookmarklet(appOrigin) {
  const code = `(${runner.toString()})(${JSON.stringify(appOrigin)},${extractUdemyCourses.toString()})`;
  return `javascript:${encodeURIComponent(code)}`;
}

const UDEMY_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*udemy\.com$/;

/** Valida uma mensagem recebida na página de importação; devolve a lista de itens ou null. */
export function parseImportMessage(event) {
  if (!UDEMY_ORIGIN.test(event.origin)) return null;
  const d = event.data;
  if (!d || d.type !== 'lc-import' || !Array.isArray(d.items)) return null;
  const items = d.items
    .filter((i) => i && typeof i.title === 'string' && typeof i.url === 'string')
    .slice(0, 500)
    .map((i) => ({
      title: i.title,
      url: i.url,
      progress: Number.isFinite(i.progress) ? i.progress : 0,
      ...(typeof i.instructor === 'string' && i.instructor ? { instructor: i.instructor } : {}),
    }));
  return items.length ? items : null;
}

/** Valida a mensagem da extensão (vem da própria página, via script de conteúdo da extensão). */
export function parseExtensionMessage(event, selfOrigin, selfWindow) {
  if (event.source !== selfWindow || event.origin !== selfOrigin) return null;
  const d = event.data;
  if (!d || d.type !== 'lc-import-ext') return null;
  return parseImportMessage({ origin: 'https://www.udemy.com', data: { type: 'lc-import', items: d.items } });
}
