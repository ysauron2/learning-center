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
  'lc-visit': 'platform', // detecção do curso aberto: vale para as janelas de plataforma, menos a Udemy (veja abaixo)
  'storage-get': 'platform',
  'storage-set': 'platform',
  'lc-get': 'app',
  'open-udemy': 'app',
  'open-platform': 'app',
  'update-state': 'app',
  'update-install': 'app',
};
const bad = { ok: false, reason: 'bad-request' };

export function createBridge({ apiBase, fetchImpl = fetch, settings, saveSettings, openAppPage, openUdemy = () => {}, openPlatform = () => {}, getUpdates = () => null }) {
  const pending = { items: null, content: null, platform: 'udemy' };

  async function callApi(path, body, method = 'POST') {
    let res;
    try {
      res = await fetchImpl(`${apiBase}/api/v1${path}`, {
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
  // O endereço vem da janela que enviou (sem parâmetros de busca nem fragmento); a mensagem só traz título, progresso e a resposta da pessoa.
  // O que volta para a página é só texto de aviso (título do curso e um código de uso único para desfazer).
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
  async function handleVisit(msg, kind, senderUrl) {
    let url;
    try {
      const u = new URL(senderUrl);
      url = u.origin + u.pathname;
    } catch {
      return bad;
    }
    const base = { platform: kind, url };
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
        if (!token) return bad;
        const r = await callApi('/courses/visit/undo', { token });
        return { ok: true, undone: Boolean(r.ok && r.data && r.data.undone) };
      }
      default:
        return bad;
    }
  }

  async function handle(msg, kind, senderUrl = '') {
    if (!msg || typeof msg !== 'object' || !(msg.type in ALLOWED)) return { ok: false, reason: 'unknown' };
    const allowed = ALLOWED[msg.type] === 'platform' ? PLATFORM_IDS.includes(kind) : kind === ALLOWED[msg.type];
    if (!allowed) return { ok: false, reason: 'forbidden' };
    if (msg.type === 'lc-visit') return kind === 'udemy' ? { ok: false, reason: 'forbidden' } : handleVisit(msg, kind, senderUrl);

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
      case 'update-state': {
        const updates = getUpdates();
        if (!updates) return { status: 'disabled' };
        return msg.refresh === true ? updates.refresh() : updates.peek();
      }
      case 'update-install': {
        const updates = getUpdates();
        return updates ? updates.install() : { status: 'none' };
      }
      default:
        return { ok: false, reason: 'unknown' };
    }
  }

  return { handle };
}
