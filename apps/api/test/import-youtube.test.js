import { describe, it, expect, afterEach } from 'vitest';
import { makeApp } from './helpers.js';
import { createFakeYoutube, makeVideos, vid } from './fake-youtube.js';
import { createYoutubeClient, parsePlaylistId, extractPageData, extractVideos } from '../src/core/youtube.js';

const PL = 'PLsimplesLista1';
const URL_PL = `https://www.youtube.com/playlist?list=${PL}`;

describe('parsePlaylistId', () => {
  it('aceita os formatos comuns de link', () => {
    for (const u of [
      `https://www.youtube.com/playlist?list=${PL}`,
      `https://www.youtube.com/watch?v=abcdefghijk&list=${PL}&index=2`,
      `https://youtu.be/abcdefghijk?list=${PL}`,
      `https://music.youtube.com/playlist?list=${PL}`,
      `https://m.youtube.com/playlist?list=${PL}`,
      `youtube.com/playlist?list=${PL}`,
      PL,
    ]) expect(parsePlaylistId(u)).toBe(PL);
  });

  it('recusa links de outros sites, sem list= ou com formato estranho', () => {
    for (const u of ['', 'oi', 'https://evil.com/playlist?list=' + PL, 'https://youtube.com.evil.com/playlist?list=' + PL,
      'https://www.youtube.com/watch?v=abcdefghijk', 'https://www.youtube.com/playlist?list=<x>', 'javascript:alert(1)', 'ftp://www.youtube.com/playlist?list=' + PL]) {
      expect(() => parsePlaylistId(u), u).toThrow(/link|playlist/i);
    }
  });
});

describe('parser (formato do YouTube simulado)', () => {
  it('lê título, canal, vídeos e continuação pelo formato antigo', async () => {
    const yt = createFakeYoutube({ [PL]: { title: 'Curso {de} "teste"', channel: 'Canal X', videos: makeVideos(250), pageSize: 100 } });
    const r = await createYoutubeClient({ fetchImpl: yt.fetch }).fetchPlaylist(PL);
    expect(r).toMatchObject({ title: 'Curso {de} "teste"', channel: 'Canal X', skipped: 0, truncated: false });
    expect(r.videos).toHaveLength(250);
    expect(r.videos[0]).toEqual({ id: 'v0000000001', title: 'Aula 1', durationSec: 60 });
    expect(yt.calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('lê o formato novo (lockupViewModel) e ignora a continuação de comentários', async () => {
    const yt = createFakeYoutube({ [PL]: { title: 'Nova', videos: [vid(1, { sec: 5408 }), vid(2)], format: 'lockup' } });
    const r = await createYoutubeClient({ fetchImpl: yt.fetch }).fetchPlaylist(PL);
    expect(r.videos.map((v) => [v.title, v.durationSec])).toEqual([['Aula 1', 5408], ['Aula 2', 120]]);
    expect(yt.calls.filter((c) => c.method === 'POST')).toHaveLength(0); // o token de comentários não é seguido
  });

  it('pula vídeos privados/removidos e conta quantos foram', async () => {
    const yt = createFakeYoutube({ [PL]: { title: 'T', videos: [vid(1), vid(2, { private: true }), vid(3), vid(4, { private: true })], format: 'old' } });
    const r = await createYoutubeClient({ fetchImpl: yt.fetch }).fetchPlaylist(PL);
    expect(r.videos.map((v) => v.title)).toEqual(['Aula 1', 'Aula 3']);
    expect(r.skipped).toBe(2);
  });

  it('para em 500 vídeos e avisa que cortou', async () => {
    const yt = createFakeYoutube({ [PL]: { title: 'Gigante', videos: makeVideos(650), pageSize: 100 } });
    const r = await createYoutubeClient({ fetchImpl: yt.fetch }).fetchPlaylist(PL);
    expect(r.videos).toHaveLength(500);
    expect(r.truncated).toBe(true);
  });

  it('se a continuação falhar, devolve o que já leu e avisa', async () => {
    const yt = createFakeYoutube({ [PL]: { title: 'T', videos: makeVideos(150), pageSize: 100, failContinuation: true } });
    const r = await createYoutubeClient({ fetchImpl: yt.fetch }).fetchPlaylist(PL);
    expect(r.videos).toHaveLength(100);
    expect(r.truncated).toBe(true);
  });

  const read = (pl) => createYoutubeClient({ fetchImpl: createFakeYoutube({ [PL]: pl }).fetch }).fetchPlaylist(PL);

  it('erros claros: playlist inexistente, privada, vazia, tudo privado e HTML sem dados', async () => {
    await expect(createYoutubeClient({ fetchImpl: createFakeYoutube({}).fetch }).fetchPlaylist(PL)).rejects.toMatchObject({ code: 'YOUTUBE_NOT_FOUND' });
    await expect(read({ alert: 'Esta playlist é privada.' })).rejects.toMatchObject({ code: 'YOUTUBE_PRIVATE', message: expect.stringContaining('privada') });
    await expect(read({ title: 'Vazia', videos: [] })).rejects.toMatchObject({ code: 'YOUTUBE_EMPTY' });
    await expect(read({ title: 'T', videos: [vid(1, { private: true })] })).rejects.toMatchObject({ code: 'YOUTUBE_EMPTY' });
    await expect(read({ html: '<html><body>sem nada</body></html>' })).rejects.toMatchObject({ code: 'YOUTUBE_PARSE', message: 'Não consegui ler essa playlist. Ela é pública?' });
    await expect(read({ html: '<script>var ytInitialData = {"quebrado": ;</script>' })).rejects.toMatchObject({ code: 'YOUTUBE_PARSE' });
  });

  it('segurança: não segue redirecionamento para outro domínio, trata rede fora, erro HTTP e resposta enorme', async () => {
    const yt = createFakeYoutube({});
    const client = createYoutubeClient({ fetchImpl: yt.fetch });
    await expect(client.fetchPlaylist('PLredirectEvil00')).rejects.toMatchObject({ code: 'YOUTUBE_PARSE' });
    expect(yt.calls.some((c) => c.url.includes('evil.example.com'))).toBe(false);
    await expect(client.fetchPlaylist('PLnetworkDown000')).rejects.toMatchObject({ code: 'YOUTUBE_UNREACHABLE' });
    await expect(client.fetchPlaylist('PLhttp500000000')).rejects.toMatchObject({ code: 'YOUTUBE_PARSE' });
    await expect(client.fetchPlaylist('PLhuge000000000')).rejects.toMatchObject({ code: 'YOUTUBE_TOO_BIG' });
  });

  it('segue redirecionamento dentro do YouTube; pede com redirect manual, idioma pt-BR e navegador comum', async () => {
    const yt = createFakeYoutube({ [PL]: { title: 'Ok', videos: makeVideos(2) } });
    const r = await createYoutubeClient({ fetchImpl: yt.fetch }).fetchPlaylist('PLredirectOkOk00');
    expect(r.videos).toHaveLength(2);
    expect(yt.calls[0].redirect).toBe('manual');
    expect(yt.calls[0].headers['Accept-Language']).toContain('pt-BR');
    expect(yt.calls[0].headers['User-Agent']).toContain('Mozilla');
  });

  it('JSON hostil muito aninhado não estoura a pilha', () => {
    const deep = '['.repeat(100000) + ']'.repeat(100000);
    const html = `var ytInitialData = {"a": ${deep}};`;
    const page = extractPageData(html);
    expect(() => extractVideos(page?.data ?? {})).not.toThrow();
  });
});

describe('rotas do YouTube', () => {
  let ctx;
  afterEach(async () => ctx?.app.close());
  const setup = async (playlists) => {
    const yt = createFakeYoutube(playlists);
    ctx = await makeApp('2026-03-11T15:00:00', { youtubeFetch: yt.fetch });
    return yt;
  };

  it('prévia não grava nada e mostra título, canal, duração e vídeos', async () => {
    await setup({ [PL]: { title: 'Meu Curso', channel: 'Fulano', videos: [vid(1, { sec: 61 }), vid(2, { sec: 30 }), vid(3, { private: true })] } });
    const r = await ctx.call('POST', '/courses/import-youtube/preview', { url: URL_PL });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ title: 'Meu Curso', channel: 'Fulano', videoCount: 2, totalMin: 3, skipped: 1, existing: null });
    expect(r.body.data.videos[0]).toMatchObject({ id: 'v0000000001', durationSec: 61 });
    expect((await ctx.call('GET', '/courses')).body.data).toHaveLength(0);
  });

  it('cria o curso: plataforma YouTube, módulo Vídeos, minutos arredondados para cima, capa e link da lista', async () => {
    await setup({ [PL]: { title: 'Meu Curso', channel: 'Fulano', videos: [vid(1, { sec: 61 }), vid(2, { sec: 5 })] } });
    const r = await ctx.call('POST', '/courses/import-youtube', { url: URL_PL });
    expect(r.body.data).toMatchObject({ created: true, lessonsAdded: 2, skipped: 0 });
    const c = (await ctx.call('GET', `/courses/${r.body.data.courseId}`)).body.data;
    expect(c).toMatchObject({ title: 'Meu Curso', platform: 'YouTube', category: 'Geral', url: URL_PL, imageUrl: 'https://i.ytimg.com/vi/v0000000001/hqdefault.jpg', description: 'Canal: Fulano' });
    expect(c.modules).toHaveLength(1);
    expect(c.modules[0].title).toBe('Vídeos');
    expect(c.modules[0].lessons.map((l) => [l.title, l.durationMin])).toEqual([['Aula 1', 2], ['Aula 2', 1]]);
  });

  it('usa a categoria escolhida e só os vídeos marcados', async () => {
    await setup({ [PL]: { title: 'C', videos: makeVideos(4) } });
    const r = await ctx.call('POST', '/courses/import-youtube', { url: URL_PL, category: 'Linux', selectedVideoIds: ['v0000000002', 'v0000000004'] });
    const c = (await ctx.call('GET', `/courses/${r.body.data.courseId}`)).body.data;
    expect(c.category).toBe('Linux');
    expect(c.modules[0].lessons.map((l) => l.title)).toEqual(['Aula 2', 'Aula 4']);
    const none = await ctx.call('POST', '/courses/import-youtube', { url: URL_PL, selectedVideoIds: ['zzzzzzzzzzz'] });
    expect(none.status).toBe(400);
  });

  it('mais de 60 vídeos viram módulos de 20', async () => {
    await setup({ [PL]: { title: 'Grande', videos: makeVideos(65), pageSize: 100 } });
    const r = await ctx.call('POST', '/courses/import-youtube', { url: URL_PL });
    const c = (await ctx.call('GET', `/courses/${r.body.data.courseId}`)).body.data;
    expect(c.modules.map((m) => [m.title, m.lessons.length])).toEqual([['Vídeos 1 a 20', 20], ['Vídeos 21 a 40', 20], ['Vídeos 41 a 60', 20], ['Vídeos 61 a 65', 5]]);
  });

  it('importar de novo não duplica: reconhece a lista e só acrescenta vídeos novos', async () => {
    const pl = { title: 'Meu Curso', videos: makeVideos(3) };
    await setup({ [PL]: pl });
    const first = await ctx.call('POST', '/courses/import-youtube', { url: URL_PL });
    const again = await ctx.call('POST', '/courses/import-youtube', { url: `https://www.youtube.com/watch?v=abcdefghijk&list=${PL}` });
    expect(again.body.data).toMatchObject({ created: false, courseId: first.body.data.courseId, lessonsAdded: 0 });
    const prev = await ctx.call('POST', '/courses/import-youtube/preview', { url: URL_PL });
    expect(prev.body.data.existing).toMatchObject({ id: first.body.data.courseId, newVideos: 0 });
    pl.videos.push(vid(4), vid(5));
    const grown = await ctx.call('POST', '/courses/import-youtube', { url: URL_PL });
    expect(grown.body.data).toMatchObject({ created: false, lessonsAdded: 2 });
    const c = (await ctx.call('GET', `/courses/${first.body.data.courseId}`)).body.data;
    expect(c.totalLessons).toBe(5);
    expect((await ctx.call('GET', '/courses')).body.data).toHaveLength(1);
  });

  it('não mexe no progresso das aulas já concluídas ao reimportar', async () => {
    await setup({ [PL]: { title: 'C', videos: makeVideos(2) } });
    const id = (await ctx.call('POST', '/courses/import-youtube', { url: URL_PL })).body.data.courseId;
    const lesson = (await ctx.call('GET', `/courses/${id}`)).body.data.modules[0].lessons[0];
    await ctx.call('PATCH', `/lessons/${lesson.id}`, { completed: true });
    await ctx.call('POST', '/courses/import-youtube', { url: URL_PL });
    expect((await ctx.call('GET', `/courses/${id}`)).body.data.doneLessons).toBe(1);
  });

  it('títulos com HTML ficam como texto puro (a tela escapa)', async () => {
    await setup({ [PL]: { title: '<img src=x onerror=alert(1)>', videos: [vid(1, { title: '<script>alert(1)</script>' })] } });
    const id = (await ctx.call('POST', '/courses/import-youtube', { url: URL_PL })).body.data.courseId;
    const c = (await ctx.call('GET', `/courses/${id}`)).body.data;
    expect(c.title).toBe('<img src=x onerror=alert(1)>');
    expect(c.modules[0].lessons[0].title).toBe('<script>alert(1)</script>');
  });

  it('erros viram mensagens em português com o status certo', async () => {
    await setup({});
    const bad = await ctx.call('POST', '/courses/import-youtube/preview', { url: 'https://evil.com/x' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/playlist do YouTube/);
    const empty = await ctx.call('POST', '/courses/import-youtube/preview', { url: '' });
    expect(empty.status).toBe(400);
    const missing = await ctx.call('POST', '/courses/import-youtube/preview', { url: URL_PL });
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toMatch(/não existe/);
    const down = await ctx.call('POST', '/courses/import-youtube/preview', { url: 'PLnetworkDown000' });
    expect(down.status).toBe(502);
  });
});
