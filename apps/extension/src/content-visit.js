// Detecção automática do curso: roda nas páginas das plataformas suportadas (Alura, Microsoft Learn etc.).
// SÓ envia ao Lume: o título da página, a porcentagem de progresso (se a própria página mostrar) e, nos botões do aviso,
// a resposta da pessoa. O endereço e a plataforma NÃO vão na mensagem: quem recebe usa o endereço da aba que enviou.
// Nunca lê nem envia o conteúdo da página, cookies, e-mail, nome de usuário ou qualquer dado pessoal.
// O reconhecimento de "página de curso" usa o mesmo registro de plataformas da API (inserido na geração do arquivo).
(() => {
  /*__REGISTRY__*/

  if (window.top !== window) return; // nunca dentro de iframes
  const send = (msg) => Promise.resolve(chrome.runtime.sendMessage(msg)).catch(() => null);

  // ---- leitura da página (só o que é permitido) ----
  const pageTitle = () => String(document.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);

  /** Porcentagem só se a página a mostra numa barra de progresso identificada como tal. Nunca inventa. */
  function readProgress() {
    const bars = [...document.querySelectorAll('[role="progressbar"], progress')].filter((el) =>
      /progress|conclu|complet/i.test(`${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`));
    if (bars.length !== 1) return undefined;
    const el = bars[0];
    const num = (v) => (v === null || v === '' ? NaN : Number(v));
    const now = [num(el.getAttribute('aria-valuenow')), num(el.getAttribute('value'))].find((n) => Number.isFinite(n));
    const maxRaw = [num(el.getAttribute('aria-valuemax')), num(el.getAttribute('max'))].find((n) => Number.isFinite(n));
    const max = maxRaw === undefined ? 100 : maxRaw;
    if (now === undefined || !(max > 0)) return undefined;
    const pct = Math.round((now / max) * 100);
    return pct >= 0 && pct <= 100 ? pct : undefined;
  }

  // ---- aviso discreto sobre a página (isolado, fechável, acessível) ----
  let host = null;
  let hideTimer;
  function closeNotice() {
    clearTimeout(hideTimer);
    if (host) host.remove();
    host = null;
  }
  function showNotice({ text, buttons, autoHideMs }) {
    closeNotice();
    host = document.createElement('div');
    host.setAttribute('data-lume-visit', '');
    host.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:2147483647;font:14px system-ui,sans-serif';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `.box{background:#111;color:#fff;border-radius:12px;padding:12px 14px;max-width:360px;box-shadow:0 4px 14px #0005;display:flex;flex-direction:column;gap:10px}
      .msg{margin:0;line-height:1.35;overflow-wrap:anywhere}
      .row{display:flex;flex-wrap:wrap;gap:6px}
      button{border:0;border-radius:8px;padding:7px 11px;font:600 13px system-ui;cursor:pointer;background:#374151;color:#fff}
      button.primary{background:#6d28d9}
      button:focus-visible{outline:2px solid #fff;outline-offset:2px}
      .x{position:absolute;top:4px;right:6px;background:transparent;padding:2px 7px;font-size:16px}`;
    const box = document.createElement('div');
    box.className = 'box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Aviso do Lume');
    const msg = document.createElement('p');
    msg.className = 'msg';
    msg.textContent = text; // sempre como texto, nunca como HTML
    const row = document.createElement('div');
    row.className = 'row';
    buttons.forEach((b, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      if (i === 0) el.className = 'primary';
      el.textContent = b.label;
      el.addEventListener('click', b.onClick);
      row.appendChild(el);
    });
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'x';
    x.setAttribute('aria-label', 'Fechar aviso');
    x.textContent = '×';
    x.addEventListener('click', closeNotice);
    box.append(msg, row, x);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNotice(); });
    root.append(style, box);
    document.documentElement.appendChild(host);
    if (autoHideMs) hideTimer = setTimeout(closeNotice, autoHideMs);
  }

  const quote = (t) => `“${String(t || '').slice(0, 120)}”`;
  const simple = (text) => showNotice({ text, buttons: [{ label: 'Ok', onClick: closeNotice }], autoHideMs: 8000 });

  function showResult(res) {
    const n = res && res.notice;
    if (!n) return;
    if (n.action === 'ask') {
      const answer = async (step) => {
        closeNotice();
        if (step === 'later') { await send({ type: 'lc-visit', step: 'later' }); return; }
        showResult(await send({ type: 'lc-visit', step }));
      };
      showNotice({
        text: `Lume: adicionar ${quote(n.title)} aos seus cursos?`,
        buttons: [
          { label: 'Adicionar', onClick: () => answer('add') },
          { label: 'Sempre automático', onClick: () => answer('always') },
          { label: 'Agora não', onClick: () => answer('later') },
        ],
        autoHideMs: 60000,
      });
      return;
    }
    const text = n.action === 'created' ? `Lume: ${quote(n.title)} foi adicionado aos seus cursos, em andamento.` : `Lume: ${quote(n.title)} agora está em andamento.`;
    showNotice({
      text,
      buttons: [{
        label: 'Desfazer',
        onClick: async () => {
          const r = await send({ type: 'lc-visit', step: 'undo', token: n.token });
          simple(r && r.undone ? 'Lume: pronto, desfeito.' : 'Lume: não consegui desfazer. Você pode mudar o curso na tela “Cursos”.');
        },
      }],
      autoHideMs: 12000,
    });
  }

  // ---- quando avisar o Lume ----
  let lastKey = null;
  let lastAt = 0;
  let lastProgress = -1;
  let busy = false;
  async function check() {
    if (busy || document.visibilityState !== 'visible') return; // aba em segundo plano: espera
    const ref = parseCourseLink(location.href);
    if (!ref) { lastKey = null; return; } // home, busca, perfil, carrinho…
    const progress = readProgress();
    const same = ref.key === lastKey && Date.now() - lastAt < 30 * 60 * 1000;
    if (same && !(progress !== undefined && progress > lastProgress)) return;
    busy = true;
    try {
      lastKey = ref.key;
      lastAt = Date.now();
      lastProgress = progress === undefined ? lastProgress : progress;
      const msg = { type: 'lc-visit', step: 'visit', title: pageTitle() };
      if (progress !== undefined) msg.progressPercent = progress;
      showResult(await send(msg));
    } finally {
      busy = false;
    }
  }

  check();
  setInterval(check, 2000); // sites que trocam de página sem recarregar
  document.addEventListener('visibilitychange', check);
})();
