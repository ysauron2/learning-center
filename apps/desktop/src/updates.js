// Aviso de versão nova e atualização do Lume.
// Tudo aqui é injetável (fetch, relógio, diálogo, links, atualizador, timers) para ser testado sem o Electron.

export const REPO = 'ysauron2/learning-center';
export const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
export const FIRST_CHECK_MS = 15_000;
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
export const SNOOZE_MS = 24 * 60 * 60 * 1000;
export const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 1_000_000;
const NOTES_MAX = 500;

/** Só links do repositório do Lume no GitHub (https, host e caminho conferidos). */
export function isAllowedUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.port || u.username || u.password) return false;
    return u.pathname === `/${REPO}` || u.pathname.startsWith(`/${REPO}/`);
  } catch {
    return false;
  }
}

function parseVersion(input) {
  if (typeof input !== 'string') return null;
  const m = /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(input.trim());
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : null };
}

function comparePre(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const an = /^\d+$/.test(a[i]);
    const bn = /^\d+$/.test(b[i]);
    if (an && bn) {
      const d = Number(a[i]) - Number(b[i]);
      if (d) return d < 0 ? -1 : 1;
    } else if (an) return -1;
    else if (bn) return 1;
    else if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/** -1, 0 ou 1; `null` se alguma das versões for inválida. Pré-lançamento (1.0.0-beta) é menor que a final. */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  if (!x.pre && !y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return comparePre(x.pre, y.pre);
}

export const isNewer = (candidate, current) => compareVersions(candidate, current) === 1;

/** Resume o texto da release: sem Markdown, sem tabelas, no máximo ~500 caracteres. */
export function summarizeNotes(body, max = NOTES_MAX) {
  if (typeof body !== 'string') return '';
  const lines = [];
  for (const raw of body.replace(/\r/g, '').split('\n')) {
    let line = raw.trim();
    if (!line || line.startsWith('|') || /^[-*_]{3,}$/.test(line) || /^```/.test(line)) continue;
    line = line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^>\s*/, '')
      .replace(/^[-*+]\s+/, '• ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/(\*\*|__|\*|`)/g, '')
      .trim();
    if (line) lines.push(line);
  }
  const text = lines.join('\n');
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Lê a resposta de `releases/latest`. Devolve `null` se for rascunho, pré-lançamento ou algo fora do esperado.
 * `{ version, notes, pageUrl, installerUrl }` — o instalador é só o do sistema (Windows .exe; Mac .dmg da arquitetura).
 */
export function parseRelease(json, { platform = process.platform, arch = process.arch } = {}) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  if (json.draft === true || json.prerelease === true) return null;
  const tag = typeof json.tag_name === 'string' ? json.tag_name.trim() : '';
  if (!tag || tag.length > 64 || !parseVersion(tag)) return null;
  const version = tag.replace(/^v/i, '');
  const pageUrl = isAllowedUrl(json.html_url) ? json.html_url : RELEASES_PAGE;
  const assets = Array.isArray(json.assets) ? json.assets.slice(0, 100) : [];
  const wanted = platform === 'win32' ? (n) => /\.exe$/i.test(n) : platform === 'darwin' ? (n) => new RegExp(`${arch}\\.dmg$`, 'i').test(n) : () => false;
  const asset = assets.find((a) => a && typeof a.name === 'string' && wanted(a.name) && isAllowedUrl(a.browser_download_url));
  return { version, notes: summarizeNotes(json.body), pageUrl, installerUrl: asset ? asset.browser_download_url : null };
}

/** Adiar: só vale para a mesma versão e dentro das 24 horas. Versão mais nova volta a avisar. */
export function shouldNotify({ version, snooze, now }) {
  if (!snooze || typeof snooze !== 'object') return true;
  if (snooze.version !== version) return true;
  return !(typeof snooze.until === 'number' && now < snooze.until);
}

/** Consulta a última versão. Nunca lança erro: devolve { status: 'available' | 'current' | 'error' }. */
export async function checkForUpdate({
  fetch: fetchFn,
  currentVersion,
  platform,
  arch,
  timeoutMs = FETCH_TIMEOUT_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  log = () => {},
}) {
  let timer;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeoutFn(() => { controller?.abort(); reject(new Error('tempo esgotado')); }, timeoutMs);
    });
    const work = (async () => {
      const res = await fetchFn(LATEST_API, {
        headers: { 'User-Agent': 'Lume-Updater', Accept: 'application/vnd.github+json' },
        signal: controller?.signal,
      });
      if (!res || !res.ok) throw new Error(`resposta ${res?.status ?? 'inválida'}`);
      const length = Number(res.headers?.get?.('content-length'));
      if (Number.isFinite(length) && length > MAX_BODY_CHARS) throw new Error('resposta grande demais');
      const text = await res.text();
      if (typeof text !== 'string' || text.length > MAX_BODY_CHARS) throw new Error('resposta grande demais');
      return JSON.parse(text);
    })();
    work.catch(() => {}); // evita erro solto se o tempo esgotar antes
    const json = await Promise.race([work, timeout]);
    const release = parseRelease(json, { platform, arch });
    if (!release) throw new Error('resposta inesperada');
    if (compareVersions(currentVersion, release.version) === null) throw new Error('versão inválida');
    return isNewer(release.version, currentVersion) ? { status: 'available', release } : { status: 'current', version: currentVersion };
  } catch (error) {
    log(`[atualização] não consegui verificar: ${error?.message ?? error}`);
    return { status: 'error' };
  } finally {
    if (timer !== undefined) clearTimeoutFn(timer);
  }
}

/**
 * Controlador: agenda a verificação (15 s depois de abrir e a cada 6 h) e conduz os avisos.
 * `showDialog({ title, message, detail, buttons })` devolve o índice do botão clicado.
 * `updater` (Windows): { checkForUpdates, downloadUpdate, quitAndInstall, on(event, fn) } no estilo do electron-updater.
 */
export function createUpdateController({
  currentVersion,
  platform = process.platform,
  arch = process.arch,
  enabled = true,
  fetch: fetchFn,
  now = () => Date.now(),
  getSnooze = () => null,
  setSnooze = () => {},
  showDialog,
  openLink,
  updater = null,
  setProgress = () => {},
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  log = () => {},
}) {
  let busy = false;
  let progressWired = false;
  let firstTimer = null;
  let loopTimer = null;

  const unref = (t) => { if (t && typeof t.unref === 'function') t.unref(); return t; };

  async function openAllowed(url) {
    if (!isAllowedUrl(url)) { log('[atualização] link recusado'); return false; }
    try { await openLink(url); return true; } catch (error) { log(`[atualização] não abriu o link: ${error?.message ?? error}`); return false; }
  }

  async function ask(options) {
    try { return await showDialog(options); } catch (error) { log(`[atualização] falha na janelinha: ${error?.message ?? error}`); return -1; }
  }

  async function updateOnWindows(release) {
    try {
      if (!progressWired) {
        progressWired = true;
        let lastPercent = -1;
        updater.on?.('download-progress', (p) => {
          const percent = Math.max(0, Math.min(100, Math.round(Number(p?.percent) || 0)));
          if (percent !== lastPercent) { lastPercent = percent; setProgress(percent / 100); }
        });
      }
      setProgress(2); // barra “indeterminada” (>1) até chegar o primeiro progresso
      await updater.checkForUpdates();
      await updater.downloadUpdate();
      setProgress(-1);
    } catch (error) {
      setProgress(-1);
      log(`[atualização] erro ao baixar: ${error?.message ?? error}`);
      const pick = await ask({
        title: 'Não consegui atualizar',
        message: 'Não foi possível baixar a nova versão agora.',
        detail: 'Você pode tentar de novo mais tarde ou baixar a versão nova pelo site.',
        buttons: ['Abrir página de download', 'Fechar'],
      });
      if (pick === 0) await openAllowed(release.pageUrl);
      return;
    }
    const pick = await ask({
      title: 'Atualização pronta',
      message: `O Lume ${release.version} foi baixado. Reiniciar agora para instalar?`,
      detail: 'O Lume vai fechar e abrir de novo já atualizado. Seus dados são mantidos.',
      buttons: ['Reiniciar agora', 'Depois'],
    });
    if (pick === 0) {
      try { updater.quitAndInstall(); } catch (error) { log(`[atualização] erro ao reiniciar: ${error?.message ?? error}`); }
    }
  }

  async function updateNow(release) {
    if (platform === 'win32' && updater) return updateOnWindows(release);
    // Mac (sem assinatura paga da Apple) e outros: o sistema não deixa instalar sozinho; abre a página da release.
    await ask({
      title: 'Baixar a nova versão',
      message: 'Vou abrir a página de download no navegador.',
      detail: 'Baixe o arquivo do seu Mac e arraste para Aplicativos.',
      buttons: ['Abrir a página'],
    });
    await openAllowed(RELEASES_PAGE);
  }

  /** `manual`: vindo do menu — sempre responde e ignora o “Depois”. */
  async function checkNow({ manual = false } = {}) {
    if (busy) return { status: 'busy' };
    if (!enabled) {
      if (manual) {
        busy = true;
        try { await ask({ title: 'Atualizações', message: 'A verificação de atualizações só funciona no Lume instalado.', buttons: ['OK'] }); } finally { busy = false; }
      }
      return { status: 'disabled' };
    }
    busy = true;
    try {
      const result = await checkForUpdate({ fetch: fetchFn, currentVersion, platform, arch, setTimeoutFn, clearTimeoutFn, log });
      if (result.status === 'error') {
        if (manual) await ask({ title: 'Atualizações', message: 'Não consegui verificar agora. Tente de novo mais tarde.', buttons: ['OK'] });
        return result;
      }
      if (result.status === 'current') {
        if (manual) await ask({ title: 'Atualizações', message: `Você já está na versão mais recente (${currentVersion}).`, buttons: ['OK'] });
        return result;
      }
      const { release } = result;
      if (!manual && !shouldNotify({ version: release.version, snooze: getSnooze(), now: now() })) return { status: 'snoozed', release };
      const pick = await ask({
        title: 'Nova versão do Lume',
        message: `O Lume ${release.version} está disponível (você está na ${currentVersion}).`,
        detail: release.notes ? `Novidades:\n${release.notes}` : undefined,
        buttons: ['Atualizar agora', 'Depois'],
      });
      if (pick === 0) await updateNow(release);
      else {
        try { setSnooze({ version: release.version, until: now() + SNOOZE_MS }); } catch (error) { log(`[atualização] não guardei o adiamento: ${error?.message ?? error}`); }
      }
      return result;
    } finally {
      busy = false;
    }
  }

  function start() {
    if (!enabled || firstTimer || loopTimer) return;
    const run = () => { checkNow().catch((error) => log(`[atualização] ${error?.message ?? error}`)); };
    firstTimer = unref(setTimeoutFn(run, FIRST_CHECK_MS));
    loopTimer = unref(setIntervalFn(run, CHECK_EVERY_MS));
  }

  function stop() {
    if (firstTimer) clearTimeoutFn(firstTimer);
    if (loopTimer) clearIntervalFn(loopTimer);
    firstTimer = null;
    loopTimer = null;
  }

  return { start, stop, checkNow };
}
