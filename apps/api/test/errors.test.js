import { describe, it, expect } from 'vitest';
import { makeApp } from './helpers.js';

describe('erros 4xx do framework', () => {
  it('corpo com content-type não suportado devolve 415, não 500', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/courses',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'title=x',
    });
    expect(res.statusCode).toBe(415);
    expect(JSON.parse(res.body).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('JSON malformado continua 400', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/courses',
      headers: { 'content-type': 'application/json' },
      payload: '{quebrado',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('BAD_REQUEST');
  });

  it('erro inesperado continua 500 sem vazar detalhes', async () => {
    const { app } = await makeApp();
    app.db.close = app.db.close.bind(app.db);
    app.db.prepare('DROP TABLE lc_settings').run();
    const res = await app.inject({ method: 'GET', url: '/api/v1/goals/weekly' });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toEqual({ code: 'INTERNAL', message: 'Erro interno do servidor.' });
  });
});
