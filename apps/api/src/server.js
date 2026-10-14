import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildApp } from './app.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';
const databaseFile = resolve(process.env.DATABASE_FILE ?? resolve(root, 'data/learning-center.db'));
const webDist = resolve(process.env.WEB_DIST ?? resolve(root, 'apps/web/dist'));

const app = await buildApp({ databaseFile, webDist, logger: { level: process.env.LOG_LEVEL ?? 'info' } });

const shutdown = async (signal) => {
  app.log.info({ signal }, 'encerrando');
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
