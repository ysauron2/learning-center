// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({
  api: {
    importPreview: vi.fn(),
    importCourses: vi.fn(),
    linkPreview: vi.fn(),
    importLink: vi.fn(),
    linkPlatforms: vi.fn().mockResolvedValue([
      { id: 'alura', name: 'Alura', hosts: ['alura.com.br'], example: 'https://www.alura.com.br/curso-online-…', note: 'Entram o título e os capítulos.' },
      { id: 'bradesco', name: 'Fundação Bradesco', hosts: ['ev.org.br'], example: null, note: null },
      { id: 'microsoft', name: 'Microsoft Learn', hosts: ['learn.microsoft.com'], example: 'https://learn.microsoft.com/pt-br/training/paths/…', note: 'Aceita trilhas, módulos e certificações.' },
      { id: 'freecodecamp', name: 'freeCodeCamp', hosts: ['freecodecamp.org'], example: null, note: null },
    ]),
    options: vi.fn().mockResolvedValue({ categories: ['Geral', 'Design'].map((name) => ({ name, count: 0, protected: false })), platforms: [] }),
  },
}));
import { api } from '../lib/api.js';
import ImportPlatform from './ImportPlatform.jsx';
import ImportLink from './ImportLink.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const items = [{ title: 'Python Flask', url: 'https://cursos.alura.com.br/course/python-flask', progress: 40 }];
let container;
let root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
  await flush();
}
const fromExtension = (data) => act(async () => {
  window.dispatchEvent(new MessageEvent('message', { data, source: window, origin: window.location.origin }));
});
const text = () => container.textContent;
const buttons = () => [...container.querySelectorAll('button')];
const byText = (t) => buttons().find((b) => b.textContent.includes(t));
const setValue = (el, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
afterEach(async () => {
  await act(async () => { root?.unmount(); }); // tira os ouvintes de mensagem da página de um teste para o outro
  delete window.lcDesktop;
});

describe('importar da Alura / Fundação Bradesco · lista "Meus cursos"', () => {
  it('mostra o título, as abas de plataforma, o passo a passo e o aviso de leitura não verificada', async () => {
    await mount(<ImportPlatform platform="alura" />);
    expect(container.querySelector('h1').textContent).toBe('Importar da Alura');
    const tabs = [...container.querySelectorAll('nav[aria-label="De onde importar"] a')].map((a) => a.textContent);
    expect(tabs).toEqual(['Udemy', 'Alura', 'Fundação Bradesco', 'Colar link de um curso', 'Outras fontes']);
    expect(text()).toContain('Importar meus cursos da Alura');
    expect(text()).toContain('ainda não foi verificada com conta real');
    expect(container.querySelector('#link-url')).not.toBeNull(); // importar por link também está aqui
  });

  it('recebe a lista da extensão, mostra a prévia e importa com a plataforma certa', async () => {
    api.importPreview.mockResolvedValue({ new: [{ title: 'Python Flask', url: 'u', progress: 40, hasImage: false }], existing: [], invalid: [], imagesToFill: 0, progressToUpdate: 0 });
    api.importCourses.mockResolvedValue({ created: 1, skipped: 0, invalid: 0, ids: [1] });
    await mount(<ImportPlatform platform="alura" />);
    await fromExtension({ type: 'lc-import-ext', items, platform: 'alura' });
    expect(api.importPreview).toHaveBeenCalledWith(items.map((i) => ({ ...i })), 'alura');
    expect(text()).toContain('Confira antes de salvar');
    expect(text()).toContain('Python Flask');
    await act(async () => { container.querySelector('button.btn-primary').click(); });
    await flush();
    expect(api.importCourses).toHaveBeenCalledWith(items.map((i) => ({ ...i })), 'Geral', 'alura');
    expect(text()).toContain('1 curso(s) importado(s)');
  });

  it('ignora a lista de outra plataforma (ex.: da Udemy chegando na página da Alura) e mensagens de fora', async () => {
    await mount(<ImportPlatform platform="bradesco" />);
    await fromExtension({ type: 'lc-import-ext', items, platform: 'alura' });
    await fromExtension({ type: 'lc-import-ext', items });
    await fromExtension({ type: 'lc-import-ext', items, platform: 'coursera' });
    // mensagem de outro site (origem diferente) e o favorito da Udemy também não valem aqui
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-import-ext', items, platform: 'bradesco' }, source: window, origin: 'https://evil.com' })); });
    await act(async () => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-import', items }, origin: 'https://www.udemy.com' })); });
    expect(api.importPreview).not.toHaveBeenCalled();
    expect(text()).not.toContain('Confira antes de salvar');
  });

  it('a Udemy continua chamando a API como antes (sem o parâmetro de plataforma)', async () => {
    api.importPreview.mockResolvedValue({ new: [], existing: [{}], invalid: [], imagesToFill: 1 });
    await mount(<ImportPlatform platform="udemy" />);
    await fromExtension({ type: 'lc-import-ext', items });
    expect(api.importPreview).toHaveBeenCalledWith(items.map((i) => ({ ...i })));
    expect(container.querySelector('h1').textContent).toBe('Importar da Udemy');
    expect(container.querySelector('#link-url')).toBeNull(); // a Udemy não tem importar por link
  });

  it('erro da API aparece em português e nada é gravado', async () => {
    api.importPreview.mockRejectedValue(Object.assign(new Error('O Lume não conseguiu falar com o servidor.'), { status: 500 }));
    await mount(<ImportPlatform platform="alura" />);
    await fromExtension({ type: 'lc-import-ext', items, platform: 'alura' });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(api.importCourses).not.toHaveBeenCalled();
  });

  it('no desktop mostra o passo a passo da janela e o botão abre a plataforma pela ponte', async () => {
    const openPlatform = vi.fn();
    window.lcDesktop = { isDesktop: true, openPlatform };
    await mount(<ImportPlatform platform="bradesco" />);
    expect(text()).toContain('Importar pela janela da Fundação Bradesco');
    expect(text()).toContain('ainda não foi verificada com conta real');
    expect(text()).not.toContain('brave://extensions');
    await act(async () => { byText('Abrir a Fundação Bradesco').click(); });
    expect(openPlatform).toHaveBeenCalledWith('bradesco');
  });
});

describe('importar por link', () => {
  const preview = {
    platform: 'alura', title: 'JavaScript I: algoritmos', url: 'https://www.alura.com.br/curso-online-x', description: 'Aprenda.\n\nCarga horária: 8h', instructor: 'Fulana',
    workloadMin: 480, imageUrl: 'https://www.alura.com.br/a.png', moduleCount: 2, lessonCount: 3,
    modules: [{ title: 'Cap 1', lessons: [{ title: 'Apresentação', durationMin: 0 }, { title: '<b>x</b>', durationMin: 0 }] }, { title: 'Cap 2', lessons: [{ title: 'Fim', durationMin: 0 }] }],
    warnings: [], existing: null,
  };

  it('cola, vê a prévia (tudo como texto), escolhe a categoria e importa', async () => {
    api.linkPreview.mockResolvedValue(preview);
    api.importLink.mockResolvedValue({ created: true, courseId: 7, title: preview.title, lessonsAdded: 3, warnings: [] });
    await mount(<ImportLink />);
    expect(container.querySelector('h1').textContent).toBe('Colar link de um curso');
    expect(byText('Ver prévia').disabled).toBe(true);
    await setValue(container.querySelector('#link-url'), ' https://www.alura.com.br/curso-online-x ');
    await act(async () => { byText('Ver prévia').click(); });
    await flush();
    expect(api.linkPreview).toHaveBeenCalledWith('https://www.alura.com.br/curso-online-x');
    expect(text()).toContain('JavaScript I: algoritmos');
    expect(text()).toContain('8h de carga horária');
    expect(text()).toContain('2 módulo(s) · 3 aula(s)');
    // HTML vindo do site NÃO vira elemento
    expect(container.querySelector('b')).toBeNull();
    expect(text()).toContain('<b>x</b>');
    expect(container.querySelector('#link-category').value).toBe('Geral');
    await act(async () => { byText('Importar curso').click(); });
    await flush();
    expect(api.importLink).toHaveBeenCalledWith('https://www.alura.com.br/curso-online-x', 'Geral');
    expect(text()).toContain('Curso criado');
    expect(container.querySelector('a[href="/cursos/7"]')).not.toBeNull();
  });

  it('curso que já existe: avisa, não pede categoria e o botão vira "Atualizar curso"', async () => {
    api.linkPreview.mockResolvedValue({ ...preview, existing: { id: 3, title: 'Meu curso', newLessons: 2 } });
    api.importLink.mockResolvedValue({ created: false, courseId: 3, title: 'Meu curso', lessonsAdded: 2, warnings: [] });
    await mount(<ImportLink />);
    await setValue(container.querySelector('#link-url'), 'https://www.alura.com.br/curso-online-x');
    await act(async () => { byText('Ver prévia').click(); });
    await flush();
    expect(text()).toContain('Esse curso já está no Lume');
    expect(text()).toContain('2 aula(s) nova(s)');
    expect(container.querySelector('#link-category')).toBeNull();
    await act(async () => { byText('Atualizar curso').click(); });
    await flush();
    expect(api.importLink).toHaveBeenCalledWith('https://www.alura.com.br/curso-online-x', undefined);
    expect(text()).toContain('Curso atualizado');
  });

  it('sem aulas na página: mostra o aviso e depois o atalho para "Colar lista de aulas"', async () => {
    const warn = 'Não encontrei as aulas nessa página. O curso será criado sem aulas.';
    api.linkPreview.mockResolvedValue({ ...preview, modules: [], moduleCount: 0, lessonCount: 0, warnings: [warn] });
    api.importLink.mockResolvedValue({ created: true, courseId: 9, title: 'X', lessonsAdded: 0, warnings: [warn] });
    await mount(<ImportLink />);
    await setValue(container.querySelector('#link-url'), 'https://www.ev.org.br/cursos/x');
    await act(async () => { byText('Ver prévia').click(); });
    await flush();
    expect(text()).toContain(warn);
    await act(async () => { byText('Importar curso').click(); });
    await flush();
    expect([...container.querySelectorAll('a[href="/importar-outras"]')].map((a) => a.textContent)).toContain('Colar lista de aulas');
  });

  it('erro (link inválido, página que não abre) aparece com a mensagem em português e não grava', async () => {
    api.linkPreview.mockRejectedValue(Object.assign(new Error('Esse link não parece ser de um curso de uma plataforma aceita.'), { status: 400 }));
    await mount(<ImportLink />);
    await setValue(container.querySelector('#link-url'), 'https://evil.com/x');
    await act(async () => { byText('Ver prévia').click(); });
    await flush();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Esse link não parece ser de um curso de uma plataforma aceita.');
    expect(api.importLink).not.toHaveBeenCalled();
    expect(byText('Ver prévia').disabled).toBe(false);
  });

  it('é acessível: campo com rótulo, estado de carregando e foco no título da prévia', async () => {
    let finish;
    api.linkPreview.mockReturnValue(new Promise((r) => { finish = r; }));
    await mount(<ImportLink />);
    const input = container.querySelector('#link-url');
    expect(container.querySelector('label[for="link-url"]').textContent).toBe('Link do curso');
    await setValue(input, 'https://www.alura.com.br/curso-online-x');
    await act(async () => { byText('Ver prévia').click(); });
    expect(byText('Lendo a página…').disabled).toBe(true);
    await act(async () => { finish(preview); });
    await flush();
    expect(document.activeElement.textContent).toBe('JavaScript I: algoritmos');
  });
});

describe('importar por link · plataformas aceitas (vêm da API)', () => {
  const msPreview = {
    platform: 'microsoft', platformName: 'Microsoft Learn', title: 'Introdução à IA no Azure', url: 'https://learn.microsoft.com/pt-br/training/modules/x/', description: 'Resumo.',
    workloadMin: 56, imageUrl: null, moduleCount: 1, lessonCount: 2,
    modules: [{ title: 'Módulo <i>1</i>', lessons: [{ title: 'Introdução', durationMin: 3 }, { title: 'Exercício', durationMin: 30 }] }],
    warnings: [], existing: null,
  };

  it('lista os sites aceitos a partir do que a API devolveu e a frase da página não cita plataformas fixas', async () => {
    await mount(<ImportLink />);
    expect(api.linkPlatforms).toHaveBeenCalled();
    const items = [...container.querySelectorAll('details li')].map((li) => li.querySelector('strong').textContent);
    expect(items).toEqual(['Alura', 'Fundação Bradesco', 'Microsoft Learn', 'freeCodeCamp']);
    expect(text()).toContain('Aceita trilhas, módulos e certificações.');
    expect(container.querySelector('.page-sub').textContent).not.toMatch(/Alura|Bradesco/);
  });

  it('reconhece o site pelo endereço, com ou sem https, subdomínio e espaços, e avisa quando não conhece', async () => {
    await mount(<ImportLink />);
    const input = container.querySelector('#link-url');
    expect(container.querySelector('[role="status"]')).toBeNull();
    await setValue(input, ' learn.microsoft.com/pt-br/training/paths/x/ ');
    expect(container.querySelector('[role="status"]').textContent).toBe('Site reconhecido: Microsoft Learn.');
    await setValue(input, 'https://www.freecodecamp.org/learn/javascript-v9');
    expect(container.querySelector('[role="status"]').textContent).toBe('Site reconhecido: freeCodeCamp.');
    await setValue(input, 'https://learn.microsoft.com.evil.com/x');
    expect(container.querySelector('[role="status"]').textContent).toBe('Não reconheci esse site. Aceitamos links de: Alura, Fundação Bradesco, Microsoft Learn e freeCodeCamp.');
    await setValue(input, 'isso não é um endereço');
    expect(container.querySelector('[role="status"]').textContent).toContain('Não reconheci esse site');
  });

  it('prévia de uma plataforma nova mostra o nome dela e o texto do site continua sendo só texto', async () => {
    api.linkPreview.mockResolvedValue(msPreview);
    api.importLink.mockResolvedValue({ created: true, courseId: 4, title: msPreview.title, lessonsAdded: 2, warnings: [] });
    await mount(<ImportLink />);
    await setValue(container.querySelector('#link-url'), 'https://learn.microsoft.com/pt-br/training/modules/x/');
    await act(async () => { byText('Ver prévia').click(); });
    await flush();
    expect(text()).toContain('Microsoft Learn · 56min de carga horária · 1 módulo(s) · 2 aula(s)');
    expect(text()).toContain('Módulo <i>1</i>');
    expect(container.querySelector('summary i')).toBeNull();
    await act(async () => { byText('Importar curso').click(); });
    await flush();
    expect(api.importLink).toHaveBeenCalledWith('https://learn.microsoft.com/pt-br/training/modules/x/', 'Geral');
    expect(text()).toContain('Curso criado');
  });

  it('se a lista de sites não carregar, a tela continua funcionando sem o reconhecimento', async () => {
    api.linkPlatforms.mockRejectedValueOnce(new Error('sem rede'));
    await mount(<ImportLink />);
    await setValue(container.querySelector('#link-url'), 'https://learn.microsoft.com/pt-br/training/paths/x/');
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(byText('Ver prévia').disabled).toBe(false);
  });

  it('mostra a mensagem de link inválido que a API devolve (específica de cada site)', async () => {
    const msg = 'Esse link não parece ser de um curso da Microsoft Learn.';
    api.linkPreview.mockRejectedValue(Object.assign(new Error(msg), { status: 400 }));
    await mount(<ImportLink />);
    await setValue(container.querySelector('#link-url'), 'https://learn.microsoft.com/pt-br/training/');
    await act(async () => { byText('Ver prévia').click(); });
    await flush();
    expect(container.querySelector('[role="alert"]').textContent).toContain(msg);
  });
});
