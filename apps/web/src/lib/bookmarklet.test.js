// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildBookmarklet, parseImportMessage } from './bookmarklet.js';

const APP = 'http://localhost:3000';
const run = () => {
  const code = decodeURIComponent(buildBookmarklet(APP).replace(/^javascript:/, ''));
  new Function(code)();
};

beforeEach(() => {
  document.body.innerHTML = '<div><a href="/course/x/"><h3>Curso X</h3></a><span>30%</span></div>';
  vi.restoreAllMocks();
});

describe('favorito (bookmarklet)', () => {
  it('é um endereço javascript: e embute o endereço do app', () => {
    const url = buildBookmarklet(APP);
    expect(url.startsWith('javascript:')).toBe(true);
    expect(decodeURIComponent(url)).toContain(APP);
  });

  it('abre o app e entrega a lista só quando o app avisa que está pronto', () => {
    const target = { postMessage: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(target);
    run();
    expect(window.open).toHaveBeenCalledWith(`${APP}/importar`, 'lc-import');
    expect(target.postMessage).not.toHaveBeenCalled();

    // origem errada não recebe nada
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-ready' }, origin: 'https://evil.com', source: target }));
    expect(target.postMessage).not.toHaveBeenCalled();

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-ready' }, origin: APP, source: target }));
    expect(target.postMessage).toHaveBeenCalledTimes(1);
    const [msg, origin] = target.postMessage.mock.calls[0];
    expect(origin).toBe(APP);
    expect(msg).toMatchObject({ type: 'lc-import', items: [{ title: 'Curso X', progress: 30 }] });
  });

  it('avisa e não abre nada quando a página não tem cursos', () => {
    document.body.innerHTML = '<p>vazio</p>';
    vi.spyOn(window, 'open');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    run();
    expect(alertSpy).toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe('parseImportMessage', () => {
  const ev = (origin, data) => ({ origin, data });
  const ok = { type: 'lc-import', items: [{ title: 'A', url: 'https://www.udemy.com/course/a/', progress: 10 }] };

  it('aceita só mensagens vindas da Udemy', () => {
    expect(parseImportMessage(ev('https://www.udemy.com', ok))).toHaveLength(1);
    expect(parseImportMessage(ev('https://empresa.udemy.com', ok))).toHaveLength(1);
    expect(parseImportMessage(ev('https://evil.com', ok))).toBeNull();
    expect(parseImportMessage(ev('https://udemy.com.evil.com', ok))).toBeNull();
    expect(parseImportMessage(ev('http://www.udemy.com', ok))).toBeNull();
  });

  it('mantém a capa (imageUrl) e o instrutor quando vierem como texto', () => {
    const r = parseImportMessage(ev('https://www.udemy.com', { type: 'lc-import', items: [{ title: 'A', url: 'u', progress: 1, imageUrl: 'https://img-c.udemycdn.com/a.jpg', instructor: 'M' }, { title: 'B', url: 'u', imageUrl: 5 }] }));
    expect(r[0]).toEqual({ title: 'A', url: 'u', progress: 1, instructor: 'M', imageUrl: 'https://img-c.udemycdn.com/a.jpg' });
    expect(r[1]).toEqual({ title: 'B', url: 'u', progress: 0 });
  });

  it('descarta formatos inválidos e itens malformados', () => {
    expect(parseImportMessage(ev('https://www.udemy.com', { type: 'outro', items: [] }))).toBeNull();
    expect(parseImportMessage(ev('https://www.udemy.com', { type: 'lc-import', items: 'x' }))).toBeNull();
    expect(parseImportMessage(ev('https://www.udemy.com', { type: 'lc-import', items: [null, { title: 1 }] }))).toBeNull();
    const r = parseImportMessage(ev('https://www.udemy.com', { type: 'lc-import', items: [{ title: 'A', url: 'u', progress: 'x' }, null] }));
    expect(r).toEqual([{ title: 'A', url: 'u', progress: 0 }]);
  });
});
