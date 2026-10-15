// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { extractPlatformCourses, diagnosePlatformCourses, scrubDiagnosticText, scrubDiagnosticPath } from './platform-courses.js';
import { parseCourseLink } from '../../../api/src/core/platforms.js';

// ATENÇÃO: estas páginas são SIMULADAS a partir do conhecimento dos sites (a leitura logada ainda não foi vista com conta real).
const setPage = (html, url) => {
  window.history.pushState({}, '', url);
  document.body.innerHTML = html;
};

const ALURA_PAGE = `
  <header><span class="user-name">Maria Souza Pereira</span><a href="/user/maria-souza">Meu perfil</a><span>maria.souza@email.com</span></header>
  <nav><a href="https://www.alura.com.br/curso-online-menu-nao-conta">Menu: curso</a></nav>
  <main>
    <section>
      <article class="course-card">
        <img src="https://cdn.alura.com.br/capas/python.png" alt="">
        <a href="https://cursos.alura.com.br/course/python-flask"><h3 class="course-title">Python Flask: crie sites</h3></a>
        <div role="progressbar" aria-valuenow="45" aria-valuemax="100"></div><span>45% concluído</span>
      </article>
      <article class="course-card">
        <a href="https://cursos.alura.com.br/course/java-basico/task/12345"><h3>Java básico</h3></a>
        <span>10 de 40 atividades</span>
        <a href="https://cursos.alura.com.br/course/java-basico/certificate">Certificado</a>
      </article>
      <article class="course-card">
        <a href="https://cursos.alura.com.br/course/git-github">Git e GitHub</a>
        <img src="http://insegura.alura.com.br/x.png">
      </article>
      <article><a href="https://evil.com/course/hack"><h3>Intruso</h3></a></article>
    </section>
  </main>
  <footer><a href="https://www.alura.com.br/curso-online-rodape">rodapé</a></footer>`;

describe('extractPlatformCourses · Alura (página simulada)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('acha os cursos pelo padrão do link, com título, progresso, capa e aulas concluídas', () => {
    setPage(ALURA_PAGE, '/dashboard');
    const items = extractPlatformCourses(document, 'alura');
    expect(items.map((i) => i.title)).toEqual(['Python Flask: crie sites', 'Java básico', 'Git e GitHub']);
    expect(items[0]).toMatchObject({ progress: 45, imageUrl: 'https://cdn.alura.com.br/capas/python.png' });
    expect(items[0].url).toBe('https://cursos.alura.com.br/course/python-flask');
    expect(items[1]).toMatchObject({ progress: 25, doneLessons: 10, totalLessons: 40 });
    expect(items[1].url).toMatch(/^http.*\/course\/java-basico\/task\/12345$/);
    expect(items[2]).toMatchObject({ progress: 0 });
    expect(items[2].imageUrl).toBeUndefined(); // imagem http é descartada
  });

  it('ignora menu e rodapé, links de outros sites e a plataforma errada', () => {
    setPage(ALURA_PAGE, '/dashboard');
    const urls = extractPlatformCourses(document, 'alura').map((i) => i.url).join(' ');
    expect(urls).not.toMatch(/menu-nao-conta|rodape|evil\.com/);
    expect(extractPlatformCourses(document, 'bradesco')).toEqual([]);
    expect(extractPlatformCourses(document, 'coursera')).toEqual([]);
  });

  it('página sem cursos devolve lista vazia', () => {
    setPage('<main><p>Você ainda não começou nenhum curso.</p></main>', '/dashboard');
    expect(extractPlatformCourses(document, 'alura')).toEqual([]);
  });

  it('os links lidos são aceitos pelo importador da API (mesmo padrão de endereço)', () => {
    setPage(ALURA_PAGE, '/dashboard');
    for (const i of extractPlatformCourses(document, 'alura')) expect(parseCourseLink(i.url)?.platform.id, i.url).toBe('alura');
  });
});

describe('extractPlatformCourses · Fundação Bradesco (página simulada)', () => {
  it('lê cartões com /cursos/<slug>, progresso por barra ou por texto', () => {
    setPage(`
      <main>
        <div class="card"><a href="https://www.ev.org.br/cursos/atendimento-ao-publico"><h2>Atendimento ao Público</h2></a><progress value="30" max="100"></progress></div>
        <div class="card"><a href="https://www.ev.org.br/cursos/AI900Azure">AI-900 Fundamentos</a><p>Progresso 80%</p></div>
        <div class="card"><a href="https://www.ev.org.br/cursos/Analise-de-Balan%C3%A7os"><h2>Análise de Balanços</h2></a></div>
        <div><a href="https://www.ev.org.br/cursos">Todos os cursos</a><a href="https://www.ev.org.br/areas-de-interesse">Áreas</a></div>
      </main>`, '/');
    const items = extractPlatformCourses(document, 'bradesco');
    expect(items.map((i) => [i.title, i.progress])).toEqual([['Atendimento ao Público', 30], ['AI-900 Fundamentos', 80], ['Análise de Balanços', 0]]);
    expect(items[0].url).toBe('https://www.ev.org.br/cursos/atendimento-ao-publico');
    for (const i of items) expect(parseCourseLink(i.url)?.platform.id, i.url).toBe('bradesco');
  });
});

describe('diagnóstico (sem dados pessoais)', () => {
  const secret = ['Maria Souza Pereira', 'maria.souza@email.com', 'maria-souza', '123.456.789-09', 'TOKEN_SUPER_SECRETO_ABCDEFGHIJKLMNOPQRSTUV', 'sessao-12345', '11987654321'];

  it('resume contagens, padrões de link e seletores, sem nome, e-mail, CPF, token, parâmetros ou cookies', () => {
    document.cookie = 'sessao=sessao-12345; path=/';
    setPage(`
      <header><span>Olá, Maria Souza Pereira</span><span>maria.souza@email.com</span><a href="/user/maria-souza?token=TOKEN_SUPER_SECRETO_ABCDEFGHIJKLMNOPQRSTUV">Meu perfil</a></header>
      <main>
        <article><a href="https://cursos.alura.com.br/course/python-flask?utm=sessao-12345"><h3>Python Flask 123.456.789-09</h3></a><div role="progressbar" aria-valuenow="10"></div></article>
        <article><a href="https://cursos.alura.com.br/course/maria-souza-123456/x" aria-label="Curso da Maria Souza Pereira maria.souza@email.com">Curso 11987654321 TOKEN_SUPER_SECRETO_ABCDEFGHIJKLMNOPQRSTUV</a></article>
        <article><a href="https://cursos.alura.com.br/course/ola"><span>Olá, Maria</span></a></article>
      </main>`, '/dashboard?email=maria.souza@email.com&token=TOKEN_SUPER_SECRETO_ABCDEFGHIJKLMNOPQRSTUV#sessao-12345');
    const out = diagnosePlatformCourses(document, 'alura');
    for (const s of secret) expect(out, s).not.toContain(s);
    expect(out).not.toMatch(/token|utm|email=|cookie|sessao/i);
    const d = JSON.parse(out);
    expect(d).toMatchObject({ modo: 'meus-cursos', plataforma: 'alura', cursosLidos: 3 });
    expect(d.padroesDeLink.find(([k]) => k === '/course/*')[1]).toBe(3);
    expect(d.seletores.funcionaram).toContain('[role=progressbar]');
    expect(d.seletores.falharam).toContain('progress');
    expect(d.amostra.length).toBeLessThanOrEqual(3);
    for (const a of d.amostra) expect(a.texto.length).toBeLessThanOrEqual(40);
    expect(out.length).toBeLessThan(3000);
    document.cookie = 'sessao=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('funciona também quando não acha nada (para o primeiro ajuste)', () => {
    setPage('<main><p>vazio</p></main>', '/');
    const d = JSON.parse(diagnosePlatformCourses(document, 'bradesco'));
    expect(d).toMatchObject({ plataforma: 'bradesco', cursosLidos: 0, linksTotal: 0, caminho: '/' });
    expect(d.seletores.falharam.length).toBeGreaterThan(0);
  });

  it('ajudantes de limpeza', () => {
    expect(scrubDiagnosticText('Fale com a@b.com ou 123.456.789-09 em https://x.com/a')).toBe('Fale com ou em');
    expect(scrubDiagnosticText('Olá, Daniel')).toBe('');
    expect(scrubDiagnosticText('palavra '.repeat(20), 40)).toHaveLength(40);
    expect(scrubDiagnosticText('x'.repeat(100))).toBe(''); // sequência longa sem espaços pode ser token
    expect(scrubDiagnosticText('ab')).toBe('');
    expect(scrubDiagnosticPath('/course/python-flask/task/9')).toBe('/course/*');
    expect(scrubDiagnosticPath('/dashboard')).toBe('/dashboard');
    expect(scrubDiagnosticPath('/maria123/x')).toBe('/*/*');
    expect(scrubDiagnosticPath('/')).toBe('/');
  });
});
