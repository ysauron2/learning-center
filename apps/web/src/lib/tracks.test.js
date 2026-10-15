import { describe, it, expect } from 'vitest';
import { orderCourses, suggestTracks, toggleSelection, selectionNumbers } from './tracks.js';

const c = (id, title, category, status = 'active', progress = 0) => ({ id, title, category, status, progress });

describe('orderCourses', () => {
  it('o que já foi feito vem primeiro, depois o em andamento (mais avançado antes), depois o que falta começar', () => {
    const list = [
      c(1, 'Planejado B', 'X', 'planned'),
      c(2, 'Andamento 30', 'X', 'active', 30),
      c(3, 'Feito', 'X', 'completed', 100),
      c(4, 'Andamento 70', 'X', 'active', 70),
      c(5, 'Pausado', 'X', 'paused', 10),
      c(6, 'Planejado A', 'X', 'planned'),
    ];
    expect(orderCourses(list).map((x) => x.title)).toEqual(['Feito', 'Andamento 70', 'Andamento 30', 'Pausado', 'Planejado A', 'Planejado B']);
  });
  it('não altera a lista original', () => {
    const list = [c(1, 'B', 'X', 'planned'), c(2, 'A', 'X', 'completed', 100)];
    orderCourses(list);
    expect(list.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe('suggestTracks', () => {
  const courses = [
    c(1, 'Redes 1', 'Redes', 'completed', 100), c(2, 'Redes 2', 'Redes', 'active', 40), c(3, 'Redes 3', 'Redes', 'planned'),
    c(4, 'Linux 1', 'Linux'), c(5, 'Linux 2', 'Linux'),
    c(6, 'Sozinho', 'Design'),
    c(7, 'Geral 1', 'Geral'), c(8, 'Geral 2', 'Geral'),
  ];

  it('sugere uma trilha por categoria com 2 ou mais cursos, na ordem sugerida', () => {
    const s = suggestTracks(courses);
    expect(s.map((x) => x.title)).toEqual(['Trilha de Redes', 'Trilha de Linux']); // mais cursos primeiro
    expect(s[0].courseIds).toEqual([1, 2, 3]);
    expect(s[0].category).toBe('Redes');
  });

  it('ignora categoria com um curso só e as genéricas ("Geral", "Outro")', () => {
    const titles = suggestTracks(courses).map((x) => x.title);
    expect(titles).not.toContain('Trilha de Design');
    expect(titles).not.toContain('Trilha de Geral');
    expect(suggestTracks([c(1, 'a', 'Outro'), c(2, 'b', 'Outro')])).toEqual([]);
  });

  it('não repete o que já virou trilha (compara o nome sem diferenciar maiúsculas e acentos)', () => {
    const s = suggestTracks(courses, [{ title: 'trilha de REDES' }]);
    expect(s.map((x) => x.title)).toEqual(['Trilha de Linux']);
    expect(suggestTracks([c(1, 'a', 'Segurança'), c(2, 'b', 'Segurança')], [{ title: 'TRILHA DE SEGURANCA' }])).toEqual([]);
  });

  it('lista vazia ou sem categoria não quebra', () => {
    expect(suggestTracks([])).toEqual([]);
    expect(suggestTracks([c(1, 'a', ''), c(2, 'b', undefined)])).toEqual([]);
    expect(suggestTracks(undefined)).toEqual([]);
  });
});

describe('seleção de cursos na ordem dos cliques', () => {
  it('marcar adiciona no fim; desmarcar tira e os números se ajustam', () => {
    let ids = [];
    ids = toggleSelection(ids, 5);
    ids = toggleSelection(ids, 2);
    ids = toggleSelection(ids, 9);
    expect(ids).toEqual([5, 2, 9]);
    expect(selectionNumbers(ids).get(2)).toBe(2);
    ids = toggleSelection(ids, 2);
    expect(ids).toEqual([5, 9]);
    expect(selectionNumbers(ids).get(9)).toBe(2);
    expect(selectionNumbers(ids).has(2)).toBe(false);
  });
  it('não muta o array original', () => {
    const a = [1];
    toggleSelection(a, 2);
    expect(a).toEqual([1]);
  });
});
