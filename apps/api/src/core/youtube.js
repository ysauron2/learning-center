import { HttpError } from './errors.js';

/**
 * Leitura de playlists públicas do YouTube, sem login e sem chave de API.
 * O YouTube muda esse formato com frequência: o parser é tolerante (procura os blocos pelo nome,
 * em qualquer lugar do JSON) e, se não entender a página, devolve um erro claro em português.
 */

export const MAX_VIDEOS = 500;
const MAX_PAGES = 15;
const MAX_BYTES = 6_000_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const isYoutubeHost = (h) => YT_HOSTS.has(h) || h.endsWith('.youtube.com');

const err = (status, code, message) => new HttpError(status, code, message);
const CANT_READ = () => err(422, 'YOUTUBE_PARSE', 'Não consegui ler essa playlist. Ela é pública?');

/** Extrai o id da lista de qualquer link comum do YouTube (ou de um id solto). */
export function parsePlaylistId(raw) {
  const text = String(raw ?? '').trim();
  const bad = () => err(400, 'YOUTUBE_URL_INVALID', 'Esse link não parece ser de uma playlist do YouTube. Ele precisa ter “list=” no endereço.');
  if (!text || text.length > 600) throw bad();
  if (/^(PL|UU|OL|FL)[A-Za-z0-9_-]{10,60}$/.test(text)) return text;
  let u;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw bad();
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !isYoutubeHost(u.hostname.toLowerCase())) throw bad();
  const id = u.searchParams.get('list');
  if (!id || !/^[A-Za-z0-9_-]{10,64}$/.test(id)) throw bad();
  return id;
}

export const playlistUrl = (listId) => `https://www.youtube.com/playlist?list=${listId}`;

/* ---------- ajudantes de JSON ---------- */

/** Texto de um campo do YouTube: `{simpleText}` ou `{runs:[{text}]}`. */
export function textOf(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r?.text ?? '').join('');
  return '';
}

/** Acha, em qualquer profundidade, todos os valores de uma chave (sem recursão: JSON hostil não estoura a pilha). */
export function findAll(root, key, limit = 5000) {
  const out = [];
  const stack = [root];
  let visited = 0;
  while (stack.length && out.length < limit && visited < 3_000_000) {
    const cur = stack.pop();
    visited += 1;
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      for (let i = cur.length - 1; i >= 0; i -= 1) stack.push(cur[i]);
      continue;
    }
    for (const k of Object.keys(cur)) {
      if (k === key) out.push(cur[k]);
      const v = cur[k];
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return out;
}

/** Lê o objeto JSON que começa em `start` (conta chaves respeitando textos entre aspas). */
function readJsonObject(src, start) {
  if (src[start] !== '{') return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i += 1;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(src.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Do HTML da página: os dados iniciais (`ytInitialData`) e o necessário para pedir as próximas páginas. */
export function extractPageData(html) {
  const src = String(html ?? '');
  const m = /(?:var\s+ytInitialData|window\[\s*["']ytInitialData["']\s*\])\s*=\s*/.exec(src);
  if (!m) return null;
  const data = readJsonObject(src, m.index + m[0].length);
  if (!data) return null;
  const key = /"INNERTUBE_API_KEY"\s*:\s*"([\w-]{10,80})"/.exec(src)?.[1] ?? null;
  const clientVersion = /"INNERTUBE_CONTEXT_CLIENT_VERSION"\s*:\s*"([\w.-]{3,40})"/.exec(src)?.[1] ?? null;
  return { data, key, clientVersion };
}

const UNAVAILABLE_TITLE = /^\[(private video|deleted video|unavailable video|v[ií]deo privado|v[ií]deo exclu[ií]do|v[ií]deo indispon[ií]vel|v[ií]deo removido)\]$/i;

function clockToSeconds(s) {
  const parts = String(s).trim().split(':').map((p) => Number.parseInt(p, 10));
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function tokenIsFor(token, listId) {
  if (!listId) return true;
  try {
    return Buffer.from(decodeURIComponent(token), 'base64').toString('latin1').includes(`VL${listId}`);
  } catch {
    return false;
  }
}

/** Um vídeo no formato novo do YouTube (lockupViewModel): id, título e a duração do selo da miniatura. */
function lockupToVideo(l) {
  if (l?.contentType && l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return undefined; // não é vídeo (ex.: anúncio)
  const id = typeof l?.contentId === 'string' ? l.contentId : '';
  const title = textOf(l?.metadata?.lockupMetadataViewModel?.title) || String(l?.metadata?.lockupMetadataViewModel?.title?.content ?? '');
  const badge = findAll(l?.contentImage, 'thumbnailBadgeViewModel', 10).map((b) => clockToSeconds(b?.text)).find((n) => n > 0) ?? 0;
  return { id, title, sec: badge, playable: undefined };
}

/** Lê uma página (a inicial ou uma continuação): vídeos válidos, quantos foram pulados e o próximo token. */
export function extractVideos(data, listId = '') {
  const raw = [];
  for (const r of findAll(data, 'playlistVideoRenderer')) {
    raw.push({
      id: typeof r?.videoId === 'string' ? r.videoId : '',
      title: textOf(r?.title),
      sec: Number.parseInt(r?.lengthSeconds, 10) || clockToSeconds(textOf(r?.lengthText)),
      playable: r?.isPlayable,
    });
  }
  for (const l of findAll(data, 'lockupViewModel')) {
    const v = lockupToVideo(l);
    if (v) raw.push(v);
  }
  const videos = [];
  let skipped = 0;
  for (const r of raw) {
    const title = String(r.title).replace(/\s+/g, ' ').trim();
    const unusable = !/^[\w-]{11}$/.test(r.id) || !title || UNAVAILABLE_TITLE.test(title) || r.playable === false || !(r.sec > 0);
    if (unusable) skipped += 1;
    else videos.push({ id: r.id, title: title.slice(0, 200), durationSec: r.sec });
  }
  // a página tem outras continuações (ex.: comentários): só vale a que carrega o id desta playlist
  const token = findAll(data, 'continuationCommand').map((c) => c?.token).find((t) => typeof t === 'string' && t && tokenIsFor(t, listId)) ?? null;
  return { videos, skipped, token };
}

/** Título da playlist e canal, procurando nos lugares conhecidos (cabeçalho novo, antigo e metadados). */
export function extractMeta(data) {
  const title =
    textOf(findAll(data, 'playlistMetadataRenderer', 1)[0]?.title) ||
    textOf(findAll(data, 'playlistHeaderRenderer', 1)[0]?.title) ||
    textOf(findAll(data, 'pageHeaderViewModel', 1)[0]?.title) ||
    textOf(findAll(data, 'pageHeaderRenderer', 1)[0]?.pageTitle);
  const channel =
    textOf(findAll(data, 'playlistHeaderRenderer', 1)[0]?.ownerText) ||
    textOf(findAll(data, 'videoOwnerRenderer', 1)[0]?.title) ||
    String(findAll(data, 'avatarStackViewModel', 1)[0]?.text?.content ?? '').replace(/^(?:por|by)\s+/i, '') ||
    textOf(findAll(data, 'playlistVideoRenderer', 1)[0]?.shortBylineText);
  return { title: title.replace(/\s+/g, ' ').trim().slice(0, 160), channel: channel.replace(/\s+/g, ' ').trim().slice(0, 120) };
}

/** Avisos do YouTube na página (playlist privada, inexistente...). */
function pageAlert(data) {
  return findAll(data, 'alertRenderer', 5).map((a) => textOf(a?.text)).find(Boolean) ?? '';
}

/* ---------- rede ---------- */

async function readLimited(res) {
  const declared = Number(res.headers?.get?.('content-length'));
  if (declared > MAX_BYTES) throw err(422, 'YOUTUBE_TOO_BIG', 'A resposta do YouTube veio grande demais.');
  if (res.body?.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw err(422, 'YOUTUBE_TOO_BIG', 'A resposta do YouTube veio grande demais.');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const text = await res.text();
  if (text.length > MAX_BYTES) throw err(422, 'YOUTUBE_TOO_BIG', 'A resposta do YouTube veio grande demais.');
  return text;
}

/** Cliente de leitura. `fetchImpl` é injetável (os testes usam um simulador). */
export function createYoutubeClient({ fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  async function request(url, init = {}) {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const u = new URL(current);
      if (u.protocol !== 'https:' || !isYoutubeHost(u.hostname.toLowerCase())) throw CANT_READ();
      let res;
      try {
        res = await fetchImpl(u.href, {
          ...init,
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            'User-Agent': BROWSER_UA,
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5',
            Cookie: 'SOCS=CAI; CONSENT=YES+1',
            ...init.headers,
          },
        });
      } catch {
        throw err(502, 'YOUTUBE_UNREACHABLE', 'Não consegui falar com o YouTube agora. Confira a internet e tente de novo.');
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers?.get?.('location');
        if (!loc) throw CANT_READ();
        try {
          current = new URL(loc, u).href; // só segue se continuar no YouTube (checado no início da volta)
        } catch {
          throw CANT_READ();
        }
        continue;
      }
      if (res.status === 404) throw err(404, 'YOUTUBE_NOT_FOUND', 'Essa playlist não existe ou foi removida.');
      if (res.status === 429) throw err(429, 'YOUTUBE_BUSY', 'O YouTube pediu para esperar um pouco. Tente de novo em alguns minutos.');
      if (res.status < 200 || res.status >= 300) throw CANT_READ();
      return readLimited(res);
    }
    throw CANT_READ();
  }

  /** Lê a playlist inteira (até 500 vídeos): título, canal, vídeos válidos e quantos foram pulados. */
  async function fetchPlaylist(listId, { maxVideos = MAX_VIDEOS } = {}) {
    let page = extractPageData(await request(playlistUrl(listId)));
    if (!page) page = extractPageData(await request(playlistUrl(listId))); // o YouTube às vezes devolve uma página incompleta: tenta mais uma vez
    if (!page) throw CANT_READ();
    const first = extractVideos(page.data, listId);
    const hasList = findAll(page.data, 'playlistVideoListRenderer', 1).length > 0;
    if (!first.videos.length && !first.skipped) {
      const alert = pageAlert(page.data);
      if (/priva|private/i.test(alert)) throw err(422, 'YOUTUBE_PRIVATE', 'Essa playlist é privada. No YouTube, deixe ela como “Pública” ou “Não listada” e tente de novo.');
      if (alert || (!hasList && !extractMeta(page.data).title)) throw err(404, 'YOUTUBE_NOT_FOUND', 'Essa playlist não existe ou foi removida.');
      if (!hasList) throw CANT_READ();
      throw err(422, 'YOUTUBE_EMPTY', 'Essa playlist está vazia.');
    }
    const meta = extractMeta(page.data);
    const videos = [...first.videos];
    let skipped = first.skipped;
    let token = first.token;
    let truncated = false;
    for (let pages = 1; token; pages += 1) {
      if (pages >= MAX_PAGES || videos.length >= maxVideos) { truncated = true; break; }
      let next;
      try {
        const key = page.key ? `?key=${encodeURIComponent(page.key)}` : '';
        const body = JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: page.clientVersion ?? '2.20240101.00.00', hl: 'pt-BR', gl: 'BR' } },
          continuation: token,
        });
        const text = await request(`https://www.youtube.com/youtubei/v1/browse${key}`, {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/json' },
        });
        next = extractVideos(JSON.parse(text), listId);
      } catch {
        truncated = true; // já temos as primeiras páginas: devolve o que deu para ler
        break;
      }
      if (!next.videos.length && !next.skipped) { truncated = Boolean(next.token); break; }
      videos.push(...next.videos);
      skipped += next.skipped;
      token = next.token;
    }
    if (videos.length > maxVideos) { videos.length = maxVideos; truncated = true; }
    if (!videos.length) {
      throw err(422, 'YOUTUBE_EMPTY', 'Não achei nenhum vídeo disponível nessa playlist (todos privados ou removidos?).');
    }
    return { listId, title: meta.title || 'Playlist do YouTube', channel: meta.channel, videos, skipped, truncated };
  }

  return { fetchPlaylist };
}
