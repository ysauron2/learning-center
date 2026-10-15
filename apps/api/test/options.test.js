import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeApp } from './helpers.js';
import { migrate } from '../src/core/migrate.js';

let ctx;
beforeEach(async () => { ctx = await makeApp(); });
afterEach(async () => { await ctx.app.close(); });

const opts = async () => (await ctx.call('GET', '/options')).body.data;
const names = (list) => list.map((o) => o.name);
const mkCourse = async (title, extra = {}) => (await ctx.call('POST', '/courses', { title, ...extra })).body.data;
const del = (kind, name) => ctx.call('DELETE', `/options/${kind}?name=${encodeURIComponent(name)}`);

describe('opções · listar', () => {
  it('já vem com as sugestões padrão, com contagem de cursos e as "padrão" protegidas', async () => {
    const o = await opts();
    expect(names(o.categories)).toEqual(expect.arrayContaining(['Cibersegurança', 'Redes', 'Linux', 'Desenvolvimento', 'Certificação', 'Geral']));
    expect(names(o.platforms)).toEqual(expect.arrayContaining(['Udemy', 'Alura', 'Coursera', 'YouTube', 'Faculdade', 'NetAcad', 'Livro', 'Outro']));
    expect(o.categories.find((c) => c.name === 'Geral')).toMatchObject({ count: 0, protected: true });
    expect(o.platforms.find((p) => p.name === 'Outro')).toMatchObject({ count: 0, protected: true });
    expect(o.categories.find((c) => c.name === 'Redes').protected).toBe(false);
  });

  it('conta os cursos de cada categoria e plataforma', async () => {
    await mkCourse('A', { category: 'Redes', platform: 'Udemy' });
    await mkCourse('B', { category: 'Redes', platform: 'Alura' });
    await mkCourse('C');
    const o = await opts();
    expect(o.categories.find((c) => c.name === 'Redes').count).toBe(2);
    expect(o.categories.find((c) => c.name === 'Geral').count).toBe(1);
    expect(o.platforms.find((p) => p.name === 'Udemy').count).toBe(1);
    expect(o.platforms.find((p) => p.name === 'Outro').count).toBe(1);
  });

  it('um curso com categoria nova faz ela aparecer na lista, e com a mesma grafia já existente reaproveita o nome', async () => {
    await mkCourse('A', { category: 'Design' });
    await mkCourse('B', { category: 'design' });
    await mkCourse('C', { category: ' REDES ' });
    const o = await opts();
    expect(names(o.categories).filter((n) => n.toLowerCase() === 'design')).toEqual(['Design']);
    expect(o.categories.find((c) => c.name === 'Design').count).toBe(2);
    const courses = (await ctx.call('GET', '/courses')).body.data;
    expect(courses.find((c) => c.title === 'B').category).toBe('Design');
    expect(courses.find((c) => c.title === 'C').category).toBe('Redes');
  });

  it('valor antigo que só existe nos cursos (sem estar na lista) é incluído na hora de listar', async () => {
    ctx.app.db.prepare("INSERT INTO lc_courses (title, platform, category, description, status, manual_progress, created_at, updated_at) VALUES ('Legado','Plataforma Rara','Categoria Rara','', 'active', 0, 'a', 'a')").run();
    const o = await opts();
    expect(o.categories.find((c) => c.name === 'Categoria Rara')).toMatchObject({ count: 1, protected: false });
    expect(o.platforms.find((p) => p.name === 'Plataforma Rara')).toMatchObject({ count: 1 });
  });

  it('a importação da Udemy com categoria nova também a registra', async () => {
    await ctx.call('POST', '/courses/import', { category: 'Segurança Ofensiva', items: [{ title: 'X', url: 'https://www.udemy.com/course/x/', progress: 0 }] });
    expect(names((await opts()).categories)).toContain('Segurança Ofensiva');
  });
});

describe('opções · criar', () => {
  it('cria categoria e plataforma sem precisar de curso', async () => {
    const r = await ctx.call('POST', '/options/categories', { name: '  Design  ' });
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ name: 'Design', created: true });
    expect(names((await opts()).categories)).toContain('Design');
    expect((await ctx.call('POST', '/options/platforms', { name: 'Domestika' })).status).toBe(201);
  });

  it('nome repetido (ignora maiúsculas e acentos) devolve o que já existe, sem duplicar', async () => {
    const r = await ctx.call('POST', '/options/categories', { name: 'cibersegurança' });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ name: 'Cibersegurança', created: false });
    const r2 = await ctx.call('POST', '/options/categories', { name: 'CIBERSEGURANCA' });
    expect(r2.body.data).toEqual({ name: 'Cibersegurança', created: false });
    expect((await opts()).categories.filter((c) => c.name.toLowerCase().startsWith('cibers'))).toHaveLength(1);
  });

  it('valida nome vazio, grande demais e tipo desconhecido', async () => {
    expect((await ctx.call('POST', '/options/categories', { name: '   ' })).status).toBe(400);
    expect((await ctx.call('POST', '/options/categories', { name: 'x'.repeat(61) })).status).toBe(400);
    expect((await ctx.call('POST', '/options/tags', { name: 'x' })).status).toBe(400);
  });
});

describe('opções · renomear', () => {
  it('renomeia e atualiza todos os cursos que usavam o nome antigo', async () => {
    await mkCourse('A', { category: 'Redes' });
    await mkCourse('B', { category: 'Redes' });
    const r = await ctx.call('PATCH', '/options/categories', { name: 'Redes', newName: 'Redes e Infra' });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ name: 'Redes e Infra', moved: 2, merged: false });
    const o = await opts();
    expect(names(o.categories)).toContain('Redes e Infra');
    expect(names(o.categories)).not.toContain('Redes');
    expect((await ctx.call('GET', '/courses?category=Redes%20e%20Infra')).body.data).toHaveLength(2);
  });

  it('só trocar maiúsculas/minúsculas também funciona', async () => {
    await mkCourse('A', { category: 'Redes' });
    const r = await ctx.call('PATCH', '/options/categories', { name: 'Redes', newName: 'REDES' });
    expect(r.body.data).toMatchObject({ name: 'REDES', merged: false });
    expect((await ctx.call('GET', '/courses')).body.data[0].category).toBe('REDES');
  });

  it('renomear para um nome que já existe junta os dois (os cursos vão para o existente)', async () => {
    await mkCourse('A', { category: 'Redes' });
    await mkCourse('B', { category: 'Linux' });
    const r = await ctx.call('PATCH', '/options/categories', { name: 'Redes', newName: 'linux' });
    expect(r.body.data).toEqual({ name: 'Linux', moved: 1, merged: true });
    const o = await opts();
    expect(names(o.categories)).not.toContain('Redes');
    expect(o.categories.find((c) => c.name === 'Linux').count).toBe(2);
  });

  it('não renomeia a padrão ("Geral"/"Outro"); 404 se não existe; valida o novo nome', async () => {
    const a = await ctx.call('PATCH', '/options/categories', { name: 'Geral', newName: 'X' });
    expect(a.status).toBe(400);
    expect(a.body.error.code).toBe('PROTECTED_OPTION');
    expect((await ctx.call('PATCH', '/options/platforms', { name: 'Outro', newName: 'X' })).status).toBe(400);
    expect((await ctx.call('PATCH', '/options/categories', { name: 'Nada', newName: 'X' })).status).toBe(404);
    expect((await ctx.call('PATCH', '/options/categories', { name: 'Redes', newName: '  ' })).status).toBe(400);
  });
});

describe('opções · excluir', () => {
  it('apagar uma categoria move os cursos dela para "Geral" e ela some da lista', async () => {
    await mkCourse('A', { category: 'Design' });
    await mkCourse('B', { category: 'Design' });
    const r = await del('categories', 'Design');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ moved: 2, movedTo: 'Geral' });
    const o = await opts();
    expect(names(o.categories)).not.toContain('Design');
    expect(o.categories.find((c) => c.name === 'Geral').count).toBe(2);
    expect((await ctx.call('GET', '/courses')).body.data.every((c) => c.category === 'Geral')).toBe(true);
  });

  it('apagar plataforma move para "Outro"', async () => {
    await mkCourse('A', { platform: 'Alura' });
    expect((await del('platforms', 'Alura')).body.data).toEqual({ moved: 1, movedTo: 'Outro' });
    expect(names((await opts()).platforms)).not.toContain('Alura');
  });

  it('apagar uma sugestão padrão sem cursos funciona e ela não volta sozinha', async () => {
    expect((await del('categories', 'Linux')).body.data).toEqual({ moved: 0, movedTo: 'Geral' });
    expect(names((await opts()).categories)).not.toContain('Linux');
    expect(names((await opts()).categories)).not.toContain('Linux'); // listar de novo não ressuscita
  });

  it('nome com acento, espaço e caracteres especiais é apagado normalmente', async () => {
    await ctx.call('POST', '/options/categories', { name: 'Segurança & Redes/2' });
    expect((await del('categories', 'Segurança & Redes/2')).status).toBe(200);
    expect(names((await opts()).categories)).not.toContain('Segurança & Redes/2');
  });

  it('não apaga a padrão; 404 se não existe; exige o nome', async () => {
    const a = await del('categories', 'Geral');
    expect(a.status).toBe(400);
    expect(a.body.error.code).toBe('PROTECTED_OPTION');
    expect((await del('platforms', 'outro')).status).toBe(400);
    expect((await del('categories', 'Nada')).status).toBe(404);
    expect((await ctx.call('DELETE', '/options/categories')).status).toBe(400);
    expect((await ctx.call('DELETE', '/options/tags?name=x')).status).toBe(400);
  });

  it('o tempo e as anotações dos cursos não se perdem (só muda o rótulo)', async () => {
    const c = await mkCourse('A', { category: 'Design' });
    await ctx.call('POST', '/notes', { title: 'N', courseId: c.id });
    await del('categories', 'Design');
    expect((await ctx.call('GET', `/courses/${c.id}`)).body.data.category).toBe('Geral');
    expect((await ctx.call('GET', '/notes')).body.data[0].courseId).toBe(c.id);
  });
});

describe('opções · backup e migração', () => {
  it('o backup guarda as opções (inclusive as sem cursos e as apagadas) e a restauração as reproduz', async () => {
    await ctx.call('POST', '/options/categories', { name: 'Minha categoria' });
    await del('categories', 'Linux');
    await mkCourse('A', { category: 'Redes' });
    const bk = (await ctx.call('GET', '/backup')).body.data;
    expect(bk.data.options.some((o) => o.kind === 'category' && o.name === 'Minha categoria')).toBe(true);
    expect(bk.data.options.some((o) => o.kind === 'category' && o.name === 'Linux')).toBe(false);
    const other = await makeApp();
    try {
      expect((await other.call('POST', '/backup/restore', { confirm: 'substituir-tudo', backup: bk })).status).toBe(200);
      const o = (await other.call('GET', '/options')).body.data;
      expect(names(o.categories)).toContain('Minha categoria');
      expect(names(o.categories)).not.toContain('Linux');
    } finally { await other.app.close(); }
  });

  it('backup antigo, sem opções, recebe as sugestões padrão e os valores usados pelos cursos', async () => {
    await mkCourse('A', { category: 'Rara' });
    const bk = (await ctx.call('GET', '/backup')).body.data;
    delete bk.data.options;
    const other = await makeApp();
    try {
      expect((await other.call('POST', '/backup/restore', { confirm: 'substituir-tudo', backup: bk })).status).toBe(200);
      const o = (await other.call('GET', '/options')).body.data;
      expect(names(o.categories)).toEqual(expect.arrayContaining(['Rara', 'Geral', 'Redes']));
      expect(names(o.platforms)).toEqual(expect.arrayContaining(['Udemy', 'Outro']));
    } finally { await other.app.close(); }
  });

  it('a migração, sobre um banco que já tem cursos, cria a lista com as padrão e o que já era usado', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lc-mig6-'));
    try {
      const files = ['001_init.sql', '002_course_image.sql', '003_udemy_slug.sql', '004_notes.sql', '005_tracks.sql'];
      for (const f of files) copyFileSync(new URL(`../migrations/${f}`, import.meta.url), join(dir, f));
      const db = new DatabaseSync(':memory:');
      db.exec('PRAGMA foreign_keys = ON;');
      migrate(db, dir);
      db.prepare("INSERT INTO lc_courses (title, platform, category, description, status, manual_progress, created_at, updated_at) VALUES ('Antigo','Hotmart','Culinária','', 'active', 0, 'a', 'a')").run();
      const ran = migrate(db);
      expect(ran[0]).toBe('006_options.sql');
      const cats = db.prepare("SELECT name FROM lc_options WHERE kind = 'category'").all().map((r) => r.name);
      expect(cats).toEqual(expect.arrayContaining(['Culinária', 'Geral', 'Redes']));
      const plats = db.prepare("SELECT name FROM lc_options WHERE kind = 'platform'").all().map((r) => r.name);
      expect(plats).toEqual(expect.arrayContaining(['Hotmart', 'Udemy', 'Outro']));
      expect(db.prepare('SELECT COUNT(*) n FROM lc_courses').get().n).toBe(1);
      db.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
