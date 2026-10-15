// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({ api: { importPreview: vi.fn(), importCourses: vi.fn(), options: vi.fn().mockResolvedValue({ categories: [], platforms: [] }), courses: vi.fn().mockResolvedValue([]), importContentPreview: vi.fn(), importContent: vi.fn() } }));
import { DesktopUdemy, isDesktop } from './DesktopUdemy.jsx';
import ImportUdemy from '../pages/ImportUdemy.jsx';
import ImportContent from '../pages/ImportContent.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
async function mount(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter>{el}</MemoryRouter>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { delete window.lcDesktop; });

describe('detecção do app desktop', () => {
  it('só é desktop quando a ponte existe e diz que é', () => {
    expect(isDesktop()).toBe(false);
    window.lcDesktop = {};
    expect(isDesktop()).toBe(false);
    window.lcDesktop = { isDesktop: true };
    expect(isDesktop()).toBe(true);
  });
});

describe('DesktopUdemy', () => {
  it('o botão abre a janela da Udemy pela ponte', async () => {
    const openUdemy = vi.fn();
    window.lcDesktop = { isDesktop: true, openUdemy };
    await mount(<DesktopUdemy />);
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Abrir a Udemy');
    await act(async () => { btn.click(); });
    expect(openUdemy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('e-mail e senha');
  });
});

describe('telas no app desktop vs. navegador', () => {
  it('no desktop, Importar da Udemy mostra o passo a passo da janela embutida e esconde o da extensão', async () => {
    window.lcDesktop = { isDesktop: true, openUdemy: vi.fn() };
    await mount(<ImportUdemy />);
    expect(container.textContent).toContain('Importar pela janela da Udemy');
    expect(container.textContent).not.toContain('extensão do navegador');
    expect(container.textContent).not.toContain('Carregar sem compactação');
  });

  it('no navegador, continua o passo a passo da extensão', async () => {
    await mount(<ImportUdemy />);
    expect(container.textContent).toContain('Carregar sem compactação');
    expect(container.textContent).not.toContain('Importar pela janela da Udemy');
  });

  it('no desktop, Importar conteúdo também aponta para a janela embutida', async () => {
    window.lcDesktop = { isDesktop: true, openUdemy: vi.fn() };
    await mount(<ImportContent />);
    expect(container.textContent).toContain('Importar pela janela da Udemy');
    expect(container.textContent).not.toContain('Como importar (um clique por curso)');
  });

  it('no navegador, Importar conteúdo mantém o passo a passo do botão roxo', async () => {
    await mount(<ImportContent />);
    expect(container.textContent).toContain('Como importar (um clique por curso)');
  });
});
