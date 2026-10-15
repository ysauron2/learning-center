import { z } from 'zod';
import { transaction } from '../../core/db.js';
import { describeCourse } from '../../core/course-pages.js';
import { loadCourseFromLink } from '../../core/course-loader.js';
import { PLATFORMS, parseCourseLink } from '../../core/platforms.js';

export const linkBody = z.object({
  url: z.string().trim().min(1, 'Cole o link do curso.').max(600),
  category: z.string().trim().min(1).max(60).optional(),
});

const NO_LESSONS = 'Não encontrei as aulas nessa página. O curso será criado sem aulas; depois você pode usar “Colar lista de aulas”.';

/**
 * Importação por link público (sem login): lê a página do curso, mostra a prévia e cria o curso.
 * Idempotente: o curso é reconhecido pela chave `plataforma:slug` (coluna source_key) ou pelo endereço.
 * Importar de novo só acrescenta o que faltar; nunca duplica, apaga ou renomeia nada.
 */
export function createLinkImporter({ db, courses, contentImporter, fetchImpl }) {
  function findExisting(page) {
    const byKey = db.prepare('SELECT id, title, description, image_url FROM lc_courses WHERE source_key = ?').get(page.key);
    if (byKey) return byKey;
    // curso cadastrado antes (à mão ou pela leitura de "Meus cursos") com o mesmo endereço
    const rows = db.prepare('SELECT id, title, description, image_url, url FROM lc_courses WHERE url IS NOT NULL').all();
    return rows.find((r) => parseCourseLink(r.url)?.key === page.key) ?? null;
  }

  const modulesBody = (page) => page.modules.map((m) => ({ title: m.title, lessons: m.lessons.map((l) => ({ title: l.title, durationMin: l.durationMin, completed: false })) }));
  const countLessons = (page) => page.modules.reduce((n, m) => n + m.lessons.length, 0);

  async function preview(body) {
    const page = await loadCourseFromLink(body.url, fetchImpl);
    const lessonCount = countLessons(page);
    const found = findExisting(page);
    let existing = null;
    if (found) {
      const added = page.modules.length ? contentImporter.preview(found.id, { modules: modulesBody(page) }).lessonsCreated : 0;
      existing = { id: found.id, title: found.title, newLessons: added };
    }
    return {
      platform: page.platform,
      platformName: PLATFORMS[page.platform].name,
      title: page.title,
      url: page.url,
      description: describeCourse(page),
      instructor: page.instructor,
      workloadMin: page.workloadMin,
      imageUrl: page.imageUrl,
      moduleCount: page.modules.length,
      lessonCount,
      modules: page.modules,
      warnings: lessonCount ? [] : [NO_LESSONS],
      existing,
    };
  }

  async function run(body) {
    const page = await loadCourseFromLink(body.url, fetchImpl);
    const modules = modulesBody(page);
    const found = findExisting(page);
    if (found) {
      let added = 0;
      transaction(db, () => {
        if (modules.length) added = contentImporter.run(found.id, { modules }).lessonsCreated;
        // só completa o que está faltando; não troca nada que a pessoa já tenha
        const patch = {};
        if (!found.image_url && page.imageUrl) patch.imageUrl = page.imageUrl;
        if (!found.description && page.description) patch.description = describeCourse(page);
        if (Object.keys(patch).length) courses.update(found.id, patch);
        db.prepare('UPDATE lc_courses SET source_key = ? WHERE id = ? AND source_key IS NULL AND NOT EXISTS (SELECT 1 FROM lc_courses WHERE source_key = ?)').run(page.key, found.id, page.key);
      });
      return { created: false, courseId: found.id, title: found.title, lessonsAdded: added, warnings: [] };
    }
    const id = transaction(db, () => {
      const course = courses.create({
        title: page.title,
        platform: PLATFORMS[page.platform].name,
        category: body.category ?? 'Geral',
        description: describeCourse(page),
        url: page.url,
        imageUrl: page.imageUrl,
        status: 'planned',
      });
      db.prepare('UPDATE lc_courses SET source_key = ? WHERE id = ?').run(page.key, course.id);
      if (modules.length) contentImporter.run(course.id, { modules });
      return course.id;
    });
    const lessonsAdded = countLessons(page);
    return { created: true, courseId: id, title: page.title, lessonsAdded, warnings: lessonsAdded ? [] : [NO_LESSONS] };
  }

  return { preview, run };
}
