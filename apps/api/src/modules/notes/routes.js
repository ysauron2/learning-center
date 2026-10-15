import { parse } from '../../core/errors.js';
import { noteCreate, noteUpdate, noteQuery } from './schemas.js';

function intParam(req) {
  const id = Number.parseInt(req.params.id, 10);
  return Number.isInteger(id) && id > 0 ? id : -1;
}

export function notesRoutes(app, { notes }) {
  app.get('/notes', async (req) => ({ data: notes.list(parse(noteQuery, req.query)) }));
  app.get('/notes/tags', async () => ({ data: notes.tagSummary() }));
  app.post('/notes', async (req, reply) => reply.status(201).send({ data: notes.create(parse(noteCreate, req.body)) }));
  app.get('/notes/:id', async (req) => ({ data: notes.get(intParam(req)) }));
  app.patch('/notes/:id', async (req) => ({ data: notes.update(intParam(req), parse(noteUpdate, req.body)) }));
  app.delete('/notes/:id', async (req, reply) => {
    notes.remove(intParam(req));
    return reply.status(204).send();
  });
}
