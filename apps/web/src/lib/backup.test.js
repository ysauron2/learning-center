// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { backupFileName, parseBackupText, countsText, saveJsonFile } from './backup.js';

describe('backupFileName', () => {
  it('usa data e hora locais, com zeros à esquerda, e a extensão .json', () => {
    expect(backupFileName(new Date(2026, 2, 5, 9, 7), 'learning-center-backup')).toBe('learning-center-backup-2026-03-05-0907.json');
  });
});

describe('parseBackupText', () => {
  const valid = JSON.stringify({ app: 'learning-center', version: 1, exportedAt: 'x', data: {} });
  it('aceita um backup do app', () => {
    const r = parseBackupText(valid);
    expect(r.ok).toBe(true);
    expect(r.backup.app).toBe('learning-center');
  });
  it('explica em português quando não é JSON, não é objeto ou é de outro app', () => {
    expect(parseBackupText('{quebrado')).toEqual({ ok: false, error: 'O arquivo não é um JSON válido.' });
    expect(parseBackupText('[1,2]').ok).toBe(false);
    expect(parseBackupText('"texto"').ok).toBe(false);
    expect(parseBackupText(JSON.stringify({ app: 'outro', version: 1 }))).toEqual({ ok: false, error: 'Esse arquivo não é um backup do Learning Center.' });
    expect(parseBackupText('')).toEqual({ ok: false, error: 'O arquivo está vazio.' });
  });
});

describe('countsText', () => {
  it('resume as contagens com singular e plural', () => {
    expect(countsText({ courses: 5, modules: 7, lessons: 130, sessions: 4, tags: 0 })).toBe('5 cursos · 7 módulos · 130 aulas · 4 sessões');
    expect(countsText({ courses: 1, modules: 1, lessons: 1, sessions: 1, tags: 0 })).toBe('1 curso · 1 módulo · 1 aula · 1 sessão');
    expect(countsText({ courses: 0, modules: 0, lessons: 0, sessions: 0, tags: 0 })).toBe('0 cursos · 0 módulos · 0 aulas · 0 sessões');
  });
});

describe('countsText com anotações e trilhas', () => {
  it('inclui quando informadas, com singular e plural', () => {
    expect(countsText({ courses: 5, modules: 7, lessons: 130, sessions: 4, tags: 0, notes: 12, tracks: 2 })).toBe('5 cursos · 7 módulos · 130 aulas · 4 sessões · 12 anotações · 2 trilhas');
    expect(countsText({ courses: 1, modules: 1, lessons: 1, sessions: 1, notes: 1, tracks: 1 })).toBe('1 curso · 1 módulo · 1 aula · 1 sessão · 1 anotação · 1 trilha');
    expect(countsText({ courses: 0, modules: 0, lessons: 0, sessions: 0, notes: 0, tracks: 0 })).toContain('0 anotações · 0 trilhas');
  });
});

describe('saveJsonFile', () => {
  it('baixa um arquivo JSON legível e libera a URL temporária', () => {
    const created = [];
    globalThis.URL.createObjectURL = vi.fn((blob) => { created.push(blob); return 'blob:x'; });
    globalThis.URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    saveJsonFile('a.json', { x: 1 });
    expect(click).toHaveBeenCalledTimes(1);
    expect(created[0].type).toBe('application/json');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    expect(document.querySelector('a[download]')).toBeNull(); // não deixa lixo na página
  });
});
