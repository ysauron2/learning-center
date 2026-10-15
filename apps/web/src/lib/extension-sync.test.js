// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildFiles } from '../../../../scripts/build-extension.mjs';

const APP = 'http://localhost:3000';
const files = buildFiles(APP);

const COURSES_HTML = '<div><a href="/course/python/"><h3>Python</h3></a><span>30%</span></div>';
const PLAYER_HTML = `
  <h1 data-purpose="course-header-title">Python</h1>
  <div data-purpose="section-panel-0">
    <button aria-expanded="true"><span data-purpose="section-heading">Seção 1: Início</span></button>
    <ul>
      <li data-purpose="curriculum-item-0-0"><label><input type="checkbox" checked><span>Aula 1</span></label><span>4min</span></li>
      <li data-purpose="curriculum-item-0-1"><label><input type="checkbox" class="b"><span>Aula 2</span></label><span>6min</span></li>
    </ul>
  </div>`;

let docListeners = [];
let origAdd;
beforeEach(() => {
  vi.useFakeTimers();
  origAdd = document.addEventListener.bind(document);
  docListeners = [];
  document.addEventListener = (type, fn, opts) => { docListeners.push([type, fn, opts]); origAdd(type, fn, opts); };
});
afterEach(() => {
  for (const [type, fn, opts] of docListeners) document.removeEventListener(type, fn, opts);
  document.addEventListener = origAdd;
  document.documentElement.querySelectorAll('div[style*="fixed"]').forEach((n) => n.remove());
  vi.useRealTimers();
});

function boot({ path, html, auto = true, respond }) {
  document.documentElement.querySelectorAll('div[style*="fixed"]').forEach((n) => n.remove());
  document.body.innerHTML = html;
  window.history.pushState({}, '', path);
  const sendMessage = vi.fn(async (msg) => respond(msg));
  const set = vi.fn().mockResolvedValue();
  globalThis.chrome = { runtime: { sendMessage }, storage: { local: { get: vi.fn().mockResolvedValue({ autoSync: auto }), set } } };
  new Function(files['content-udemy.js'])();
  const host = () => document.documentElement.querySelector('div[style*="fixed"]');
  return {
    sendMessage, set, host,
    toast: () => host().shadowRoot.querySelector('.toast'),
    box: () => host().shadowRoot.querySelector('.auto-box'),
  };
}
const ok = (data) => () => ({ ok: true, data });
const syncCalls = (sendMessage) => sendMessage.mock.calls.map((c) => c[0]).filter((m) => m.type === 'lc-sync');

describe('sincronização automática · Meus cursos', () => {
  it('ligada: lê a lista, envia ao app e avisa o que mudou', async () => {
    const t = boot({ path: '/home/my-courses/learning/', html: COURSES_HTML, respond: ok({ created: 1, progressUpdated: 2, imagesFilled: 0 }) });
    await vi.advanceTimersByTimeAsync(3500);
    const calls = syncCalls(t.sendMessage);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ type: 'lc-sync', kind: 'courses', items: [{ title: 'Python', progress: 30 }] });
    expect(t.toast().textContent).toBe('Sincronizado: 1 curso novo, 2 progressos atualizados.');
  });

  it('desligada: não envia nada sozinha', async () => {
    const t = boot({ path: '/home/my-courses/learning/', html: COURSES_HTML, auto: false, respond: ok({}) });
    await vi.advanceTimersByTimeAsync(10000);
    expect(syncCalls(t.sendMessage)).toHaveLength(0);
    expect(t.box().checked).toBe(false);
  });

  it('ligar o interruptor guarda a escolha, avisa e sincroniza logo em seguida', async () => {
    const t = boot({ path: '/home/my-courses/learning/', html: COURSES_HTML, auto: false, respond: ok({ created: 1 }) });
    await vi.advanceTimersByTimeAsync(100);
    t.box().checked = true;
    t.box().dispatchEvent(new Event('change'));
    expect(t.set).toHaveBeenCalledWith({ autoSync: true });
    expect(t.toast().textContent).toContain('ligada');
    await vi.advanceTimersByTimeAsync(1000);
    expect(syncCalls(t.sendMessage)).toHaveLength(1);
    t.box().checked = false;
    t.box().dispatchEvent(new Event('change'));
    expect(t.set).toHaveBeenLastCalledWith({ autoSync: false });
    expect(t.toast().textContent).toContain('desligada');
  });

  it('sem novidades não incomoda (nenhum aviso), e o mesmo conteúdo não é reenviado', async () => {
    const t = boot({ path: '/home/my-courses/learning/', html: COURSES_HTML, respond: ok({ created: 0, progressUpdated: 0, imagesFilled: 0 }) });
    await vi.advanceTimersByTimeAsync(3500);
    expect(syncCalls(t.sendMessage)).toHaveLength(1);
    expect(t.toast().style.display).not.toBe('block');
    // muda de página e volta com a mesma lista: não reenvia
    window.history.pushState({}, '', '/home/my-courses/archived/');
    await vi.advanceTimersByTimeAsync(6000);
    expect(syncCalls(t.sendMessage)).toHaveLength(1);
  });

  it('página sem cursos (ainda carregando): tenta algumas vezes e desiste sem aviso', async () => {
    const t = boot({ path: '/home/my-courses/learning/', html: '<p>carregando…</p>', respond: ok({}) });
    await vi.advanceTimersByTimeAsync(20000);
    expect(syncCalls(t.sendMessage)).toHaveLength(0);
    expect(t.toast().style.display).not.toBe('block');
  });
});

describe('sincronização automática · player do curso', () => {
  const summary = { matched: true, courseId: 1, courseTitle: 'Python', summary: { lessonsCreated: 2, lessonsCompleted: 1 } };

  it('lê as aulas, envia e avisa no aviso do canto da página', async () => {
    const t = boot({ path: '/course/python/learn/lecture/10', html: PLAYER_HTML, respond: ok(summary) });
    await vi.advanceTimersByTimeAsync(3500);
    const [call] = syncCalls(t.sendMessage);
    expect(call).toMatchObject({ kind: 'content', content: { title: 'Python' } });
    expect(call.content.modules[0].lessons.map((l) => [l.title, l.completed])).toEqual([['Aula 1', true], ['Aula 2', false]]);
    expect(t.toast().textContent).toBe('Sincronizado em "Python": 2 aulas novas, 1 concluída.');
  });

  it('curso não encontrado no app: avisa uma vez só e orienta o clique manual', async () => {
    const t = boot({ path: '/course/python/learn/lecture/10', html: PLAYER_HTML, respond: ok({ matched: false, candidates: [] }) });
    await vi.advanceTimersByTimeAsync(3500);
    expect(t.toast().textContent).toContain('Não achei este curso no seu app');
    t.toast().textContent = '';
    window.history.pushState({}, '', '/course/python/learn/lecture/11');
    await vi.advanceTimersByTimeAsync(6000);
    expect(t.toast().textContent).toBe(''); // mesma situação: não repete o aviso
  });

  it('marcar uma aula como vista sincroniza de novo depois de alguns segundos', async () => {
    const t = boot({ path: '/course/python/learn/lecture/10', html: PLAYER_HTML, respond: ok({ ...summary, summary: { lessonsCreated: 0, lessonsCompleted: 0 } }) });
    await vi.advanceTimersByTimeAsync(3500);
    expect(syncCalls(t.sendMessage)).toHaveLength(1);
    const box = document.querySelector('input.b');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(syncCalls(t.sendMessage)).toHaveLength(1); // ainda esperando (atraso)
    await vi.advanceTimersByTimeAsync(4000);
    const calls = syncCalls(t.sendMessage);
    expect(calls).toHaveLength(2);
    expect(calls[1].content.modules[0].lessons.map((l) => l.completed)).toEqual([true, true]);
  });

  it('mudar de aula (nova página) também sincroniza', async () => {
    const t = boot({ path: '/course/python/learn/lecture/10', html: PLAYER_HTML, respond: ok(summary) });
    await vi.advanceTimersByTimeAsync(3500);
    document.querySelector('input.b').checked = true; // o estado mudou entre as aulas
    window.history.pushState({}, '', '/course/python/learn/lecture/11');
    await vi.advanceTimersByTimeAsync(6000);
    expect(syncCalls(t.sendMessage)).toHaveLength(2);
  });
});

describe('sincronização automática · app fechado ou com erro', () => {
  it('app não está rodando: avisa como abrir, e não repete o aviso por 10 minutos', async () => {
    const t = boot({ path: '/home/my-courses/learning/', html: COURSES_HTML, respond: () => ({ ok: false, reason: 'offline' }) });
    await vi.advanceTimersByTimeAsync(3500);
    expect(t.toast().textContent).toContain('não está rodando');
    t.toast().textContent = '';
    window.history.pushState({}, '', '/home/my-courses/archived/');
    await vi.advanceTimersByTimeAsync(6000);
    expect(syncCalls(t.sendMessage).length).toBeGreaterThan(1); // tenta de novo...
    expect(t.toast().textContent).toBe(''); // ...mas sem repetir o aviso
  });

  it('erro do servidor mostra o código', async () => {
    const t = boot({ path: '/home/my-courses/learning/', html: COURSES_HTML, respond: () => ({ ok: false, reason: 'http', status: 500 }) });
    await vi.advanceTimersByTimeAsync(3500);
    expect(t.toast().textContent).toBe('Não consegui sincronizar (erro 500).');
  });

  it('a falha de envio (mensagem rejeitada) vira "app fechado", sem quebrar a página', async () => {
    const t = boot({ path: '/home/my-courses/learning/', html: COURSES_HTML, respond: () => { throw new Error('Extension context invalidated'); } });
    await vi.advanceTimersByTimeAsync(3500);
    expect(t.toast().textContent).toContain('não está rodando');
  });
});

describe('background.js · chamadas ao app local', () => {
  let listener;
  const load = () => {
    globalThis.chrome = { runtime: { onMessage: { addListener: (fn) => { listener = fn; } } }, tabs: {}, storage: { session: {} } };
    new Function(files['background.js'])();
  };
  const ask = (msg) => new Promise((resolve) => { const keep = listener(msg, {}, resolve); if (!keep) resolve('sem-resposta'); });
  beforeEach(() => { vi.useRealTimers(); load(); });

  it('cursos: envia ao app com updateProgress e devolve os dados', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { created: 1 } }) });
    globalThis.fetch = fetchMock;
    const r = await ask({ type: 'lc-sync', kind: 'courses', items: [{ title: 'A', url: 'u', progress: 1 }] });
    expect(r).toEqual({ ok: true, data: { created: 1 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${APP}/api/v1/courses/import`);
    expect(JSON.parse(init.body)).toEqual({ updateProgress: true, items: [{ title: 'A', url: 'u', progress: 1 }] });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('conteúdo: usa o endpoint de sincronização automática', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { matched: true } }) });
    globalThis.fetch = fetchMock;
    const content = { title: 'T', url: 'u', modules: [{ title: 'M', lessons: [] }] };
    expect(await ask({ type: 'lc-sync', kind: 'content', content })).toEqual({ ok: true, data: { matched: true } });
    expect(fetchMock.mock.calls[0][0]).toBe(`${APP}/api/v1/courses/sync-content`);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(content);
  });

  it('app fechado vira "offline"; erro de servidor vira "http" com o código', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await ask({ type: 'lc-sync', kind: 'courses', items: [{}] })).toEqual({ ok: false, reason: 'offline' });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    expect(await ask({ type: 'lc-sync', kind: 'courses', items: [{}] })).toEqual({ ok: false, reason: 'http', status: 503 });
  });

  it('pedido malformado é ignorado e nada é enviado', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    expect(await ask({ type: 'lc-sync', kind: 'courses' })).toBe('sem-resposta');
    expect(await ask({ type: 'lc-sync', kind: 'content', content: { modules: 'x' } })).toBe('sem-resposta');
    expect(await ask({ type: 'lc-sync', kind: 'outro' })).toBe('sem-resposta');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('limita a 500 cursos por envio e só fala com o endereço configurado do app', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    globalThis.fetch = fetchMock;
    await ask({ type: 'lc-sync', kind: 'courses', items: Array.from({ length: 800 }, () => ({})) });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).items).toHaveLength(500);
    expect(new URL(fetchMock.mock.calls[0][0]).origin).toBe(APP);
  });
});
