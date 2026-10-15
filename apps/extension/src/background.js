// Guarda o que foi lido na Udemy, na Alura ou na Fundação Bradesco e abre o Lume na página de importação certa.
// Também faz a sincronização automática da Udemy: fala com o app local (e só com ele) pela API.
const APP_ORIGIN = __APP_ORIGIN__;

// A plataforma de quem enviou vem do ENDEREÇO da aba (nunca do que a mensagem diz).
// As listas vêm do registro de plataformas da API (inseridas na geração do arquivo).
const DOMAINS = __IMPORT_DOMAINS__; // quem pode importar "Meus cursos"
const VISIT_DOMAINS = __VISIT_DOMAINS__; // quem pode avisar "estou neste curso" (todas do registro, menos a Udemy)
function platformIn(domains, sender) {
  let host = '';
  try { host = new URL((sender && sender.url) || '').hostname.toLowerCase(); } catch { return null; }
  for (const [id, domain] of Object.entries(domains)) {
    if (host === domain || host.endsWith('.' + domain)) return id;
  }
  return null;
}
const platformOf = (sender) => platformIn(DOMAINS, sender);
const pageFor = (platform) => (platform === 'udemy' ? '/importar' : `/importar/${platform}`);

const PAGES = { 'lc-content': ['content', '/importar-conteudo'] };

async function callApi(path, body, method = 'POST') {
  let res;
  try {
    res = await fetch(`${APP_ORIGIN}/api/v1${path}`, {
      method,
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

// ---- detecção automática do curso aberto ----
// O endereço vem da aba que enviou (sem parâmetros de busca nem fragmento); a mensagem só traz título, progresso e a resposta da pessoa.
const lastVisit = new Map(); // limite de frequência por curso
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
function noticeFrom(res) {
  if (!res.ok || !res.data) return { ok: true };
  const d = res.data;
  if (d.action === 'ask') return { ok: true, notice: { action: 'ask', title: text(d.title, 160) } };
  if ((d.action === 'created' || d.action === 'activated') && d.course && d.undoToken) {
    return { ok: true, notice: { action: d.action, title: text(d.course.title, 160), token: text(d.undoToken, 100) } };
  }
  return { ok: true };
}
async function handleVisit(msg, sender, platform) {
  let url;
  try {
    const u = new URL(sender.url);
    url = u.origin + u.pathname;
  } catch { return { ok: false }; }
  const base = { platform, url };
  const title = text(msg.title, 400);
  const pct = typeof msg.progressPercent === 'number' && msg.progressPercent >= 0 && msg.progressPercent <= 100 ? Math.round(msg.progressPercent) : undefined;
  switch (msg.step) {
    case 'visit': {
      const last = lastVisit.get(url);
      if (last && Date.now() - last < 60000 && pct === undefined) return { ok: true };
      lastVisit.set(url, Date.now());
      if (lastVisit.size > 200) lastVisit.delete(lastVisit.keys().next().value);
      return noticeFrom(await callApi('/courses/visit', { ...base, ...(title ? { title } : {}), ...(pct === undefined ? {} : { progressPercent: pct }) }));
    }
    case 'add':
      return noticeFrom(await callApi('/courses/visit', { ...base, confirm: true }));
    case 'always': {
      const set = await callApi('/settings/auto-detect', { mode: 'auto' }, 'PATCH');
      if (!set.ok) return { ok: true };
      return noticeFrom(await callApi('/courses/visit', { ...base, confirm: true }));
    }
    case 'later':
      await callApi('/courses/visit/dismiss', base);
      return { ok: true };
    case 'undo': {
      const token = text(msg.token, 100);
      if (!token) return { ok: false };
      const r = await callApi('/courses/visit/undo', { token });
      return { ok: true, undone: Boolean(r.ok && r.data && r.data.undone) };
    }
    default:
      return { ok: false };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'lc-visit') {
    const vp = platformIn(VISIT_DOMAINS, sender);
    if (!vp) return false;
    handleVisit(msg, sender, vp).then(sendResponse, () => sendResponse({ ok: false }));
    return true;
  }
  // Só os scripts de conteúdo da própria extensão chegam aqui. Sem endereço (contexto interno da extensão) vale o comportamento antigo, o da Udemy.
  const noUrl = !sender || !sender.url;
  const platform = platformOf(sender) ?? (noUrl ? 'udemy' : null);
  if (msg && msg.type === 'lc-items' && platform) {
    const items = Array.isArray(msg.items) ? msg.items.slice(0, 500) : null;
    if (!items) return false;
    chrome.storage.session.set({ items, platform }).then(() => {
      chrome.tabs.create({ url: `${APP_ORIGIN}${pageFor(platform)}` });
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && PAGES[msg.type] && platform === 'udemy') {
    const [key, path] = PAGES[msg.type];
    const value = msg.content;
    if (!value) return false;
    chrome.storage.session.set({ [key]: value }).then(() => {
      chrome.tabs.create({ url: `${APP_ORIGIN}${path}` });
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg && msg.type === 'lc-sync' && platform === 'udemy') {
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
    chrome.storage.session.get(['items', 'content', 'platform']).then(async ({ items, content, platform: from }) => {
      await chrome.storage.session.remove(['items', 'content', 'platform']);
      sendResponse({ items: items || null, content: content || null, ...(items && from && from !== 'udemy' ? { platform: from } : {}) });
    });
    return true;
  }
  return false;
});
