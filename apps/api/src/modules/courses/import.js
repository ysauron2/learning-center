import { z } from 'zod';
import { transaction } from '../../core/db.js';

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

const importItem = z.object({
  title: z.string().trim().min(1).transform((s) => s.slice(0, 160)),
  url: z.string().trim().max(500),
  progress: z.number().min(0).max(100).default(0).transform(Math.round),
  instructor: z.string().trim().max(120).optional(),
  imageUrl: z.string().max(2000).optional(),
});

export const importBody = z.object({ items: z.array(importItem).min(1).max(500) });

const statusFor = (progress) => (progress >= 100 ? 'completed' : progress > 0 ? 'active' : 'planned');

export function createCourseImporter(db, courses) {
  function existingKeys() {
    const map = new Map();
    for (const r of db.prepare('SELECT id, url, image_url FROM lc_courses WHERE url IS NOT NULL').all()) {
      const k = udemyKey(r.url);
      if (k && !map.has(k)) map.set(k, { id: r.id, hasImage: Boolean(r.image_url) });
    }
    return map;
  }

  /** Classifica cada item em novo / já existente / inválido, sem gravar nada. */
  function classify({ items }) {
    const known = existingKeys();
    const seen = new Set();
    const out = { new: [], existing: [], invalid: [], fill: [] };
    for (const it of items) {
      const key = udemyKey(it.url);
      if (!key) {
        out.invalid.push({ title: it.title, reason: 'Link não é de um curso da Udemy.' });
      } else if (known.has(key)) {
        const ex = known.get(key);
        out.existing.push({ title: it.title, url: canonicalUrl(key), courseId: ex.id });
        const img = safeImage(it.imageUrl);
        if (img && !ex.hasImage && !out.fill.some((f) => f.courseId === ex.id)) out.fill.push({ courseId: ex.id, imageUrl: img });
      } else if (seen.has(key)) {
        out.existing.push({ title: it.title, url: canonicalUrl(key), courseId: null });
      } else {
        seen.add(key);
        out.new.push({
          key,
          title: it.title,
          url: canonicalUrl(key),
          progress: it.progress,
          status: statusFor(it.progress),
          instructor: it.instructor,
          imageUrl: safeImage(it.imageUrl),
        });
      }
    }
    return out;
  }

  function preview(body) {
    const r = classify(body);
    const { fill, ...rest } = r;
    return { ...rest, new: r.new.map(({ key, imageUrl, ...c }) => ({ ...c, hasImage: Boolean(imageUrl) })), imagesToFill: fill.length };
  }

  function run(body) {
    const r = classify(body);
    const ids = transaction(db, () => {
      const created = r.new.map((c) =>
        courses.create({
          title: c.title,
          platform: 'Udemy',
          url: c.url,
          status: c.status,
          manualProgress: c.progress,
          description: c.instructor ? `Instrutor: ${c.instructor}` : '',
          imageUrl: c.imageUrl,
        }).id,
      );
      // cursos que já existem só ganham imagem se não tinham; nunca trocamos uma existente
      r.fill.forEach((f) => courses.update(f.courseId, { imageUrl: f.imageUrl }));
      return created;
    });
    return { created: ids.length, skipped: r.existing.length, invalid: r.invalid.length, imagesFilled: r.fill.length, ids };
  }

  return { preview, run };
}
