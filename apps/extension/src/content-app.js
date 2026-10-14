// Roda nas páginas /importar* do Learning Center: entrega à página o que a extensão guardou.
(() => {
  const ask = () =>
    chrome.runtime.sendMessage({ type: 'lc-get' }).then((res) => {
      if (!res) return;
      if (res.items) window.postMessage({ type: 'lc-import-ext', items: res.items }, window.location.origin);
      if (res.content) window.postMessage({ type: 'lc-content-ext', content: res.content }, window.location.origin);
    });
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.type === 'lc-ready') ask();
  });
})();
