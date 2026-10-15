import { describe, it, expect } from 'vitest';
import { parseTags, formatTags, noteLabel, saveStatusText, lessonOptions } from './notes.js';

describe('parseTags / formatTags', () => {
  it('separa por vírgula, tira espaços, minúsculas, sem repetir nem vazios, no máximo 10', () => {
    expect(parseTags(' Redes, TCP ,redes,, ,Linux ')).toEqual(['redes', 'tcp', 'linux']);
    expect(parseTags('')).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(Array.from({ length: 15 }, (_, i) => `t${i}`).join(','))).toHaveLength(10);
  });
  it('ignora tag maior que 30 letras (a API recusaria)', () => {
    expect(parseTags(`curta, ${'x'.repeat(31)}`)).toEqual(['curta']);
  });
  it('formata de volta para o campo de texto', () => {
    expect(formatTags(['a', 'b'])).toBe('a, b');
    expect(formatTags([])).toBe('');
    expect(formatTags(undefined)).toBe('');
  });
});

describe('noteLabel', () => {
  it('usa o título; sem título, o trecho; sem nada, "Sem título"', () => {
    expect(noteLabel({ title: 'Redes', excerpt: 'x' })).toBe('Redes');
    expect(noteLabel({ title: '', excerpt: 'Primeira linha do texto' })).toBe('Primeira linha do texto');
    expect(noteLabel({ title: '  ', excerpt: '' })).toBe('Sem título');
  });
});

describe('saveStatusText', () => {
  it('descreve cada estado em português', () => {
    expect(saveStatusText('saved')).toBe('Salvo');
    expect(saveStatusText('saving')).toBe('Salvando…');
    expect(saveStatusText('dirty')).toBe('Alterações ainda não salvas');
    expect(saveStatusText('error')).toBe('Não foi possível salvar');
    expect(saveStatusText('new')).toBe('Anotação nova (ainda não salva)');
    expect(saveStatusText('qualquer')).toBe('');
  });
});

describe('lessonOptions', () => {
  it('achata módulos e aulas, mostrando o módulo ao lado do nome da aula', () => {
    const course = { modules: [{ title: 'M1', lessons: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }] }, { title: 'M2', lessons: [{ id: 3, title: 'C' }] }] };
    expect(lessonOptions(course)).toEqual([
      { id: 1, label: 'M1 · A' }, { id: 2, label: 'M1 · B' }, { id: 3, label: 'M2 · C' },
    ]);
    expect(lessonOptions(null)).toEqual([]);
    expect(lessonOptions({ modules: [] })).toEqual([]);
  });
});
