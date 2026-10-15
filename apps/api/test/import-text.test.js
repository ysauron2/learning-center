import { describe, it, expect, afterEach } from 'vitest';
import { makeApp } from './helpers.js';
import { parseLessonList, durationToSeconds } from '../src/core/lesson-text.js';

const lessons = (text) => parseLessonList(text).modules.flatMap((m) => m.lessons);
const one = (line) => lessons(line)[0];

describe('durationToSeconds', () => {
  it('entende os formatos comuns e recusa os inválidos', () => {
    expect(durationToSeconds('12:30')).toBe(750);
    expect(durationToSeconds('00:12:30')).toBe(750);
    expect(durationToSeconds('1:05:00')).toBe(3900);
    expect(durationToSeconds('1h05')).toBe(3900);
    expect(durationToSeconds('2h')).toBe(7200);
    expect(durationToSeconds('1h 05min')).toBe(3900);
    expect(durationToSeconds('8 min')).toBe(480);
    expect(durationToSeconds('45 minutos')).toBe(2700);
    expect(durationToSeconds('30 seg')).toBe(30);
    expect(durationToSeconds('12:75')).toBe(0);
    expect(durationToSeconds('abc')).toBe(0);
  });
});

describe('parseLessonList: uma aula por linha', () => {
  it('título simples recebe 10 min estimados e é marcado como estimativa', () => {
    expect(one('Introdução')).toEqual({ title: 'Introdução', durationMin: 10, estimated: true });
  });

  it.each([
    ['1. Título', 'Título', 10, true],
    ['02) Título', 'Título', 10, true],
    ['03 - Título', 'Título', 10, true],
    ['- Título', 'Título', 10, true],
    ['Título | 12:30', 'Título', 13, false],
    ['Título - 8 min', 'Título', 8, false],
    ['Título – 8 minutos', 'Título', 8, false],
    ['Título (1h05)', 'Título', 65, false],
    ['Título (12:30)', 'Título', 13, false],
    ['Título 00:12:30', 'Título', 13, false],
    ['Título 8min', 'Título', 8, false],
    ['4. Redes - Camada 2 | 1:02:00', 'Redes - Camada 2', 62, false],
    ['Aula 10 - Python 3', 'Aula 10 - Python 3', 10, true],
    ['Título | 0:20', 'Título', 1, false],
  ])('%s', (line, title, min, estimated) => {
    expect(one(line)).toEqual({ title, durationMin: min, estimated });
  });

  it('linhas vazias são ignoradas e CRLF funciona', () => {
    const r = parseLessonList('A\r\n\r\n   \r\nB\r\n');
    expect(r.lessonCount).toBe(2);
    expect(r.modules).toHaveLength(1);
    expect(r.modules[0].title).toBe('Aulas');
  });

  it('abre módulos por "Módulo", "Seção", dois-pontos e MAIÚSCULAS', () => {
    const r = parseLessonList(['Módulo 1: Começando', 'Aula A | 5 min', 'Aula B', 'Seção 2', 'Aula C', 'Redes:', 'Aula D', 'PARTE FINAL', 'Aula E | 3:00'].join('\n'));
    expect(r.modules.map((m) => [m.title, m.lessons.map((l) => l.title)])).toEqual([
      ['Módulo 1: Começando', ['Aula A', 'Aula B']],
      ['Seção 2', ['Aula C']],
      ['Redes', ['Aula D']],
      ['PARTE FINAL', ['Aula E']],
    ]);
  });

  it('linha com duração nunca vira módulo; lista toda em maiúsculas continua sendo aulas', () => {
    expect(parseLessonList('Módulo 3 - Intro | 5:00').modules[0].lessons[0].title).toBe('Módulo 3 - Intro');
    const shout = parseLessonList('AULA UM\nAULA DOIS\nAULA TRÊS');
    expect(shout.lessonCount).toBe(3);
  });

  it('módulo sem aulas é ignorado e avisado', () => {
    const r = parseLessonList('Módulo 1\nMódulo 2\nAula');
    expect(r.moduleCount).toBe(1);
    expect(r.warnings.join(' ')).toMatch(/sem aulas/);
  });

  it('prévia: total de minutos, contagem de estimadas e aviso "N aulas sem duração"', () => {
    const r = parseLessonList('A | 10:00\nB\nC\nD - 5 min');
    expect(r).toMatchObject({ lessonCount: 4, estimatedCount: 2, totalMin: 10 + 10 + 10 + 5 });
    expect(r.warnings[0]).toBe('2 aula(s) sem duração: usei 10 min como estimativa.');
  });

  it('limites: título longo é cortado com aviso; mais de 2000 linhas é recusado', () => {
    const r = parseLessonList('x'.repeat(500));
    expect(r.modules[0].lessons[0].title).toHaveLength(200);
    expect(r.warnings.join(' ')).toMatch(/cortados/);
    const lines = Array.from({ length: 2000 }, (_, i) => `Aula ${i}`).join('\n');
    expect(parseLessonList(lines).lessonCount).toBe(2000);
    expect(() => parseLessonList(lines + '\nmais uma')).toThrowError(/2000/);
  });

  it('entradas hostis não quebram nem demoram', () => {
    const t0 = Date.now();
    const r = parseLessonList([
      '\u0000\u0007controle',
      '<script>alert(1)</script> | 1:00',
      '1:00',
      '   ',
      '!!! ???',
      '9'.repeat(5000) + ' min',
      ('1 '.repeat(2000)) + 'x',
      '(((((' + '('.repeat(900) + ')',
      'a'.repeat(100000),
    ].join('\n'));
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(r.modules[0].lessons[0].title).toBe('controle');
    expect(r.modules[0].lessons[1].title).toBe('<script>alert(1)</script>'); // texto puro; a tela escapa
    expect(r.warnings.join(' ')).toMatch(/Ignorei/);
  });

  it('texto vazio ou só espaços dá lista vazia', () => {
    expect(parseLessonList('').lessonCount).toBe(0);
    expect(parseLessonList('   \n\n').lessonCount).toBe(0);
  });
});

describe('rotas de lista colada', () => {
  let ctx;
  afterEach(async () => ctx?.app.close());
  const setup = async () => { ctx = await makeApp(); };
  const TEXT = 'Módulo 1: Base\n1. Intro | 10:00\n2. Teoria - 5 min\nMódulo 2\nPrática';

  it('prévia mostra módulos, aulas, total e avisos, sem gravar nada', async () => {
    await setup();
    const r = await ctx.call('POST', '/courses/import-text/preview', { title: 'Meu Curso', platform: 'Alura', text: TEXT });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ moduleCount: 2, lessonCount: 3, totalMin: 25, estimatedCount: 1, existing: null });
    expect(r.body.data.warnings[0]).toMatch(/1 aula\(s\) sem duração/);
    expect((await ctx.call('GET', '/courses')).body.data).toHaveLength(0);
  });

  it('cria o curso com módulos e aulas na ordem, plataforma, categoria e link', async () => {
    await setup();
    const r = await ctx.call('POST', '/courses/import-text', { title: 'Meu Curso', platform: 'Alura', category: 'Redes', url: 'https://exemplo.com/curso', text: TEXT });
    expect(r.body.data).toMatchObject({ created: true, lessonsAdded: 3, modulesAdded: 2 });
    const c = (await ctx.call('GET', `/courses/${r.body.data.courseId}`)).body.data;
    expect(c).toMatchObject({ title: 'Meu Curso', platform: 'Alura', category: 'Redes', url: 'https://exemplo.com/curso' });
    expect(c.modules.map((m) => [m.title, m.lessons.map((l) => [l.title, l.durationMin])])).toEqual([
      ['Módulo 1: Base', [['Intro', 10], ['Teoria', 5]]],
      ['Módulo 2', [['Prática', 10]]],
    ]);
  });

  it('padrões: plataforma "Outro", categoria "Geral"; link vazio é aceito', async () => {
    await setup();
    const r = await ctx.call('POST', '/courses/import-text', { title: 'X', url: '', text: 'A' });
    const c = (await ctx.call('GET', `/courses/${r.body.data.courseId}`)).body.data;
    expect(c).toMatchObject({ platform: 'Outro', category: 'Geral', url: null });
  });

  it('mesmo título + plataforma: avisa na prévia, recusa sem decisão (409) e respeita "novo" e "acrescentar"', async () => {
    await setup();
    const body = { title: 'Meu Curso', platform: 'Alura', text: 'A\nB' };
    const first = await ctx.call('POST', '/courses/import-text', body);
    const prev = await ctx.call('POST', '/courses/import-text/preview', { ...body, title: 'meu curso' });
    expect(prev.body.data.existing).toMatchObject({ id: first.body.data.courseId });
    const blocked = await ctx.call('POST', '/courses/import-text', body);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('COURSE_EXISTS');
    const add = await ctx.call('POST', '/courses/import-text', { ...body, text: 'A\nB\nC', mode: 'acrescentar' });
    expect(add.body.data).toMatchObject({ created: false, courseId: first.body.data.courseId, lessonsAdded: 1 });
    expect((await ctx.call('GET', `/courses/${first.body.data.courseId}`)).body.data.totalLessons).toBe(3);
    const fresh = await ctx.call('POST', '/courses/import-text', { ...body, mode: 'novo' });
    expect(fresh.body.data.created).toBe(true);
    expect(fresh.body.data.courseId).not.toBe(first.body.data.courseId);
    // outra plataforma, mesmo título: não é duplicata
    expect((await ctx.call('POST', '/courses/import-text', { ...body, platform: 'Livro' })).status).toBe(200);
  });

  it('validação: título, texto vazio, link perigoso, lista sem aulas e lista longa demais', async () => {
    await setup();
    const call = (b) => ctx.call('POST', '/courses/import-text', { title: 'T', text: 'A', ...b });
    expect((await call({ title: '' })).status).toBe(400);
    expect((await call({ text: '   ' })).status).toBe(400);
    expect((await call({ url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await call({ mode: 'outro' })).status).toBe(400);
    const none = await call({ text: '1:00\n!!!' });
    expect(none.status).toBe(422);
    expect(none.body.error.message).toMatch(/nenhuma aula/);
    const long = await call({ text: Array.from({ length: 2001 }, (_, i) => `Aula ${i}`).join('\n') });
    expect(long.status).toBe(400);
    expect(long.body.error.message).toMatch(/2000/);
    expect((await ctx.call('GET', '/courses')).body.data).toHaveLength(0);
  });
});
