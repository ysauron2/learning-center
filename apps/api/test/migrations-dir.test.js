import { describe, it, expect } from 'vitest';
import { mkdtempSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { ALL_MIGRATIONS } from './migration-list.js';

describe('pasta de migrações configurável (servidor empacotado)', () => {
  it('buildApp usa a pasta informada em vez da padrão', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lc-migdir-'));
    try {
      for (const f of readdirSync(new URL('../migrations', import.meta.url)).filter((x) => x.endsWith('.sql'))) {
        copyFileSync(new URL(`../migrations/${f}`, import.meta.url), join(dir, f));
      }
      const app = await buildApp({ databaseFile: ':memory:', migrationsDir: dir });
      const applied = app.db.prepare('SELECT name FROM lc_schema_migrations ORDER BY name').all().map((r) => r.name);
      expect(applied).toEqual(ALL_MIGRATIONS);
      expect((await app.inject({ url: '/api/v1/health' })).statusCode).toBe(200);
      await app.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('pasta inexistente falha de forma clara, em vez de subir com banco vazio', async () => {
    await expect(buildApp({ databaseFile: ':memory:', migrationsDir: join(tmpdir(), 'nao-existe-lc-xyz') })).rejects.toThrow();
  });
});
