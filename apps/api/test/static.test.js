import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';

describe('front-end estático', () => {
  let dir;
  let app;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'lc-dist-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>LC</title>');
    writeFileSync(join(dir, 'app.js'), 'console.log(1)');
    app = await buildApp({ databaseFile: ':memory:', webDist: dir });
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serve index e arquivos', async () => {
    expect((await app.inject({ url: '/' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/app.js' })).statusCode).toBe(200);
  });

  it('rota do front desconhecida cai no index (SPA)', async () => {
    const res = await app.inject({ url: '/courses/42' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>LC</title>');
  });

  it('rota de API inexistente devolve 404 JSON, não o index', async () => {
    const res = await app.inject({ url: '/api/v1/nada' });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('não escapa da pasta dist (path traversal)', async () => {
    for (const url of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/%2e%2e%2fpackage.json']) {
      const res = await app.inject({ url });
      expect(res.body).not.toContain('"workspaces"');
    }
  });
});
