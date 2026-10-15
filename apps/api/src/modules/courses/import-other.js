import { z } from 'zod';
import { transaction } from '../../core/db.js';
import { HttpError } from '../../core/errors.js';
import { fold } from '../../core/text.js';
import { createYoutubeClient, parsePlaylistId, playlistUrl, MAX_VIDEOS } from '../../core/youtube.js';
import { parseLessonList } from '../../core/lesson-text.js';

const optionName = (max) => z.string().trim().min(1).max(max).optional();
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u) && URL.canParse(u), 'Use um endereço que comece com http:// ou https://.');

export const youtubeBody = z.object({
  url: z.string().trim().min(1, 'Cole o link da playlist.').max(600),
  platform: optionName(60),
  category: optionName(60),
  selectedVideoIds: z.array(z.string().regex(/^[\w-]{11}$/)).max(MAX_VIDEOS).optional(),
});

export const textBody = z.object({
  title: z.string().trim().min(1, 'Informe o título do curso.').max(160),
  platform: optionName(60),
  category: optionName(60),
  url: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), httpUrl.optional()),
  text: z.string().max(400_000).refine((t) => t.trim().length > 0, 'Cole a lista de aulas.'),
  mode: z.enum(['novo', 'acrescentar']).optional(),
});

const BLOCK = 20;
const BLOCK_THRESHOLD = 60;
const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const minutes = (sec) => Math.max(1, Math.ceil(sec / 60));
const sameKey = (s) => fold(s);

/** Importações "de outras fontes": playlist do YouTube e lista de aulas colada. */
export function createOtherImporters({ db, courses, contentImporter, fetchImpl }) {
  const youtube = createYoutubeClient({ fetchImpl });

  /* ---------- YouTube ---------- */

  function findByList(listId) {
    const rows = db.prepare('SELECT id, title, url FROM lc_courses WHERE url LIKE ?').all(`%list=${listId.replace(/[\\%_]/g, '\\$&')}%`);
    return rows.find((r) => {
      try { return new URL(r.url).searchParams.get('list') === listId; } catch { return false; }
    }) ?? null;
  }

  const lessonKeys = (course) => {
    const counts = new Map();
    for (const m of course.modules) for (const l of m.lessons) counts.set(sameKey(l.title), (counts.get(sameKey(l.title)) ?? 0) + 1);
    return counts;
  };

  /** Quebra os vídeos em módulos: um só ("Vídeos") ou blocos de 20 se a playlist for grande. */
  function moduleBlocks(videos) {
    const asLesson = (v) => ({ title: v.title, durationMin: minutes(v.durationSec), completed: false });
    if (videos.length <= BLOCK_THRESHOLD) return [{ title: 'Vídeos', lessons: videos.map(asLesson) }];
    const out = [];
    for (let i = 0; i < videos.length; i += BLOCK) {
      const part = videos.slice(i, i + BLOCK);
      out.push({ title: `Vídeos ${i + 1} a ${i + part.length}`, lessons: part.map(asLesson) });
    }
    return out;
  }

  async function load(body) {
    const listId = parsePlaylistId(body.url);
    const pl = await youtube.fetchPlaylist(listId);
    let videos = pl.videos;
    if (body.selectedVideoIds) {
      const want = new Set(body.selectedVideoIds);
      videos = videos.filter((v) => want.has(v.id));
      if (!videos.length) throw new HttpError(400, 'YOUTUBE_NOTHING_SELECTED', 'Marque pelo menos um vídeo para importar.');
    }
    return { ...pl, videos };
  }

  /** Vídeos que o curso já tem não entram de novo (compara pelo título, pois a aula não guarda o link). */
  function newOnly(course, videos) {
    const have = lessonKeys(course);
    return videos.filter((v) => {
      const k = sameKey(v.title);
      const n = have.get(k) ?? 0;
      if (n > 0) { have.set(k, n - 1); return false; }
      return true;
    });
  }

  async function youtubePreview(body) {
    const pl = await load(body);
    const found = findByList(pl.listId);
    let existing = null;
    if (found) {
      const fresh = newOnly(courses.get(found.id), pl.videos);
      existing = { id: found.id, title: found.title, newVideos: fresh.length };
    }
    return {
      listId: pl.listId,
      title: pl.title,
      channel: pl.channel,
      videoCount: pl.videos.length,
      totalMin: pl.videos.reduce((n, v) => n + minutes(v.durationSec), 0),
      skipped: pl.skipped,
      truncated: pl.truncated,
      videos: pl.videos,
      existing,
    };
  }

  async function youtubeRun(body) {
    const pl = await load(body);
    const found = findByList(pl.listId);
    if (found) {
      const fresh = newOnly(courses.get(found.id), pl.videos);
      if (fresh.length) {
        contentImporter.run(found.id, { modules: [{ title: 'Novos vídeos', lessons: moduleBlocks(fresh).flatMap((m) => m.lessons) }] });
      }
      return { created: false, courseId: found.id, title: found.title, lessonsAdded: fresh.length, skipped: pl.skipped, truncated: pl.truncated };
    }
    const id = transaction(db, () => {
      const course = courses.create({
        title: pl.title.slice(0, 160),
        platform: body.platform ?? 'YouTube',
        category: body.category ?? 'Geral',
        description: pl.channel ? `Canal: ${pl.channel}` : '',
        url: playlistUrl(pl.listId),
        imageUrl: thumb(pl.videos[0].id),
        status: 'planned',
      });
      contentImporter.run(course.id, { modules: moduleBlocks(pl.videos) });
      return course.id;
    });
    return { created: true, courseId: id, title: pl.title, lessonsAdded: pl.videos.length, skipped: pl.skipped, truncated: pl.truncated };
  }

  /* ---------- Lista colada ---------- */

  function findSameCourse(title, platform) {
    const canon = (kind, v) => db.prepare('SELECT name FROM lc_options WHERE kind = ?').all(kind).map((r) => r.name).find((n) => fold(n) === fold(v)) ?? v;
    const wantPlatform = fold(canon('platform', platform));
    const row = db.prepare('SELECT id, title, platform FROM lc_courses').all().find((r) => fold(r.title) === fold(title) && fold(r.platform) === wantPlatform);
    return row ? { id: row.id, title: row.title } : null;
  }

  function textPreview(body) {
    const list = parseLessonList(body.text);
    if (!list.lessonCount) throw new HttpError(422, 'LIST_EMPTY', 'Não achei nenhuma aula nesse texto. Escreva uma aula por linha.');
    return { ...list, existing: findSameCourse(body.title, body.platform ?? 'Outro') };
  }

  function textRun(body) {
    const list = parseLessonList(body.text);
    if (!list.lessonCount) throw new HttpError(422, 'LIST_EMPTY', 'Não achei nenhuma aula nesse texto. Escreva uma aula por linha.');
    const modules = list.modules.map((m) => ({ title: m.title, lessons: m.lessons.map((l) => ({ title: l.title, durationMin: l.durationMin, completed: false })) }));
    const existing = findSameCourse(body.title, body.platform ?? 'Outro');
    if (existing && !body.mode) {
      throw new HttpError(409, 'COURSE_EXISTS', `Já existe um curso chamado “${existing.title}” nessa plataforma. Escolha entre acrescentar as aulas nele ou criar um curso novo.`, { courseId: existing.id });
    }
    if (existing && body.mode === 'acrescentar') {
      const summary = contentImporter.run(existing.id, { modules });
      return { created: false, courseId: existing.id, title: existing.title, lessonsAdded: summary.lessonsCreated, modulesAdded: summary.modulesCreated };
    }
    const id = transaction(db, () => {
      const course = courses.create({
        title: body.title,
        platform: body.platform ?? 'Outro',
        category: body.category ?? 'Geral',
        url: body.url,
        status: 'planned',
      });
      contentImporter.run(course.id, { modules });
      return course.id;
    });
    return { created: true, courseId: id, title: body.title, lessonsAdded: list.lessonCount, modulesAdded: modules.length };
  }

  return { youtubePreview, youtubeRun, textPreview, textRun };
}
