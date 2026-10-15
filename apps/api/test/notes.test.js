import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeApp } from './helpers.js';

let ctx;
beforeEach(async () => { ctx = await makeApp(); });
afterEach(async () => { await ctx.app.close(); });

const note = (extra = {}) => ({ title: 'Minha nota', body: '# Título\n\nTexto **forte**', ...extra });
const create = async (extra) => (await ctx.call('POST', '/notes', note(extra)));
const get = async (id) => (await ctx.call('GET', `/notes/${id}`)).body.data;
const list = async (qs = '') => (await ctx.call('GET', `/notes${qs}`)).body.data;
const mkCourse = async (title = 'Curso') => (await ctx.call('POST', '/courses', { title })).body.data;
async function mkLesson(courseId) {
  const m = (await ctx.call('POST', `/courses/${courseId}/modules`, { title: 'M' })).body.data;
  return (await ctx.call('POST', `/modules/${m.id}/lessons`, { title: 'Aula 1', durationMin: 5 })).body.data;
}

describe('anotações · criar e ler', () => {
  it('cria com título, texto e tags normalizadas, e devolve tudo', async () => {
    const r = await create({ tags: ['Redes', 'redes', ' TCP '] });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ title: 'Minha nota', body: '# Título\n\nTexto **forte**', courseId: null, lessonId: null, tags: ['redes', 'tcp'] });
    expect(r.body.data.createdAt).toBe(r.body.data.updatedAt);
    expect((await get(r.body.data.id)).body).toBe('# Título\n\nTexto **forte**');
  });

  it('aceita só título ou só texto, mas não os dois vazios', async () => {
    expect((await create({ title: 'Só título', body: '' })).status).toBe(201);
    expect((await create({ title: '', body: 'Só texto' })).status).toBe(201);
    const bad = await create({ title: '   ', body: '  \n ' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('valida tamanhos e tags', async () => {
    expect((await create({ title: 'x'.repeat(201) })).status).toBe(400);
    expect((await create({ body: 'x'.repeat(100001) })).status).toBe(400);
    expect((await create({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).status).toBe(400);
    expect((await create({ tags: ['x'.repeat(31)] })).status).toBe(400);
  });

  it('guarda HTML e scripts como texto puro (quem exibe é que precisa escapar)', async () => {
    const r = await create({ title: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script>' });
    expect(r.body.data.title).toBe('<img src=x onerror=alert(1)>');
    expect((await get(r.body.data.id)).body).toBe('<script>alert(1)</script>');
  });

  it('404 para nota inexistente e id inválido', async () => {
    expect((await ctx.call('GET', '/notes/999')).status).toBe(404);
    expect((await ctx.call('GET', '/notes/abc')).status).toBe(404);
    expect((await ctx.call('PATCH', '/notes/999', { title: 'x' })).status).toBe(404);
    expect((await ctx.call('DELETE', '/notes/999')).status).toBe(404);
  });
});

describe('anotações · vínculo com curso e aula', () => {
  it('liga ao curso e à aula, e devolve os títulos', async () => {
    const c = await mkCourse('Redes');
    const l = await mkLesson(c.id);
    const n = (await create({ courseId: c.id, lessonId: l.id })).body.data;
    expect(n).toMatchObject({ courseId: c.id, courseTitle: 'Redes', lessonId: l.id, lessonTitle: 'Aula 1' });
  });

  it('só com a aula, descobre o curso sozinho', async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    expect((await create({ lessonId: l.id })).body.data.courseId).toBe(c.id);
  });

  it('recusa curso/aula inexistentes e aula de outro curso', async () => {
    const a = await mkCourse('A');
    const b = await mkCourse('B');
    const lb = await mkLesson(b.id);
    expect((await create({ courseId: 999 })).body.error.code).toBe('INVALID_COURSE');
    expect((await create({ lessonId: 999 })).body.error.code).toBe('INVALID_LESSON');
    const r = await create({ courseId: a.id, lessonId: lb.id });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_LESSON');
  });

  it('apagar o curso mantém a anotação, só sem vínculo; apagar a aula também', async () => {
    const c = await mkCourse();
    const l = await mkLesson(c.id);
    const n = (await create({ courseId: c.id, lessonId: l.id })).body.data;
    await ctx.call('DELETE', `/lessons/${l.id}`);
    expect(await get(n.id)).toMatchObject({ courseId: c.id, lessonId: null });
    await ctx.call('DELETE', `/courses/${c.id}`);
    expect(await get(n.id)).toMatchObject({ courseId: null, lessonId: null, title: 'Minha nota' });
  });
});

describe('anotações · editar e apagar', () => {
  it('altera campos, troca as tags e atualiza a data de edição', async () => {
    const n = (await create({ tags: ['a'] })).body.data;
    ctx.clock.advance(60000);
    const r = await ctx.call('PATCH', `/notes/${n.id}`, { title: 'Novo', body: 'corpo novo', tags: ['b', 'c'] });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ title: 'Novo', body: 'corpo novo', tags: ['b', 'c'] });
    expect(r.body.data.updatedAt > n.updatedAt).toBe(true);
    expect(r.body.data.createdAt).toBe(n.createdAt);
  });

  it('PATCH parcial não mexe no resto; limpar vínculo com null', async () => {
    const c = await mkCourse();
    const n = (await create({ courseId: c.id, tags: ['x'] })).body.data;
    const r1 = (await ctx.call('PATCH', `/notes/${n.id}`, { title: 'só o título' })).body.data;
    expect(r1).toMatchObject({ courseId: c.id, tags: ['x'], body: n.body });
    const r2 = (await ctx.call('PATCH', `/notes/${n.id}`, { courseId: null })).body.data;
    expect(r2.courseId).toBeNull();
  });

  it('trocar de curso desfaz a aula (que era do outro curso)', async () => {
    const a = await mkCourse('A');
    const b = await mkCourse('B');
    const la = await mkLesson(a.id);
    const n = (await create({ courseId: a.id, lessonId: la.id })).body.data;
    const r = (await ctx.call('PATCH', `/notes/${n.id}`, { courseId: b.id })).body.data;
    expect(r).toMatchObject({ courseId: b.id, lessonId: null });
  });

  it('não deixa a anotação ficar totalmente vazia', async () => {
    const n = (await create({ title: 'T', body: '' })).body.data;
    expect((await ctx.call('PATCH', `/notes/${n.id}`, { title: '' })).status).toBe(400);
    expect((await get(n.id)).title).toBe('T');
  });

  it('apaga e some da lista (e as tags junto)', async () => {
    const n = (await create({ tags: ['x'] })).body.data;
    expect((await ctx.call('DELETE', `/notes/${n.id}`)).status).toBe(204);
    expect(await list()).toEqual([]);
    expect(await list('/tags')).toEqual([]);
  });
});

describe('anotações · lista, busca e filtros', () => {
  it('lista da mais recente editada para a mais antiga, com trecho e sem o texto completo', async () => {
    const a = (await create({ title: 'Primeira', body: '# Cabeçalho\n- item **um**\n\n```js\ncodigo()\n```\nfim' })).body.data;
    ctx.clock.advance(60000);
    await create({ title: 'Segunda', body: 'b' });
    ctx.clock.advance(60000);
    await ctx.call('PATCH', `/notes/${a.id}`, { body: '# Cabeçalho\n- item **um**\n\n```js\ncodigo()\n```\nfim' });
    const l = await list();
    expect(l.map((n) => n.title)).toEqual(['Primeira', 'Segunda']);
    expect(l[0].body).toBeUndefined();
    expect(l[0].excerpt).toBe('Cabeçalho item um fim');
  });

  it('o trecho da lista não mostra símbolos de tabela, citação, tarefas nem links', async () => {
    await create({ title: 'T', body: '> citação\n\n| a | b |\n|---|:--:|\n| 1 | 2 |\n\n- [x] feito\n- [ ] fazer\n\n---\n\n[link](https://x.com) e ![img](https://x.com/i.png)' });
    expect((await list())[0].excerpt).toBe('citação a b 1 2 feito fazer link e img');
  });

  it('busca em título, texto e tags, sem diferenciar maiúsculas nem acentos', async () => {
    await create({ title: 'Introdução às Redes', body: 'modelo OSI' });
    await create({ title: 'Outra', body: 'O protocolo TCP é orientado a conexão' });
    await create({ title: 'Terceira', body: 'nada', tags: ['segurança'] });
    expect((await list('?q=introducao')).map((n) => n.title)).toEqual(['Introdução às Redes']);
    expect((await list('?q=PROTOCOLO%20tcp')).map((n) => n.title)).toEqual(['Outra']);
    expect(await list('?q=tcp%20orientado')).toEqual([]); // é a frase seguida, não palavras soltas
    expect((await list('?q=SEGURANCA')).map((n) => n.title)).toEqual(['Terceira']);
    expect(await list('?q=inexistente')).toEqual([]);
  });

  it('filtra por curso, aula e tag', async () => {
    const c = await mkCourse('C');
    const d = await mkCourse('D');
    const l = await mkLesson(c.id);
    await create({ title: 'Do C', courseId: c.id, tags: ['x'] });
    await create({ title: 'Da aula', courseId: c.id, lessonId: l.id, tags: ['y'] });
    await create({ title: 'Do D', courseId: d.id, tags: ['x'] });
    expect((await list(`?courseId=${c.id}`)).map((n) => n.title).sort()).toEqual(['Da aula', 'Do C']);
    expect((await list(`?lessonId=${l.id}`)).map((n) => n.title)).toEqual(['Da aula']);
    expect((await list('?tag=x')).map((n) => n.title).sort()).toEqual(['Do C', 'Do D']);
    expect((await list(`?courseId=${c.id}&tag=x`)).map((n) => n.title)).toEqual(['Do C']);
  });

  it('inclui o título do curso na lista e valida os parâmetros', async () => {
    const c = await mkCourse('Redes');
    await create({ courseId: c.id });
    expect((await list())[0].courseTitle).toBe('Redes');
    expect((await ctx.call('GET', '/notes?courseId=abc')).status).toBe(400);
    expect((await ctx.call('GET', '/notes?limit=0')).status).toBe(400);
  });

  it('respeita o limite pedido', async () => {
    for (let i = 0; i < 5; i += 1) await create({ title: `N${i}` });
    expect(await list('?limit=3')).toHaveLength(3);
  });

  it('resumo de tags com contagem, da mais usada para a menos', async () => {
    await create({ tags: ['a', 'b'] });
    await create({ tags: ['a'] });
    await create({ tags: ['c'] });
    expect(await list('/tags')).toEqual([{ tag: 'a', count: 2 }, { tag: 'b', count: 1 }, { tag: 'c', count: 1 }]);
  });
});
