import { describe, it, expect } from 'vitest';
import { hasWork, confirmLabel } from './import-preview.js';

const p = (novos, capas) => ({ new: Array.from({ length: novos }, () => ({})), imagesToFill: capas });

describe('prévia da importação de cursos', () => {
  it('só capas a preencher já é trabalho (o caso que travava o botão)', () => {
    expect(hasWork(p(0, 5))).toBe(true);
    expect(confirmLabel(p(0, 5))).toBe('Preencher 5 capa(s)');
  });
  it('só cursos novos, e os dois juntos', () => {
    expect(hasWork(p(3, 0))).toBe(true);
    expect(confirmLabel(p(3, 0))).toBe('Importar 3 curso(s)');
    expect(confirmLabel(p(2, 4))).toBe('Importar 2 curso(s) e preencher 4 capa(s)');
  });
  it('nada novo e nenhuma capa: botão bloqueado e texto neutro', () => {
    expect(hasWork(p(0, 0))).toBe(false);
    expect(confirmLabel(p(0, 0))).toBe('Nada a importar');
  });
  it('resposta sem imagesToFill (API antiga) não quebra', () => {
    expect(hasWork({ new: [] })).toBe(false);
    expect(confirmLabel({ new: [{}] })).toBe('Importar 1 curso(s)');
  });
});
