/**
 * Ponto de entrada portátil do Learning Center.
 *
 * Para integrar ao Meu Hub, basta:
 *   import { registerLearningCenter } from '@learning-center/api';
 *   await app.register(registerLearningCenter, { db, prefix: '/api/learning' });
 *
 * O módulo só exige uma instância `node:sqlite` (DatabaseSync) e cria suas
 * próprias tabelas com o prefixo `lc_` (veja migrations/).
 */
import { migrate } from './core/migrate.js';
import { systemClock } from './core/time.js';
import { errorHandler } from './core/errors.js';
import { createCoursesService } from './modules/courses/service.js';
import { createSessionsService } from './modules/sessions/service.js';
import { createGoalsService } from './modules/goals/service.js';
import { createDashboardService } from './modules/dashboard/service.js';
import { coursesRoutes } from './modules/courses/routes.js';
import { sessionsRoutes } from './modules/sessions/routes.js';
import { goalsRoutes } from './modules/goals/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';

export function createLearningCenter({ db, clock = systemClock, runMigrations = true }) {
  if (runMigrations) migrate(db);
  const courses = createCoursesService(db, clock);
  const sessions = createSessionsService(db, clock);
  const goals = createGoalsService(db, clock, sessions);
  const dashboard = createDashboardService({ db, clock, courses, sessions, goals });
  return { courses, sessions, goals, dashboard };
}

/** Plugin Fastify (encapsulado: o error handler vale só dentro do prefixo). */
export async function registerLearningCenter(app, opts) {
  const services = createLearningCenter(opts);
  app.setErrorHandler(errorHandler);
  app.get('/health', async () => ({ status: 'ok', module: 'learning-center' }));
  coursesRoutes(app, services);
  sessionsRoutes(app, services);
  goalsRoutes(app, services);
  dashboardRoutes(app, services);
}

export { migrate } from './core/migrate.js';
export { openDb } from './core/db.js';
