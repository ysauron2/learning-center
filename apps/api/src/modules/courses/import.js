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

const canonicalUrl = (key) =>
  key.startsWith('id:')
    ? `https://www.udemy.com/course-dashboard-redirect/?course_id=${key.slice(3)}`
    : `https://www.udemy.com/course/${key}/`;

const importItem = z.object({
  title: z.string().trim().min(1).transform((s) => s.slice(0, 160)),
  url: z.string().trim().max(500),
  progress: z.number().min(0).max(100).default(0).transform(Math.round),
  instructor: z.string().trim().max(120).optional(),
});

export const importBody = z.object({ items: z.array(importItem).min(1).max(500) });

const statusFor = (progress) => (progress >= 100 ? 'completed' : progress > 0 ? 'active' : 'planned');

export function createCourseImporter(db, courses) {
  function existingKeys() {
    const map = new Map();
    for (const r of db.prepare('SELECT id, url FROM lc_courses WHERE url IS NOT NULL').all()) {
      const k = udemyKey(r.url);
      if (k && !map.has(k)) map.set(k, r.id);
    }
    return map;
  }

  /** Classifica cada item em novo / já existente / inválido, sem gravar nada. */
  function classify({ items }) {
    const known = existingKeys();
    const seen = new Set();
    const out = { new: [], existing: [], invalid: [] };
    for (const it of items) {
      const key = udemyKey(it.url);
      if (!key) {
        out.invalid.push({ title: it.title, reason: 'Link não é de um curso da Udemy.' });
      } else if (known.has(key)) {
        out.existing.push({ title: it.title, url: canonicalUrl(key), courseId: known.get(key) });
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
        });
      }
    }
    return out;
  }

  function preview(body) {
    const r = classify(body);
    return { ...r, new: r.new.map(({ key, ...rest }) => rest) };
  }

  function run(body) {
    const r = classify(body);
    const ids = transaction(db, () =>
      r.new.map((c) =>
        courses.create({
          title: c.title,
          platform: 'Udemy',
          url: c.url,
          status: c.status,
          manualProgress: c.progress,
          description: c.instructor ? `Instrutor: ${c.instructor}` : '',
        }).id,
      ),
    );
    return { created: ids.length, skipped: r.existing.length, invalid: r.invalid.length, ids };
  }

  return { preview, run };
}
