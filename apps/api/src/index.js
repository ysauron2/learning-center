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
import { createCourseImporter } from './modules/courses/import.js';
import { createContentImporter } from './modules/courses/import-content.js';
import { createSessionsService } from './modules/sessions/service.js';
import { createGoalsService } from './modules/goals/service.js';
import { createDashboardService } from './modules/dashboard/service.js';
import { createAnalyticsService } from './modules/analytics/service.js';
import { createBackupService } from './modules/backup/service.js';
import { createNotesService } from './modules/notes/service.js';
import { createTracksService } from './modules/tracks/service.js';
import { createOptionsService } from './modules/options/service.js';
import { createCalendarService } from './modules/calendar/service.js';
import { createNotionService } from './modules/notion/service.js';
import { createAutoSync } from './modules/calendar/auto-sync.js';
import { coursesRoutes } from './modules/courses/routes.js';
import { sessionsRoutes } from './modules/sessions/routes.js';
import { goalsRoutes } from './modules/goals/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { analyticsRoutes } from './modules/analytics/routes.js';
import { backupRoutes } from './modules/backup/routes.js';
import { notesRoutes } from './modules/notes/routes.js';
import { tracksRoutes } from './modules/tracks/routes.js';
import { optionsRoutes } from './modules/options/routes.js';
import { calendarRoutes } from './modules/calendar/routes.js';
import { notionRoutes } from './modules/notion/routes.js';

export function createLearningCenter({ db, clock = systemClock, runMigrations = true, migrationsDir, googleFetch, notionFetch, notionPauseMs, notionSleep }) {
  if (runMigrations) migrate(db, migrationsDir);
  const courses = createCoursesService(db, clock);
  const courseImporter = createCourseImporter(db, courses);
  const contentImporter = createContentImporter(db, courses);
  const sessions = createSessionsService(db, clock);
  const goals = createGoalsService(db, clock, sessions);
  const dashboard = createDashboardService({ db, clock, courses, sessions, goals });
  const analytics = createAnalyticsService({ db, clock, courses, goals });
  const backup = createBackupService(db, clock);
  const notes = createNotesService(db, clock);
  const tracks = createTracksService(db, clock, courses);
  const options = createOptionsService(db);
  const calendar = createCalendarService({ db, clock, courses, fetchImpl: googleFetch });
  const notion = createNotionService({ db, clock, courses, fetchImpl: notionFetch, pauseMs: notionPauseMs, sleep: notionSleep });
  return { courses, courseImporter, contentImporter, sessions, goals, dashboard, analytics, backup, notes, tracks, options, calendar, notion };
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
  analyticsRoutes(app, services);
  backupRoutes(app, services);
  notesRoutes(app, services);
  tracksRoutes(app, services);
  optionsRoutes(app, services);
  calendarRoutes(app, services);
  notionRoutes(app, services);
  // sincronização automática com o Google Agenda e o Notion: só quando quem monta o app pede (servidor e app desktop)
  if (opts.autoSync) {
    const auto = createAutoSync({ calendar: services.calendar, notion: services.notion });
    auto.start();
    app.addHook('onClose', async () => auto.stop());
  }
}

export { migrate } from './core/migrate.js';
export { openDb } from './core/db.js';
