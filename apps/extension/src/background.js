// Guarda o que foi lido na Udemy e abre o Learning Center na página de importação certa.
// Também faz a sincronização automática: fala com o app local (e só com ele) pela API.
const APP_ORIGIN = __APP_ORIGIN__;

const PAGES = { 'lc-items': ['items', '/importar'], 'lc-content': ['content', '/importar-conteudo'] };

async function callApi(path, body) {
  let res;
  try {
    res = await fetch(`${APP_ORIGIN}/api/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'offline' };
  }
  if (!res.ok) return { ok: false, reason: 'http', status: res.status };
  const json = await res.json().catch(() => null);
  return { ok: true, data: json ? json.data : null };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && PAGES[msg.type]) {
    const [key, path] = PAGES[msg.type];
    const value = key === 'items' ? (Array.isArray(msg.items) ? msg.items.slice(0, 500) : null) : msg.content;
    if (!value) return false;
    chrome.storage.session.set({ [key]: value }).then(() => {
      chrome.tabs.create({ url: `${APP_ORIGIN}${path}` });
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.type === 'lc-sync') {
    let job = null;
    if (msg.kind === 'courses' && Array.isArray(msg.items)) {
      job = callApi('/courses/import', { updateProgress: true, items: msg.items.slice(0, 500) });
    } else if (msg.kind === 'content' && msg.content && Array.isArray(msg.content.modules)) {
      job = callApi('/courses/sync-content', msg.content);
    }
    if (!job) return false;
    job.then(sendResponse);
    return true;
  }
  if (msg && msg.type === 'lc-get') {
    chrome.storage.session.get(['items', 'content']).then(async ({ items, content }) => {
      await chrome.storage.session.remove(['items', 'content']);
      sendResponse({ items: items || null, content: content || null });
    });
    return true;
  }
  return false;
});
