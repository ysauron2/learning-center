// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('../lib/api.js', () => ({
  api: { notionStatus: vi.fn(), notionToken: vi.fn(), notionPages: vi.fn(), notionConnect: vi.fn(), notionDisconnect: vi.fn(), notionSettings: vi.fn(), notionSync: vi.fn() },
}));
import { api } from '../lib/api.js';
import { NotionCalendar } from './NotionCalendar.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const status = (over = {}) => ({ hasToken: false, botName: null, workspace: null, connected: false, databaseUrl: null, lastSyncAt: null, lastError: null, autoSync: true, logSessions: true, ...over });
const CONNECTED = status({ hasToken: true, connected: true, workspace: 'Meu espaço', databaseUrl: 'https://notion.so/db-1' });
const PAGES = [{ id: 'p1', title: 'Meus estudos', url: 'u1' }, { id: 'p2', title: 'Outra página', url: 'u2' }];

let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(props = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<NotionCalendar {...props} />); });
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
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  api.notionStatus.mockResolvedValue(status());
  api.notionPages.mockResolvedValue(PAGES);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Notion · primeiro passo (sem código)', () => {
  it('explica em 3 passos simples e mostra o campo do código', async () => {
    await mount();
    expect(container.querySelectorAll('ol li')).toHaveLength(3);
    expect(container.textContent).toContain('Nova integração');
    expect(container.textContent).toContain('Conexões');
    expect(q('a[href*="notion.so"]').target).toBe('_blank');
    expect(q('#nt-token').type).toBe('password');
  });

  it('o botão só libera com o código preenchido; salvar leva para a escolha da página', async () => {
    await mount();
    expect(btn('Salvar código').disabled).toBe(true);
    await setValue(q('#nt-token'), '  ntn_abc  ');
    expect(btn('Salvar código').disabled).toBe(false);
    api.notionToken.mockResolvedValue(status({ hasToken: true }));
    api.notionStatus.mockResolvedValue(status({ hasToken: true, workspace: 'Meu espaço' }));
    await submit(q('form[aria-label="Código do Notion"]'));
    expect(api.notionToken).toHaveBeenCalledWith('ntn_abc');
    expect(container.textContent).toContain('Código aceito');
    expect(container.textContent).toContain('Meu espaço');
    expect(q('#nt-token')).toBeNull();
  });

  it('código errado mostra o aviso do servidor e mantém o formulário', async () => {
    await mount();
    await setValue(q('#nt-token'), 'ntn_errado');
    api.notionToken.mockRejectedValue(new Error('O Notion não aceitou esse código.'));
    await submit(q('form[aria-label="Código do Notion"]'));
    expect(q('[role="alert"]').textContent).toContain('não aceitou');
    expect(q('#nt-token')).not.toBeNull();
  });
});

describe('Notion · escolher a página', () => {
  beforeEach(() => { api.notionStatus.mockResolvedValue(status({ hasToken: true, workspace: 'Meu espaço' })); });

  it('lista as páginas e cria a tabela na escolhida', async () => {
    await mount();
    expect([...q('#nt-page').options].map((o) => o.textContent)).toEqual(['Meus estudos', 'Outra página']);
    await setValue(q('#nt-page'), 'p2');
    api.notionConnect.mockResolvedValue(CONNECTED);
    api.notionStatus.mockResolvedValue(CONNECTED);
    await click(btn('Criar tabela de estudos'));
    expect(api.notionConnect).toHaveBeenCalledWith('p2');
    expect(container.textContent).toContain('Conectado');
  });

  it('sem escolher nada usa a primeira página', async () => {
    await mount();
    api.notionConnect.mockResolvedValue(CONNECTED);
    await click(btn('Criar tabela de estudos'));
    expect(api.notionConnect).toHaveBeenCalledWith('p1');
  });

  it('sem páginas compartilhadas explica o passo 2 e permite atualizar a lista', async () => {
    api.notionPages.mockResolvedValue([]);
    await mount();
    expect(container.textContent).toContain('passo 2');
    expect(btn('Criar tabela de estudos').disabled).toBe(true);
    api.notionPages.mockResolvedValue(PAGES);
    await click(btn('Atualizar lista'));
    expect(q('#nt-page')).not.toBeNull();
    expect(btn('Criar tabela de estudos').disabled).toBe(false);
  });

  it('erro ao criar a tabela aparece na tela e o botão volta a funcionar', async () => {
    await mount();
    api.notionConnect.mockRejectedValue(new Error('O Notion não encontrou essa página.'));
    await click(btn('Criar tabela de estudos'));
    expect(q('[role="alert"]').textContent).toContain('não encontrou');
    expect(btn('Criar tabela de estudos').disabled).toBe(false);
  });

  it('"Trocar o código" mostra o formulário e dá para cancelar', async () => {
    await mount();
    await click(btn('Trocar o código'));
    expect(q('label[for="nt-token"]').textContent).toBe('Novo código da integração');
    await click(btn('Cancelar'));
    expect(q('#nt-page')).not.toBeNull();
  });

  it('mostra o motivo se a tabela anterior se perdeu', async () => {
    api.notionStatus.mockResolvedValue(status({ hasToken: true, lastError: 'O Notion não encontrou mais a tabela de estudos. Conecte de novo.' }));
    await mount();
    expect(q('[role="alert"]').textContent).toContain('Conecte de novo');
  });
});

describe('Notion · conectado', () => {
  beforeEach(() => { api.notionStatus.mockResolvedValue(CONNECTED); });

  it('mostra o espaço, o link da tabela e a dica do Notion Calendar', async () => {
    await mount();
    expect(container.textContent).toContain('Meu espaço');
    expect(q('a[href="https://notion.so/db-1"]').textContent).toContain('Abrir a tabela no Notion');
    expect(q('details').textContent).toContain('Notion Calendar');
  });

  it('"Sincronizar agora" mostra o resumo e avisa a página', async () => {
    const onMessage = vi.fn();
    const onChanged = vi.fn();
    await mount({ onMessage, onChanged });
    api.notionSync.mockResolvedValue({ planCreated: 4, planUpdated: 0, planDeleted: 0, sessionsCreated: 1 });
    await click(btn('Sincronizar agora'));
    expect(onMessage).toHaveBeenCalledWith('Notion · Sincronizado: 4 blocos de estudo criados, 1 sessão registrada.');
    expect(onChanged).toHaveBeenCalled();
  });

  it('erro de sincronização aparece na tela', async () => {
    await mount();
    api.notionSync.mockRejectedValue(new Error('Notion fora do ar'));
    await click(btn('Sincronizar agora'));
    expect(q('[role="alert"]').textContent).toContain('Notion fora do ar');
    expect(btn('Sincronizar agora').disabled).toBe(false);
  });

  it('as opções liga/desliga chamam a API', async () => {
    await mount();
    api.notionSettings.mockResolvedValue(CONNECTED);
    const [auto, log] = container.querySelectorAll('input[type="checkbox"]');
    await click(auto);
    expect(api.notionSettings).toHaveBeenLastCalledWith({ autoSync: false });
    await click(log);
    expect(api.notionSettings).toHaveBeenLastCalledWith({ logSessions: false });
  });

  it('desconectar pede confirmação; recusando, nada acontece', async () => {
    await mount();
    window.confirm.mockReturnValue(false);
    await click(btn('Desconectar'));
    expect(api.notionDisconnect).not.toHaveBeenCalled();
    window.confirm.mockReturnValue(true);
    api.notionDisconnect.mockResolvedValue(status());
    api.notionStatus.mockResolvedValue(status());
    const onMessage = vi.fn();
    await click(btn('Desconectar'));
    expect(api.notionDisconnect).toHaveBeenCalled();
    expect(q('#nt-token')).not.toBeNull();
  });

  it('o código nunca aparece na tela', async () => {
    await mount();
    expect(container.innerHTML).not.toMatch(/ntn_|secret_/);
  });
});
