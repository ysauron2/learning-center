import { z } from 'zod';
import { parse } from '../../core/errors.js';
import { RANGES } from './service.js';

const query = z.object({ range: z.enum(RANGES).default('30d') });

export function analyticsRoutes(app, { analytics }) {
  app.get('/analytics', async (req) => ({ data: analytics.get(parse(query, req.query).range) }));
}
