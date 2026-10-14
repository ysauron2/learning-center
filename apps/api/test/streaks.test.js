import { describe, it, expect } from 'vitest';
import { currentStreak, longestStreak } from '../src/core/streaks.js';

const now = new Date('2026-03-11T15:00:00'); // quarta
const days = (...k) => new Set(k);

describe('currentStreak', () => {
  it('conta dias consecutivos terminando hoje', () => {
    expect(currentStreak(days('2026-03-09', '2026-03-10', '2026-03-11'), now)).toBe(3);
  });
  it('se hoje ainda não teve estudo, parte de ontem', () => {
    expect(currentStreak(days('2026-03-09', '2026-03-10'), now)).toBe(2);
  });
  it('quebra quando falta um dia', () => {
    expect(currentStreak(days('2026-03-08', '2026-03-10', '2026-03-11'), now)).toBe(2);
  });
  it('zero sem estudo recente ou sem dados', () => {
    expect(currentStreak(days('2026-03-05'), now)).toBe(0);
    expect(currentStreak(days(), now)).toBe(0);
  });
});

describe('longestStreak', () => {
  it('acha a maior sequência mesmo com buracos', () => {
    expect(longestStreak(days('2026-01-01', '2026-01-02', '2026-01-04', '2026-01-05', '2026-01-06', '2026-02-01'))).toBe(3);
  });
  it('atravessa fim de mês e de ano', () => {
    expect(longestStreak(days('2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'))).toBe(4);
    expect(longestStreak(days('2026-02-27', '2026-02-28', '2026-03-01'))).toBe(3);
  });
  it('vazio é zero e um dia é um', () => {
    expect(longestStreak(days())).toBe(0);
    expect(longestStreak(days('2026-03-11'))).toBe(1);
  });
});
