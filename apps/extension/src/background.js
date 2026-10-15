// Guarda o que foi lido na Udemy, na Alura ou na Fundação Bradesco e abre o Lume na página de importação certa.
// Também faz a sincronização automática da Udemy: fala com o app local (e só com ele) pela API.
const APP_ORIGIN = __APP_ORIGIN__;

// A plataforma de quem enviou vem do ENDEREÇO da aba (nunca do que a mensagem diz).
const DOMAINS = { udemy: 'udemy.com', alura: 'alura.com.br', bradesco: 'ev.org.br' };
function platformOf(sender) {
  let host = '';
  try { host = new URL((sender && sender.url) || '').hostname.toLowerCase(); } catch { return null; }
  for (const [id, domain] of Object.entries(DOMAINS)) {
    if (host === domain || host.endsWith('.' + domain)) return id;
  }
  return null;
}
const pageFor = (platform) => (platform === 'udemy' ? '/importar' : `/importar/${platform}`);

const PAGES = { 'lc-content': ['content', '/importar-conteudo'] };

async function callApi(path, body) {
  let res;
  try {
    res = await fetch(`${APP_ORIGIN}/api/v1${path}`, {
      method: 'POST',
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
