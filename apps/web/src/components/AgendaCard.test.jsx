// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({ api: { calendarStatus: vi.fn(), calendarEvents: vi.fn(), calendarSync: vi.fn(), notionStatus: vi.fn(), notionSync: vi.fn(), calendarUpcoming: vi.fn() } }));
import { api } from '../lib/api.js';
import { AgendaCard, syncSummaryText } from './AgendaCard.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const local = (addDays, h, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const ev = (id, title, start, end, extra = {}) => ({ id, title, start, end, allDay: false, calendar: 'primary', kind: null, url: null, ...extra });
const connected = (over = {}) => ({ configured: true, connected: true, account: 'pessoa@example.com', lastSyncAt: new Date(Date.now() - 5 * 60000).toISOString(), lastError: null, planBlocks: 2, ...over });

let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><AgendaCard /></MemoryRouter>); });
  await flush();
}
const q = (sel) => container.querySelector(sel);
const btn = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text));
beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); api.calendarUpcoming.mockResolvedValue([]); });

describe('syncSummaryText', () => {
  it('descreve o que foi feito, ou que já estava tudo em dia', () => {
    expect(syncSummaryText({ planCreated: 4, planUpdated: 1, planDeleted: 2, sessionsCreated: 3 })).toBe('Sincronizado: 4 blocos de estudo criados, 1 atualizado, 2 removidos, 3 sessões registradas.');
    expect(syncSummaryText({ planCreated: 1, planUpdated: 0, planDeleted: 0, sessionsCreated: 1 })).toBe('Sincronizado: 1 bloco de estudo criado, 1 sessão registrada.');
    expect(syncSummaryText({ planCreated: 0, planUpdated: 0, planDeleted: 0, sessionsCreated: 0 })).toBe('Tudo já estava sincronizado.');
  });
});

describe('AgendaCard · antes de conectar', () => {
  it('sem configurar: convida a conectar e leva para a página Agenda', async () => {
    api.calendarStatus.mockResolvedValue({ configured: false, connected: false });
    await mount();
    expect(container.textContent).toContain('Calendário da Apple');
    expect(container.textContent).toContain('Google Agenda');
    expect(q('a[href="/agenda"]').textContent).toBe('Configurar a agenda');
    expect(api.calendarEvents).not.toHaveBeenCalled();
  });

  it('com a chave salva mas sem autorizar: pede só a autorização, e mostra o erro anterior', async () => {
    api.calendarStatus.mockResolvedValue({ configured: true, connected: false, lastError: 'O acesso ao Google Agenda expirou ou foi removido. Conecte de novo.' });
    await mount();
    expect(container.textContent).toContain('Falta só autorizar');
    expect(q('a[href="/agenda"]').textContent).toBe('Autorizar o Google Agenda');
    expect(q('[role="alert"]').textContent).toContain('Conecte de novo');
  });

  const plan = (id, title, start, end, extra = {}) => ({ id, title, start, end, allDay: false, calendar: 'study', kind: 'plan', url: null, courseId: 5, courseTitle: 'Cyber', lessonTitle: null, ...extra });

  it('sem Google mas com o Notion e sem plano: convida a montar o plano (não só botões soltos)', async () => {
    api.calendarStatus.mockResolvedValue({ configured: false, connected: false });
    api.notionStatus.mockResolvedValue({ connected: true, hasToken: true, lastSyncAt: new Date(Date.now() - 60000).toISOString(), databaseUrl: 'https://notion.so/db-1', lastError: null });
    await mount();
    expect(container.textContent).toContain('Notion · há 1 min');
    expect(container.textContent).toContain('Você ainda não montou seu plano de estudo');
    expect(q('a[href="/agenda"]').textContent).toBe('Montar plano de estudo');
    expect(container.textContent).not.toContain('Configurar a agenda');
    expect(q('a[href="https://notion.so/db-1"]').textContent).toBe('Abrir no Notion');
  });

  it('com plano: destaca o próximo bloco com "Começar agora" para o curso e mostra a semana', async () => {
    api.calendarStatus.mockResolvedValue({ configured: false, connected: false });
    api.notionStatus.mockResolvedValue({ connected: true, hasToken: true, lastSyncAt: new Date(Date.now() - 60000).toISOString(), databaseUrl: 'https://notion.so/db-1', lastError: null });
    api.calendarUpcoming.mockResolvedValue([
      plan('plan:1|a', '📚 Estudar: Cyber Security', local(1, 20), local(1, 20, 45), { lessonTitle: 'Invasores' }),
      plan('plan:1|b', '📚 Estudar: Cyber Security', local(2, 20), local(2, 20, 45)),
    ]);
    await mount();
    const next = q('.agenda-next');
    expect(next.textContent).toContain('Estudar: Cyber Security');
    expect(next.textContent).toContain('20:00–20:45');
    expect(next.textContent).toContain('Próxima aula: Invasores');
    expect(next.querySelector('a').getAttribute('href')).toBe('/foco?course=5&auto=1');
    expect(next.querySelector('a').textContent).toBe('Começar agora');
    const days = [...container.querySelectorAll('.week-day')];
    expect(days).toHaveLength(7);
    expect(days[0].className).toContain('today');
    expect(days[1].textContent).toContain('20:00');
    expect(days[2].textContent).toContain('20:00');
    expect(days[3].textContent).toContain('–');
  });

  it('bloco sem curso leva ao foco livre; sessão feita hoje aparece como "feito"', async () => {
    api.calendarStatus.mockResolvedValue({ configured: false, connected: false });
    api.notionStatus.mockResolvedValue(null);
    api.calendarUpcoming.mockResolvedValue([
      { id: 'session:9', title: '✅ Estudei: Redes (25 min)', start: local(0, 0, 1), end: local(0, 0, 26), allDay: false, calendar: 'study', kind: 'session', url: null },
      plan('plan:2|a', '📚 Hora de estudar', local(1, 7, 30), local(1, 8), { courseId: null, courseTitle: null }),
    ]);
    await mount();
    expect(q('.agenda-next a').getAttribute('href')).toBe('/foco');
    expect(q('.week-day.today').textContent).toContain('feito');
    expect(container.textContent).toContain('Quer ver isso no seu calendário');
    expect(btn('Sincronizar Notion')).toBeUndefined();
  });

  it('"Sincronizar Notion" mostra o resumo e atualiza o cartão', async () => {
    api.calendarStatus.mockResolvedValue({ configured: false, connected: false });
    api.notionStatus.mockResolvedValue({ connected: true, hasToken: true, lastSyncAt: new Date(Date.now() - 60000).toISOString(), databaseUrl: 'https://notion.so/db-1', lastError: null });
    api.notionSync.mockResolvedValue({ planCreated: 5, planUpdated: 0, planDeleted: 0, sessionsCreated: 0 });
    await mount();
    await act(async () => { btn('Sincronizar Notion').click(); });
    await flush();
    expect(container.textContent).toContain('Notion · Sincronizado: 5 blocos de estudo criados.');
    expect(api.calendarUpcoming).toHaveBeenCalledTimes(2);
  });

  it('erro ao sincronizar o Notion aparece e o botão volta', async () => {
    api.calendarStatus.mockResolvedValue({ configured: false, connected: false });
    api.notionStatus.mockResolvedValue({ connected: true, hasToken: true, lastSyncAt: new Date(Date.now() - 60000).toISOString(), databaseUrl: 'https://notion.so/db-1', lastError: null });
    api.notionSync.mockRejectedValue(new Error('Notion fora do ar'));
    await mount();
    await act(async () => { btn('Sincronizar Notion').click(); });
    await flush();
    expect(q('[role="alert"]').textContent).toContain('Notion fora do ar');
    expect(btn('Sincronizar Notion').disabled).toBe(false);
  });

  it('só com plano (sem Notion nem Google) ainda mostra a semana e sugere conectar', async () => {
    api.calendarStatus.mockResolvedValue({ configured: false, connected: false });
    api.notionStatus.mockResolvedValue(null);
    api.calendarUpcoming.mockResolvedValue([plan('plan:1|a', '📚 Estudar: Cyber', local(1, 20), local(1, 20, 45))]);
    await mount();
    expect(container.querySelectorAll('.week-day')).toHaveLength(7);
    expect(container.textContent).toContain('Conecte em Agenda');
  });

  it('com Google conectado nada muda: continua a lista do Google', async () => {
    api.calendarStatus.mockResolvedValue(connected());
    api.calendarEvents.mockResolvedValue({ connected: true, stale: false, error: null, events: [] });
    api.calendarUpcoming.mockResolvedValue([plan('plan:1|a', '📚 Estudar: Cyber', local(1, 20), local(1, 20, 45))]);
    await mount();
    expect(q('.week-strip')).toBeNull();
    expect(container.textContent).toContain('Nada na sua agenda nos próximos 7 dias');
  });

  it('se o estado do Notion falhar, o cartão segue normal', async () => {
    api.calendarStatus.mockResolvedValue({ configured: false, connected: false });
    api.notionStatus.mockRejectedValue(new Error('falhou'));
    await mount();
    expect(q('a[href="/agenda"]').textContent).toBe('Configurar a agenda');
  });

  it('se o estado não carregar, avisa sem quebrar o início', async () => {
    api.calendarStatus.mockRejectedValue(new Error('falhou'));
    await mount();
    expect(container.textContent).toContain('Não foi possível ver o estado do Google Agenda');
  });
});

describe('AgendaCard · conectado', () => {
  it('mostra a conta, a última sincronização e os próximos dias, com blocos de estudo em destaque', async () => {
    api.calendarStatus.mockResolvedValue(connected());
    api.calendarEvents.mockResolvedValue({
      connected: true, stale: false, error: null,
      events: [
        ev('primary:1', 'Almoço com a Ana', local(0, 12), local(0, 13), { url: 'https://calendar.google.com/event?eid=1' }),
        ev('study:2', '📚 Estudar: Redes', local(0, 19), local(0, 20), { calendar: 'study', kind: 'plan' }),
        ev('study:3', '✅ Estudei: Linux (30 min)', local(1, 8), local(1, 8, 30), { calendar: 'study', kind: 'session' }),
        { id: 'primary:4', title: 'Feriado', start: local(2, 0).slice(0, 10), end: local(3, 0).slice(0, 10), allDay: true, calendar: 'primary', kind: null, url: null },
      ],
    });
    await mount();
    expect(api.calendarEvents).toHaveBeenCalledWith(7);
    expect(container.textContent).toContain('pessoa@example.com');
    expect(container.textContent).toContain('há 5 min');
    const days = [...container.querySelectorAll('.agenda-day')];
    expect(days).toHaveLength(3);
    expect(days[0].querySelector('h3').textContent).toContain('Hoje');
    expect(days[1].querySelector('h3').textContent).toContain('Amanhã');
    expect(days[0].querySelectorAll('li')).toHaveLength(2);
    expect(days[0].querySelector('li.study').textContent).toContain('📚');
    expect(days[1].querySelector('li.study').textContent).toContain('✅');
    expect(days[2].textContent).toContain('Dia inteiro');
    const link = days[0].querySelector('a');
    expect(link.getAttribute('href')).toContain('calendar.google.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(q('a[href="/agenda"]').textContent).toBe('Plano de estudo');
  });

  it('título de evento com HTML aparece como texto (nada é injetado)', async () => {
    api.calendarStatus.mockResolvedValue(connected());
    api.calendarEvents.mockResolvedValue({ connected: true, stale: false, error: null, events: [ev('p:1', '<img src=x onerror=alert(1)>', local(0, 12), local(0, 13))] });
    await mount();
    expect(q('.agenda-day img')).toBeNull();
    expect(q('.agenda-day').textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('agenda vazia incentiva planejar', async () => {
    api.calendarStatus.mockResolvedValue(connected());
    api.calendarEvents.mockResolvedValue({ connected: true, stale: false, error: null, events: [] });
    await mount();
    expect(container.textContent).toContain('Nada na sua agenda nos próximos 7 dias');
  });

  it('se o Google falhar, avisa e mostra a última lista conhecida', async () => {
    api.calendarStatus.mockResolvedValue(connected());
    api.calendarEvents.mockResolvedValue({ connected: true, stale: true, error: 'Backend Error', events: [ev('p:1', 'Reunião', local(0, 12), local(0, 13))] });
    await mount();
    expect(container.textContent).toContain('Mostrando a última lista');
    expect(container.textContent).toContain('Backend Error');
    expect(container.textContent).toContain('Reunião');
  });

  it('mostra o último erro de sincronização guardado', async () => {
    api.calendarStatus.mockResolvedValue(connected({ lastError: 'Calendar API has not been used in project 1' }));
    api.calendarEvents.mockResolvedValue({ connected: true, stale: false, error: null, events: [] });
    await mount();
    expect(q('[role="alert"]').textContent).toContain('Calendar API has not been used');
  });

  it('"Sincronizar agora" sincroniza, recarrega os eventos já atualizados e conta o que fez', async () => {
    api.calendarStatus.mockResolvedValue(connected());
    api.calendarEvents.mockResolvedValueOnce({ connected: true, stale: false, error: null, events: [] });
    api.calendarSync.mockResolvedValue({ planCreated: 4, planUpdated: 0, planDeleted: 0, sessionsCreated: 1 });
    api.calendarEvents.mockResolvedValueOnce({ connected: true, stale: false, error: null, events: [ev('study:9', '📚 Estudar', local(0, 19), local(0, 20), { calendar: 'study', kind: 'plan' })] });
    await mount();
    await act(async () => { btn('Sincronizar agora').click(); });
    await flush();
    expect(api.calendarSync).toHaveBeenCalledTimes(1);
    expect(api.calendarEvents).toHaveBeenLastCalledWith(7, true);
    expect(q('[role="status"]').textContent).toBe('Sincronizado: 4 blocos de estudo criados, 1 sessão registrada.');
    expect(container.querySelectorAll('.agenda-day li')).toHaveLength(1);
  });

  it('falha ao sincronizar mostra a mensagem e mantém a tela', async () => {
    api.calendarStatus.mockResolvedValue(connected());
    api.calendarEvents.mockResolvedValue({ connected: true, stale: false, error: null, events: [ev('p:1', 'Reunião', local(0, 12), local(0, 13))] });
    api.calendarSync.mockRejectedValue(new Error('O Google Agenda não respondeu.'));
    await mount();
    await act(async () => { btn('Sincronizar agora').click(); });
    await flush();
    expect(q('[role="alert"]').textContent).toContain('não respondeu');
    expect(container.textContent).toContain('Reunião');
    expect(btn('Sincronizar agora').disabled).toBe(false);
  });
});
