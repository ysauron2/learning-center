import { z } from 'zod';
import { HttpError } from '../../core/errors.js';
import { addDays, startOfDay } from '../../core/time.js';
import { createNotionClient, NotionError } from '../../core/notion.js';
import { createStudyEvents, rfc3339Local, sessionSummary, STUDY_CALENDAR_NAME, WINDOW_DAYS, SESSION_DAYS } from '../calendar/study-events.js';

export const tokenBody = z.object({ token: z.string().trim().min(1, 'Cole o código da integração.').max(300) });
export const connectBody = z.object({ pageId: z.string().trim().min(1, 'Escolha uma página.').max(100) });
export const settingsBody = z.object({ autoSync: z.boolean().optional(), logSessions: z.boolean().optional() });

export const TYPE_PLAN = 'Estudo';
export const TYPE_SESSION = 'Sessão feita';
const text = (s) => [{ type: 'text', text: { content: String(s ?? '').slice(0, 1900) } }];
const plainOf = (prop) => (prop?.title ?? prop?.rich_text ?? []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');

export function createNotionService({ db, clock, courses, fetchImpl, pauseMs, sleep }) {
  const notion = createNotionClient({ db, clock, fetchImpl, pauseMs, sleep });
  const study = createStudyEvents({ db, clock, courses });
  let syncing = null;

  /** Erros do Notion viram erros HTTP com mensagem em português. */
  async function guard(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof NotionError) {
        if (['not_connected', 'bad_token'].includes(err.code)) throw new HttpError(err.code === 'bad_token' ? 400 : 401, err.code === 'bad_token' ? 'NOTION_AUTH' : 'NOT_CONNECTED', err.message);
        if (err.status === 401) throw new HttpError(401, 'NOT_CONNECTED', 'O Notion recusou o código. Cole o código da integração de novo.');
        throw new HttpError(502, 'NOTION_ERROR', err.message);
      }
      throw err;
    }
  }

  const status = () => ({ ...notion.publicState(), planBlocks: db.prepare('SELECT COUNT(*) AS n FROM lc_study_plan').get().n });

  function requireConnected() {
    if (!notion.publicState().connected) throw new HttpError(401, 'NOT_CONNECTED', 'Conecte o Notion primeiro.');
  }

  // ---------- conexão ----------
  const saveToken = (token) => guard(async () => {
    await notion.saveToken(token);
    return status();
  });

  /** Páginas que o Notion deixou a integração enxergar (as que o usuário "conectou" a ela). */
  const listPages = () => guard(async () => {
    if (!notion.publicState().hasToken) throw new NotionError(401, 'Cole o código da integração primeiro.', 'not_connected');
    const res = await notion.request('POST', '/search', { filter: { property: 'object', value: 'page' }, page_size: 50 });
    return (res.results ?? [])
      .filter((p) => p.object === 'page' && !p.archived && !p.parent?.database_id) // só páginas comuns, não linhas de tabelas
      .map((p) => {
        const titleProp = Object.values(p.properties ?? {}).find((v) => v.type === 'title');
        return { id: p.id, title: plainOf(titleProp).trim() || '(sem título)', url: p.url ?? null };
      });
  });

  /** Cria a tabela "Learning Center · Estudos" dentro da página escolhida. */
  const connect = (pageId) => guard(async () => {
    if (!notion.publicState().hasToken) throw new NotionError(401, 'Cole o código da integração primeiro.', 'not_connected');
    let created;
    try {
      created = await notion.request('POST', '/databases', {
        parent: { type: 'page_id', page_id: pageId },
        title: text(STUDY_CALENDAR_NAME),
        properties: {
          Nome: { title: {} },
          Quando: { date: {} },
          Tipo: { select: { options: [{ name: TYPE_PLAN, color: 'purple' }, { name: TYPE_SESSION, color: 'green' }] } },
          Curso: { rich_text: {} },
          Detalhes: { rich_text: {} },
          Chave: { rich_text: {} },
        },
      });
    } catch (err) {
      if (err instanceof NotionError && err.status === 404) {
        throw new HttpError(400, 'NOTION_PAGE', 'O Notion não encontrou essa página. Abra a página no Notion, clique em "…" → "Conexões" e adicione a integração.');
      }
      throw err;
    }
    notion.save({ parent_page_id: pageId, database_id: created.id, database_url: created.url ?? null, connected_at: clock.now().toISOString(), last_error: null });
    return status();
  });

  /** Desliga o Learning Center do Notion. A tabela e o que já foi criado ficam lá (é seu). */
  const disconnect = () => {
    notion.clearAll();
    notion.save({ last_error: null, last_sync_at: null });
    return status();
  };

  const setSettings = (patch) => {
    const upd = {};
    if (patch.autoSync !== undefined) upd.auto_sync = patch.autoSync ? 1 : 0;
    if (patch.logSessions !== undefined) upd.log_sessions = patch.logSessions ? 1 : 0;
    notion.save(upd);
    return status();
  };

  // ---------- sincronização ----------
  const databaseId = () => notion.row().database_id;

  const planProps = (d, prefix = 'plan') => ({
    Nome: { title: text(d.summary) },
    Quando: { date: { start: rfc3339Local(d.start), end: rfc3339Local(d.end) } },
    Tipo: { select: { name: TYPE_PLAN } },
    Curso: { rich_text: text(d.courseTitle ?? '') },
    Detalhes: { rich_text: text(d.description) },
    Chave: { rich_text: text(`${prefix}-${d.planId ?? d.onceId}-${d.date}`) },
  });

  /** Todas as linhas (não arquivadas) da tabela a partir de uma data, com paginação. */
  async function listRows(from) {
    const out = [];
    let cursor;
    do {
      const res = await notion.request('POST', `/databases/${encodeURIComponent(databaseId())}/query`, {
        filter: { and: [{ property: 'Quando', date: { on_or_after: rfc3339Local(from) } }] },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      out.push(...(res.results ?? []).filter((r) => !r.archived));
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return out;
  }

  const keyOf = (row) => plainOf(row.properties?.Chave);
  const archive = (row) => notion.request('PATCH', `/pages/${encodeURIComponent(row.id)}`, { archived: true });

  async function syncPlan(rows) {
    const now = clock.now();
    // blocos do plano e avulsos compartilham a mesma tabela; a chave diferencia (plan-… / once-…)
    const desired = { plan: study.desiredPlanEvents(), once: study.desiredOnceEvents() };
    const byKey = new Map();
    let created = 0;
    let updated = 0;
    let deleted = 0;
    for (const row of rows) {
      const key = keyOf(row);
      if (!key.startsWith('plan-') && !key.startsWith('once-')) continue;
      const endIso = row.properties?.Quando?.date?.end ?? row.properties?.Quando?.date?.start;
      if (endIso && new Date(endIso) <= now) continue; // já aconteceu: vira histórico, não mexemos
      const m = key.match(/^(plan|once)-(\d+)-(\d{4}-\d{2}-\d{2})$/);
      const want = m ? desired[m[1]].get(`${m[2]}|${m[3]}`) : null;
      if (!want || byKey.has(key)) {
        await archive(row);
        deleted += 1;
        continue;
      }
      byKey.set(key, true);
      const date = row.properties?.Quando?.date;
      const same = plainOf(row.properties?.Nome) === want.summary
        && plainOf(row.properties?.Detalhes) === want.description
        && plainOf(row.properties?.Curso) === (want.courseTitle ?? '')
        && date?.start && new Date(date.start).getTime() === want.start.getTime()
        && date?.end && new Date(date.end).getTime() === want.end.getTime();
      if (!same) {
        await notion.request('PATCH', `/pages/${encodeURIComponent(row.id)}`, { properties: planProps(want, m[1]) });
        updated += 1;
      }
    }
    for (const prefix of ['plan', 'once']) {
      for (const [, want] of desired[prefix]) {
        if (byKey.has(`${prefix}-${want.planId ?? want.onceId}-${want.date}`)) continue;
        await notion.request('POST', '/pages', { parent: { database_id: databaseId() }, properties: planProps(want, prefix) });
        created += 1;
      }
    }
    return { created, updated, deleted };
  }

  async function syncSessions(rows, from) {
    if (!notion.row().log_sessions) return { created: 0 };
    const have = new Set(rows.map(keyOf));
    let created = 0;
    for (const s of study.recentSessions(from)) {
      if (have.has(`session-${s.id}`)) continue;
      const start = new Date(s.started_at);
      const end = new Date(start.getTime() + s.duration_sec * 1000);
      await notion.request('POST', '/pages', {
        parent: { database_id: databaseId() },
        properties: {
          Nome: { title: text(sessionSummary(s)) },
          Quando: { date: { start: rfc3339Local(start), end: rfc3339Local(end) } },
          Tipo: { select: { name: TYPE_SESSION } },
          Curso: { rich_text: text(s.course_title ?? '') },
          Detalhes: { rich_text: text('Sessão de foco registrada no Learning Center.') },
          Chave: { rich_text: text(`session-${s.id}`) },
        },
      });
      created += 1;
    }
    return { created };
  }

  async function runSync() {
    requireConnected();
    try {
      const from = addDays(startOfDay(clock.now()), -SESSION_DAYS);
      const rows = await listRows(from);
      const plan = await syncPlan(rows);
      const sessions = await syncSessions(rows, from);
      const syncedAt = clock.now().toISOString();
      notion.save({ last_sync_at: syncedAt, last_error: null });
      return { planCreated: plan.created, planUpdated: plan.updated, planDeleted: plan.deleted, sessionsCreated: sessions.created, syncedAt };
    } catch (err) {
      if (err instanceof NotionError) {
        if (err.status === 404) {
          // a tabela foi apagada ou deixou de ser compartilhada: esquece a tabela e pede para escolher a página de novo
          notion.save({ database_id: null, database_url: null, connected_at: null, last_error: 'O Notion não encontrou mais a tabela de estudos (foi apagada ou a integração perdeu o acesso). Conecte de novo.' });
          throw new HttpError(409, 'NOTION_LOST', notion.row().last_error);
        } else {
          notion.save({ last_error: err.status === 401 ? 'O Notion recusou o código. Cole o código da integração de novo.' : err.message });
        }
      }
      throw err;
    }
  }

  /** Uma sincronização por vez: botão e automático compartilham o mesmo resultado. */
  function syncNow() {
    syncing ??= guard(runSync).finally(() => { syncing = null; });
    return syncing;
  }

  return { status, saveToken, listPages, connect, disconnect, setSettings, syncNow, notion, WINDOW_DAYS };
}
