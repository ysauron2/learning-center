import { describe, it, expect } from 'vitest';
import { barHeights, heatLevel, deltaText, shortDate, tickLabels, ratingText, PERIOD_LABEL, hitCount } from './analytics.js';

describe('barHeights', () => {
  it('escala pelo maior valor, com altura mínima para barras visíveis', () => {
    expect(barHeights([0, 30, 60])).toEqual([3, 50, 100]);
  });
  it('tudo zero devolve só a altura mínima, sem NaN', () => {
    expect(barHeights([0, 0])).toEqual([3, 3]);
    expect(barHeights([])).toEqual([]);
  });
  it('respeita um teto fixo (ex.: meta)', () => {
    expect(barHeights([30, 120], { max: 60 })).toEqual([50, 100]);
  });
});

describe('heatLevel', () => {
  it('0 minutos é nível 0; o máximo é 4; valores no meio ficam entre 1 e 4', () => {
    expect(heatLevel(0, 100)).toBe(0);
    expect(heatLevel(100, 100)).toBe(4);
    expect(heatLevel(1, 100)).toBe(1);
    expect(heatLevel(50, 100)).toBe(2);
    expect(heatLevel(75, 100)).toBe(3);
  });
  it('sem máximo (tudo zero) devolve 0', () => {
    expect(heatLevel(0, 0)).toBe(0);
    expect(heatLevel(5, 0)).toBe(0);
  });
});

describe('deltaText', () => {
  it('descreve em palavras, não só com cor', () => {
    expect(deltaText(null)).toBe('sem período anterior para comparar');
    expect(deltaText(20)).toBe('+20% em relação ao período anterior');
    expect(deltaText(-35)).toBe('−35% em relação ao período anterior');
    expect(deltaText(0)).toBe('igual ao período anterior');
  });
});

describe('shortDate e tickLabels', () => {
  it('formata YYYY-MM-DD como dd/mm', () => {
    expect(shortDate('2026-03-05')).toBe('05/03');
  });
  it('mostra rótulo só de tantas em tantas barras e sempre na última', () => {
    const dates = Array.from({ length: 30 }, (_, i) => `2026-03-${String(i + 1).padStart(2, '0')}`);
    const labels = tickLabels(dates, 7);
    expect(labels[0]).toBe('01/03');
    expect(labels[1]).toBe('');
    expect(labels[7]).toBe('08/03');
    expect(labels.at(-1)).toBe('30/03');
    expect(labels).toHaveLength(30);
  });
  it('lista curta mostra todos os rótulos', () => {
    expect(tickLabels(['2026-03-05', '2026-03-06'], 1)).toEqual(['05/03', '06/03']);
  });
});

describe('ratingText e hitCount', () => {
  it('usa vírgula e indica a escala', () => {
    expect(ratingText(3.3)).toBe('3,3 de 5');
    expect(ratingText(null)).toBe('sem notas ainda');
  });
  it('conta semanas com meta batida', () => {
    expect(hitCount([{ hit: true }, { hit: false }, { hit: true }])).toBe(2);
    expect(hitCount([])).toBe(0);
  });
  it('rótulos das faixas do dia', () => {
    expect(PERIOD_LABEL.manha).toBe('Manhã');
    expect(Object.keys(PERIOD_LABEL)).toEqual(['madrugada', 'manha', 'tarde', 'noite']);
  });
});
