import { parse } from '../../core/errors.js';
import {
  courseCreate, courseUpdate, courseStatus, courseQuery,
  moduleCreate, lessonCreate, lessonUpdate,
} from './schemas.js';
import { importBody } from './import.js';

function intParam(req) {
  const id = Number.parseInt(req.params.id, 10);
  return Number.isInteger(id) && id > 0 ? id : -1;
}

export function coursesRoutes(app, { courses, courseImporter }) {
  app.get('/courses', async (req) => ({ data: courses.list(parse(courseQuery, req.query)) }));
  app.get('/courses/summary', async () => ({ data: courses.summary() }));
  app.post('/courses', async (req, reply) => {
    const data = courses.create(parse(courseCreate, req.body));
    return reply.status(201).send({ data });
  });
  app.post('/courses/import/preview', async (req) => ({ data: courseImporter.preview(parse(importBody, req.body)) }));
  app.post('/courses/import', async (req) => ({ data: courseImporter.run(parse(importBody, req.body)) }));
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
