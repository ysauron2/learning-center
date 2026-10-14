// Roda na página /importar do Learning Center: entrega a lista guardada pela extensão.
(() => {
  const ask = () =>
    chrome.runtime.sendMessage({ type: 'lc-get' }).then((res) => {
      if (res && res.items) window.postMessage({ type: 'lc-import-ext', items: res.items }, window.location.origin);
    });
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.type === 'lc-ready') ask();
  });
})();
