import { z } from 'zod';
import { HttpError, parse } from '../../core/errors.js';
import { KINDS } from '../../core/options.js';
import { optionName } from './service.js';

const kindOf = (req) => {
  const def = KINDS[req.params.kind];
  if (!def) throw new HttpError(400, 'VALIDATION_ERROR', 'Tipo inválido: use "categories" ou "platforms".');
  return def;
};

const createBody = z.object({ name: optionName });
const renameBody = z.object({ name: z.string().trim().min(1), newName: optionName });

export function optionsRoutes(app, { options }) {
  app.get('/options', async () => ({ data: options.list() }));
  app.post('/options/:kind', async (req, reply) => {
    const out = options.create(kindOf(req), parse(createBody, req.body).name);
    return reply.status(out.created ? 201 : 200).send({ data: out });
  });
  app.patch('/options/:kind', async (req) => {
    const body = parse(renameBody, req.body);
    return { data: options.rename(kindOf(req), body.name, body.newName) };
  });
  app.delete('/options/:kind', async (req) => ({ data: options.remove(kindOf(req), req.query.name) }));
}
