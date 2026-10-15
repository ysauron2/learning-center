import { parse } from '../../core/errors.js';
import {
  courseCreate, courseUpdate, courseStatus, courseQuery,
  moduleCreate, lessonCreate, lessonUpdate,
} from './schemas.js';
import { importBody } from './import.js';
import { contentBody } from './import-content.js';
import { youtubeBody, textBody } from './import-other.js';
import { linkBody } from './import-link.js';
import { visitBody, undoBody, modeBody } from './visit.js';
import { platformsForUi } from '../../core/platforms.js';

function intParam(req) {
  const id = Number.parseInt(req.params.id, 10);
  return Number.isInteger(id) && id > 0 ? id : -1;
}

export function coursesRoutes(app, { courses, courseImporter, contentImporter, otherImporters, linkImporter, visits }) {
  app.get('/courses', async (req) => ({ data: courses.list(parse(courseQuery, req.query)) }));
  app.get('/courses/summary', async () => ({ data: courses.summary() }));
  app.post('/courses', async (req, reply) => {
    const data = courses.create(parse(courseCreate, req.body));
    return reply.status(201).send({ data });
  });
  app.post('/courses/import/preview', async (req) => ({ data: courseImporter.preview(parse(importBody, req.body)) }));
  app.post('/courses/import', async (req) => ({ data: courseImporter.run(parse(importBody, req.body)) }));
  app.get('/courses/import-link/platforms', async () => ({ data: platformsForUi() }));
  app.post('/courses/import-link/preview', async (req) => ({ data: await linkImporter.preview(parse(linkBody, req.body)) }));
  app.post('/courses/import-link', async (req) => ({ data: await linkImporter.run(parse(linkBody, req.body)) }));
  app.post('/courses/visit', async (req) => ({ data: await visits.visit(parse(visitBody, req.body)) }));
  app.post('/courses/visit/dismiss', async (req) => ({ data: visits.dismiss(parse(visitBody, req.body)) }));
  app.post('/courses/visit/undo', async (req) => ({ data: visits.undo(parse(undoBody, req.body).token) }));
  app.get('/settings/auto-detect', async () => ({ data: visits.getSettings() }));
  app.patch('/settings/auto-detect', async (req) => ({ data: visits.setMode(parse(modeBody, req.body).mode) }));
  app.post('/courses/import-youtube/preview', async (req) => ({ data: await otherImporters.youtubePreview(parse(youtubeBody, req.body)) }));
  app.post('/courses/import-youtube', async (req) => ({ data: await otherImporters.youtubeRun(parse(youtubeBody, req.body)) }));
  app.post('/courses/import-text/preview', async (req) => ({ data: otherImporters.textPreview(parse(textBody, req.body)) }));
  app.post('/courses/import-text', async (req) => ({ data: otherImporters.textRun(parse(textBody, req.body)) }));
  app.post('/courses/sync-content', async (req) => ({ data: contentImporter.sync(parse(contentBody, req.body)) }));
  app.post('/courses/:id/import-content/preview', async (req) => ({ data: contentImporter.preview(intParam(req), parse(contentBody, req.body)) }));
  app.post('/courses/:id/import-content', async (req) => ({ data: contentImporter.run(intParam(req), parse(contentBody, req.body)) }));
  app.get('/courses/:id', async (req) => ({ data: courses.get(intParam(req)) }));
  app.patch('/courses/:id', async (req) => ({ data: courses.update(intParam(req), parse(courseUpdate, req.body)) }));
  app.post('/courses/:id/status', async (req) => ({
    data: courses.setStatus(intParam(req), parse(courseStatus, req.body).status),
  }));
  app.delete('/courses/:id', async (req, reply) => {
    courses.remove(intParam(req));
    return reply.status(204).send();
  });

  app.post('/courses/:id/modules', async (req, reply) =>
    reply.status(201).send({ data: courses.addModule(intParam(req), parse(moduleCreate, req.body)) }),
  );
  app.delete('/modules/:id', async (req, reply) => {
    courses.removeModule(intParam(req));
    return reply.status(204).send();
  });
  app.post('/modules/:id/lessons', async (req, reply) =>
    reply.status(201).send({ data: courses.addLesson(intParam(req), parse(lessonCreate, req.body)) }),
  );
  app.patch('/lessons/:id', async (req) => ({ data: courses.updateLesson(intParam(req), parse(lessonUpdate, req.body)) }));
  app.delete('/lessons/:id', async (req, reply) => {
    courses.removeLesson(intParam(req));
    return reply.status(204).send();
  });
}
