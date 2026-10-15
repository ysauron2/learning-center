// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
async function mount(path = '/') {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route element={<Layout />}><Route path="*" element={<div id="page" />} /></Route></Routes>
      </MemoryRouter>,
    );
  });
}
beforeEach(() => { document.body.innerHTML = ''; });

const side = () => container.querySelector('nav[aria-label="Navegação principal"]');
const bottom = () => container.querySelector('nav.bottom-nav');
const linkTexts = (nav) => [...nav.querySelectorAll('a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]);

describe('menu lateral', () => {
  it('tem Trilhas e Anotações ativas, e Laboratórios saiu', async () => {
    await mount();
    const links = linkTexts(side());
    expect(links).toEqual(expect.arrayContaining([
      ['Learning Center', '/'], ['Cursos', '/cursos'], ['Trilhas', '/trilhas'], ['Sessões de foco', '/foco'],
      ['Anotações', '/anotacoes'], ['Analytics', '/analytics'], ['Agenda', '/agenda'], ['Backup', '/backup'],
    ]));
    expect(side().textContent).not.toContain('Laboratórios');
  });

  it('Tutor IA (e Certificações) seguem como "em breve", sem link', async () => {
    await mount();
    const soon = [...side().querySelectorAll('[aria-disabled="true"]')].map((el) => el.textContent);
    expect(soon.some((t) => t.includes('Tutor IA') && t.includes('EM BREVE'))).toBe(true);
    expect(soon.some((t) => t.includes('Certificações') && t.includes('EM BREVE'))).toBe(true);
    expect(side().querySelector('a[href*="tutor"]')).toBeNull();
    expect(soon.some((t) => t.includes('Trilhas') || t.includes('Anotações'))).toBe(false); // deixaram de ser "em breve"
  });

  it('marca o item da página atual', async () => {
    await mount('/trilhas/5');
    const active = [...side().querySelectorAll('a.active')].map((a) => a.textContent.trim());
    expect(active).toEqual(['Trilhas']);
  });
});

describe('barra do celular', () => {
  it('inclui Trilhas e Notas, e Analytics', async () => {
    await mount();
    expect(linkTexts(bottom())).toEqual(expect.arrayContaining([['Trilhas', '/trilhas'], ['Notas', '/anotacoes'], ['Analytics', '/analytics'], ['Agenda', '/agenda']]));
  });
});
