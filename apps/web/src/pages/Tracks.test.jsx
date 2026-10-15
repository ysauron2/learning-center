// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({
  api: {
    tracks: vi.fn(), track: vi.fn(), courses: vi.fn(), createTrack: vi.fn(), updateTrack: vi.fn(), deleteTrack: vi.fn(),
    addTrackItem: vi.fn(), updateTrackItem: vi.fn(), removeTrackItem: vi.fn(), reorderTrack: vi.fn(),
  },
}));
import { api } from '../lib/api.js';
import Tracks from './Tracks.jsx';
import TrackDetail from './TrackDetail.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const item = (over) => ({ id: 1, position: 1, kind: 'course', title: 'Redes', courseId: 3, course: { id: 3, title: 'Redes', platform: 'Udemy', category: 'Redes', status: 'active', progress: 40, imageUrl: null }, progress: 40, status: 'active', isNext: true, doneAt: null, ...over });
const trackWith = (items, over = {}) => ({
  id: 5, title: 'Cibersegurança', description: 'Do zero ao Security+', totalItems: items.length,
  doneItems: items.filter((i) => i.status === 'done').length, progress: 40,
  next: items.find((i) => i.isNext) ? { itemId: 2, title: items.find((i) => i.isNext).title, courseId: items.find((i) => i.isNext).courseId } : null,
  createdAt: 'x', updatedAt: 'x', items, ...over,
});
const THREE = () => [
  item({ id: 1, position: 1, title: 'Redes', status: 'done', progress: 100, isNext: false }),
  item({ id: 2, position: 2, title: 'Linux', courseId: 4, course: { id: 4, title: 'Linux', platform: 'Alura', category: 'Linux', status: 'active', progress: 30, imageUrl: null }, progress: 30, status: 'active', isNext: true }),
  { id: 3, position: 3, kind: 'step', title: 'Prova Security+', courseId: null, course: null, progress: 0, status: 'todo', isNext: false, doneAt: null },
];
const COURSES = [
  { id: 3, title: 'Redes 1', platform: 'Udemy', category: 'Redes', status: 'completed', progress: 100 },
  { id: 4, title: 'Redes 2', platform: 'Udemy', category: 'Redes', status: 'active', progress: 40 },
  { id: 6, title: 'Python', platform: 'Alura', category: 'Geral', status: 'planned', progress: 0 },
];

let container;
let where;
function Spy() { where = useLocation(); return null; }
async function mount(path, routes) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(<MemoryRouter initialEntries={[path]}><Spy /><Routes>{routes}</Routes></MemoryRouter>);
  });
  await flush();
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const q = (sel) => document.body.querySelector(sel);
const btn = (text) => [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const setValue = async (el, value) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const submit = async (form) => { await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };

beforeEach(() => {
  document.body.innerHTML = '';
  try { localStorage.clear(); } catch { /* ignora */ }
  vi.clearAllMocks();
  api.courses.mockResolvedValue(COURSES);
});

describe('Trilhas · lista', () => {
  const routes = [<Route key="l" path="/trilhas" element={<Tracks />} />, <Route key="d" path="/trilhas/:id" element={<div id="detail" />} />];

  it('mostra cada trilha com etapas feitas, progresso e a próxima etapa', async () => {
    api.courses.mockResolvedValue([]);
    api.tracks.mockResolvedValue([
      { id: 5, title: 'Cibersegurança', description: 'Do zero ao Security+', totalItems: 3, doneItems: 1, progress: 43, next: { itemId: 2, title: 'Linux', courseId: 4 } },
      { id: 6, title: 'Vazia', description: '', totalItems: 0, doneItems: 0, progress: 0, next: null },
      { id: 7, title: 'Pronta', description: '', totalItems: 2, doneItems: 2, progress: 100, next: null },
    ]);
    await mount('/trilhas', routes);
    const cards = [...document.querySelectorAll('.track-card')];
    expect(cards).toHaveLength(3);
    expect(cards[0].textContent).toContain('1 de 3 etapas');
    expect(cards[0].textContent).toContain('43%');
    expect(cards[0].textContent).toContain('Próxima: Linux');
    expect(cards[0].querySelector('a[href="/trilhas/5"]')).not.toBeNull();
    expect(cards[1].textContent).toContain('Sem etapas ainda');
    expect(cards[2].textContent).toContain('Trilha concluída!');
  });

  it('sem trilhas: explica o que é, mostra um exemplo e ensina a criar em 3 passos', async () => {
    api.courses.mockResolvedValue([]);
    api.tracks.mockResolvedValue([]);
    await mount('/trilhas', routes);
    const intro = q('[aria-label="O que é uma trilha"]');
    expect(intro.textContent).toContain('O que é uma trilha?');
    expect(intro.textContent).toContain('roteiro');
    expect(intro.textContent).toContain('avança sozinha');
    expect(intro.querySelectorAll('.track-howto li')).toHaveLength(3);
    expect(intro.textContent).toContain('Para ver funcionando');
    expect(q('.track-example').getAttribute('aria-label')).toContain('Exemplo de trilha');
    expect(q('.track-example').textContent).toContain('EXEMPLO');
    expect(btn('Criar minha primeira trilha')).toBeDefined();
  });

  it('com trilhas já criadas, a explicação some (não atrapalha)', async () => {
    api.courses.mockResolvedValue([]);
    api.tracks.mockResolvedValue([{ id: 5, title: 'T', description: '', totalItems: 0, doneItems: 0, progress: 0, next: null }]);
    await mount('/trilhas', routes);
    expect(q('[aria-label="O que é uma trilha"]')).toBeNull();
  });

  it('sugere trilhas a partir das categorias dos cursos e cria com um clique, já na ordem certa', async () => {
    api.tracks.mockResolvedValue([]);
    api.createTrack.mockResolvedValue({ id: 8 });
    await mount('/trilhas', routes);
    const sug = q('[aria-label="Sugestões de trilha"]');
    expect(sug.textContent).toContain('Trilha de Redes');
    expect(sug.textContent).toContain('Redes 1 → Redes 2'); // concluído antes do em andamento
    expect(sug.textContent).not.toContain('Trilha de Geral');
    await act(async () => { btn('Criar esta trilha').click(); });
    await flush();
    expect(api.createTrack).toHaveBeenCalledWith({ title: 'Trilha de Redes', courseIds: [3, 4] });
    expect(where.pathname).toBe('/trilhas/8');
  });

  it('"Ajustar antes" abre o assistente já preenchido', async () => {
    api.tracks.mockResolvedValue([]);
    await mount('/trilhas', routes);
    await act(async () => { btn('Ajustar antes').click(); });
    expect(q('#tw-title').value).toBe('Trilha de Redes');
    expect([...document.querySelectorAll('.wizard-num')].map((n) => n.textContent).filter(Boolean)).toEqual(['1', '2']);
    expect(btn('Criar trilha com 2 cursos')).toBeDefined();
  });

  it('erro ao criar pela sugestão aparece na tela', async () => {
    api.tracks.mockResolvedValue([]);
    api.createTrack.mockRejectedValue(new Error('Curso inexistente.'));
    await mount('/trilhas', routes);
    await act(async () => { btn('Criar esta trilha').click(); });
    await flush();
    expect(q('[role="alert"]').textContent).toContain('Curso inexistente.');
    expect(where.pathname).toBe('/trilhas');
  });

  it('não repete a sugestão de uma trilha que já existe', async () => {
    api.tracks.mockResolvedValue([{ id: 5, title: 'Trilha de Redes', description: '', totalItems: 2, doneItems: 0, progress: 0, next: null }]);
    await mount('/trilhas', routes);
    expect(q('[aria-label="Sugestões de trilha"]')).toBeNull();
  });
});

describe('Trilhas · assistente de criação', () => {
  const routes = [<Route key="l" path="/trilhas" element={<Tracks />} />, <Route key="d" path="/trilhas/:id" element={<div id="detail" />} />];
  const open = async () => { api.tracks.mockResolvedValue([]); await mount('/trilhas', routes); await act(async () => { btn('Criar trilha').click(); }); };

  it('explica em palavras simples e mostra os cursos para marcar', async () => {
    await open();
    expect(q('.modal, [role="dialog"]').textContent).toContain('Uma trilha é a ordem em que você quer fazer seus cursos');
    expect([...document.querySelectorAll('.wizard-course strong')].map((e) => e.textContent)).toEqual(['Redes 1', 'Redes 2', 'Python']);
    expect(document.body.textContent).toContain('Marque os cursos, na ordem em que quer fazer');
  });

  it('o número mostra a ordem dos cliques; desmarcar renumera; o botão diz quantos cursos', async () => {
    await open();
    const boxes = () => [...document.querySelectorAll('.wizard-course input[type="checkbox"]')];
    await act(async () => { boxes()[2].click(); });
    await act(async () => { boxes()[0].click(); });
    await act(async () => { boxes()[1].click(); });
    expect([...document.querySelectorAll('.wizard-num')].map((n) => n.textContent)).toEqual(['2', '3', '1']);
    expect(btn('Criar trilha com 3 cursos')).toBeDefined();
    await act(async () => { boxes()[2].click(); }); // desmarca o primeiro marcado (Python)
    expect([...document.querySelectorAll('.wizard-num')].map((n) => n.textContent)).toEqual(['1', '2', '']);
  });

  it('cria com o nome e os cursos na ordem marcada, e abre a trilha nova', async () => {
    api.createTrack.mockResolvedValue({ id: 8 });
    await open();
    await setValue(q('#tw-title'), 'Quero aprender Redes');
    const boxes = [...document.querySelectorAll('.wizard-course input[type="checkbox"]')];
    await act(async () => { boxes[1].click(); });
    await act(async () => { boxes[0].click(); });
    await submit(q('#tw-title').closest('form'));
    expect(api.createTrack).toHaveBeenCalledWith({ title: 'Quero aprender Redes', courseIds: [4, 3] });
    expect(where.pathname).toBe('/trilhas/8');
  });

  it('dá para criar uma trilha vazia e os atalhos preenchem nome e cursos', async () => {
    api.createTrack.mockResolvedValue({ id: 9 });
    await open();
    await act(async () => { btn('Trilha de Redes · 2 cursos').click(); });
    expect(q('#tw-title').value).toBe('Trilha de Redes');
    await setValue(q('#tw-title'), 'Só o nome');
    const boxes = [...document.querySelectorAll('.wizard-course input[type="checkbox"]')];
    await act(async () => { boxes[0].click(); boxes[1].click(); }); // desmarca os dois do atalho
    await submit(q('#tw-title').closest('form'));
    expect(api.createTrack).toHaveBeenCalledWith({ title: 'Só o nome', courseIds: [] });
  });

  it('sem nome mostra o erro da API no campo e mantém o assistente aberto', async () => {
    api.createTrack.mockRejectedValue(Object.assign(new Error('Dados inválidos.'), { details: [{ path: 'title', message: 'Informe um título.' }] }));
    await open();
    await submit(q('#tw-title').closest('form'));
    expect(q('.error-text').textContent).toBe('Informe um título.');
    expect(q('#tw-title')).not.toBeNull();
  });

  it('sem nenhum curso cadastrado, explica o que fazer', async () => {
    api.courses.mockResolvedValue([]);
    api.tracks.mockResolvedValue([]);
    await mount('/trilhas', routes);
    await act(async () => { btn('Criar trilha').click(); });
    const t = document.body.textContent;
    expect(t).toContain('Você ainda não tem cursos');
    expect(q('a[href="/importar"]')).not.toBeNull();
    expect(q('a[href="/cursos"]')).not.toBeNull();
    expect(btn('Criar trilha')).toBeDefined();
  });

  it('cancelar fecha sem criar nada', async () => {
    await open();
    await act(async () => { btn('Cancelar').click(); });
    expect(q('#tw-title')).toBeNull();
    expect(api.createTrack).not.toHaveBeenCalled();
  });
});

describe('Trilhas · detalhe', () => {
  const routes = [<Route key="d" path="/trilhas/:id" element={<TrackDetail />} />, <Route key="l" path="/trilhas" element={<div id="list" />} />];
  const steps = () => [...document.querySelectorAll('.track-step')];

  it('mostra as etapas em ordem com status, próxima etapa e progresso', async () => {
    api.track.mockResolvedValue(trackWith(THREE(), { progress: 43, doneItems: 1 }));
    await mount('/trilhas/5', routes);
    expect(api.track).toHaveBeenCalledWith(5);
    expect(steps()).toHaveLength(3);
    expect(steps()[0].textContent).toContain('Concluída');
    expect(steps()[1].textContent).toContain('Em andamento');
    expect(steps()[1].textContent).toContain('Próxima');
    expect(steps()[1].getAttribute('aria-current')).toBe('step');
    expect(steps()[2].textContent).toContain('Etapa avulsa');
    expect(steps()[0].querySelector('a[href="/cursos/3"]')).not.toBeNull();
    expect(document.body.textContent).toContain('1 de 3 etapas concluídas');
    expect(document.body.textContent).toContain('Próxima etapa: Linux');
  });

  it('tem botão claro para continuar na próxima etapa e "Abrir o curso" em cada curso', async () => {
    api.track.mockResolvedValue(trackWith(THREE()));
    await mount('/trilhas/5', routes);
    const cont = q('a.btn-primary[href="/cursos/4"]');
    expect(cont.textContent).toBe('Continuar: Linux');
    const opens = [...document.querySelectorAll('a')].filter((a) => a.textContent === 'Abrir o curso');
    expect(opens.map((a) => a.getAttribute('href'))).toEqual(['/cursos/3', '/cursos/4']);
    expect(opens[1].className).toContain('btn-primary'); // a da etapa Próxima se destaca
    expect(opens[0].className).not.toContain('btn-primary');
  });

  it('o "Como funciona" aparece de início, com o passo para ver funcionando; dá para esconder e reabrir, e lembra a escolha', async () => {
    api.track.mockResolvedValue(trackWith(THREE()));
    await mount('/trilhas/5', routes);
    const hint = q('[aria-label="Como funciona esta trilha"]');
    expect(hint.textContent).toContain('avança sozinha');
    expect(hint.textContent).toContain('Quer ver funcionando?');
    expect(hint.textContent).toContain('Etapa avulsa');
    await act(async () => { btn('Entendi, esconder').click(); });
    expect(q('[aria-label="Como funciona esta trilha"]')).toBeNull();
    expect(localStorage.getItem('lc-track-hint-hidden')).toBe('1');
    // remonta a tela: continua escondido
    document.body.innerHTML = '';
    await mount('/trilhas/5', routes);
    expect(q('[aria-label="Como funciona esta trilha"]')).toBeNull();
    await act(async () => { btn('Como funciona esta trilha?').click(); });
    expect(q('[aria-label="Como funciona esta trilha"]')).not.toBeNull();
    expect(localStorage.getItem('lc-track-hint-hidden')).toBe('0');
  });

  it('marcar etapa avulsa como concluída atualiza a tela com a resposta', async () => {
    api.track.mockResolvedValue(trackWith(THREE()));
    const done = THREE();
    done[2] = { ...done[2], status: 'done', progress: 100 };
    api.updateTrackItem.mockResolvedValue(trackWith(done, { doneItems: 2 }));
    await mount('/trilhas/5', routes);
    const box = steps()[2].querySelector('input[type="checkbox"]');
    await act(async () => { box.click(); });
    await flush();
    expect(api.updateTrackItem).toHaveBeenCalledWith(5, 3, { done: true });
    expect(steps()[2].textContent).toContain('Concluída');
    expect(document.body.textContent).toContain('2 de 3 etapas concluídas');
  });

  it('mover para cima/baixo envia a nova ordem; os extremos ficam desabilitados', async () => {
    api.track.mockResolvedValue(trackWith(THREE()));
    const reordered = [THREE()[1], THREE()[0], THREE()[2]].map((i, n) => ({ ...i, position: n + 1 }));
    api.reorderTrack.mockResolvedValue(trackWith(reordered));
    await mount('/trilhas/5', routes);
    expect(document.querySelector('[aria-label="Mover \\"Redes\\" para cima"]').disabled).toBe(true);
    expect(document.querySelector('[aria-label="Mover \\"Prova Security+\\" para baixo"]').disabled).toBe(true);
    await act(async () => { document.querySelector('[aria-label="Mover \\"Linux\\" para cima"]').click(); });
    await flush();
    expect(api.reorderTrack).toHaveBeenCalledWith(5, [2, 1, 3]);
    expect(steps().map((s) => s.querySelector('strong').textContent)).toEqual(['Linux', 'Redes', 'Prova Security+']);
  });

  it('tirar da trilha pede confirmação e recarrega a trilha', async () => {
    api.track.mockResolvedValueOnce(trackWith(THREE()));
    api.removeTrackItem.mockResolvedValue(null);
    await mount('/trilhas/5', routes);
    api.track.mockResolvedValue(trackWith(THREE().slice(0, 2)));
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await act(async () => { document.querySelector('[aria-label="Tirar \\"Prova Security+\\" da trilha"]').click(); });
    expect(api.removeTrackItem).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    await act(async () => { document.querySelector('[aria-label="Tirar \\"Prova Security+\\" da trilha"]').click(); });
    await flush();
    expect(api.removeTrackItem).toHaveBeenCalledWith(5, 3);
    expect(steps()).toHaveLength(2);
  });

  it('adicionar curso: a lista só tem os que ainda não estão na trilha', async () => {
    api.courses.mockResolvedValue([{ id: 3, title: 'Redes' }, { id: 4, title: 'Linux' }, { id: 6, title: 'Python' }]);
    api.track.mockResolvedValue(trackWith(THREE()));
    await mount('/trilhas/5', routes);
    const options = [...q('#td-course').options].map((o) => o.textContent);
    expect(options).toEqual(['Escolha um curso…', 'Python']);
    const withPython = [...THREE(), item({ id: 4, position: 4, title: 'Python', courseId: 6, status: 'todo', progress: 0, isNext: false })];
    api.addTrackItem.mockResolvedValue(trackWith(withPython));
    await setValue(q('#td-course'), '6');
    await submit(q('form[aria-label="Adicionar curso"]'));
    expect(api.addTrackItem).toHaveBeenCalledWith(5, { courseId: 6 });
    expect(steps()).toHaveLength(4);
    expect(q('#td-course').value).toBe('');
  });

  it('adicionar etapa avulsa envia o nome e limpa o campo', async () => {
    api.track.mockResolvedValue(trackWith(THREE()));
    api.addTrackItem.mockResolvedValue(trackWith(THREE()));
    await mount('/trilhas/5', routes);
    await setValue(q('#td-step'), 'Projeto final');
    await submit(q('form[aria-label="Adicionar etapa avulsa"]'));
    expect(api.addTrackItem).toHaveBeenCalledWith(5, { title: 'Projeto final' });
    expect(q('#td-step').value).toBe('');
  });

  it('erro da API (ex.: curso repetido) aparece na tela', async () => {
    api.courses.mockResolvedValue([{ id: 3, title: 'Redes' }, { id: 6, title: 'Python' }]);
    api.track.mockResolvedValue(trackWith(THREE()));
    api.addTrackItem.mockRejectedValue(new Error('Esse curso já está na trilha.'));
    await mount('/trilhas/5', routes);
    await setValue(q('#td-course'), '6');
    await submit(q('form[aria-label="Adicionar curso"]'));
    expect(q('[role="alert"]').textContent).toContain('Esse curso já está na trilha.');
  });

  it('editar nome e descrição atualiza o cabeçalho', async () => {
    api.track.mockResolvedValue(trackWith(THREE()));
    api.updateTrack.mockResolvedValue(trackWith(THREE(), { title: 'Novo nome', description: 'Nova descrição' }));
    await mount('/trilhas/5', routes);
    await act(async () => { btn('Editar').click(); });
    expect(q('#tf-title').value).toBe('Cibersegurança');
    await setValue(q('#tf-title'), 'Novo nome');
    await submit(q('#tf-title').closest('form'));
    expect(api.updateTrack).toHaveBeenCalledWith(5, { title: 'Novo nome', description: 'Do zero ao Security+' });
    expect(q('h1').textContent).toBe('Novo nome');
  });

  it('apagar a trilha pede confirmação e volta para a lista', async () => {
    api.track.mockResolvedValue(trackWith(THREE()));
    api.deleteTrack.mockResolvedValue(null);
    await mount('/trilhas/5', routes);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await act(async () => { btn('Apagar trilha').click(); });
    expect(api.deleteTrack).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    await act(async () => { btn('Apagar trilha').click(); });
    await flush();
    expect(api.deleteTrack).toHaveBeenCalledWith(5);
    expect(where.pathname).toBe('/trilhas');
  });

  it('trilha sem etapas explica o que fazer; trilha inexistente mostra erro', async () => {
    api.track.mockResolvedValue(trackWith([], { totalItems: 0, doneItems: 0, progress: 0, next: null }));
    await mount('/trilhas/5', routes);
    expect(document.body.textContent).toContain('Adicione cursos ou etapas abaixo.');
    expect(document.body.textContent).toContain('Nenhuma etapa ainda.');
    document.body.innerHTML = '';
    api.track.mockRejectedValue(new Error('Trilha não encontrado(a).'));
    await mount('/trilhas/99', routes);
    expect(q('[role="alert"]')).not.toBeNull();
  });
});
