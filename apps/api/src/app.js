import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { registerLearningCenter } from './index.js';
import { openDb } from './core/db.js';

/**
 * Monta a aplicação standalone: API em /api/v1 + (opcional) front-end estático.
 * Em testes, passe `databaseFile: ':memory:'` e um `clock` fixo.
 */
export async function buildApp({
  databaseFile = './data/learning-center.db',
  webDist,
  clock,
  logger = false,
  migrationsDir,
  googleFetch,
  notionFetch,
  notionPauseMs,
  notionSleep,
  autoSync = false,
} = {}) {
  const app = Fastify({ logger });
  const db = openDb(databaseFile);
  app.decorate('db', db);
  app.addHook('onClose', async () => db.close());

  await app.register(registerLearningCenter, { db, clock, migrationsDir, googleFetch, notionFetch, notionPauseMs, notionSleep, autoSync, prefix: '/api/v1' });

  if (webDist && existsSync(resolve(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: resolve(webDist) });
    // SPA fallback: qualquer rota que não seja /api devolve o index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/')) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
      }
      return reply.sendFile('index.html');
    });
  }
  return app;
}
