// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({ api: { calendarMissed: vi.fn(), addOnceBlock: vi.fn(), removeOnceBlock: vi.fn() } }));
import { api } from '../lib/api.js';
import { MissedBlocks, suggestTime, dayWord, missedText, readDismissed } from './MissedBlocks.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return keyOf(d); };
const block = (extra = {}) => ({ kind: 'plan', key: 'plan-3-x', planId: 3, onceId: null, date: daysAgo(1), startTime: '20:00', durationMin: 45, courseId: 5, courseTitle: 'Cyber Security', ...extra });

let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><MissedBlocks /></MemoryRouter>); });
  await flush();
}
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })); });
const btn = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const setValue = (el, v) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.clearAllMocks();
  api.calendarMissed.mockResolvedValue([block()]);
  api.addOnceBlock.mockResolvedValue({ id: 1 });
  api.removeOnceBlock.mockResolvedValue(null);
});

describe('funções de apoio', () => {
  it('sugere a próxima hora cheia com 30 min de folga, entre 08:00 e 22:00', () => {
    expect(suggestTime(new Date('2026-03-11T15:00:00'))).toBe('16:00'); // 15:30 -> 16:00
    expect(suggestTime(new Date('2026-03-11T15:29:00'))).toBe('16:00');
    expect(suggestTime(new Date('2026-03-11T15:31:00'))).toBe('17:00');
    expect(suggestTime(new Date('2026-03-11T15:45:00'))).toBe('17:00');
    expect(suggestTime(new Date('2026-03-11T05:00:00'))).toBe('08:00');
    expect(suggestTime(new Date('2026-03-11T21:50:00'))).toBe('22:00');
    expect(suggestTime(new Date('2026-03-11T23:10:00'))).toBe('22:00');
  });
  it('escreve o aviso em português', () => {
    const now = new Date('2026-03-11T12:00:00');
    expect(dayWord('2026-03-10', now)).toBe('ontem');
    expect(dayWord('2026-03-09', now)).toBe('anteontem');
    expect(dayWord('2026-03-08', now)).toBe('em 08/03');
    expect(dayWord('2026-03-11', now)).toBe('hoje');
    expect(missedText({ date: '2026-03-10', startTime: '20:00', courseTitle: 'Cyber Security' }, now)).toBe('Você perdeu o bloco de ontem às 20h (Cyber Security)');
    expect(missedText({ date: '2026-03-10', startTime: '07:30', courseTitle: null }, now)).toBe('Você perdeu o bloco de ontem às 7h30');
  });
});

describe('MissedBlocks', () => {
  it('não aparece quando não há blocos perdidos', async () => {
    api.calendarMissed.mockResolvedValue([]);
    await mount();
    expect(container.innerHTML).toBe('');
  });

  it('não aparece (nem quebra) se a busca falhar', async () => {
    api.calendarMissed.mockRejectedValue(new Error('x'));
    await mount();
    expect(container.innerHTML).toBe('');
  });

  it('mostra o aviso com os três botões', async () => {
    await mount();
    expect(container.textContent).toContain('Você perdeu o bloco de ontem às 20h (Cyber Security)');
    expect(btn('Remarcar para hoje')).toBeDefined();
    expect(btn('Dispensar')).toBeDefined();
    expect([...container.querySelectorAll('a')].find((a) => a.textContent === 'Estudar agora').getAttribute('href')).toBe('/foco?course=5&auto=1&min=25');
  });

  it('remarcar abre o horário e, ao confirmar, cria o bloco avulso de hoje', async () => {
    await mount();
    await click(btn('Remarcar para hoje'));
    const input = container.querySelector('input[type="time"]');
    expect(input.min).toBe('08:00');
    expect(input.max).toBe('22:00');
    await setValue(input, '19:30');
    api.calendarMissed.mockResolvedValue([]); // depois de remarcar, o bloco original sai da lista
    await click(btn('Confirmar'));
    await flush();
    expect(api.addOnceBlock).toHaveBeenCalledWith({ date: keyOf(new Date()), startTime: '19:30', durationMin: 45, courseId: 5, fromPlanId: 3, fromDate: daysAgo(1) });
    expect(container.querySelector('[role="status"]').textContent).toContain('Pronto! Bloco marcado para hoje às 19h30.');
    expect(container.textContent).not.toContain('Você perdeu o bloco');
  });

  it('remarcar um avulso perdido troca o antigo pelo novo', async () => {
    api.calendarMissed.mockResolvedValue([block({ kind: 'once', planId: null, onceId: 8, key: 'once-8-x' })]);
    await mount();
    await click(btn('Remarcar para hoje'));
    await click(btn('Confirmar'));
    await flush();
    expect(api.addOnceBlock.mock.calls[0][0]).not.toHaveProperty('fromPlanId');
    expect(api.removeOnceBlock).toHaveBeenCalledWith(8);
  });

  it('mostra o erro da API e deixa tentar de novo', async () => {
    api.addOnceBlock.mockRejectedValue(Object.assign(new Error('Esse horário já passou. Escolha um horário mais adiante.'), { status: 400 }));
    await mount();
    await click(btn('Remarcar para hoje'));
    await click(btn('Confirmar'));
    await flush();
    expect(container.querySelector('[role="alert"]').textContent).toContain('Esse horário já passou');
    expect(btn('Confirmar').disabled).toBe(false);
  });

  it('dispensar esconde só aquele aviso e lembra no navegador', async () => {
    api.calendarMissed.mockResolvedValue([block(), block({ key: 'plan-4-y', planId: 4, courseTitle: 'Redes' })]);
    await mount();
    await click(btn('Dispensar'));
    expect(container.textContent).not.toContain('Cyber Security');
    expect(container.textContent).toContain('Redes');
    expect(readDismissed()).toEqual(['plan-3-x']);
    expect(api.addOnceBlock).not.toHaveBeenCalled();
  });

  it('avisos já dispensados não voltam na próxima visita', async () => {
    localStorage.setItem('lume-avisos-dispensados', JSON.stringify(['plan-3-x']));
    await mount();
    expect(container.innerHTML).toBe('');
  });

  it('funciona mesmo se o navegador não deixar guardar', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio'); });
    await mount();
    await click(btn('Dispensar'));
    expect(container.innerHTML).toBe('');
    spy.mockRestore();
  });
});
