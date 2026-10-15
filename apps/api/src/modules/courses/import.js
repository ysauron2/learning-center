import { z } from 'zod';
import { transaction } from '../../core/db.js';
import { PLATFORMS, parseCourseLink, platformForHost } from '../../core/platforms.js';

/**
 * Identifica o curso pelo link, ignorando hash e subdomínio da Udemy:
 * `/course/<slug>` → slug; `?course_id=<n>` (redirecionamento do painel) → "id:<n>".
 */
export function udemyKey(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (host !== 'udemy.com' && !host.endsWith('.udemy.com')) return null;
  const m = u.pathname.match(/^\/course\/([^/]+)/i);
  if (m) return decodeURIComponent(m[1]).toLowerCase();
  const id = u.searchParams.get('course_id');
  return id && /^\d{1,12}$/.test(id) ? `id:${id}` : null;
}

/** Imagem só se for https e da própria Udemy (evita rastreadores); caso contrário é ignorada. */
export function safeImage(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const ok = host === 'udemycdn.com' || host.endsWith('.udemycdn.com') || host === 'udemy.com' || host.endsWith('.udemy.com');
    return u.protocol === 'https:' && ok && raw.length <= 500 ? u.href : null;
  } catch {
    return null;
  }
}

const canonicalUrl = (key) =>
  key.startsWith('id:')
    ? `https://www.udemy.com/course-dashboard-redirect/?course_id=${key.slice(3)}`
    : `https://www.udemy.com/course/${key}/`;

/** Plataformas da leitura de "Meus cursos". A Udemy é a original; as outras vêm do registro (core/platforms.js). */
// as plataformas só de link (Microsoft Learn etc.) não têm leitura pela janela logada
export const IMPORT_PLATFORMS = ['udemy', ...Object.values(PLATFORMS).filter((p) => !p.linkOnly).map((p) => p.id)];
const platformName = (id) => (id === 'udemy' ? 'Udemy' : PLATFORMS[id].name);

/** Chave do curso (sem duplicar ao importar de novo): a da Udemy ou `plataforma:slug`. */
function courseKey(platform, raw) {
  if (platform === 'udemy') return udemyKey(raw);
  const ref = parseCourseLink(raw);
  return ref && ref.platform.id === platform ? ref.key : null;
}

function imageFor(platform, raw) {
  if (platform === 'udemy') return safeImage(raw);
  try {
    const u = new URL(String(raw ?? ''));
    return u.protocol === 'https:' && u.href.length <= 500 && platformForHost(u.hostname)?.id === platform ? u.href : null;
  } catch {
    return null;
  }
}

const importItem = z.object({
  title: z.string().trim().min(1).transform((s) => s.slice(0, 160)),
  url: z.string().trim().max(500),
  progress: z.number().min(0).max(100).default(0).transform(Math.round),
  instructor: z.string().trim().max(120).optional(),
  imageUrl: z.string().max(2000).optional(),
});

export const importBody = z.object({
  /** De qual plataforma é a lista (padrão: Udemy). */
  platform: z.enum(IMPORT_PLATFORMS).default('udemy'),
  items: z.array(importItem).min(1).max(500),
  /** Sobe o progresso de cursos existentes sem aulas (nunca desce). Desligado por padrão. */
  updateProgress: z.boolean().optional(),
  /** Categoria dos cursos NOVOS (padrão: Geral). Cursos existentes não são alterados. */
  category: z.string().trim().min(1).max(60).optional(),
});

const canonicalFor = (platform, key, raw) => (platform === 'udemy' ? canonicalUrl(key) : parseCourseLink(raw).url);

const statusFor = (progress) => (progress >= 100 ? 'completed' : progress > 0 ? 'active' : 'planned');

export function createCourseImporter(db, courses) {
  function existingKeys(platform) {
    const map = new Map();
    const rows = db
      .prepare(
        `SELECT id, url, source_key, image_url, status, manual_progress,
          (SELECT COUNT(*) FROM lc_lessons l WHERE l.course_id = lc_courses.id) AS n_lessons
         FROM lc_courses WHERE url IS NOT NULL OR source_key IS NOT NULL`,
      )
      .all();
    for (const r of rows) {
      const k = platform === 'udemy' ? (r.url ? udemyKey(r.url) : null) : (r.source_key?.startsWith(`${platform}:`) ? r.source_key : (r.url ? courseKey(platform, r.url) : null));
      if (k && !map.has(k)) {
        map.set(k, { id: r.id, hasImage: Boolean(r.image_url), status: r.status, progress: r.manual_progress, hasLessons: r.n_lessons > 0 });
      }
    }
    return map;
  }

  /** Classifica cada item em novo / já existente / inválido, sem gravar nada. */
  function classify({ items, updateProgress, platform = 'udemy' }) {
    const known = existingKeys(platform);
    const seen = new Set();
    const out = { new: [], existing: [], invalid: [], fill: [], progress: [] };
    for (const it of items) {
      const key = courseKey(platform, it.url);
      if (!key) {
        out.invalid.push({ title: it.title, reason: `Link não é de um curso da ${platformName(platform)}.` });
      } else if (known.has(key)) {
        const ex = known.get(key);
        out.existing.push({ title: it.title, url: canonicalFor(platform, key, it.url), courseId: ex.id });
        // só sobe o progresso de curso sem aulas (com aulas, o progresso vem delas)
        if (updateProgress && !ex.hasLessons && it.progress > ex.progress && !out.progress.some((q) => q.courseId === ex.id)) {
          out.progress.push({ courseId: ex.id, progress: it.progress, status: it.progress >= 100 ? 'completed' : ex.status === 'planned' ? 'active' : ex.status });
        }
        const img = imageFor(platform, it.imageUrl);
        if (img && !ex.hasImage && !out.fill.some((f) => f.courseId === ex.id)) out.fill.push({ courseId: ex.id, imageUrl: img });
      } else if (seen.has(key)) {
        out.existing.push({ title: it.title, url: canonicalFor(platform, key, it.url), courseId: null });
      } else {
        seen.add(key);
        out.new.push({
          key,
          title: it.title,
          url: canonicalFor(platform, key, it.url),
          progress: it.progress,
          status: statusFor(it.progress),
          instructor: it.instructor,
          imageUrl: imageFor(platform, it.imageUrl),
        });
      }
    }
    return out;
  }

  function preview(body) {
    const r = classify(body);
    const { fill, progress, ...rest } = r;
    return { ...rest, new: r.new.map(({ key, imageUrl, ...c }) => ({ ...c, hasImage: Boolean(imageUrl) })), imagesToFill: fill.length, progressToUpdate: progress.length };
  }

  function run(body) {
    const platform = body.platform ?? 'udemy';
    const r = classify(body);
    const ids = transaction(db, () => {
      const created = r.new.map((c) => {
        const course = courses.create({
          title: c.title,
          platform: platformName(platform),
          url: c.url,
          status: c.status,
          manualProgress: c.progress,
          description: c.instructor ? `Instrutor: ${c.instructor}` : '',
          imageUrl: c.imageUrl,
          category: body.category,
        });
        if (platform !== 'udemy') db.prepare('UPDATE lc_courses SET source_key = ? WHERE id = ?').run(c.key, course.id);
        return course.id;
      });
      // cursos que já existem só ganham imagem se não tinham; nunca trocamos uma existente
      r.fill.forEach((f) => courses.update(f.courseId, { imageUrl: f.imageUrl }));
      r.progress.forEach((q) => courses.update(q.courseId, { manualProgress: q.progress, status: q.status }));
      return created;
    });
    return { created: ids.length, skipped: r.existing.length, invalid: r.invalid.length, imagesFilled: r.fill.length, progressUpdated: r.progress.length, ids };
  }

  return { preview, run };
}
