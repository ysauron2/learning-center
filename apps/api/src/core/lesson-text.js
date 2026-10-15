import { HttpError } from './errors.js';

export const MAX_LINES = 2000;
export const MAX_TITLE = 200;
export const DEFAULT_MIN = 10;
const MAX_LINE_CHARS = 1000;

// "12:30", "1:05:00", "1h05", "2h", "1h 05min", "8 min", "45 minutos", "30 seg"
const DUR = String.raw`(?:\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}\s*h(?:\s*\d{1,2}\s*(?:min|m)?)?|\d{1,4}\s*(?:min|mins|minutos?|m)|\d{1,5}\s*(?:seg|segundos?))`;
// duração no fim da linha, depois de "|", " - ", "(" ou só um espaço
const TAIL = new RegExp(String.raw`^(.*?)(?:\s*\|\s*|\s+[-–—]\s+|\s*\(\s*|\s+)(${DUR})\s*\)?\s*$`, 'i');
const ONLY_DUR = new RegExp(String.raw`^\s*(${DUR})\s*$`, 'i');
const MODULE_WORD = /^(?:m[óo]dulo|se[çc][ãa]o|section|module)\b/i;

/** "1h05" → 3900 s; devolve 0 se não for uma duração válida. */
export function durationToSeconds(raw) {
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  let m;
  if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s))) {
    const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] === undefined ? null : Number(m[3])];
    if (b > 59 || (c !== null && c > 59)) return 0;
    return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
  }
  if ((m = /^(\d{1,2})h(?:(\d{1,2})(?:min|m)?)?$/.exec(s))) return Number(m[1]) * 3600 + Number(m[2] ?? 0) * 60;
  if ((m = /^(\d+)(?:min|mins|minutos?|m)$/.exec(s))) return Number(m[1]) * 60;
  if ((m = /^(\d+)(?:seg|segundos?)$/.exec(s))) return Number(m[1]);
  return 0;
}

const toMinutes = (sec) => (sec > 0 ? Math.max(1, Math.ceil(sec / 60)) : 0);

const hasLetters = (s) => /\p{L}/u.test(s);
const isShout = (s) => hasLetters(s) && s === s.toLocaleUpperCase('pt-BR') && s.length >= 3;

function splitDuration(line) {
  const only = ONLY_DUR.exec(line);
  if (only) return { title: '', sec: durationToSeconds(only[1]) };
  const m = TAIL.exec(line);
  if (!m) return { title: line, sec: 0 };
  const sec = durationToSeconds(m[2]);
  return sec > 0 ? { title: m[1].trim(), sec } : { title: line, sec: 0 };
}

const stripBullet = (s) => s.replace(/^\s*(?:[-*•▪◦·]|\d{1,4}\s*[.)]|\d{1,4}\s+[-–—])\s+/, '').trim();

/**
 * Lê uma lista colada (uma aula por linha). Reconhece números, durações em vários formatos e
 * cabeçalhos de módulo. Nunca falha por conteúdo estranho: no máximo avisa e ignora a linha.
 */
export function parseLessonList(rawText) {
  const text = String(rawText ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  const lines = text.split('\n');
  if (lines.length > MAX_LINES * 3) throw new HttpError(400, 'LIST_TOO_LONG', `A lista é grande demais. Cole no máximo ${MAX_LINES} linhas.`);
  const filled = lines.map((l) => l.trim()).filter(Boolean);
  if (filled.length > MAX_LINES) throw new HttpError(400, 'LIST_TOO_LONG', `A lista tem ${filled.length} linhas. O máximo é ${MAX_LINES}; divida em partes.`);

  const warnings = [];
  const parsed = filled.map((line) => {
    const clean = line.slice(0, MAX_LINE_CHARS);
    const { title, sec } = splitDuration(clean);
    return { raw: clean, title, sec };
  });

  // "TUDO EM MAIÚSCULAS" só vira módulo se não for a lista inteira
  const shouts = parsed.filter((p) => !p.sec && isShout(p.raw)).length;
  const shoutIsHeader = shouts > 0 && shouts <= parsed.length / 2;

  const modules = [];
  let current = null;
  let cutTitles = 0;
  const open = (title) => {
    current = { title: title.slice(0, 160), lessons: [] };
    modules.push(current);
  };

  for (const p of parsed) {
    const isHeader = !p.sec && (MODULE_WORD.test(p.raw) || p.raw.endsWith(':') || (shoutIsHeader && isShout(p.raw)));
    if (isHeader) {
      const t = p.raw.replace(/\s*:+\s*$/, '').trim();
      if (hasLetters(t)) { open(t); continue; }
    }
    const title = stripBullet(p.title).trim();
    if (!title || !hasLetters(title)) {
      warnings.push(`Ignorei uma linha sem título: “${p.raw.slice(0, 40)}”.`);
      continue;
    }
    if (!current) open('Aulas');
    if (title.length > MAX_TITLE) cutTitles += 1;
    const min = toMinutes(p.sec);
    current.lessons.push({ title: title.slice(0, MAX_TITLE), durationMin: min || DEFAULT_MIN, estimated: !min });
  }

  const kept = modules.filter((m) => m.lessons.length);
  const emptyModules = modules.length - kept.length;
  if (emptyModules) warnings.push(`${emptyModules} módulo(s) ficaram sem aulas e foram ignorados.`);
  if (cutTitles) warnings.push(`${cutTitles} título(s) passavam de ${MAX_TITLE} letras e foram cortados.`);

  const lessons = kept.flatMap((m) => m.lessons);
  const estimatedCount = lessons.filter((l) => l.estimated).length;
  if (estimatedCount) warnings.unshift(`${estimatedCount} aula(s) sem duração: usei ${DEFAULT_MIN} min como estimativa.`);

  return {
    modules: kept,
    moduleCount: kept.length,
    lessonCount: lessons.length,
    estimatedCount,
    totalMin: lessons.reduce((n, l) => n + l.durationMin, 0),
    warnings,
  };
}
