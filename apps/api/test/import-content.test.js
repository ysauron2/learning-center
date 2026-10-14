import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeApp } from './helpers.js';
import { createLearningCenter } from '../src/index.js';
import { createContentImporter } from '../src/modules/courses/import-content.js';

let ctx;
beforeEach(async () => { ctx = await makeApp(); });
afterEach(async () => { await ctx.app.close(); });

const mkCourse = async (extra = {}) => (await ctx.call('POST', '/courses', { title: 'Curso', ...extra })).body.data;
const lesson = (title, durationMin = 5, completed = false) => ({ title, durationMin, completed });
const content = () => ({
  modules: [
    { title: 'Seção 1: Introdução', lessons: [lesson('Boas-vindas', 3, true), lesson('Instalação', 10, true), lesson('Primeiro app', 15)] },
    { title: 'Seção 2: Avançado', lessons: [lesson('Tópicos', 20), lesson('Encerramento', 2)] },
  ],
});
const preview = (id, body) => ctx.call('POST', `/courses/${id}/import-content/preview`, body);
const run = (id, body) => ctx.call('POST', `/courses/${id}/import-content`, body);
const getCourse = async (id) => (await ctx.call('GET', `/courses/${id}`)).body.data;

describe('importação de conteúdo do curso', () => {
  it('prévia conta o que será criado e não grava nada', async () => {
    const c = await mkCourse();
    const r = await preview(c.id, content());
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ modulesCreated: 2, lessonsCreated: 5, lessonsCompleted: 2, lessonsExisting: 0 });
    expect(r.body.data.after).toEqual({ total: 5, done: 2, progress: 40 });
    expect((await getCourse(c.id)).modules).toHaveLength(0);
  });

  it('cria módulos e aulas na ordem, com duração e conclusão, e o progresso passa a vir das aulas', async () => {
    const c = await mkCourse({ manualProgress: 90 });
    const r = await run(c.id, content());
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ modulesCreated: 2, lessonsCreated: 5, lessonsCompleted: 2 });
    const got = await getCourse(c.id);
    expect(got.modules.map((m) => m.title)).toEqual(['Seção 1: Introdução', 'Seção 2: Avançado']);
    expect(got.modules[0].lessons.map((l) => [l.title, l.durationMin, l.completed])).toEqual([
      ['Boas-vindas', 3, true], ['Instalação', 10, true], ['Primeiro app', 15, false],
    ]);
    expect(got.progress).toBe(40);
  });

  it('rodar de novo não duplica nada', async () => {
    const c = await mkCourse();
    await run(c.id, content());
    const again = await run(c.id, content());
    expect(again.body.data).toMatchObject({ modulesCreated: 0, lessonsCreated: 0, lessonsCompleted: 0, lessonsExisting: 5 });
    const got = await getCourse(c.id);
    expect(got.modules).toHaveLength(2);
    expect(got.totalLessons).toBe(5);
  });

  it('marca como concluída a aula que passou a estar vista, mas nunca desmarca', async () => {
    const c = await mkCourse();
    await run(c.id, content());
    const before = await getCourse(c.id);
    const done = before.modules[0].lessons[0];
    const updated = {
      modules: [
        { title: 'Seção 1: Introdução', lessons: [lesson('Boas-vindas', 3, false), lesson('Instalação', 10, true), lesson('Primeiro app', 15, true)] },
        { title: 'Seção 2: Avançado', lessons: [lesson('Tópicos', 20), lesson('Encerramento', 2)] },
      ],
    };
    const r = await run(c.id, updated);
    expect(r.body.data.lessonsCompleted).toBe(1);
    const after = await getCourse(c.id);
    expect(after.modules[0].lessons.map((l) => l.completed)).toEqual([true, true, true]);
    expect(after.modules[0].lessons[0].completedAt).toBe(done.completedAt);
  });

  it('mescla com módulo existente (ignora maiúsculas e espaços) e acrescenta só aulas novas', async () => {
    const c = await mkCourse();
    const m = (await ctx.call('POST', `/courses/${c.id}/modules`, { title: 'seção 1:  introdução' })).body.data;
    await ctx.call('POST', `/modules/${m.id}/lessons`, { title: 'BOAS-VINDAS', durationMin: 0 });
    const r = await run(c.id, content());
    expect(r.body.data).toMatchObject({ modulesCreated: 1, lessonsExisting: 1, lessonsCreated: 4 });
    const got = await getCourse(c.id);
    expect(got.modules).toHaveLength(2);
    expect(got.modules[0].title).toBe('seção 1:  introdução'); // mantém o nome que o usuário já tinha
    expect(got.modules[0].lessons.map((l) => l.title)).toEqual(['BOAS-VINDAS', 'Instalação', 'Primeiro app']);
    expect(got.modules[0].lessons[0].durationMin).toBe(3); // preenche duração que estava zerada
  });

  it('aulas com o mesmo título no módulo são tratadas uma a uma', async () => {
    const c = await mkCourse();
    const body = { modules: [{ title: 'M', lessons: [lesson('Quiz', 5, true), lesson('Aula', 5), lesson('Quiz', 5, false)] }] };
    await run(c.id, body);
    expect((await getCourse(c.id)).totalLessons).toBe(3);
    const again = await run(c.id, body);
    expect(again.body.data).toMatchObject({ lessonsCreated: 0, lessonsExisting: 3 });
    expect((await getCourse(c.id)).totalLessons).toBe(3);
  });

  it('é atômico: erro no meio não deixa conteúdo pela metade', async () => {
    const c = await mkCourse();
    const lc = createLearningCenter({ db: ctx.app.db, clock: ctx.clock, runMigrations: false });
    let n = 0;
    const failing = {
      ...lc.courses,
      addLesson: (...args) => { if (++n === 3) throw new Error('falha simulada'); return lc.courses.addLesson(...args); },
    };
    const importer = createContentImporter(ctx.app.db, failing, ctx.clock);
    expect(() => importer.run(c.id, content())).toThrow('falha simulada');
    expect((await getCourse(c.id)).modules).toHaveLength(0);
  });

  it('valida: curso inexistente, corpo vazio, títulos vazios e tamanho', async () => {
    const c = await mkCourse();
    expect((await run(9999, content())).status).toBe(404);
    expect((await run(c.id, { modules: [] })).status).toBe(400);
    expect((await run(c.id, { modules: [{ title: '  ', lessons: [] }] })).status).toBe(400);
    expect((await run(c.id, { modules: [{ title: 'M', lessons: [{ title: '', durationMin: 1 }] }] })).status).toBe(400);
    const big = { modules: [{ title: 'M', lessons: Array.from({ length: 501 }, (_, i) => lesson(`A${i}`)) }] };
    expect((await run(c.id, big)).status).toBe(400);
    expect((await getCourse(c.id)).modules).toHaveLength(0);
  });

  it('ajusta duração absurda ou negativa e guarda HTML como texto', async () => {
    const c = await mkCourse();
    await run(c.id, { modules: [{ title: '<b>M</b>', lessons: [lesson('<img src=x onerror=1>', 99999), lesson('B', -5)] }] });
    const got = await getCourse(c.id);
    expect(got.modules[0].title).toBe('<b>M</b>');
    expect(got.modules[0].lessons.map((l) => l.durationMin)).toEqual([1000, 0]);
  });
});
