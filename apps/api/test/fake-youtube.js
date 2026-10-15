/**
 * Simulador do YouTube para os testes: devolve páginas no formato que o YouTube usa
 * (`ytInitialData` no HTML + continuação pela API interna). NÃO prova que o YouTube real
 * ainda está assim; isso é conferido à mão (veja docs/IMPORTACAO-OUTRAS.md).
 */
export const vid = (n, extra = {}) => ({ id: `v${String(n).padStart(10, '0')}`.slice(0, 11), title: `Aula ${n}`, sec: 60 * n, ...extra });

export const makeVideos = (count, from = 1) => Array.from({ length: count }, (_, i) => vid(from + i));

const token = (listId, offset) => Buffer.from(`\n\x04VL${listId}:${offset}`).toString('base64');

function oldRenderer(v) {
  if (v.private) {
    return { playlistVideoRenderer: { videoId: v.id, title: { runs: [{ text: '[Private video]' }] }, isPlayable: false } };
  }
  return {
    playlistVideoRenderer: {
      videoId: v.id,
      title: { runs: [{ text: v.title }] },
      lengthSeconds: String(v.sec),
      shortBylineText: { runs: [{ text: 'Canal Velho' }] },
      isPlayable: true,
    },
  };
}

function lockup(v) {
  return {
    lockupViewModel: {
      contentId: v.id,
      contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
      contentImage: {
        thumbnailViewModel: {
          overlays: [{ thumbnailBottomOverlayViewModel: { badges: v.private ? [] : [{ thumbnailBadgeViewModel: { text: clock(v.sec), animatedText: 'Tocando agora' } }] } }],
        },
      },
      metadata: { lockupMetadataViewModel: { title: { content: v.private ? 'Vídeo privado' : v.title } } },
    },
  };
}

function clock(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

/**
 * @param playlists  { [id]: { title, channel, videos, pageSize?, format?: 'old'|'lockup', alert?, html?, noData? } }
 */
export function createFakeYoutube(playlists) {
  const calls = [];
  const res = (status, body, headers = {}) => ({
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });

  function items(pl, from) {
    const size = pl.pageSize ?? 100;
    const slice = pl.videos.slice(from, from + size);
    const render = pl.format === 'lockup' ? lockup : oldRenderer;
    const out = slice.map(render);
    const next = from + size;
    if (next < pl.videos.length) {
      out.push({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: token(pl.id, next), request: 'CONTINUATION_REQUEST_TYPE_BROWSE' } } } });
    }
    return out;
  }

  async function fake(url, init = {}) {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers, redirect: init.redirect, body: init.body });
    const u = new URL(url);
    if (u.hostname !== 'www.youtube.com') return res(200, 'fora do YouTube');
    if (u.pathname === '/playlist') {
      const id = u.searchParams.get('list');
      if (id === 'PLredirectEvil00') return res(302, '', { location: 'https://evil.example.com/steal' });
      if (id === 'PLredirectOkOk00') return res(302, '', { location: 'https://www.youtube.com/playlist?list=PLsimplesLista1' });
      if (id === 'PLnetworkDown000') throw new Error('ECONNRESET');
      if (id === 'PLhttp500000000') return res(500, 'erro');
      if (id === 'PLhuge000000000') return res(200, 'x'.repeat(10), { 'content-length': String(50_000_000) });
      const pl = playlists[id];
      if (!pl) return res(200, wrap({ alerts: [{ alertRenderer: { text: { runs: [{ text: 'A playlist não existe.' }] } } }] }));
      pl.id = id;
      if (pl.html !== undefined) return res(200, pl.html);
      if (pl.alert) return res(200, wrap({ alerts: [{ alertRenderer: { text: { simpleText: pl.alert } } }] }));
      const data = {
        metadata: { playlistMetadataRenderer: { title: pl.title } },
        header: { playlistHeaderRenderer: { ownerText: { runs: [{ text: pl.channel ?? '' }] } } },
        contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: [{ playlistVideoListRenderer: { contents: items(pl, 0) } }] } }] } } } }] } },
        // outra continuação na página (comentários): precisa ser ignorada
        engagementPanels: [{ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: Buffer.from('FEcomment_playlist_web_top_level').toString('base64') } } } }],
      };
      return res(200, wrap(data));
    }
    if (u.pathname === '/youtubei/v1/browse' && init.method === 'POST') {
      const body = JSON.parse(init.body);
      const raw = Buffer.from(body.continuation, 'base64').toString('latin1');
      const m = /VL(.+):(\d+)$/.exec(raw);
      const pl = m && playlists[m[1]];
      if (!pl) return res(400, { error: 'bad token' });
      pl.id = m[1];
      if (pl.failContinuation) return res(500, 'falhou');
      return res(200, { onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: items(pl, Number(m[2])) } }] });
    }
    return res(404, 'nada');
  }

  return { fetch: fake, calls };
}

function wrap(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head><title>x - YouTube</title></head><body><script>var ytcfg = {"INNERTUBE_API_KEY":"AIzaFAKEKEYFAKEKEYFAKEKEY","INNERTUBE_CONTEXT_CLIENT_VERSION":"2.20260101.00.00"};</script><script nonce="a">var ytInitialData = ${json};</script></body></html>`;
}
