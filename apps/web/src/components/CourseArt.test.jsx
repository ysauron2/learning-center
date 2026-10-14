// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CourseArt } from './CourseArt.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
const render = async (el) => {
  await act(async () => { root.render(el); });
};
beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

const URL1 = 'https://img-c.udemycdn.com/course/240x135/1_a.jpg';
const URL2 = 'https://img-c.udemycdn.com/course/240x135/2_b.jpg';

describe('CourseArt', () => {
  it('sem imagem usa só o degradê', async () => {
    await render(<CourseArt id={3} className="course-thumb" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstChild.style.background).toContain('gradient');
  });

  it('com imagem mostra <img> decorativa, sem referrer e carregamento tardio, com filhos por cima', async () => {
    await render(<CourseArt id={3} imageUrl={URL1}><span className="plat">Udemy</span></CourseArt>);
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe(URL1);
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(container.querySelector('.plat')).not.toBeNull();
    expect(img.compareDocumentPosition(container.querySelector('.plat')) & 4).toBeTruthy(); // filho depois = por cima
  });

  it('se a imagem falhar, volta para o degradê', async () => {
    await render(<CourseArt id={3} imageUrl={URL1} />);
    await act(async () => { container.querySelector('img').dispatchEvent(new Event('error')); });
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstChild.style.background).toContain('gradient');
  });

  it('trocar o endereço depois de uma falha tenta a nova imagem', async () => {
    await render(<CourseArt id={3} imageUrl={URL1} />);
    await act(async () => { container.querySelector('img').dispatchEvent(new Event('error')); });
    await render(<CourseArt id={3} imageUrl={URL2} />);
    expect(container.querySelector('img').getAttribute('src')).toBe(URL2);
  });

  it('repassa atributos de acessibilidade ao contêiner', async () => {
    await render(<CourseArt id={1} imageUrl={URL1} role="img" aria-label="Capa do curso" />);
    expect(container.firstChild.getAttribute('role')).toBe('img');
    expect(container.firstChild.getAttribute('aria-label')).toBe('Capa do curso');
  });
});
