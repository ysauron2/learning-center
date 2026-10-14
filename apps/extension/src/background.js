// Guarda o que foi lido na Udemy e abre o Learning Center na página de importação certa.
const APP_ORIGIN = __APP_ORIGIN__;

const PAGES = { 'lc-items': ['items', '/importar'], 'lc-content': ['content', '/importar-conteudo'] };

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
  if (msg && msg.type === 'lc-get') {
    chrome.storage.session.get(['items', 'content']).then(async ({ items, content }) => {
      await chrome.storage.session.remove(['items', 'content']);
      sendResponse({ items: items || null, content: content || null });
    });
    return true;
  }
  return false;
});
