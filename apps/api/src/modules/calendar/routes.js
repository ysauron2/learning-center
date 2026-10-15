import { z } from 'zod';
import { HttpError, parse } from '../../core/errors.js';
import { planBody, planUpdate, configBody, settingsBody } from './service.js';

const eventsQuery = z.object({
  days: z.coerce.number().int().min(1).max(31).default(7),
  refresh: z.enum(['0', '1']).default('0'),
});

const upcomingQuery = z.object({ days: z.coerce.number().int().min(1).max(14).default(7) });

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Página simples mostrada depois do login no Google (vale também quando abre no navegador do sistema, no app desktop). */
function resultPage({ ok, message }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Google Agenda · Learning Center</title>${ok ? '<meta http-equiv="refresh" content="2;url=/agenda?conectado=1">' : ''}
<style>body{font:16px system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;text-align:center;color:#151a36}a{color:#6d28d9;font-weight:700}</style></head>
<body><h1>${ok ? '✅ Conectado!' : 'Não deu certo'}</h1><p>${esc(message)}</p><p><a href="/agenda">Voltar para o Learning Center</a></p></body></html>`;
}

export function calendarRoutes(app, { calendar }) {
  const idOf = (req) => {
    const id = Number.parseInt(req.params.id, 10);
    return Number.isInteger(id) && id > 0 ? id : -1;
  };

  app.get('/calendar/status', async () => ({ data: calendar.status() }));

  app.put('/calendar/config', async (req) => ({ data: calendar.saveConfig(parse(configBody, req.body)) }));

  app.post('/calendar/connect', async (req) => {
    const redirectUri = `${req.protocol}://${req.headers.host}/api/v1/calendar/callback`;
    return { data: { ...calendar.connectUrl(redirectUri), redirectUri } };
  });

  app.get('/calendar/callback', async (req, reply) => {
    reply.type('text/html; charset=utf-8');
    try {
      const { warning } = await calendar.handleCallback({ code: req.query.code, state: req.query.state, error: req.query.error });
      return resultPage({
        ok: true,
        message: warning ? `Conectado, mas faltou um passo: ${warning}` : 'Google Agenda conectado. Voltando para o app…',
      });
    } catch (err) {
      reply.status(400);
      return resultPage({ ok: false, message: err.message });
    }
  });

  app.post('/calendar/disconnect', async () => ({ data: await calendar.disconnect() }));
  app.patch('/calendar/settings', async (req) => ({ data: calendar.setSettings(parse(settingsBody, req.body)) }));

  app.get('/calendar/events', async (req) => {
    const q = parse(eventsQuery, req.query);
    return { data: await calendar.events({ days: q.days, refresh: q.refresh === '1' }) };
  });

  app.get('/calendar/upcoming', async (req) => ({ data: calendar.upcoming({ days: parse(upcomingQuery, req.query).days }) }));

  app.get('/calendar/plan', async () => ({ data: calendar.listPlan() }));
  app.post('/calendar/plan', async (req, reply) => reply.status(201).send({ data: calendar.addPlan(parse(planBody, req.body)) }));
  app.patch('/calendar/plan/:id', async (req) => ({ data: calendar.updatePlan(idOf(req), parse(planUpdate, req.body)) }));
  app.delete('/calendar/plan/:id', async (req, reply) => {
    calendar.removePlan(idOf(req));
    return reply.status(204).send();
  });

  // Calendário para assinar (Mac/iPhone/Outlook). Não exige conta do Google; vale só enquanto o app está aberto.
  app.get('/calendar/feed.ics', async (req, reply) => {
    reply.type('text/calendar; charset=utf-8').header('Cache-Control', 'no-cache');
    if (req.query.download === '1') reply.header('Content-Disposition', 'attachment; filename="learning-center-estudos.ics"');
    return calendar.feed();
  });

  app.post('/calendar/sync', async () => {
    if (!calendar.status().connected) throw new HttpError(401, 'NOT_CONNECTED', 'Conecte o Google Agenda primeiro.');
    return { data: await calendar.syncNow() };
  });
}
