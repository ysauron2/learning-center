import { HttpError } from './errors.js';
import { MESSAGES, oneLine, metaContent, platformImage, textOfHtml, decodeEntities } from './course-pages.js';

/**
 * Leitura das páginas e dados PÚBLICOS de Microsoft Learn, freeCodeCamp, Coursera e Rocketseat (sem login).
 * Cada leitor foi escrito contra respostas reais (veja test/fixtures) e prefere dados estruturados
 * (catálogo oficial, repositório do currículo, estado embutido da página) a seletores de HTML.
 * Tudo que vem do site é tratado como TEXTO. Duração que o site não informa fica 0 (nada é inventado).
 */

const err = (status, code, message) => new HttpError(status, code, message);
const notCourse = () => err(422, 'COURSE_NOT_FOUND', MESSAGES.notCourse);
const MAX_LESSONS = 1500;

/** Lê o JSON que começa em `start` (um `{` ou `[`) até o fechamento correspondente. */
function readBalancedJson(src, start) {
  const open = src[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i += 1;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(src.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw notCourse();
  }
}

/** "PT1H35M17S" → minutos (arredondado). */
export function isoMinutes(raw) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(String(raw ?? '').trim());
  if (!m || !(m[1] || m[2] || m[3])) return 0;
  return Math.round((Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) / 60);
}

const cleanLessons = (list) => list.filter((l) => l.title).slice(0, MAX_LESSONS);

/* ---------- Microsoft Learn ---------- */

const MS_CATALOG = 'https://learn.microsoft.com/api/catalog/';
const MS_UID = /^[a-z0-9][a-z0-9._-]{0,200}$/i;
const MS_LEVELS = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };
// o catálogo recusa pedidos com muitos identificadores de uma vez (testado: 20 passa, 30 não)
const MS_BATCH = 20;
const MS_MAX_BATCHES = 30;

/** Busca no catálogo oficial pelos identificadores (uid), em lotes pequenos. */
async function msCatalog(ctx, uids, locale, listName) {
  const clean = [...new Set(uids)].filter((u) => typeof u === 'string' && MS_UID.test(u));
  if (clean.length > MS_BATCH * MS_MAX_BATCHES) throw notCourse();
  const found = new Map();
  for (let i = 0; i < clean.length; i += MS_BATCH) {
    const batch = clean.slice(i, i + MS_BATCH);
    const { text } = await ctx.get(`${MS_CATALOG}?uid=${batch.join(',')}&locale=${locale}`, { accept: 'application/json' });
    for (const item of parseJson(text)[listName] ?? []) if (item?.uid) found.set(item.uid, item);
  }
  return found;
}

const msLessons = (module, units) => cleanLessons((module.units ?? []).map((uid) => units.get(uid)).filter(Boolean)
  .map((u) => ({ title: oneLine(u.title, 200), durationMin: Math.max(0, Math.round(Number(u.duration_in_minutes) || 0)) })));

const msImage = (item) => (/generic/i.test(String(item?.icon_url)) ? null : platformImage(item?.icon_url, 'microsoft'));
const msLevel = (item) => (item?.levels ?? []).map((l) => MS_LEVELS[l]).filter(Boolean).join(', ');

export async function parseMicrosoftPage(html, ref, ctx) {
  const uid = /<meta\s+name="uid"\s+content="([^"]+)"/i.exec(html)?.[1];
  const schema = /<meta\s+name="schema"\s+content="([^"]+)"/i.exec(html)?.[1];
  const expected = { path: 'LearningPath', module: 'Module', cert: 'Certification' }[ref.kind];
  if (!uid || !MS_UID.test(uid) || schema !== expected) throw notCourse();

  if (ref.kind === 'path') {
    const path = (await msCatalog(ctx, [uid], ref.locale, 'learningPaths')).get(uid);
    if (!path) throw notCourse();
    const modUids = path.modules ?? [];
    const mods = await msCatalog(ctx, modUids, ref.locale, 'modules');
    const units = await msCatalog(ctx, [...mods.values()].flatMap((m) => m.units ?? []), ref.locale, 'units');
    const modules = modUids.map((id) => mods.get(id)).filter(Boolean)
      .map((m) => ({ title: oneLine(m.title, 160), lessons: msLessons(m, units) })).filter((m) => m.title);
    return base(ref, path, modules);
  }
  if (ref.kind === 'module') {
    const mod = (await msCatalog(ctx, [uid], ref.locale, 'modules')).get(uid);
    if (!mod) throw notCourse();
    const units = await msCatalog(ctx, mod.units ?? [], ref.locale, 'units');
    const lessons = msLessons(mod, units);
    return base(ref, mod, lessons.length ? [{ title: oneLine(mod.title, 160), lessons }] : []);
  }
  const cert = (await msCatalog(ctx, [uid], ref.locale, 'certifications')).get(uid);
  if (!cert) throw notCourse();
  // o guia de estudos da certificação lista as trilhas recomendadas: cada uma vira uma "aula"
  const pathUids = (cert.study_guide ?? []).filter((s) => s?.type === 'learningPath').map((s) => s.uid);
  const paths = pathUids.length ? await msCatalog(ctx, pathUids, ref.locale, 'learningPaths') : new Map();
  const lessons = cleanLessons(pathUids.map((id) => paths.get(id)).filter(Boolean)
    .map((p) => ({ title: `Trilha: ${oneLine(p.title, 190)}`, durationMin: Math.max(0, Math.round(Number(p.duration_in_minutes) || 0)) })));
  const lines = textOfHtml(cert.subtitle).split('\n').slice(0, 2).join(' ');
  return { ...base(ref, { ...cert, summary: lines }, lessons.length ? [{ title: 'Guia de estudos', lessons }] : []), workloadMin: 0 };

  function base(r, item, modules) {
    const title = oneLine(item.title, 160);
    if (!title) throw notCourse();
    return {
      platform: 'microsoft',
      key: r.key,
      url: r.url,
      title,
      description: oneLine(item.summary, 1500),
      instructor: '',
      level: msLevel(item),
      workloadMin: Math.max(0, Math.round(Number(item.duration_in_minutes) || 0)),
      imageUrl: msImage(item),
      modules,
    };
  }
}

/* ---------- freeCodeCamp ---------- */

const FCC_RAW = 'https://raw.githubusercontent.com/freeCodeCamp/freeCodeCamp/main/';
const FCC_BLOCK = /^[a-z0-9][a-z0-9-]{0,200}$/i;

/** O site é uma página que só carrega por JavaScript; o currículo público fica no repositório oficial. */
export async function loadFreeCodeCamp(ref, ctx) {
  let structure = null;
  try {
    structure = parseJson((await ctx.get(`${FCC_RAW}curriculum/structure/superblocks/${ref.slug}.json`, { accept: 'application/json' })).text);
  } catch (e) {
    if (!(e instanceof HttpError) || e.code !== 'PAGE_NOT_FOUND') throw e;
  }
  const intro = parseJson((await ctx.get(`${FCC_RAW}client/i18n/locales/english/intro.json`, { accept: 'application/json' })).text);
  const sb = intro?.[ref.slug];
  if (!sb || typeof sb !== 'object') throw notCourse();

  const blockTitle = (id) => oneLine(sb.blocks?.[id]?.title ?? id, 200);
  const lessonsOf = (ids) => cleanLessons((Array.isArray(ids) ? ids : []).filter((b) => typeof b === 'string' && FCC_BLOCK.test(b)).map((b) => ({ title: blockTitle(b), durationMin: 0 })));
  let modules = [];
  if (Array.isArray(structure?.chapters)) {
    for (const ch of structure.chapters) {
      const chTitle = oneLine(sb.chapters?.[ch?.dashedName] ?? ch?.dashedName, 120);
      for (const mod of Array.isArray(ch?.modules) ? ch.modules : []) {
        const modTitle = oneLine(sb.modules?.[mod?.dashedName] ?? mod?.dashedName, 120);
        const lessons = lessonsOf(mod?.blocks);
        if (lessons.length) modules.push({ title: chTitle && chTitle !== modTitle ? `${chTitle} — ${modTitle}` : modTitle, lessons });
      }
    }
  } else {
    // sem arquivo de estrutura (currículos antigos): vale a ordem dos blocos do próprio texto do currículo
    const ids = Array.isArray(structure?.blocks) ? structure.blocks : Object.keys(sb.blocks ?? {});
    const lessons = lessonsOf(ids);
    modules = lessons.length ? [{ title: 'Blocos do curso', lessons }] : [];
  }
  const title = oneLine(sb.title, 160);
  if (!title) throw notCourse();
  const description = (Array.isArray(sb.intro) ? sb.intro : []).map((l) => String(l)).filter((l) => !l.trim().startsWith('-') && !l.trim().endsWith(':')).join(' ');
  return {
    platform: 'freecodecamp',
    key: ref.key,
    url: ref.url,
    title,
    description: oneLine(description, 1500),
    instructor: 'freeCodeCamp',
    workloadMin: 0,
    imageUrl: null,
    modules,
  };
}

/* ---------- Coursera ---------- */

function apolloState(html) {
  const at = html.indexOf('window.__APOLLO_STATE__');
  const start = at >= 0 ? html.indexOf('{', at) : -1;
  return start >= 0 ? readBalancedJson(html, start) : null;
}

export function parseCourseraPage(html, ref) {
  const st = apolloState(html);
  const deref = (v) => (v?.__ref ? st[v.__ref] : v);
  const course = st && Object.entries(st).find(([k]) => k.startsWith('DescriptionPage_CoursePage:'))?.[1];
  const title = oneLine(course?.name, 160);
  if (!course || !title) throw notCourse();
  const modules = [];
  for (const w of Array.isArray(course.material?.weeks) ? course.material.weeks : []) {
    const week = deref(w);
    if (!week) continue;
    const item = (it) => {
      const x = deref(it);
      return x ? { title: oneLine(x.name, 200), durationMin: isoMinutes(x.duration) } : null;
    };
    const lessons = cleanLessons([...(week.lectures ?? []), ...(week.assessments ?? [])].map(item).filter(Boolean)
      .map((l) => ({ ...l, durationMin: l.durationMin && Math.max(1, l.durationMin) })));
    const name = oneLine(week.name, 160);
    if (name && lessons.length) modules.push({ title: name, lessons });
  }
  return {
    platform: 'coursera',
    key: ref.key,
    url: ref.url,
    title,
    description: oneLine(textOfHtml(course.description).replace(/\n+/g, ' '), 1500),
    instructor: '',
    level: { BEGINNER: 'Iniciante', INTERMEDIATE: 'Intermediário', ADVANCED: 'Avançado' }[course.difficultyLevel] ?? '',
    workloadMin: isoMinutes(course.material?.totalDuration),
    imageUrl: platformImage(course.photoUrl, 'coursera') ?? platformImage(course.metaImgSrc, 'coursera'),
    modules,
  };
}

/* ---------- Rocketseat ---------- */

export function parseRocketseatPage(html, ref) {
  const h1 = oneLine(textOfHtml(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]), 160);
  if (!h1) throw notCourse();
  const description = oneLine(textOfHtml(/<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/i.exec(html)?.[1]), 1500) || metaContent(html, 'description');
  const hours = /\+?\s*(\d{1,4})\s*h de conte[úu]do/i.exec(html)?.[1];
  const level = /\b(Iniciante|Intermedi[aá]rio|Avan[cç]ado)\b/.exec(textOfHtml(html.slice(html.indexOf('</h1>'), html.indexOf('</h1>') + 1500)))?.[1] ?? '';
  const lessons = [];
  for (const m of html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)) {
    const name = /<span class="[^"]*font-semibold[^"]*">([\s\S]*?)<\/span>/i.exec(m[1])?.[1];
    const title = oneLine(textOfHtml(name), 160);
    if (!title) continue;
    const classes = />\s*(\d+)\s*aulas?\s*</i.exec(m[1])?.[1];
    lessons.push({ title: classes ? `${title} (${classes} aulas)` : title, durationMin: 0 });
  }
  return {
    platform: 'rocketseat',
    key: ref.key,
    url: ref.url,
    title: h1,
    description: decodeEntities(description),
    instructor: '',
    level,
    // o site dá só uma estimativa em horas ("+181h de conteúdo")
    workloadMin: hours ? Number(hours) * 60 : 0,
    imageUrl: platformImage(metaContent(html, 'og:image'), 'rocketseat'),
    modules: lessons.length ? [{ title: 'Módulos da formação', lessons: cleanLessons(lessons) }] : [],
  };
}
