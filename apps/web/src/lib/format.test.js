import { describe, it, expect } from 'vitest';
import { formatMinutes, formatClock, relativeDay, greeting, thumbFor } from './format.js';

describe('formatMinutes', () => {
  it('formata minutos, horas e combinações', () => {
    expect(formatMinutes(0)).toBe('0min');
    expect(formatMinutes(45)).toBe('45min');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(750)).toBe('12h 30min');
    expect(formatMinutes(65)).toBe('1h 05min');
  });
  it('tolera valores inválidos', () => {
    expect(formatMinutes(undefined)).toBe('0min');
    expect(formatMinutes(-5)).toBe('0min');
  });
});

describe('formatClock', () => {
  it('formata mm:ss e h:mm:ss', () => {
    expect(formatClock(1500)).toBe('25:00');
    expect(formatClock(59)).toBe('00:59');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-3)).toBe('00:00');
  });
});

describe('relativeDay', () => {
  const now = new Date('2026-03-11T15:00:00');
  it('descreve hoje, ontem e dias atrás', () => {
    expect(relativeDay('2026-03-11T08:00:00', now)).toBe('hoje');
    expect(relativeDay('2026-03-10T23:00:00', now)).toBe('ontem');
    expect(relativeDay('2026-03-08T10:00:00', now)).toBe('há 3 dias');
    expect(relativeDay(null, now)).toBe('');
  });
});

describe('greeting / thumbFor', () => {
  it('muda conforme a hora', () => {
    expect(greeting(new Date('2026-03-11T09:00:00'))).toBe('Bom dia');
    expect(greeting(new Date('2026-03-11T15:00:00'))).toBe('Boa tarde');
    expect(greeting(new Date('2026-03-11T21:00:00'))).toBe('Boa noite');
  });
  it('é estável para o mesmo id', () => {
    expect(thumbFor(3)).toBe(thumbFor(3));
  });
});
