// Roda nas páginas da Udemy. Só lê a página aberta; não usa senha, token nem faz chamadas à Udemy.
// Com a "sincronização automática" ligada, entrega o que leu ao Learning Center local (localhost).
(() => {
  /*__EXTRACTOR__*/
  /*__CURRICULUM__*/

  const chainOf = (start) => {
    const chain = [];
    for (let el = start, i = 0; el && el !== document.body && i < 8; el = el.parentElement, i++) {
      const dp = el.getAttribute('data-purpose');
      const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
      chain.push(el.tagName.toLowerCase() + (dp ? `[data-purpose=${dp}]` : '') + (cls ? `.${cls}` : ''));
    }
    return chain;
  };

  /** Diagnóstico da lista "Meus cursos": o que a página tem no lugar dos links de curso. */
  function diagnoseCourses(doc) {
    const links = Array.from(doc.querySelectorAll('a[href]')).map((a) => {
      try { const u = new URL(a.getAttribute('href'), location.href); return u.pathname + (u.search ? '?' + Array.from(u.searchParams.keys()).join('&') : ''); } catch { return ''; }
    });
    const padroes = {};
    for (const l of links) { const k = l.replace(/\d+/g, 'N').slice(0, 80); padroes[k] = (padroes[k] || 0) + 1; }
    const progresso = Array.from(doc.querySelectorAll('*')).filter((el) => el.children.length === 0 && /\d+\s*%\s*conclu|come[cç]ar curso|start course/i.test(el.textContent || ''));
    return JSON.stringify({
      modo: 'meus-cursos',
      path: location.pathname,
      linksTotal: links.length,
      padroesDeLink: Object.entries(padroes).sort((a, b) => b[1] - a[1]).slice(0, 12),
      cartoesPorTexto: progresso.length,
      amostra: progresso.slice(0, 2).map((el) => ({ texto: (el.textContent || '').trim().slice(0, 40), cadeia: chainOf(el) })),
    }, null, 1);
  }

  /** Diagnóstico do player: estrutura da barra de conteúdo (sem copiar títulos de aulas). */
  function diagnoseCurriculum(doc) {
    const purposes = {};
    for (const el of doc.querySelectorAll('[data-purpose]')) {
      const dp = el.getAttribute('data-purpose').replace(/\d+/g, 'N');
      if (/curricul|section|lecture|item|progress|sidebar|toggle|accordion/i.test(dp)) purposes[dp] = (purposes[dp] || 0) + 1;
    }
    const boxes = Array.from(doc.querySelectorAll('input[type="checkbox"],[role="checkbox"]'));
    const expandable = Array.from(doc.querySelectorAll('button[aria-expanded]'));
    const cut = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 25);
    return JSON.stringify({
      modo: 'player',
      path: location.pathname.replace(/\/lecture\/\d+/, '/lecture/N'),
      checkboxes: boxes.length,
      botoesExpansiveis: expandable.length,
      botoesRecolhidos: expandable.filter((b) => b.getAttribute('aria-expanded') === 'false').length,
      dataPurposeRelevantes: Object.entries(purposes).sort((a, b) => b[1] - a[1]).slice(0, 25),
      amostraCheckbox: boxes.slice(0, 2).map((b) => chainOf(b)),
      amostraBotao: expandable.slice(0, 2).map((b) => ({ texto: cut(b.textContent).replace(/[^\s\d:/|a-zA-ZÀ-ú]/g, ''), cadeia: chainOf(b) })),
    }, null, 1);
  }

  /** Abre as seções recolhidas da barra de conteúdo (só expande; não altera nada do curso). */
  async function expandSections() {
    const closed = Array.from(document.querySelectorAll('button[aria-expanded="false"]')).filter(
      (b) => /^(se[cç][aã]o|section|m[oó]dulo|module|parte|part)\b/i.test((b.textContent || '').trim()) || (b.closest('[data-purpose*="section"]') !== null),
    );
    closed.forEach((b) => b.click());
    if (closed.length) await new Promise((r) => setTimeout(r, 800));
    return closed.length;
  }

  /** Tenta `fn` algumas vezes (a Udemy carrega a lista aos poucos). */
  async function waitFor(fn, tries, delayMs) {
    for (let i = 0; i < tries; i++) {
      const v = fn();
      if (v) return v;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  }

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;font:14px system-ui,sans-serif;display:flex;flex-direction:column;align-items:flex-end';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      button{background:#6d28d9;color:#fff;border:0;border-radius:10px;padding:12px 16px;font:600 14px system-ui;cursor:pointer;box-shadow:0 4px 14px #0004}
      button:hover{background:#5b21b6}
      button:disabled{opacity:.6;cursor:wait}
      .toast{margin-bottom:8px;background:#111;color:#fff;padding:10px 14px;border-radius:10px;max-width:320px;display:none}
      .auto{margin-top:6px;background:#111c;color:#fff;border-radius:8px;padding:6px 10px;font-size:12px;display:flex;gap:6px;align-items:center;cursor:pointer}
    </style>
    <div class="toast" role="status"></div>
    <button type="button" class="main"></button>
    <label class="auto"><input type="checkbox" class="auto-box"> Sincronizar automaticamente</label>`;
  const toast = root.querySelector('.toast');
  const btn = root.querySelector('.main');
  const autoBox = root.querySelector('.auto-box');
  let timer;
  const say = (t) => { toast.textContent = t; toast.style.display = 'block'; clearTimeout(timer); timer = setTimeout(() => { toast.style.display = 'none'; }, 10000); };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); } catch { /* ignore */ } };

  // A Udemy troca de página sem recarregar: o modo é decidido pelo endereço atual.
  const modeNow = () => {
    if (location.pathname.startsWith('/home/my-courses')) return 'courses';
    if (/^\/course\/[^/]+\/learn\//.test(location.pathname)) return 'content';
    return null;
  };
  const LABEL = { courses: 'Importar para o Learning Center', content: 'Importar conteúdo deste curso' };

  // ---------- Sincronização automática ----------
  const store = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
  let auto = false;
  let running = false;
  let lastKey = null;
  let unmatchedKey = null;
  let offlineAt = 0;
  let syncTimer;

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const send = (msg) => Promise.resolve(chrome.runtime.sendMessage(msg)).catch(() => ({ ok: false, reason: 'offline' }));

  function report(kind, res, key) {
    if (!res || !res.ok) {
      if (res && res.reason === 'offline') {
        if (Date.now() - offlineAt > 10 * 60 * 1000) {
          offlineAt = Date.now();
          say('O Learning Center não está rodando. Abra o atalho "Learning Center" na área de trabalho.');
        }
      } else {
        say(`Não consegui sincronizar (erro ${(res && res.status) || 'desconhecido'}).`);
      }
      return false;
    }
    const d = res.data || {};
    if (kind === 'courses') {
      const parts = [];
      if (d.created) parts.push(`${plural(d.created, 'curso novo', 'cursos novos')}`);
      if (d.progressUpdated) parts.push(`${plural(d.progressUpdated, 'progresso atualizado', 'progressos atualizados')}`);
      if (d.imagesFilled) parts.push(`${plural(d.imagesFilled, 'capa', 'capas')}`);
      if (parts.length) say(`Sincronizado: ${parts.join(', ')}.`);
      return true;
    }
    if (!d.matched) {
      if (unmatchedKey !== key) {
        unmatchedKey = key;
        say('Não achei este curso no seu app. Clique em "Importar conteúdo deste curso" para escolher qual é.');
      }
      return true; // não repete a cada ciclo
    }
    const s = d.summary || {};
    const parts = [];
    if (s.lessonsCreated) parts.push(`${plural(s.lessonsCreated, 'aula nova', 'aulas novas')}`);
    if (s.lessonsCompleted) parts.push(`${plural(s.lessonsCompleted, 'concluída', 'concluídas')}`);
    if (parts.length) say(`Sincronizado em "${d.courseTitle}": ${parts.join(', ')}.`);
    return true;
  }

  async function autoSyncOnce() {
    if (!auto || running) return;
    const mode = modeNow();
    if (!mode) return;
    running = true;
    try {
      if (mode === 'courses') {
        const items = await waitFor(() => { const i = extractUdemyCourses(document); return i.length ? i : null; }, 4, 2500);
        if (!items) return;
        const key = `c:${JSON.stringify(items)}`;
        if (key === lastKey) return;
        if (report('courses', await send({ type: 'lc-sync', kind: 'courses', items }), key)) lastKey = key;
      } else {
        await expandSections();
        const content = await waitFor(() => { const c = extractUdemyCurriculum(document); return c.modules.length ? c : null; }, 4, 2500);
        if (!content) return;
        const key = `p:${JSON.stringify(content)}`;
        if (key === lastKey) return;
        if (report('content', await send({ type: 'lc-sync', kind: 'content', content }), key)) lastKey = key;
      }
    } finally {
      running = false;
    }
  }

  const schedule = (ms) => { clearTimeout(syncTimer); syncTimer = setTimeout(autoSyncOnce, ms); };

  if (store) {
    Promise.resolve(store.get('autoSync')).then((v) => {
      auto = Boolean(v && v.autoSync);
      autoBox.checked = auto;
      if (auto) schedule(3000);
    }).catch(() => {});
  }
  autoBox.addEventListener('change', () => {
    auto = autoBox.checked;
    if (store) Promise.resolve(store.set({ autoSync: auto })).catch(() => {});
    if (auto) {
      lastKey = null;
      say('Sincronização automática ligada.');
      schedule(500);
    } else {
      say('Sincronização automática desligada.');
    }
  });
  // Marcar/desmarcar uma aula como vista também dispara a sincronização (com um pequeno atraso).
  document.addEventListener('change', (e) => {
    if (auto && modeNow() === 'content' && e.target && e.target.matches && e.target.matches('input[type="checkbox"],[role="checkbox"]')) schedule(4000);
  }, true);

  // ---------- Botão manual ----------
  btn.addEventListener('click', async () => {
    const mode = modeNow();
    if (mode === 'courses') {
      const items = extractUdemyCourses(document);
      if (!items.length) {
        await copy(diagnoseCourses(document));
        say('Não achei cursos nesta página. Abra "Meus cursos" e role até o fim. Copiei um diagnóstico: cole no chat com o Claude.');
        return;
      }
      say(`Encontrei ${items.length} curso(s). Abrindo o Learning Center…`);
      chrome.runtime.sendMessage({ type: 'lc-items', items });
    } else if (mode === 'content') {
      btn.disabled = true;
      say('Lendo o conteúdo do curso…');
      try {
        await expandSections();
        const content = extractUdemyCurriculum(document);
        const lessons = content.modules.reduce((n, m) => n + m.lessons.length, 0);
        if (!lessons) {
          await copy(diagnoseCurriculum(document));
          say('Não achei as aulas. Deixe a barra "Conteúdo do curso" visível e tente de novo. Copiei um diagnóstico: cole no chat com o Claude.');
          return;
        }
        say(`Encontrei ${content.modules.length} seção(ões) e ${lessons} aula(s). Abrindo o Learning Center…`);
        chrome.runtime.sendMessage({ type: 'lc-content', content });
      } finally {
        btn.disabled = false;
      }
    }
  });

  let lastPath = null;
  const sync = () => {
    const mode = modeNow();
    if (mode && !host.isConnected) document.documentElement.appendChild(host);
    if (!mode && host.isConnected) host.remove();
    if (mode && btn.textContent !== LABEL[mode]) btn.textContent = LABEL[mode];
    // mudou de página (ex.: próxima aula): sincroniza de novo depois de a página assentar
    if (location.pathname !== lastPath) {
      const first = lastPath === null;
      lastPath = location.pathname;
      if (!first && auto && mode) schedule(4000);
    }
  };
  sync();
  setInterval(sync, 1000);
})();
