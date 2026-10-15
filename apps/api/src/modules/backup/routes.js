import { z } from 'zod';
import { parse } from '../../core/errors.js';

const BIG = { bodyLimit: 50 * 1024 * 1024 }; // backups com muito histórico passam do limite padrão (1 MB)
const previewBody = z.object({ backup: z.unknown() });
const restoreBody = z.object({
  confirm: z.literal('substituir-tudo', { errorMap: () => ({ message: 'Confirmação ausente.' }) }),
  backup: z.unknown(),
});

export function backupRoutes(app, { backup }) {
  app.get('/backup', async () => ({ data: backup.exportAll() }));
  app.post('/backup/preview', BIG, async (req) => ({ data: backup.preview(parse(previewBody, req.body).backup) }));
  app.post('/backup/restore', BIG, async (req) => ({ data: backup.restore(parse(restoreBody, req.body).backup) }));
}
