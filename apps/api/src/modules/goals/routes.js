import { z } from 'zod';
import { parse } from '../../core/errors.js';

const body = z.object({
  targetMinutes: z.number().int().min(15, 'A meta mínima é de 15 minutos.').max(60 * 80),
});

export function goalsRoutes(app, { goals }) {
  app.get('/goals/weekly', async () => ({ data: goals.weekly() }));
  app.put('/goals/weekly', async (req) => ({ data: goals.setWeekly(parse(body, req.body).targetMinutes) }));
}
