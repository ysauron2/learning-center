// Guarda a lista lida na Udemy e abre o Learning Center na página de importação.
const APP_ORIGIN = __APP_ORIGIN__;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'lc-items' && Array.isArray(msg.items)) {
    chrome.storage.session.set({ items: msg.items.slice(0, 500) }).then(() => {
      chrome.tabs.create({ url: `${APP_ORIGIN}/importar` });
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.type === 'lc-get') {
    chrome.storage.session.get('items').then(async ({ items }) => {
      await chrome.storage.session.remove('items');
      sendResponse({ items: items || null });
    });
    return true;
  }
  return false;
});
