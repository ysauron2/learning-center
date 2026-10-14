import { z } from 'zod';
import { parse } from '../../core/errors.js';

const id = z.number().int().positive();

const startBody = z.object({
  courseId: id.nullish(),
  lessonId: id.nullish(),
  kind: z.enum(['pomodoro', 'stopwatch']).default('pomodoro'),
  plannedMin: z.number().int().min(1).max(240).default(25),
});

const finishBody = z.object({
  notes: z.string().trim().max(2000).optional(),
  focusRating: z.number().int().min(1).max(5).nullish(),
  completeLesson: z.boolean().default(false),
});

const manualBody = z.object({
  courseId: id.nullish(),
  lessonId: id.nullish(),
  durationMin: z.number().int().min(1).max(720),
  startedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const listQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  courseId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const pid = (req) => {
  const n = Number.parseInt(req.params.id, 10);
  return Number.isInteger(n) && n > 0 ? n : -1;
};

export function sessionsRoutes(app, { sessions }) {
  app.get('/sessions/active', async () => ({ data: sessions.active() }));
  app.get('/sessions', async (req) => ({ data: sessions.list(parse(listQuery, req.query)) }));
  app.post('/sessions/start', async (req, reply) =>
    reply.status(201).send({ data: sessions.start(parse(startBody, req.body)) }),
  );
  app.post('/sessions/manual', async (req, reply) =>
    reply.status(201).send({ data: sessions.logManual(parse(manualBody, req.body)) }),
  );
  app.post('/sessions/:id/pause', async (req) => ({ data: sessions.pause(pid(req)) }));
  app.post('/sessions/:id/resume', async (req) => ({ data: sessions.resume(pid(req)) }));
  app.post('/sessions/:id/finish', async (req) => ({ data: sessions.finish(pid(req), parse(finishBody, req.body)) }));
  app.delete('/sessions/:id', async (req, reply) => {
    sessions.discard(pid(req));
    return reply.status(204).send();
  });
}
