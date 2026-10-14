// Roda nas páginas da Udemy. Só lê a página aberta; não usa senha, token nem faz chamadas à Udemy.
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

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;font:14px system-ui,sans-serif';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      button{background:#6d28d9;color:#fff;border:0;border-radius:10px;padding:12px 16px;font:600 14px system-ui;cursor:pointer;box-shadow:0 4px 14px #0004}
      button:hover{background:#5b21b6}
      button:disabled{opacity:.6;cursor:wait}
      .toast{margin-bottom:8px;background:#111;color:#fff;padding:10px 14px;border-radius:10px;max-width:320px;display:none}
    </style>
    <div class="toast" role="status"></div>
    <button type="button"></button>`;
  const toast = root.querySelector('.toast');
  const btn = root.querySelector('button');
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

  const sync = () => {
    const mode = modeNow();
    if (mode && !host.isConnected) document.documentElement.appendChild(host);
    if (!mode && host.isConnected) host.remove();
    if (mode && btn.textContent !== LABEL[mode]) btn.textContent = LABEL[mode];
  };
  sync();
  setInterval(sync, 1000);
})();
