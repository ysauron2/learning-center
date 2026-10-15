import { PLATFORMS, PLATFORM_IDS, platformOfUrl } from './platforms.js';

/**
 * Ponte entre as janelas do app desktop (a da Udemy, a da Alura, a da Fundação Bradesco e a do próprio app) e a API local.
 * É o equivalente do `background.js` da extensão, mas dentro do processo principal do Electron.
 *
 * Princípio: cada origem só pode o que lhe cabe. Cada plataforma só consegue entregar o que leu e pedir
 * sincronização (e sempre como ela mesma: a plataforma vem do endereço da janela, nunca da mensagem); o app só consegue buscar o que estava pendente e pedir para abrir a Udemy.
 * Quem fala com a API local é este módulo; a página das plataformas nunca recebe nada do app.
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
// (a Escola Virtual da Fundação Bradesco também oferece entrar pelo LinkedIn)
const AUTH_HOSTS = new Set(['accounts.google.com', 'appleid.apple.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'www.linkedin.com']);
export function isAuthHost(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && AUTH_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** 'udemy' | 'alura' | 'bradesco' | 'app' | null, a partir do endereço de quem enviou a mensagem. */
export function senderKind(url, appOrigin) {
  const platform = platformOfUrl(url);
  if (platform) return platform;
  try {
    if (new URL(url).origin === new URL(appOrigin).origin) return 'app';
  } catch { /* ignora */ }
  return null;
}

// 'platform' = qualquer janela de plataforma (Udemy, Alura, Fundação Bradesco); o resto é por origem exata
const ALLOWED = {
  'lc-sync': 'platform',
  'lc-items': 'platform',
  'lc-content': 'udemy',
  'storage-get': 'platform',
  'storage-set': 'platform',
  'lc-get': 'app',
  'open-udemy': 'app',
  'open-platform': 'app',
};
const bad = { ok: false, reason: 'bad-request' };

export function createBridge({ apiBase, fetchImpl = fetch, settings, saveSettings, openAppPage, openUdemy = () => {}, openPlatform = () => {} }) {
  const pending = { items: null, content: null, platform: 'udemy' };

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
    const allowed = ALLOWED[msg.type] === 'platform' ? PLATFORM_IDS.includes(kind) : kind === ALLOWED[msg.type];
    if (!allowed) return { ok: false, reason: 'forbidden' };

    switch (msg.type) {
      case 'lc-sync':
        if (msg.kind === 'courses' && Array.isArray(msg.items)) {
          const items = msg.items.slice(0, 500);
          return callApi('/courses/import', kind === 'udemy' ? { updateProgress: true, items } : { platform: kind, updateProgress: true, items });
        }
        // o conteúdo das aulas (sincronização do player) só existe para a Udemy
        if (kind === 'udemy' && msg.kind === 'content' && msg.content && Array.isArray(msg.content.modules)) {
          return callApi('/courses/sync-content', msg.content);
        }
        return bad;
      case 'lc-items':
        if (!Array.isArray(msg.items)) return bad;
        pending.items = msg.items.slice(0, 500);
        pending.platform = kind;
        openAppPage(PLATFORMS[kind].importPath);
        return { ok: true };
      case 'lc-content':
        if (!msg.content || !Array.isArray(msg.content.modules)) return bad;
        pending.content = msg.content;
        openAppPage('/importar-conteudo');
        return { ok: true };
      case 'lc-get': {
        const out = { items: pending.items, content: pending.content, ...(pending.items && pending.platform !== 'udemy' ? { platform: pending.platform } : {}) };
        pending.items = null;
        pending.content = null;
        pending.platform = 'udemy';
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
      case 'open-platform':
        if (typeof msg.platform !== 'string' || !PLATFORM_IDS.includes(msg.platform)) return bad;
        openPlatform(msg.platform);
        return { ok: true };
      default:
        return { ok: false, reason: 'unknown' };
    }
  }

  return { handle };
}
