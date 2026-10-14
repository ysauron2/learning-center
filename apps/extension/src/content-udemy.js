// Roda nas páginas da Udemy. Só lê a página aberta; não usa senha, token nem faz chamadas à Udemy.
(() => {
  /*__EXTRACTOR__*/

  function diagnose(doc) {
    const chainOf = (start) => {
      const chain = [];
      for (let el = start, i = 0; el && el !== doc.body && i < 7; el = el.parentElement, i++) {
        const dp = el.getAttribute('data-purpose');
        const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
        chain.push(el.tagName.toLowerCase() + (dp ? `[data-purpose=${dp}]` : '') + (cls ? `.${cls}` : ''));
      }
      return chain;
    };
    const links = Array.from(doc.querySelectorAll('a[href]')).map((a) => {
      try { const u = new URL(a.getAttribute('href'), location.href); return u.pathname + (u.search ? '?' + Array.from(u.searchParams.keys()).join('&') : ''); } catch { return ''; }
    });
    const padroes = {};
    for (const l of links) { const k = l.replace(/\d+/g, 'N').slice(0, 80); padroes[k] = (padroes[k] || 0) + 1; }
    const progresso = Array.from(doc.querySelectorAll('*')).filter((el) => el.children.length === 0 && /\d+\s*%\s*conclu|come[cç]ar curso|start course/i.test(el.textContent || ''));
    return JSON.stringify({
      path: location.pathname,
      linksTotal: links.length,
      padroesDeLink: Object.entries(padroes).sort((a, b) => b[1] - a[1]).slice(0, 12),
      cartoesPorTexto: progresso.length,
      amostra: progresso.slice(0, 2).map((el) => ({ texto: (el.textContent || '').trim().slice(0, 40), cadeia: chainOf(el) })),
    }, null, 1);
  }

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;font:14px system-ui,sans-serif';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      button{background:#6d28d9;color:#fff;border:0;border-radius:10px;padding:12px 16px;font:600 14px system-ui;cursor:pointer;box-shadow:0 4px 14px #0004}
      button:hover{background:#5b21b6}
      .toast{margin-bottom:8px;background:#111;color:#fff;padding:10px 14px;border-radius:10px;max-width:320px;display:none}
    </style>
    <div class="toast" role="status"></div>
    <button type="button">Importar para o Learning Center</button>`;
  const toast = root.querySelector('.toast');
  const btn = root.querySelector('button');
  const say = (t) => { toast.textContent = t; toast.style.display = 'block'; setTimeout(() => { toast.style.display = 'none'; }, 9000); };

  btn.addEventListener('click', async () => {
    const items = extractUdemyCourses(document);
    if (!items.length) {
      try { await navigator.clipboard.writeText(diagnose(document)); } catch { /* ignore */ }
      say('Não achei cursos nesta página. Abra "Meus cursos" e role até o fim. Copiei um diagnóstico: cole no chat com o Claude.');
      return;
    }
    say(`Encontrei ${items.length} curso(s). Abrindo o Learning Center…`);
    chrome.runtime.sendMessage({ type: 'lc-items', items });
  });

  // Só mostra o botão em "Meus cursos" (a Udemy troca de página sem recarregar).
  const sync = () => {
    const on = location.pathname.startsWith('/home/my-courses');
    if (on && !host.isConnected) document.documentElement.appendChild(host);
    if (!on && host.isConnected) host.remove();
  };
  sync();
  setInterval(sync, 1000);
})();
