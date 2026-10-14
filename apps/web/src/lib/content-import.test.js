import { describe, it, expect } from 'vitest';
import { parseContentMessage, matchCourse, countLessons } from './content-import.js';

const ev = (data, over = {}) => ({ source: 'W', origin: 'http://localhost:3000', data, ...over });
const ok = {
  type: 'lc-content-ext',
  content: {
    title: 'Curso Y', url: 'https://www.udemy.com/course/curso-y/',
    modules: [{ title: 'M1', lessons: [{ title: 'A', durationMin: 5, completed: true }, { title: 'B', durationMin: 'x', completed: 'sim' }] }],
  },
};

describe('parseContentMessage', () => {
  it('aceita só da própria página e normaliza os campos', () => {
    const r = parseContentMessage(ev(ok), 'http://localhost:3000', 'W');
    expect(r.title).toBe('Curso Y');
    expect(r.modules[0].lessons).toEqual([
      { title: 'A', durationMin: 5, completed: true },
      { title: 'B', durationMin: 0, completed: false },
    ]);
    expect(parseContentMessage(ev(ok, { origin: 'https://evil.com' }), 'http://localhost:3000', 'W')).toBeNull();
    expect(parseContentMessage(ev(ok, { source: 'X' }), 'http://localhost:3000', 'W')).toBeNull();
    expect(parseContentMessage(ev({ type: 'outro' }), 'http://localhost:3000', 'W')).toBeNull();
  });
  it('descarta itens malformados e módulos sem aulas', () => {
    const bad = { type: 'lc-content-ext', content: { title: 1, url: null, modules: [null, { title: 'X', lessons: 'x' }, { title: 'Vazio', lessons: [] }, { title: 'M', lessons: [{ title: 5 }, null, { title: 'ok' }] }] } };
    const r = parseContentMessage(ev(bad), 'http://localhost:3000', 'W');
    expect(r.modules).toEqual([{ title: 'M', lessons: [{ title: 'ok', durationMin: 0, completed: false }] }]);
    expect(r.title).toBe('');
    expect(parseContentMessage(ev({ type: 'lc-content-ext', content: { modules: [] } }), 'http://localhost:3000', 'W')).toBeNull();
  });
  it('limita tamanho (módulos e aulas)', () => {
    const many = { type: 'lc-content-ext', content: { title: 't', url: 'u', modules: Array.from({ length: 300 }, (_, i) => ({ title: `M${i}`, lessons: [{ title: 'a' }] })) } };
    expect(parseContentMessage(ev(many), 'http://localhost:3000', 'W').modules).toHaveLength(200);
  });
});

describe('matchCourse', () => {
  const courses = [
    { id: 1, title: 'Desenvolvimento Web Completo - 20 cursos', url: 'https://www.udemy.com/course-dashboard-redirect/?course_id=1' },
    { id: 2, title: 'Python Completo', url: 'https://www.udemy.com/course/python-completo/' },
    { id: 3, title: 'Docker', url: null },
  ];
  it('casa pelo endereço (slug) primeiro', () => {
    expect(matchCourse(courses, { title: 'Qualquer', url: 'https://www.udemy.com/course/python-completo/' })).toBe(2);
  });
  it('senão pelo título, ignorando maiúsculas e acentos', () => {
    expect(matchCourse(courses, { title: 'DESENVOLVIMENTO web completo - 20 cursos', url: 'https://www.udemy.com/course/x/' })).toBe(1);
    expect(matchCourse(courses, { title: 'docker', url: '' })).toBe(3);
  });
  it('título contido em outro só vale se for único; ambíguo ou sem relação dá null', () => {
    expect(matchCourse(courses, { title: 'Desenvolvimento Web Completo', url: '' })).toBe(1);
    const dup = [{ id: 1, title: 'Python Básico', url: null }, { id: 2, title: 'Python Avançado', url: null }];
    expect(matchCourse(dup, { title: 'Python', url: '' })).toBeNull();
    expect(matchCourse(courses, { title: 'Culinária', url: '' })).toBeNull();
  });
});

describe('countLessons', () => {
  it('soma aulas de todos os módulos', () => {
    expect(countLessons([{ lessons: [1, 2] }, { lessons: [3] }])).toBe(3);
    expect(countLessons([])).toBe(0);
  });
});
