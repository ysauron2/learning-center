// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({
  api: {
    calendarStatus: vi.fn(), calendarConfig: vi.fn(), calendarConnect: vi.fn(), calendarDisconnect: vi.fn(), calendarSettings: vi.fn(),
    calendarPlan: vi.fn(), addPlanBlock: vi.fn(), removePlanBlock: vi.fn(), calendarSync: vi.fn(), courses: vi.fn(),
    notionStatus: vi.fn(), notionToken: vi.fn(), notionPages: vi.fn(), notionConnect: vi.fn(), notionDisconnect: vi.fn(), notionSettings: vi.fn(), notionSync: vi.fn(),
  },
}));
import { api } from '../lib/api.js';
import Agenda from './Agenda.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const status = (over = {}) => ({ configured: false, connected: false, clientId: '', account: null, lastSyncAt: null, lastError: null, autoSync: true, logSessions: true, planBlocks: 0, ...over });
const COURSES = [{ id: 3, title: 'Redes' }, { id: 4, title: 'Linux' }];
const PLAN = [{ id: 1, weekday: 0, startTime: '07:30', durationMin: 30, courseId: null, courseTitle: null }, { id: 2, weekday: 2, startTime: '20:00', durationMin: 45, courseId: 3, courseTitle: 'Redes' }];

let container;
let assign;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(path = '/agenda') {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter initialEntries={[path]}><Agenda /></MemoryRouter>); });
  await flush();
}
const q = (sel) => container.querySelector(sel);
const btn = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const setValue = async (el, value) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const submit = async (form) => { await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  assign = vi.fn();
  Object.defineProperty(window, 'location', { value: { origin: 'http://localhost:3000', host: 'localhost:3000', href: 'http://localhost:3000/agenda', assign }, writable: true, configurable: true });
  api.calendarStatus.mockResolvedValue(status());
  api.calendarPlan.mockResolvedValue([]);
  api.courses.mockResolvedValue(COURSES);
  api.notionStatus.mockResolvedValue({ hasToken: false, connected: false });
  api.notionPages.mockResolvedValue([]);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Agenda · primeira vez (sem chave)', () => {
  it('mostra o passo a passo em linguagem simples e o formulário da chave', async () => {
    await mount();
    const guide = q('.agenda-guide');
    expect(guide.textContent).toContain('Como conectar');
    expect(guide.querySelectorAll('ol li')).toHaveLength(5);
    expect(guide.textContent).toContain('Google Calendar API');
    expect(guide.textContent).toContain('App para computador');
    expect(guide.textContent).toContain('7 dias'); // aviso do modo de teste
    expect(guide.querySelector('a[href*="console.cloud.google.com"]').getAttribute('rel')).toContain('noopener');
    expect(q('form[aria-label="Chave do Google"]')).not.toBeNull();
    expect(btn('Conectar ao Google')).toBeUndefined(); // ainda não
  });

  it('o botão Salvar só libera com os dois campos; salva e orienta o próximo passo', async () => {
    api.calendarConfig.mockResolvedValue(status({ configured: true }));
    await mount();
    expect(q('form[aria-label="Chave do Google"] button').disabled).toBe(true);
    await setValue(q('#ag-id'), 'meu-id.apps.googleusercontent.com');
    expect(q('form[aria-label="Chave do Google"] button').disabled).toBe(true);
    await setValue(q('#ag-secret'), 'GOCSPX-abc');
    expect(q('form[aria-label="Chave do Google"] button').disabled).toBe(false);
    api.calendarStatus.mockResolvedValue(status({ configured: true, clientId: 'meu-id.apps.googleusercontent.com' }));
    await submit(q('form[aria-label="Chave do Google"]'));
    expect(api.calendarConfig).toHaveBeenCalledWith({ clientId: 'meu-id.apps.googleusercontent.com', clientSecret: 'GOCSPX-abc' });
    expect(container.textContent).toContain('Chave salva');
    expect(btn('Conectar ao Google')).toBeDefined();
  });

  it('o campo da chave secreta é de senha (não aparece na tela)', async () => {
    await mount();
    expect(q('#ag-secret').getAttribute('type')).toBe('password');
  });

  it('erro ao salvar aparece na tela', async () => {
    api.calendarConfig.mockRejectedValue(Object.assign(new Error('Dados inválidos.'), { details: [{ message: 'Informe o segredo.' }] }));
    await mount();
    await setValue(q('#ag-id'), 'x');
    await setValue(q('#ag-secret'), 'y');
    await submit(q('form[aria-label="Chave do Google"]'));
    expect(q('[role="alert"]').textContent).toContain('Informe o segredo.');
  });
});

describe('Agenda · Calendário da Apple e ajuda do erro de retorno', () => {
  it('o jeito da Apple aparece primeiro e sempre, sem precisar de conta do Google', async () => {
    await mount();
    const apple = q('[aria-label="Calendário da Apple"]');
    expect(apple).not.toBeNull();
    expect(apple.textContent).toContain('o jeito mais fácil');
    expect(apple.compareDocumentPosition(q('[aria-label="Conexão com o Google Agenda"]')) & 4).toBeTruthy(); // Google vem depois
  });

  it('o guia do Google mostra o endereço de retorno exato e explica o erro redirect_uri_mismatch', async () => {
    await mount();
    const guide = q('.agenda-guide');
    expect(guide.textContent).toContain('redirect_uri_mismatch');
    expect(guide.textContent).toContain('Aplicativo da Web');
    expect(guide.textContent).toContain('URIs de redirecionamento autorizados');
    expect(guide.querySelector('.agenda-url').textContent).toBe('http://localhost:3000/api/v1/calendar/callback');
  });

  it('quando a chave já está salva mas falta autorizar, a ajuda do erro continua à mão', async () => {
    api.calendarStatus.mockResolvedValue(status({ configured: true, clientId: 'meu-id' }));
    await mount();
    expect(q('.agenda-guide').textContent).toContain('redirect_uri_mismatch');
  });
});

describe('Agenda · chave salva, falta autorizar', () => {
  beforeEach(() => { api.calendarStatus.mockResolvedValue(status({ configured: true, clientId: 'meu-id' })); });

  it('"Conectar ao Google" pede o endereço e leva a pessoa até o Google', async () => {
    api.calendarConnect.mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', redirectUri: 'http://localhost:3000/api/v1/calendar/callback' });
    await mount();
    expect(container.textContent).toContain('A chave está salva');
    await act(async () => { btn('Conectar ao Google').click(); });
    await flush();
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1');
  });

  it('erro ao iniciar a conexão aparece e o botão volta a funcionar', async () => {
    api.calendarConnect.mockRejectedValue(new Error('Configure o ID e o segredo do Google antes de conectar.'));
    await mount();
    await act(async () => { btn('Conectar ao Google').click(); });
    await flush();
    expect(q('[role="alert"]').textContent).toContain('Configure o ID');
    expect(btn('Conectar ao Google').disabled).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it('"Trocar a chave" abre o formulário com o ID atual (o segredo nunca volta preenchido)', async () => {
    await mount();
    await act(async () => { btn('Trocar a chave').click(); });
    expect(q('#ag-id').value).toBe('meu-id');
    expect(q('#ag-secret').value).toBe('');
  });

  it('mostra o motivo se o acesso anterior expirou', async () => {
    api.calendarStatus.mockResolvedValue(status({ configured: true, lastError: 'O acesso ao Google Agenda expirou ou foi removido. Conecte de novo.' }));
    await mount();
    expect(q('[role="alert"]').textContent).toContain('Conecte de novo');
  });
});

describe('Agenda · conectado', () => {
  const on = (over = {}) => status({ configured: true, connected: true, account: 'pessoa@example.com', lastSyncAt: new Date(Date.now() - 3 * 3600000).toISOString(), ...over });
  beforeEach(() => { api.calendarStatus.mockResolvedValue(on()); });

  it('mostra a conta e a última sincronização; ?conectado=1 dá as boas-vindas', async () => {
    await mount('/agenda?conectado=1');
    expect(container.textContent).toContain('Conectado como pessoa@example.com');
    expect(container.textContent).toContain('há 3 h');
    expect(container.textContent).toContain('Google Agenda conectado!');
    expect(container.textContent).toContain('Learning Center · Estudos');
  });

  it('as duas opções gravam a escolha', async () => {
    api.calendarSettings.mockResolvedValue(on());
    await mount();
    const boxes = [...container.querySelectorAll('input[type="checkbox"]')];
    expect(boxes.map((b) => b.checked)).toEqual([true, true]);
    await act(async () => { boxes[0].click(); });
    expect(api.calendarSettings).toHaveBeenLastCalledWith({ autoSync: false });
    await act(async () => { boxes[1].click(); });
    expect(api.calendarSettings).toHaveBeenLastCalledWith({ logSessions: false });
  });

  it('"Sincronizar agora" mostra o resumo; erro do Google aparece', async () => {
    api.calendarSync.mockResolvedValueOnce({ planCreated: 4, planUpdated: 0, planDeleted: 0, sessionsCreated: 0 });
    await mount();
    await act(async () => { btn('Sincronizar agora').click(); });
    await flush();
    expect(q('[role="status"]').textContent).toBe('Sincronizado: 4 blocos de estudo criados.');
    api.calendarSync.mockRejectedValueOnce(new Error('Backend Error'));
    await act(async () => { btn('Sincronizar agora').click(); });
    await flush();
    expect(q('[role="alert"]').textContent).toContain('Backend Error');
  });

  it('desconectar pede confirmação', async () => {
    api.calendarDisconnect.mockResolvedValue(status({ configured: true }));
    await mount();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await act(async () => { btn('Desconectar').click(); });
    expect(api.calendarDisconnect).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    api.calendarStatus.mockResolvedValue(status({ configured: true }));
    await act(async () => { btn('Desconectar').click(); });
    await flush();
    expect(api.calendarDisconnect).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Google Agenda desconectado');
    expect(btn('Conectar ao Google')).toBeDefined();
  });
});

describe('Agenda · plano de estudo', () => {
  it('lista os blocos com dia, horário, duração e curso', async () => {
    api.calendarPlan.mockResolvedValue(PLAN);
    await mount();
    const items = [...container.querySelectorAll('.plan-list li')];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Segunda às 07:30 · 30 min');
    expect(items[0].textContent).toContain('Qualquer curso');
    expect(items[1].textContent).toContain('Quarta às 20:00 · 45 min');
    expect(items[1].textContent).toContain('Redes');
  });

  it('sem blocos convida a adicionar o primeiro', async () => {
    await mount();
    expect(container.textContent).toContain('Nenhum bloco ainda');
  });

  it('adicionar: envia o bloco; se conectado, já sincroniza com o Google e avisa', async () => {
    api.calendarStatus.mockResolvedValue(status({ configured: true, connected: true, account: 'a@b.c' }));
    api.addPlanBlock.mockResolvedValue({ id: 9 });
    api.calendarSync.mockResolvedValue({ planCreated: 4 });
    await mount();
    await setValue(q('#pl-day'), '2');
    await setValue(q('#pl-time'), '20:30');
    await setValue(q('#pl-dur'), '45');
    await setValue(q('#pl-course'), '3');
    await submit(q('form[aria-label="Adicionar bloco de estudo"]'));
    expect(api.addPlanBlock).toHaveBeenCalledWith({ weekday: 2, startTime: '20:30', durationMin: 45, courseId: 3 });
    expect(api.calendarSync).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Plano salvo e enviado ao Google Agenda');
  });

  it('adicionar sem estar conectado salva e explica que falta conectar (sem tentar sincronizar)', async () => {
    api.addPlanBlock.mockResolvedValue({ id: 9 });
    await mount();
    await submit(q('form[aria-label="Adicionar bloco de estudo"]'));
    expect(api.addPlanBlock).toHaveBeenCalledWith({ weekday: 0, startTime: '19:00', durationMin: 60, courseId: null });
    expect(api.calendarSync).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Plano salvo. No Calendário da Apple ele aparece sozinho; para aparecer no Notion ou no Google Agenda, conecte-os.');
  });

  it('se salvar der certo mas enviar ao Google falhar, diz as duas coisas', async () => {
    api.calendarStatus.mockResolvedValue(status({ configured: true, connected: true }));
    api.addPlanBlock.mockResolvedValue({ id: 9 });
    api.calendarSync.mockRejectedValue(new Error('Backend Error'));
    await mount();
    await submit(q('form[aria-label="Adicionar bloco de estudo"]'));
    expect(q('[role="alert"]').textContent).toContain('O plano foi salvo, mas não foi possível enviar ao Google Agenda: Backend Error');
  });

  it('com o Notion conectado, o bloco também é enviado ao Notion (e o Google, se estiver conectado)', async () => {
    api.notionStatus.mockResolvedValue({ hasToken: true, connected: true, databaseUrl: 'https://notion.so/db-1', autoSync: true, logSessions: true });
    api.addPlanBlock.mockResolvedValue({ id: 9 });
    api.notionSync.mockResolvedValue({});
    await mount();
    await submit(q('form[aria-label="Adicionar bloco de estudo"]'));
    expect(api.notionSync).toHaveBeenCalledTimes(1);
    expect(api.calendarSync).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Plano salvo e enviado ao Notion.');
    api.calendarStatus.mockResolvedValue(status({ configured: true, connected: true }));
    api.calendarSync.mockResolvedValue({});
    await mount();
    const forms = container.querySelectorAll('form[aria-label="Adicionar bloco de estudo"]');
    await submit(forms[forms.length - 1]);
    expect(container.textContent).toContain('enviado ao Google Agenda e ao Notion');
  });

  it('se o Notion falhar, o plano continua salvo e o aviso diz qual agenda falhou', async () => {
    api.notionStatus.mockResolvedValue({ hasToken: true, connected: true, autoSync: true, logSessions: true });
    api.addPlanBlock.mockResolvedValue({ id: 9 });
    api.notionSync.mockRejectedValue(new Error('Notion fora do ar'));
    await mount();
    await submit(q('form[aria-label="Adicionar bloco de estudo"]'));
    expect([...container.querySelectorAll('[role="alert"]')].map((a) => a.textContent).join(' ')).toContain('O plano foi salvo, mas não foi possível enviar ao Notion: Notion fora do ar');
  });

  it('a página mostra o Notion antes do Google, e o Google como avançado', async () => {
    await mount();
    const titles = [...container.querySelectorAll('h2')].map((h) => h.textContent);
    const apple = titles.findIndex((t) => t.includes('Apple'));
    const notion = titles.findIndex((t) => t.includes('Notion'));
    const google = titles.findIndex((t) => t.includes('Google Agenda'));
    expect(apple).toBeGreaterThanOrEqual(0);
    expect(notion).toBeGreaterThan(apple);
    expect(google).toBeGreaterThan(notion);
    expect(titles[google]).toContain('avançado');
  });

  it('erro de validação da API aparece na tela', async () => {
    api.addPlanBlock.mockRejectedValue(Object.assign(new Error('Dados inválidos.'), { details: [{ message: 'No mínimo 5 minutos.' }] }));
    await mount();
    await submit(q('form[aria-label="Adicionar bloco de estudo"]'));
    expect(q('[role="alert"]').textContent).toContain('No mínimo 5 minutos.');
  });

  it('tirar um bloco pede confirmação e atualiza a lista', async () => {
    api.calendarPlan.mockResolvedValue(PLAN);
    api.removePlanBlock.mockResolvedValue(null);
    await mount();
    api.calendarPlan.mockResolvedValue([PLAN[1]]);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await act(async () => { container.querySelector('[aria-label="Tirar do plano: Segunda às 07:30"]').click(); });
    expect(api.removePlanBlock).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    await act(async () => { container.querySelector('[aria-label="Tirar do plano: Segunda às 07:30"]').click(); });
    await flush();
    expect(api.removePlanBlock).toHaveBeenCalledWith(1);
    expect(container.querySelectorAll('.plan-list li')).toHaveLength(1);
  });
});
