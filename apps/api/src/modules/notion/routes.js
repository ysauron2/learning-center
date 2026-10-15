import { parse } from '../../core/errors.js';
import { tokenBody, connectBody, settingsBody } from './service.js';

export function notionRoutes(app, { notion }) {
  app.get('/notion/status', async () => ({ data: notion.status() }));
  app.put('/notion/token', async (req) => ({ data: await notion.saveToken(parse(tokenBody, req.body).token) }));
  app.get('/notion/pages', async () => ({ data: await notion.listPages() }));
  app.post('/notion/connect', async (req) => ({ data: await notion.connect(parse(connectBody, req.body).pageId) }));
  app.post('/notion/disconnect', async () => ({ data: notion.disconnect() }));
  app.patch('/notion/settings', async (req) => ({ data: notion.setSettings(parse(settingsBody, req.body)) }));
  app.post('/notion/sync', async () => ({ data: await notion.syncNow() }));
}
