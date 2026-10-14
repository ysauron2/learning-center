// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractUdemyCourses } from './udemy-extractor.js';

const page = (html) => {
  document.body.innerHTML = html;
  return document;
};

describe('extractUdemyCourses', () => {
  it('lê título, link e progresso de cartões típicos (imagem + título + barra)', () => {
    const items = extractUdemyCourses(page(`
      <div class="grid">
        <div class="card">
          <a href="/course/python-completo/learn/"><img alt=""></a>
          <h3><a href="/course/python-completo/learn/">Python Completo do Zero</a></h3>
          <div data-purpose="instructor">Maria Silva</div>
          <div role="progressbar" aria-valuenow="45"></div><span>45% concluído</span>
        </div>
        <div class="card">
          <a href="https://www.udemy.com/course/docker-na-pratica/"><span>Docker na Prática</span></a>
          <a href="/course/docker-na-pratica/">Iniciar curso</a>
        </div>
      </div>`));
    expect(items).toEqual([
      { title: 'Python Completo do Zero', url: expect.stringContaining('/course/python-completo/'), progress: 45, instructor: 'Maria Silva' },
      { title: 'Docker na Prática', url: 'https://www.udemy.com/course/docker-na-pratica/', progress: 0 },
    ]);
  });

  it('lê cartões do painel que apontam para course-dashboard-redirect?course_id=', () => {
    const items = extractUdemyCourses(page(`
      <div>
        <div><a href="https://www.udemy.com/course-dashboard-redirect/?course_id=111"><img alt=""></a>
          <h3><a href="https://www.udemy.com/course-dashboard-redirect/?course_id=111">Fundamentos de Segurança</a></h3>
          <p>Elias Sousa</p><div>9% concluído</div></div>
        <div><a href="https://www.udemy.com/course-dashboard-redirect/?course_id=222"><h3>Web Frontend</h3></a><div>COMEÇAR CURSO</div></div>
      </div>`));
    expect(items).toEqual([
      { title: 'Fundamentos de Segurança', url: 'https://www.udemy.com/course-dashboard-redirect/?course_id=111', progress: 9 },
      { title: 'Web Frontend', url: 'https://www.udemy.com/course-dashboard-redirect/?course_id=222', progress: 0 },
    ]);
  });

  it('usa a porcentagem do texto quando não há barra de progresso', () => {
    const items = extractUdemyCourses(page(`
      <section><div><a href="/course/redes/"><h4>Redes de Computadores</h4></a><p>100% concluído</p></div></section>`));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Redes de Computadores', progress: 100 });
  });

  it('um curso por slug, mesmo com vários links; não mistura cartões vizinhos', () => {
    const items = extractUdemyCourses(page(`
      <div><div><a href="/course/a/"><h3>Curso A</h3></a><a href="/course/a/learn/">Continuar</a><span>10%</span></div>
      <div><a href="/course/b/"><h3>Curso B</h3></a><span>90%</span></div></div>`));
    expect(items.map((i) => [i.title, i.progress])).toEqual([['Curso A', 10], ['Curso B', 90]]);
  });

  it('ignora links que não são de curso e página sem cursos devolve lista vazia', () => {
    expect(extractUdemyCourses(page('<a href="/user/x/">Perfil</a><a href="/courses/search/">Buscar</a>'))).toEqual([]);
    expect(extractUdemyCourses(page('<p>nada</p>'))).toEqual([]);
  });

  it('limita progresso a 0–100 e título a 160 caracteres', () => {
    const items = extractUdemyCourses(page(`
      <div><a href="/course/x/"><h3>${'T'.repeat(300)}</h3></a><div aria-valuenow="250"></div></div>`));
    expect(items[0].progress).toBe(100);
    expect(items[0].title).toHaveLength(160);
  });

  it('funciona após ser serializada com toString (como no favorito)', () => {
    const copy = new Function(`return (${extractUdemyCourses.toString()})`)();
    const items = copy(page('<div><a href="/course/z/"><h3>Z</h3></a><span>5%</span></div>'));
    expect(items).toEqual([{ title: 'Z', url: expect.stringContaining('/course/z/'), progress: 5 }]);
  });
});
