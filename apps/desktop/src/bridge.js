/**
 * Ponte entre as duas janelas do app desktop (a da Udemy e a do próprio app) e a API local.
 * É o equivalente do `background.js` da extensão, mas dentro do processo principal do Electron.
 *
 * Princípio: cada origem só pode o que lhe cabe. A Udemy só consegue entregar o que leu e pedir
 * sincronização; o app só consegue buscar o que estava pendente e pedir para abrir a Udemy.
 * Quem fala com a API local é este módulo; a página da Udemy nunca recebe nada do app.
 */

export function isUdemyHost(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'udemy.com' || u.hostname.endsWith('.udemy.com'));
  } catch {
    return false;
  }
}

/**
 * Páginas de login que a Udemy abre numa janela pequena ("Continuar com o Google/Apple/Facebook").
 * Elas precisam abrir DENTRO do app: o resultado do login volta para a janela da Udemy por mensagem.
 * Se abrissem no navegador do sistema, a janela da Udemy ficaria esperando para sempre (tela branca).
 */
const AUTH_HOSTS = new Set(['accounts.google.com', 'appleid.apple.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com']);
export function isAuthHost(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && AUTH_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** 'udemy' | 'app' | null, a partir do endereço de quem enviou a mensagem. */
export function senderKind(url, appOrigin) {
  if (isUdemyHost(url)) return 'udemy';
  try {
    if (new URL(url).origin === new URL(appOrigin).origin) return 'app';
  } catch { /* ignora */ }
  return null;
}

const ALLOWED = {
  'lc-sync': 'udemy',
  'lc-items': 'udemy',
  'lc-content': 'udemy',
  'storage-get': 'udemy',
  'storage-set': 'udemy',
  'lc-get': 'app',
  'open-udemy': 'app',
};
const bad = { ok: false, reason: 'bad-request' };

export function createBridge({ apiBase, fetchImpl = fetch, settings, saveSettings, openAppPage, openUdemy = () => {} }) {
  const pending = { items: null, content: null };

  async function callApi(path, body) {
    let res;
    try {
      res = await fetchImpl(`${apiBase}/api/v1${path}`, {
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

  async function handle(msg, kind) {
    if (!msg || typeof msg !== 'object' || !(msg.type in ALLOWED)) return { ok: false, reason: 'unknown' };
    if (kind !== ALLOWED[msg.type]) return { ok: false, reason: 'forbidden' };

    switch (msg.type) {
      case 'lc-sync':
        if (msg.kind === 'courses' && Array.isArray(msg.items)) {
          return callApi('/courses/import', { updateProgress: true, items: msg.items.slice(0, 500) });
        }
        if (msg.kind === 'content' && msg.content && Array.isArray(msg.content.modules)) {
          return callApi('/courses/sync-content', msg.content);
        }
        return bad;
      case 'lc-items':
        if (!Array.isArray(msg.items)) return bad;
        pending.items = msg.items.slice(0, 500);
        openAppPage('/importar');
        return { ok: true };
      case 'lc-content':
        if (!msg.content || !Array.isArray(msg.content.modules)) return bad;
        pending.content = msg.content;
        openAppPage('/importar-conteudo');
        return { ok: true };
      case 'lc-get': {
        const out = { items: pending.items, content: pending.content };
        pending.items = null;
        pending.content = null;
        return out;
      }
      case 'storage-get':
        return msg.key === 'autoSync' ? { autoSync: Boolean(settings.autoSync) } : {};
      case 'storage-set':
        if (msg.values && typeof msg.values.autoSync === 'boolean') {
          settings.autoSync = msg.values.autoSync;
          saveSettings({ ...settings });
        }
        return { ok: true };
      case 'open-udemy':
        openUdemy();
        return { ok: true };
      default:
        return { ok: false, reason: 'unknown' };
    }
  }

  return { handle };
}
