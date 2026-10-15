// Roda nas páginas da Alura e da Fundação Bradesco (Escola Virtual). Só lê a página aberta; não usa senha,
// token nem faz chamadas ao site. LEITURA LOGADA AINDA NÃO VERIFICADA COM CONTA REAL: se não achar cursos,
// o botão "Copiar diagnóstico" gera um resumo sem dados pessoais para o ajuste fino.
// `LC_PLATFORM_ID` ('alura' ou 'bradesco') é definido na geração do arquivo (scripts/build-extension.mjs).
(() => {
  /*__PLATFORM_LIB__*/

  const NAMES = { alura: 'Alura', bradesco: 'Fundação Bradesco' };
  const NAME = NAMES[LC_PLATFORM_ID];

  const host = document.createElement('div');
  host.setAttribute('data-lume', LC_PLATFORM_ID);
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;font:14px system-ui,sans-serif;display:flex;flex-direction:column;align-items:flex-end;gap:6px';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      button{border:0;border-radius:10px;padding:12px 16px;font:600 14px system-ui;cursor:pointer;box-shadow:0 4px 14px #0004}
      .main{background:#6d28d9;color:#fff}
      .main:hover{background:#5b21b6}
      .diag{background:#111c;color:#fff;padding:6px 10px;font-size:12px;font-weight:500;border-radius:8px}
      button:disabled{opacity:.6;cursor:wait}
      .toast{background:#111;color:#fff;padding:10px 14px;border-radius:10px;max-width:320px;display:none}
      .note{background:#111c;color:#fff;border-radius:8px;padding:6px 10px;font-size:11px;max-width:260px;text-align:right}
    </style>
    <div class="toast" role="status"></div>
    <button type="button" class="main"></button>
    <button type="button" class="diag">Copiar diagnóstico</button>
    <div class="note">Leitura logada ainda não verificada com conta real.</div>`;
  const toast = root.querySelector('.toast');
  const btn = root.querySelector('.main');
  const diagBtn = root.querySelector('.diag');
  btn.textContent = `Importar meus cursos da ${NAME}`;
  let timer;
  const say = (t) => { toast.textContent = t; toast.style.display = 'block'; clearTimeout(timer); timer = setTimeout(() => { toast.style.display = 'none'; }, 10000); };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };
  const send = (msg) => Promise.resolve(chrome.runtime.sendMessage(msg)).catch(() => ({ ok: false, reason: 'offline' }));

  btn.addEventListener('click', async () => {
    const items = extractPlatformCourses(document, LC_PLATFORM_ID);
    if (!items.length) {
      await copy(diagnosePlatformCourses(document, LC_PLATFORM_ID));
      say(`Não achei cursos nesta página. Abra a lista dos seus cursos na ${NAME} (já logado) e tente de novo. Copiei um diagnóstico: cole no chat com o Claude.`);
      return;
    }
    say(`Encontrei ${items.length} curso(s). Abrindo o Lume…`);
    // a plataforma NÃO vai na mensagem: quem recebe decide pelo endereço de quem enviou
    send({ type: 'lc-items', items });
  });

  diagBtn.addEventListener('click', async () => {
    const ok = await copy(diagnosePlatformCourses(document, LC_PLATFORM_ID));
    say(ok ? 'Diagnóstico copiado (sem dados pessoais). Cole no chat com o Claude.' : 'Não consegui copiar. Tente de novo com a página em primeiro plano.');
  });

  const attach = () => { if (!host.isConnected) document.documentElement.appendChild(host); };
  attach();
  setInterval(attach, 2000);
})();
