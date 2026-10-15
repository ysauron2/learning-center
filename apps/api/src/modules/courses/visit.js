import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../../core/errors.js';
import { PLATFORM_IDS, PLATFORMS, parseCourseLink } from '../../core/platforms.js';

const MODE_KEY = 'auto_detect_mode';
export const MODES = ['ask', 'auto', 'never'];
const HOUR_MS = 60 * 60 * 1000;
const SNOOZE_MS = 7 * 24 * HOUR_MS;
const TOKEN_MS = 10 * 60 * 1000;
const SNOOZE_PREFIX = 'visit_snooze:';

export const visitBody = z.object({
  platform: z.enum(PLATFORM_IDS, { errorMap: () => ({ message: 'Plataforma não aceita para detecção automática.' }) }),
  url: z.string().trim().min(1).max(600),
  title: z.string().max(400).optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  confirm: z.boolean().optional(),
});
export const undoBody = z.object({ token: z.string().min(8).max(100) });
export const modeBody = z.object({ mode: z.enum(MODES) });

/** Título só como texto: sem quebras, sem o nome do site no fim, no máximo 160 caracteres. */
export function cleanTitle(raw, fallback = '') {
  const t = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+[|\-–—]\s+(?:Alura|Microsoft Learn|freeCodeCamp(?:\.org)?|Coursera|Rocketseat|Escola Virtual.*|Fundação Bradesco)\s*$/i, '')
    .replace(/\s+[|\-–—]\s+(?:Training|Treinamento)\s*$/i, '')
    .trim();
  return (t || fallback).slice(0, 160);
}

/**
 * Detecção automática do curso que a pessoa está fazendo. Reaproveita o importador por link (nada de
 * segundo caminho): a URL só serve para achar a chave `plataforma:slug`; quem busca a página é o importador,
 * sempre no endereço canônico do registro.
 */
export function createVisitService({ db, clock, courses, linkImporter }) {
  const now = () => clock.now();
  const undoTokens = new Map(); // token → { courseId, kind, previousStatus, expires } (só em memória, uso único)

  const getSetting = (key) => db.prepare('SELECT value FROM lc_settings WHERE key = ?').get(key)?.value ?? null;
  const putSetting = (key, value) =>
    db.prepare('INSERT INTO lc_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);

  function getMode() {
    const v = getSetting(MODE_KEY);
    return MODES.includes(v) ? v : 'ask';
  }
  const getSettings = () => ({ mode: getMode() });
  function setMode(mode) {
    putSetting(MODE_KEY, mode);
    return getSettings();
  }

  function issueToken(info) {
    for (const [t, v] of undoTokens) if (v.expires < now().getTime()) undoTokens.delete(t);
    const token = randomUUID();
    undoTokens.set(token, { ...info, expires: now().getTime() + TOKEN_MS });
    return token;
  }

  function resolve(body) {
    const ref = parseCourseLink(body.url);
    if (!ref || ref.platform.id !== body.platform) {
      throw new HttpError(400, 'VISIT_INVALID', 'Esse endereço não é de uma página de curso dessa plataforma.');
    }
    return ref;
  }

  const row = (id) => db.prepare('SELECT id, status, manual_progress, last_visited_at FROM lc_courses WHERE id = ?').get(id);
  const touch = (id) => db.prepare('UPDATE lc_courses SET last_visited_at = ? WHERE id = ?').run(now().toISOString(), id);
  const isSnoozed = (key) => {
    const until = getSetting(SNOOZE_PREFIX + key);
    return Boolean(until) && new Date(until).getTime() > now().getTime();
  };

  function dismiss(body) {
    const ref = resolve(body);
    for (const r of db.prepare('SELECT key, value FROM lc_settings WHERE key LIKE ?').all(`${SNOOZE_PREFIX}%`)) {
      if (new Date(r.value).getTime() <= now().getTime()) db.prepare('DELETE FROM lc_settings WHERE key = ?').run(r.key);
    }
    putSetting(SNOOZE_PREFIX + ref.key, new Date(now().getTime() + SNOOZE_MS).toISOString());
    return { action: 'unchanged', reason: 'snoozed' };
  }

  function summary(id) {
    const c = courses.get(id);
    return { id: c.id, title: c.title, platform: c.platform, status: c.status, progress: c.progress };
  }

  function existing(r, progress) {
    const recent = r.last_visited_at && now().getTime() - new Date(r.last_visited_at).getTime() < HOUR_MS;
    const higher = progress !== null && progress > r.manual_progress && r.status !== 'completed';
    if (r.status === 'completed') {
      touch(r.id);
      return { action: 'unchanged', course: summary(r.id) };
    }
    if (recent) {
      // visita repetida em menos de 1 hora: só a data (e o progresso, que nunca desce, se subiu)
      if (higher) courses.update(r.id, { manualProgress: progress });
      return { action: 'unchanged', course: summary(r.id) };
    }
    if (r.status === 'planned' || r.status === 'paused') {
      const patch = { status: 'active' };
      if (higher) patch.manualProgress = progress;
      courses.update(r.id, patch);
      touch(r.id);
      return { action: 'activated', course: summary(r.id), undoToken: issueToken({ courseId: r.id, kind: 'status', previousStatus: r.status }) };
    }
    touch(r.id);
    if (higher) {
      courses.update(r.id, { manualProgress: progress });
      return { action: 'progress', course: summary(r.id) };
    }
    return { action: 'unchanged', course: summary(r.id) };
  }

  async function visit(body) {
    const ref = resolve(body);
    const mode = getMode();
    if (mode === 'never') return { action: 'unchanged', reason: 'never' };
    const progress = body.progressPercent === undefined ? null : Math.round(body.progressPercent);
    const platformName = PLATFORMS[ref.platform.id].name;

    const found = linkImporter.findByKey(ref.key);
    if (found) return existing(row(found.id), progress);

    if (mode === 'ask' && !body.confirm) {
      if (isSnoozed(ref.key)) return { action: 'unchanged', reason: 'snoozed' };
      return { action: 'ask', title: cleanTitle(body.title, ref.slug), platformName };
    }

    let id;
    try {
      const res = await linkImporter.run({ url: ref.url });
      if (!res.created) return existing(row(res.courseId), progress);
      id = res.courseId;
    } catch {
      // sem rede ou página fora do ar: não atrapalha a navegação; tenta de novo na próxima visita
      return { action: 'unchanged', reason: 'import-failed' };
    }
    const patch = { status: 'active' };
    if (progress !== null && progress > 0) patch.manualProgress = progress;
    courses.update(id, patch);
    touch(id);
    db.prepare('DELETE FROM lc_settings WHERE key = ?').run(SNOOZE_PREFIX + ref.key);
    return { action: 'created', course: summary(id), undoToken: issueToken({ courseId: id, kind: 'remove' }) };
  }

  function undo(token) {
    const info = undoTokens.get(token);
    if (!info || info.expires < now().getTime()) {
      undoTokens.delete(token);
      throw new HttpError(410, 'UNDO_EXPIRED', 'Não dá mais para desfazer. Se quiser, mude o curso na tela “Cursos”.');
    }
    undoTokens.delete(token);
    const r = row(info.courseId);
    if (!r) return { undone: false, action: 'none' };
    if (info.kind === 'status') {
      if (r.status === 'active') courses.update(r.id, { status: info.previousStatus });
      return { undone: true, action: 'status', status: info.previousStatus };
    }
    const used = db
      .prepare('SELECT (SELECT COUNT(*) FROM lc_study_sessions WHERE course_id = ?) + (SELECT COUNT(*) FROM lc_notes WHERE course_id = ?) AS n')
      .get(r.id, r.id).n;
    if (used > 0) throw new HttpError(409, 'UNDO_IN_USE', 'Esse curso já tem estudo ou anotações; não o removi.');
    courses.remove(r.id);
    return { undone: true, action: 'removed' };
  }

  return { visit, dismiss, undo, getSettings, setMode };
}
