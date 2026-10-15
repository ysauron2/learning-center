// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AppleCalendar, CopyButton, feedUrls } from './AppleCalendar.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('feedUrls', () => {
  it('monta o endereço comum, o que abre direto no Calendário (webcal) e o de baixar', () => {
    expect(feedUrls('http://localhost:3000')).toEqual({
      http: 'http://localhost:3000/api/v1/calendar/feed.ics',
      webcal: 'webcal://localhost:3000/api/v1/calendar/feed.ics',
      download: 'http://localhost:3000/api/v1/calendar/feed.ics?download=1',
    });
  });
  it('acompanha o endereço do app de desktop (127.0.0.1 e outra porta)', () => {
    expect(feedUrls('http://127.0.0.1:38250/agenda').webcal).toBe('webcal://127.0.0.1:38250/api/v1/calendar/feed.ics');
  });
});

let container;
async function mount(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(el); });
}
beforeEach(() => { document.body.innerHTML = ''; });

describe('AppleCalendar', () => {
  it('explica em 3 passos e oferece abrir no Calendário e baixar o arquivo', async () => {
    await mount(<AppleCalendar />);
    const t = container.textContent;
    expect(t).toContain('Sem conta, sem chave, sem senha');
    expect(container.querySelectorAll('.agenda-steps li')).toHaveLength(3);
    expect(t).toContain('A cada 15 minutos');
    const open = container.querySelector('a.btn-primary');
    expect(open.textContent).toBe('Abrir no Calendário');
    expect(open.getAttribute('href')).toBe('webcal://localhost:3000/api/v1/calendar/feed.ics');
    const dl = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Baixar arquivo'));
    expect(dl.getAttribute('href')).toBe('http://localhost:3000/api/v1/calendar/feed.ics?download=1');
    expect(dl.hasAttribute('download')).toBe(true);
  });

  it('mostra o caminho manual (Arquivo → Nova assinatura) com o endereço para copiar', async () => {
    await mount(<AppleCalendar />);
    const manual = container.querySelector('details');
    expect(manual.textContent).toContain('Arquivo → Nova assinatura de calendário');
    expect(manual.querySelector('.agenda-url').textContent).toBe('http://localhost:3000/api/v1/calendar/feed.ics');
  });

  it('avisa a limitação: só enquanto o app está aberto, e o Google não assina', async () => {
    await mount(<AppleCalendar />);
    expect(container.textContent).toContain('enquanto o Lume estiver aberto');
    expect(container.textContent).toContain('Google Agenda não consegue assinar');
  });
});

describe('CopyButton', () => {
  it('copia o texto e confirma', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await mount(<CopyButton text="abc" />);
    const b = container.querySelector('button');
    await act(async () => { b.click(); });
    expect(writeText).toHaveBeenCalledWith('abc');
    expect(b.textContent).toBe('Copiado!');
  });

  it('se o navegador bloquear a cópia, orienta a copiar à mão', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('bloqueado')) }, configurable: true });
    await mount(<CopyButton text="abc" />);
    await act(async () => { container.querySelector('button').click(); });
    expect(container.textContent).toContain('Não deu para copiar');
  });
});
