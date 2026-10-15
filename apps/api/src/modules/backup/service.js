import { z } from 'zod';
import { transaction } from '../../core/db.js';
import { HttpError } from '../../core/errors.js';
import { seedDefaultOptions, syncOptions } from '../../core/options.js';

export const BACKUP_APP = 'learning-center';
export const BACKUP_VERSION = 1;

const id = z.number().int().positive();
const nullableId = id.nullable();
const int0 = z.number().int().min(0);
const text = z.string().max(20000);
const httpsOrNull = z
  .string()
  .max(500)
  .refine((u) => u.startsWith('https://'), 'Use um endereço https.')
  .nullish()
  .transform((v) => v ?? null);

const courseRow = z.object({
  id,
  title: z.string().min(1).max(500),
  platform: z.string().min(1).max(200),
  category: z.string().min(1).max(200),
  description: text,
  url: z.string().max(2000).nullable(),
  image_url: httpsOrNull,
  udemy_slug: z.string().max(300).nullish().transform((v) => v ?? null),
  status: z.enum(['planned', 'active', 'paused', 'completed']),
  manual_progress: z.number().int().min(0).max(100),
  created_at: z.string().min(1).max(40),
  updated_at: z.string().min(1).max(40),
});
const tagRow = z.object({ course_id: id, tag: z.string().min(1).max(200) });
const moduleRow = z.object({ id, course_id: id, title: z.string().min(1).max(500), position: z.number().int() });
const lessonRow = z.object({
  id, module_id: id, course_id: id,
  title: z.string().min(1).max(500),
  duration_min: int0,
  position: z.number().int(),
  completed_at: z.string().max(40).nullable(),
  last_position_sec: int0,
});
const sessionRow = z.object({
  id, course_id: nullableId, lesson_id: nullableId,
  kind: z.enum(['pomodoro', 'stopwatch', 'manual']),
  planned_min: z.number().int().nullable(),
  started_at: z.string().min(1).max(40),
  paused_at: z.string().max(40).nullable(),
  paused_total_sec: int0,
  ended_at: z.string().max(40).nullable(),
  duration_sec: int0,
  focus_rating: z.number().int().min(1).max(5).nullable(),
  notes: text,
});
const settingRow = z.object({ key: z.string().min(1).max(200), value: z.string().max(2000) });
const optionRow = z.object({ kind: z.enum(['category', 'platform']), name: z.string().trim().min(1).max(60) });
const planRow = z.object({
  id,
  weekday: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration_min: z.number().int().min(5).max(600),
  course_id: nullableId,
  created_at: z.string().min(1).max(40),
});
const noteRow = z.object({
  id,
  title: z.string().max(200),
  body_md: z.string().max(100000),
  course_id: nullableId,
  lesson_id: nullableId,
  created_at: z.string().min(1).max(40),
  updated_at: z.string().min(1).max(40),
});
const noteTagRow = z.object({ note_id: id, tag: z.string().min(1).max(100) });
const trackRow = z.object({
  id,
  title: z.string().min(1).max(500),
  description: z.string().max(5000),
  created_at: z.string().min(1).max(40),
  updated_at: z.string().min(1).max(40),
});
const trackItemRow = z.object({
  id,
  track_id: id,
  position: z.number().int(),
  course_id: nullableId,
  title: z.string().max(500),
  done_at: z.string().max(40).nullable(),
});

const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().max(40),
  data: z.object({
    courses: z.array(courseRow),
    courseTags: z.array(tagRow),
    modules: z.array(moduleRow),
    lessons: z.array(lessonRow),
    sessions: z.array(sessionRow),
    settings: z.array(settingRow),
    // opcionais: backups antigos (anteriores às anotações e trilhas) continuam válidos
    notes: z.array(noteRow).default([]),
    noteTags: z.array(noteTagRow).default([]),
    tracks: z.array(trackRow).default([]),
    trackItems: z.array(trackItemRow).default([]),
    // ausente em backups antigos: aí valem as sugestões padrão
    options: z.array(optionRow).optional(),
    studyPlan: z.array(planRow).default([]),
  }),
});

const COLUMNS = {
  courses: 'id, title, platform, category, description, url, image_url, udemy_slug, status, manual_progress, created_at, updated_at',
  courseTags: 'course_id, tag',
  modules: 'id, course_id, title, position',
  lessons: 'id, module_id, course_id, title, duration_min, position, completed_at, last_position_sec',
  sessions: 'id, course_id, lesson_id, kind, planned_min, started_at, paused_at, paused_total_sec, ended_at, duration_sec, focus_rating, notes',
  settings: 'key, value',
  notes: 'id, title, body_md, course_id, lesson_id, created_at, updated_at',
  noteTags: 'note_id, tag',
  tracks: 'id, title, description, created_at, updated_at',
  trackItems: 'id, track_id, position, course_id, title, done_at',
  options: 'kind, name',
  studyPlan: 'id, weekday, start_time, duration_min, course_id, created_at',
};
const TABLES = {
  courses: ['lc_courses', 'id'],
  courseTags: ['lc_course_tags', 'course_id, tag'],
  modules: ['lc_modules', 'id'],
  lessons: ['lc_lessons', 'id'],
  sessions: ['lc_study_sessions', 'id'],
  settings: ['lc_settings', 'key'],
  notes: ['lc_notes', 'id'],
  noteTags: ['lc_note_tags', 'note_id, tag'],
  tracks: ['lc_tracks', 'id'],
  trackItems: ['lc_track_items', 'id'],
  options: ['lc_options', 'kind, name'],
  studyPlan: ['lc_study_plan', 'id'],
};

const invalid = (message, details) => new HttpError(400, 'INVALID_BACKUP', message, details);

export function createBackupService(db, clock) {
  function exportAll() {
    const data = {};
    for (const [name, [table, order]] of Object.entries(TABLES)) {
      data[name] = db.prepare(`SELECT ${COLUMNS[name]} FROM ${table} ORDER BY ${order}`).all().map((r) => ({ ...r }));
    }
    return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: clock.now().toISOString(), data };
  }

  /** Valida formato, tipos, ids repetidos e referências entre tabelas. Devolve o backup limpo. */
  function validate(raw) {
    if (!raw || typeof raw !== 'object') throw invalid('Arquivo de backup inválido.');
    if (raw.app !== undefined && raw.app !== BACKUP_APP) throw invalid('Esse arquivo não é um backup do Learning Center.');
    if (raw.version !== undefined && raw.version !== BACKUP_VERSION) throw invalid(`Versão de backup não suportada (${String(raw.version)}).`);
    const parsed = backupSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message }));
      throw invalid('O arquivo está incompleto ou com dados inválidos.', issues);
    }
    const d = parsed.data.data;
    const unique = (rows, field, label) => {
      const seen = new Set();
      for (const r of rows) {
        if (seen.has(r[field])) throw invalid(`${label} com id repetido (${r[field]}).`);
        seen.add(r[field]);
      }
      return seen;
    };
    const courseIds = unique(d.courses, 'id', 'Curso');
    const slugs = new Set();
    for (const c of d.courses) {
      if (c.udemy_slug === null) continue;
      if (slugs.has(c.udemy_slug)) throw invalid(`Dois cursos com o mesmo endereço da Udemy (${c.udemy_slug}).`);
      slugs.add(c.udemy_slug);
    }
    const moduleIds = unique(d.modules, 'id', 'Módulo');
    const lessonIds = unique(d.lessons, 'id', 'Aula');
    unique(d.sessions, 'id', 'Sessão');
    unique(d.settings, 'key', 'Configuração');
    const tagKeys = new Set();
    for (const t of d.courseTags) {
      if (!courseIds.has(t.course_id)) throw invalid(`Tag aponta para curso inexistente (${t.course_id}).`);
      const k = `${t.course_id}|${t.tag}`;
      if (tagKeys.has(k)) throw invalid('Tag repetida no mesmo curso.');
      tagKeys.add(k);
    }
    const moduleCourse = new Map();
    for (const m of d.modules) {
      if (!courseIds.has(m.course_id)) throw invalid(`Módulo aponta para curso inexistente (${m.course_id}).`);
      moduleCourse.set(m.id, m.course_id);
    }
    for (const l of d.lessons) {
      if (!moduleIds.has(l.module_id)) throw invalid(`Aula aponta para módulo inexistente (${l.module_id}).`);
      if (moduleCourse.get(l.module_id) !== l.course_id) throw invalid(`Aula ${l.id} não pertence ao curso do módulo.`);
    }
    for (const s of d.sessions) {
      if (s.course_id !== null && !courseIds.has(s.course_id)) throw invalid(`Sessão aponta para curso inexistente (${s.course_id}).`);
      if (s.lesson_id !== null && !lessonIds.has(s.lesson_id)) throw invalid(`Sessão aponta para aula inexistente (${s.lesson_id}).`);
    }
    unique(d.studyPlan, 'id', 'Bloco do plano');
    for (const p of d.studyPlan) {
      if (p.course_id !== null && !courseIds.has(p.course_id)) throw invalid(`Bloco do plano aponta para curso inexistente (${p.course_id}).`);
    }
    const noteIds = unique(d.notes, 'id', 'Anotação');
    for (const n of d.notes) {
      if (n.course_id !== null && !courseIds.has(n.course_id)) throw invalid(`Anotação aponta para curso inexistente (${n.course_id}).`);
      if (n.lesson_id !== null && !lessonIds.has(n.lesson_id)) throw invalid(`Anotação aponta para aula inexistente (${n.lesson_id}).`);
      if (!n.title.trim() && !n.body_md.trim()) throw invalid(`Anotação ${n.id} está vazia.`);
    }
    const noteTagKeys = new Set();
    for (const t of d.noteTags) {
      if (!noteIds.has(t.note_id)) throw invalid(`Tag aponta para anotação inexistente (${t.note_id}).`);
      const k = `${t.note_id}|${t.tag}`;
      if (noteTagKeys.has(k)) throw invalid('Tag repetida na mesma anotação.');
      noteTagKeys.add(k);
    }
    const trackIds = unique(d.tracks, 'id', 'Trilha');
    unique(d.trackItems, 'id', 'Etapa');
    const trackCourse = new Set();
    for (const i of d.trackItems) {
      if (!trackIds.has(i.track_id)) throw invalid(`Etapa aponta para trilha inexistente (${i.track_id}).`);
      if (i.course_id !== null) {
        if (!courseIds.has(i.course_id)) throw invalid(`Etapa aponta para curso inexistente (${i.course_id}).`);
        const k = `${i.track_id}|${i.course_id}`;
        if (trackCourse.has(k)) throw invalid('O mesmo curso aparece duas vezes na mesma trilha.');
        trackCourse.add(k);
      } else if (!i.title.trim()) {
        throw invalid(`Etapa ${i.id} não tem curso nem título.`);
      }
    }
    return parsed.data;
  }

  const countsOf = (d) => ({
    courses: d.courses.length,
    modules: d.modules.length,
    lessons: d.lessons.length,
    sessions: d.sessions.length,
    tags: d.courseTags.length,
    notes: d.notes.length,
    tracks: d.tracks.length,
    plan: d.studyPlan.length,
  });

  function preview(raw) {
    const bk = validate(raw);
    return { exportedAt: bk.exportedAt, counts: countsOf(bk.data) };
  }

  /** Substitui TODOS os dados pelos do backup, em uma única transação (ou tudo, ou nada). */
  function restore(raw) {
    const bk = validate(raw);
    const d = bk.data;
    transaction(db, () => {
      for (const t of ['lc_note_tags', 'lc_notes', 'lc_track_items', 'lc_tracks', 'lc_study_sessions', 'lc_lessons', 'lc_modules', 'lc_course_tags', 'lc_courses', 'lc_settings', 'lc_options', 'lc_study_plan']) {
        db.exec(`DELETE FROM ${t}`);
      }
      db.exec("DELETE FROM sqlite_sequence WHERE name IN ('lc_courses','lc_modules','lc_lessons','lc_study_sessions','lc_notes','lc_tracks','lc_track_items','lc_study_plan')");
      const insert = (table, cols, rows) => {
        const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
        for (const r of rows) stmt.run(...cols.map((c) => r[c]));
      };
      for (const name of ['courses', 'courseTags', 'modules', 'lessons', 'sessions', 'tracks', 'trackItems', 'notes', 'noteTags', 'studyPlan', 'settings']) {
        insert(TABLES[name][0], COLUMNS[name].split(', '), d[name]);
      }
      // lista de categorias/plataformas: a do backup (ou as padrão, se for backup antigo) + o que os cursos usam
      if (d.options) {
        const opt = db.prepare('INSERT OR IGNORE INTO lc_options (kind, name) VALUES (?, ?)');
        for (const o of d.options) opt.run(o.kind, o.name);
      } else {
        seedDefaultOptions(db);
      }
      syncOptions(db);
    });
    return { counts: countsOf(d), exportedAt: bk.exportedAt };
  }

  return { exportAll, preview, restore };
}
