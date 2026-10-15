// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({ api: { backup: vi.fn(), backupPreview: vi.fn(), backupRestore: vi.fn() } }));
vi.mock('../lib/backup.js', async (orig) => ({ ...(await orig()), saveJsonFile: vi.fn() }));
import { api } from '../lib/api.js';
import { saveJsonFile } from '../lib/backup.js';
import Backup from './Backup.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const counts = { courses: 5, modules: 7, lessons: 130, sessions: 4, tags: 0 };
const backupObj = { app: 'learning-center', version: 1, exportedAt: '2026-10-14T18:00:00.000Z', data: {} };
let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><Backup /></MemoryRouter>); });
}
async function pick(text, name = 'meu-backup.json') {
  const input = container.querySelector('#bk-file');
  const file = new File([text], name, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await flush();
}
const btn = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(label));

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  api.backup.mockResolvedValue(backupObj);
  api.backupPreview.mockResolvedValue({ exportedAt: backupObj.exportedAt, counts });
  api.backupRestore.mockResolvedValue({ counts, exportedAt: backupObj.exportedAt });
});

describe('página Backup', () => {
  it('baixar backup salva o arquivo e avisa', async () => {
    await mount();
    await act(async () => { btn('Baixar backup').click(); });
    await flush();
    expect(api.backup).toHaveBeenCalledTimes(1);
    expect(saveJsonFile).toHaveBeenCalledWith(expect.stringMatching(/^learning-center-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/), backupObj);
    expect(container.textContent).toContain('Backup baixado');
  });

  it('escolher arquivo mostra a prévia e o aviso, e o botão só libera depois de concordar', async () => {
    await mount();
    await pick(JSON.stringify(backupObj));
    expect(api.backupPreview).toHaveBeenCalledWith(backupObj);
    expect(container.textContent).toContain('5 cursos · 7 módulos · 130 aulas · 4 sessões');
    expect(container.querySelector('[role="alert"]').textContent).toContain('substitui todos os dados atuais');
    const restoreBtn = () => btn('Restaurar e substituir tudo');
    expect(restoreBtn().disabled).toBe(true);
    await act(async () => { container.querySelector('input[type="checkbox"]').click(); });
    expect(restoreBtn().disabled).toBe(false);
  });

  it('restaurar baixa antes uma cópia de segurança e só então substitui', async () => {
    await mount();
    await pick(JSON.stringify(backupObj));
    await act(async () => { container.querySelector('input[type="checkbox"]').click(); });
    await act(async () => { btn('Restaurar e substituir tudo').click(); });
    await flush();
    expect(saveJsonFile).toHaveBeenCalledWith(expect.stringContaining('antes-de-restaurar'), backupObj);
    expect(api.backupRestore).toHaveBeenCalledWith(backupObj);
    expect(saveJsonFile.mock.invocationCallOrder[0]).toBeLessThan(api.backupRestore.mock.invocationCallOrder[0]);
    expect(container.textContent).toContain('Restaurado: 5 cursos');
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('se a cópia de segurança falhar, NÃO restaura', async () => {
    api.backup.mockRejectedValue(new Error('sem rede'));
    await mount();
    await pick(JSON.stringify(backupObj));
    await act(async () => { container.querySelector('input[type="checkbox"]').click(); });
    await act(async () => { btn('Restaurar e substituir tudo').click(); });
    await flush();
    expect(api.backupRestore).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('arquivo inválido ou de outro app mostra erro e não chama a API', async () => {
    await mount();
    await pick('isso não é json');
    expect(api.backupPreview).not.toHaveBeenCalled();
    expect(container.textContent).toContain('não é um JSON válido');
    await pick(JSON.stringify({ app: 'outro' }));
    expect(api.backupPreview).not.toHaveBeenCalled();
    expect(container.textContent).toContain('não é um backup do Learning Center');
  });

  it('o servidor recusando o arquivo mostra o erro e não oferece restaurar', async () => {
    api.backupPreview.mockRejectedValue(new Error('arquivo corrompido'));
    await mount();
    await pick(JSON.stringify(backupObj));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(btn('Restaurar e substituir tudo')).toBeUndefined();
  });

  it('cancelar esconde a prévia', async () => {
    await mount();
    await pick(JSON.stringify(backupObj));
    await act(async () => { btn('Cancelar').click(); });
    expect(btn('Restaurar e substituir tudo')).toBeUndefined();
  });
});
