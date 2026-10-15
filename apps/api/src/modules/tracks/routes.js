import { parse } from '../../core/errors.js';
import { trackCreate, trackUpdate, itemCreate, itemUpdate, orderBody } from './schemas.js';

function intParam(req, name = 'id') {
  const id = Number.parseInt(req.params[name], 10);
  return Number.isInteger(id) && id > 0 ? id : -1;
}

export function tracksRoutes(app, { tracks }) {
  app.get('/tracks', async () => ({ data: tracks.list() }));
  app.post('/tracks', async (req, reply) => reply.status(201).send({ data: tracks.create(parse(trackCreate, req.body)) }));
  app.get('/tracks/:id', async (req) => ({ data: tracks.get(intParam(req)) }));
  app.patch('/tracks/:id', async (req) => ({ data: tracks.update(intParam(req), parse(trackUpdate, req.body)) }));
  app.delete('/tracks/:id', async (req, reply) => {
    tracks.remove(intParam(req));
    return reply.status(204).send();
  });
  app.post('/tracks/:id/items', async (req, reply) =>
    reply.status(201).send({ data: tracks.addItem(intParam(req), parse(itemCreate, req.body)) }),
  );
  app.patch('/tracks/:id/items/:itemId', async (req) => ({
    data: tracks.updateItem(intParam(req), intParam(req, 'itemId'), parse(itemUpdate, req.body)),
  }));
  app.delete('/tracks/:id/items/:itemId', async (req, reply) => {
    tracks.removeItem(intParam(req), intParam(req, 'itemId'));
    return reply.status(204).send();
  });
  app.put('/tracks/:id/order', async (req) => ({ data: tracks.reorder(intParam(req), parse(orderBody, req.body).itemIds) }));
}
