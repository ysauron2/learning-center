import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeApp } from './helpers.js';
import { migrate } from '../src/core/migrate.js';
import { ALL_MIGRATIONS } from './migration-list.js';

let ctx;
beforeEach(async () => { ctx = await makeApp(); });
afterEach(async () => { await ctx.app.close(); });

const IMG = 'https://img-c.udemycdn.com/course/240x135/123_abc.jpg';
const item = (slug, extra = {}) => ({ title: `Curso ${slug}`, url: `https://www.udemy.com/course/${slug}/`, progress: 0, ...extra });
const list = async () => (await ctx.call('GET', '/courses')).body.data;

describe('imagem do curso (cadastro manual)', () => {
  it('cria com imageUrl, devolve no curso e aceita limpar depois', async () => {
    const c = (await ctx.call('POST', '/courses', { title: 'X', imageUrl: IMG })).body.data;
    expect(c.imageUrl).toBe(IMG);
    expect((await ctx.call('GET', `/courses/${c.id}`)).body.data.imageUrl).toBe(IMG);
    const cleared = (await ctx.call('PATCH', `/courses/${c.id}`, { imageUrl: null })).body.data;
    expect(cleared.imageUrl).toBeNull();
    const set = (await ctx.call('PATCH', `/courses/${c.id}`, { imageUrl: IMG })).body.data;
    expect(set.imageUrl).toBe(IMG);
  });

  it('sem imageUrl o curso fica sem imagem (null)', async () => {
    expect((await ctx.call('POST', '/courses', { title: 'X' })).body.data.imageUrl).toBeNull();
  });

  it('rejeita o que não é https: http, javascript:, data: e texto solto', async () => {
    for (const bad of ['http://img.com/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'não é url']) {
      const r = await ctx.call('POST', '/courses', { title: 'X', imageUrl: bad });
      expect(r.status, bad).toBe(400);
    }
  });
});

describe('imagem na importação da Udemy', () => {
  it('curso novo guarda a imagem; imagem de outro site é ignorada sem rejeitar o curso', async () => {
    const r = await ctx.call('POST', '/courses/import', {
      items: [item('a', { imageUrl: IMG }), item('b', { imageUrl: 'https://evil.com/track.gif' }), item('c', { imageUrl: 'http://img-c.udemycdn.com/x.jpg' }), item('d')],
    });
    expect(r.body.data.created).toBe(4);
    const by = Object.fromEntries((await list()).map((c) => [c.title, c.imageUrl]));
    expect(by['Curso a']).toBe(IMG);
    expect(by['Curso b']).toBeNull();
    expect(by['Curso c']).toBeNull();
    expect(by['Curso d']).toBeNull();
  });

  it('reimportar preenche a imagem que faltava e não troca a que já existe', async () => {
    await ctx.call('POST', '/courses/import', { items: [item('a'), item('b', { imageUrl: IMG })] });
    const other = 'https://img-c.udemycdn.com/course/240x135/999_zzz.jpg';
    const r = await ctx.call('POST', '/courses/import', { items: [item('a', { imageUrl: IMG }), item('b', { imageUrl: other })] });
    expect(r.body.data).toMatchObject({ created: 0, skipped: 2, imagesFilled: 1 });
    const by = Object.fromEntries((await list()).map((c) => [c.title, c.imageUrl]));
    expect(by['Curso a']).toBe(IMG);
    expect(by['Curso b']).toBe(IMG);
  });

  it('a prévia informa quantas imagens serão preenchidas e não grava nada', async () => {
    await ctx.call('POST', '/courses/import', { items: [item('a')] });
    const r = await ctx.call('POST', '/courses/import/preview', { items: [item('a', { imageUrl: IMG }), item('n', { imageUrl: IMG })] });
    expect(r.body.data.imagesToFill).toBe(1);
    expect((await list()).find((c) => c.title === 'Curso a').imageUrl).toBeNull();
  });
});

describe('migração 002 (coluna de imagem)', () => {
  it('aplica sobre um banco que já tem cursos sem perder dados', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lc-mig-'));
    try {
      copyFileSync(new URL('../migrations/001_init.sql', import.meta.url), join(dir, '001_init.sql'));
      const db = new DatabaseSync(':memory:');
      db.exec('PRAGMA foreign_keys = ON;');
      expect(migrate(db, dir)).toEqual(['001_init.sql']);
      db.prepare("INSERT INTO lc_courses (title, platform, category, description, status, manual_progress, created_at, updated_at) VALUES ('Antigo','Udemy','Geral','', 'active', 30, 'a', 'a')").run();
      expect(migrate(db)).toEqual(ALL_MIGRATIONS.slice(1)); // todas as seguintes à 001
      const row = db.prepare('SELECT title, manual_progress, image_url FROM lc_courses').get();
      expect(row).toMatchObject({ title: 'Antigo', manual_progress: 30, image_url: null });
      expect(migrate(db)).toEqual([]); // idempotente
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
