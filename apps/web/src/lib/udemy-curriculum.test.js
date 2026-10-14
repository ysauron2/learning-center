// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractUdemyCurriculum } from './udemy-curriculum.js';

const page = (html, title = 'Curso Teste | Udemy') => {
  document.title = title;
  document.body.innerHTML = html;
  window.history.pushState({}, '', '/course/curso-teste/learn/lecture/123');
  return document;
};

const withDataPurpose = `
  <h1 data-purpose="course-header-title">Curso Teste</h1>
  <div data-purpose="curriculum-section-container">
    <div data-purpose="section-panel-0">
      <button aria-expanded="true"><span data-purpose="section-heading">Seção 1: Introdução</span><span>2 / 3 | 28min</span></button>
      <ul>
        <li data-purpose="curriculum-item-0-0"><label><input type="checkbox" checked><span>1. Boas-vindas</span></label><span>3min</span></li>
        <li data-purpose="curriculum-item-0-1"><label><input type="checkbox" checked><span>2. Instalação</span></label><span>10min</span></li>
        <li data-purpose="curriculum-item-0-2"><label><input type="checkbox"><span>3. Primeiro app</span></label><span>1h 5min</span></li>
      </ul>
    </div>
    <div data-purpose="section-panel-1">
      <button aria-expanded="true"><span data-purpose="section-heading">Seção 2: Avançado</span><span>0 / 1 | 12:30</span></button>
      <ul><li data-purpose="curriculum-item-1-0"><label><input type="checkbox"><span>Tópicos avançados</span></label><span>12:30</span></li></ul>
    </div>
  </div>`;

describe('extractUdemyCurriculum', () => {
  it('lê seções, aulas, durações e concluídas (marcação com data-purpose)', () => {
    const r = extractUdemyCurriculum(page(withDataPurpose));
    expect(r.title).toBe('Curso Teste');
    expect(r.url).toMatch(/\/course\/curso-teste\/$/);
    expect(r.modules.map((m) => m.title)).toEqual(['Seção 1: Introdução', 'Seção 2: Avançado']);
    expect(r.modules[0].lessons).toEqual([
      { title: 'Boas-vindas', durationMin: 3, completed: true },
      { title: 'Instalação', durationMin: 10, completed: true },
      { title: 'Primeiro app', durationMin: 65, completed: false },
    ]);
    expect(r.modules[1].lessons).toEqual([{ title: 'Tópicos avançados', durationMin: 13, completed: false }]);
  });

  it('funciona sem data-purpose: cabeçalho h3 + lista com caixas de seleção', () => {
    const r = extractUdemyCurriculum(page(`
      <h3>Seção 1: Básico</h3>
      <ul><li><input type="checkbox" checked><span>Aula A</span><span>5min</span></li>
          <li><input type="checkbox"><span>Aula B</span><span>7min</span></li></ul>
      <h3>Módulo 2: Prática</h3>
      <ul><li><input type="checkbox"><span>Aula C</span></li></ul>`, 'Outro Curso - Udemy'));
    expect(r.title).toBe('Outro Curso');
    expect(r.modules.map((m) => [m.title, m.lessons.map((l) => [l.title, l.durationMin, l.completed])])).toEqual([
      ['Seção 1: Básico', [['Aula A', 5, true], ['Aula B', 7, false]]],
      ['Módulo 2: Prática', [['Aula C', 0, false]]],
    ]);
  });

  it('sem cabeçalhos agrupa tudo num módulo "Conteúdo"', () => {
    const r = extractUdemyCurriculum(page('<ul><li><input type="checkbox"><span>Primeira</span></li><li><input type="checkbox" checked><span>Segunda</span></li></ul>'));
    expect(r.modules).toEqual([{ title: 'Conteúdo', lessons: [
      { title: 'Primeira', durationMin: 0, completed: false },
      { title: 'Segunda', durationMin: 0, completed: true },
    ] }]);
  });

  it('entende "concluída" por aria-checked e ignora texto de ruído', () => {
    const r = extractUdemyCurriculum(page(`
      <h2>Seção 1</h2>
      <div data-purpose="curriculum-item-0-0"><div role="checkbox" aria-checked="true"></div><span>1 / 3</span><span>Aula com aria</span><span>Recursos</span><span>8min</span></div>`));
    expect(r.modules[0].lessons).toEqual([{ title: 'Aula com aria', durationMin: 8, completed: true }]);
  });

  it('o contador "2 / 3 | 28min" do cabeçalho não entra no título da seção', () => {
    const r = extractUdemyCurriculum(page(`
      <button aria-expanded="true">Seção 1: Teste 2 / 3 | 28min</button>
      <ul><li><input type="checkbox"><span>A</span></li><li><input type="checkbox"><span>B</span></li></ul>`));
    expect(r.modules[0].title).toBe('Seção 1: Teste');
  });

  it('caixa de seleção solta (banner, filtro) não vira aula', () => {
    const r = extractUdemyCurriculum(page('<div class="cookies"><label><input type="checkbox"> Aceitar tudo</label></div><main><p>vídeo</p></main>'));
    expect(r.modules).toEqual([]);
  });

  it('página sem aulas devolve módulos vazios', () => {
    expect(extractUdemyCurriculum(page('<p>nada aqui</p>')).modules).toEqual([]);
  });

  it('funciona depois de serializada com toString (como na extensão)', () => {
    const copy = new Function(`return (${extractUdemyCurriculum.toString()})`)();
    const r = copy(page(withDataPurpose));
    expect(r.modules).toHaveLength(2);
    expect(r.modules[0].lessons).toHaveLength(3);
  });
});
