import { z } from 'zod';
import { transaction } from '../../core/db.js';

const MAX_LESSONS_TOTAL = 3000;

const lessonItem = z.object({
  title: z.string().trim().min(1).transform((s) => s.slice(0, 200)),
  durationMin: z.number().default(0).transform((n) => Math.min(1000, Math.max(0, Math.round(n)))),
  completed: z.boolean().default(false),
});

const moduleItem = z.object({
  title: z.string().trim().min(1).transform((s) => s.slice(0, 160)),
  lessons: z.array(lessonItem).max(500),
});

export const contentBody = z
  .object({ modules: z.array(moduleItem).min(1).max(200) })
  .refine((b) => b.modules.reduce((n, m) => n + m.lessons.length, 0) <= MAX_LESSONS_TOTAL, 'Aulas demais.');

const norm = (s) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Chave "título#n": a n-ésima ocorrência do mesmo título (aulas como "Quiz" se repetem). */
function keyed(items) {
  const seen = new Map();
  return items.map((it) => {
    const base = norm(it.title);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...it, key: `${base}#${n}` };
  });
}

/**
 * Importa seções e aulas para um curso existente. É idempotente e só soma:
 * cria o que falta, preenche duração zerada e marca como concluída; nunca apaga,
 * renomeia nem desmarca nada que o usuário já tenha.
 */
export function createContentImporter(db, courses) {
  function plan(courseId, body) {
    const course = courses.get(courseId); // 404 se não existir
    const existingModules = new Map(keyed(course.modules).map((m) => [m.key, m]));
    const summary = { modulesCreated: 0, modulesExisting: 0, lessonsCreated: 0, lessonsExisting: 0, lessonsCompleted: 0 };
    let total = course.totalLessons;
    let done = course.doneLessons;
    const modules = keyed(body.modules).map((m) => {
      const found = existingModules.get(m.key) ?? null;
      if (found) summary.modulesExisting += 1;
      else summary.modulesCreated += 1;
      const existingLessons = new Map(keyed(found?.lessons ?? []).map((l) => [l.key, l]));
      const lessons = keyed(m.lessons).map((l) => {
        const ex = existingLessons.get(l.key) ?? null;
        if (!ex) {
          summary.lessonsCreated += 1;
          total += 1;
          if (l.completed) { summary.lessonsCompleted += 1; done += 1; }
          return { ...l, existing: null, complete: l.completed, fillDuration: false };
        }
        summary.lessonsExisting += 1;
        const complete = l.completed && !ex.completed;
        if (complete) { summary.lessonsCompleted += 1; done += 1; }
        return { ...l, existing: ex, complete, fillDuration: ex.durationMin === 0 && l.durationMin > 0 };
      });
      return { title: m.title, existing: found, lessons };
    });
    return { summary: { ...summary, after: { total, done, progress: total ? Math.round((done / total) * 100) : course.progress } }, modules };
  }

  const preview = (courseId, body) => plan(courseId, body).summary;

  function run(courseId, body) {
    const { summary, modules } = plan(courseId, body);
    transaction(db, () => {
      for (const m of modules) {
        const moduleId = m.existing ? m.existing.id : courses.addModule(courseId, { title: m.title }).id;
        for (const l of m.lessons) {
          if (!l.existing) {
            const created = courses.addLesson(moduleId, { title: l.title, durationMin: l.durationMin });
            if (l.complete) courses.updateLesson(created.id, { completed: true });
          } else {
            const patch = {};
            if (l.complete) patch.completed = true;
            if (l.fillDuration) patch.durationMin = l.durationMin;
            if (Object.keys(patch).length) courses.updateLesson(l.existing.id, patch);
          }
        }
      }
    });
    return summary;
  }

  return { preview, run };
}
