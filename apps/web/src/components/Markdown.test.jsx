// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Markdown } from './Markdown.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
async function render(md) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<Markdown>{md}</Markdown>); });
  return container;
}
beforeEach(() => { document.body.innerHTML = ''; });

describe('Markdown · formatação', () => {
  it('renderiza títulos, negrito, itálico, listas e código', async () => {
    const c = await render('# Título\n\nTexto **forte** e *leve* com `codigo`.\n\n- um\n- dois\n\n1. a\n2. b\n\n```js\nconst x = 1;\n```');
    expect(c.querySelector('h1').textContent).toBe('Título');
    expect(c.querySelector('strong').textContent).toBe('forte');
    expect(c.querySelector('em').textContent).toBe('leve');
    expect(c.querySelectorAll('ul li')).toHaveLength(2);
    expect(c.querySelectorAll('ol li')).toHaveLength(2);
    expect(c.querySelector('pre code').textContent).toContain('const x = 1;');
    expect(c.querySelector('p code').textContent).toBe('codigo');
  });

  it('renderiza tabelas e listas de tarefas (GFM)', async () => {
    const c = await render('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] feito\n- [ ] a fazer');
    expect(c.querySelector('table th').textContent).toBe('a');
    expect(c.querySelector('table td').textContent).toBe('1');
    const boxes = c.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
    expect([...boxes].every((b) => b.disabled)).toBe(true); // só leitura
  });

  it('texto vazio não quebra', async () => {
    const c = await render('');
    expect(c.querySelector('.markdown')).not.toBeNull();
    expect(c.textContent).toBe('');
  });
});

describe('Markdown · segurança (anotação é conteúdo digitado, e pode ser colado de qualquer lugar)', () => {
  it('HTML cru não vira elemento: script, img, iframe, style e handlers aparecem só como texto', async () => {
    const c = await render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://evil.com"></iframe>\n\n<style>body{display:none}</style>\n\n<div onclick="alert(1)">oi</div>');
    for (const tag of ['script', 'img', 'iframe', 'style']) expect(c.querySelector(tag), tag).toBeNull();
    expect(c.querySelector('[onclick],[onerror]')).toBeNull();
    expect(c.querySelector('div[onclick]')).toBeNull();
  });

  it('links javascript:, data: e vbscript: perdem o endereço', async () => {
    const c = await render('[a](javascript:alert(1)) [b](data:text/html;base64,PHNjcmlwdD4=) [c](vbscript:msgbox(1)) [d](JaVaScRiPt:alert(1))');
    const hrefs = [...c.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs).toHaveLength(4);
    for (const h of hrefs) expect(h.toLowerCase()).not.toMatch(/^(javascript|data|vbscript):/);
  });

  it('links https abrem em nova aba, sem repassar a origem nem o referrer', async () => {
    const c = await render('[site](https://example.com/p?x=1) [mail](mailto:a@b.com)');
    const [a, m] = c.querySelectorAll('a');
    expect(a.getAttribute('href')).toBe('https://example.com/p?x=1');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(a.getAttribute('rel')).toContain('noreferrer');
    expect(m.getAttribute('href')).toBe('mailto:a@b.com');
  });

  it('imagens remotas não são carregadas (privacidade): vira texto no lugar', async () => {
    const c = await render('![logo](https://tracker.example/pixel.png) e ![](https://tracker.example/2.png)');
    expect(c.querySelector('img')).toBeNull();
    expect(c.textContent).toContain('[imagem: logo]');
    expect(c.textContent).toContain('[imagem]');
  });

  it('o texto perigoso aparece escapado, legível para quem escreveu', async () => {
    const c = await render('Use `<script>` com cuidado');
    expect(c.querySelector('code').textContent).toBe('<script>');
    expect(c.querySelector('script')).toBeNull();
  });
});
