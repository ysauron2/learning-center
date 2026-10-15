import { describe, it, expect } from 'vitest';
import { groupByDay, dayLabel, timeRange, eventIcon, relativeSync, eventDayKey, WEEKDAYS_FULL, weekdayShort, nextDays, startsIn } from './calendar.js';

const now = new Date('2026-03-11T15:00:00'); // quarta-feira, horário local
const iso = (local) => new Date(local).toISOString();
const ev = (title, start, end, extra = {}) => ({ id: title, title, start: iso(start), end: iso(end), allDay: false, calendar: 'primary', kind: null, ...extra });

describe('eventDayKey', () => {
  it('dia local do início; dia inteiro usa a própria data', () => {
    expect(eventDayKey(ev('a', '2026-03-12T23:30:00', '2026-03-13T00:30:00'))).toBe('2026-03-12');
    expect(eventDayKey({ allDay: true, start: '2026-03-13', end: '2026-03-14' })).toBe('2026-03-13');
  });
});

describe('dayLabel', () => {
  it('Hoje, Amanhã e depois o dia da semana com data', () => {
    expect(dayLabel('2026-03-11', now)).toBe('Hoje · qua 11/03');
    expect(dayLabel('2026-03-12', now)).toBe('Amanhã · qui 12/03');
    expect(dayLabel('2026-03-14', now)).toBe('sáb 14/03');
  });
  it('funciona na virada do mês e do ano', () => {
    expect(dayLabel('2026-04-01', new Date('2026-03-31T10:00:00'))).toBe('Amanhã · qua 01/04');
    expect(dayLabel('2027-01-01', new Date('2026-12-31T10:00:00'))).toBe('Amanhã · sex 01/01');
  });
});

describe('timeRange', () => {
  it('mostra HH:MM–HH:MM no horário local; dia inteiro vira "Dia inteiro"', () => {
    expect(timeRange(ev('a', '2026-03-12T09:05:00', '2026-03-12T10:00:00'))).toBe('09:05–10:00');
    expect(timeRange({ allDay: true, start: '2026-03-13', end: '2026-03-14' })).toBe('Dia inteiro');
  });
  it('evento sem fim mostra só o início', () => {
    expect(timeRange({ allDay: false, start: iso('2026-03-12T09:05:00'), end: null })).toBe('09:05');
  });
});

describe('eventIcon', () => {
  it('📚 para bloco de estudo, ✅ para sessão feita, nada para os demais', () => {
    expect(eventIcon({ kind: 'plan' })).toBe('📚');
    expect(eventIcon({ kind: 'session' })).toBe('✅');
    expect(eventIcon({ kind: null })).toBe('');
  });
});

describe('groupByDay', () => {
  const events = [
    ev('Almoço', '2026-03-11T12:00:00', '2026-03-11T13:00:00'),
    { id: 'f', title: 'Feriado', allDay: true, start: '2026-03-13', end: '2026-03-14', calendar: 'primary', kind: null },
    ev('Estudar', '2026-03-11T19:00:00', '2026-03-11T20:00:00', { calendar: 'study', kind: 'plan' }),
    ev('Reunião', '2026-03-12T10:00:00', '2026-03-12T11:00:00'),
  ];
  it('agrupa por dia, em ordem, com rótulos e mantendo a ordem dos eventos', () => {
    const g = groupByDay(events, now);
    expect(g.map((d) => [d.key, d.label, d.events.map((e) => e.title)])).toEqual([
      ['2026-03-11', 'Hoje · qua 11/03', ['Almoço', 'Estudar']],
      ['2026-03-12', 'Amanhã · qui 12/03', ['Reunião']],
      ['2026-03-13', 'sex 13/03', ['Feriado']],
    ]);
  });
  it('lista vazia ou indefinida devolve vazio', () => {
    expect(groupByDay([], now)).toEqual([]);
    expect(groupByDay(undefined, now)).toEqual([]);
  });
  it('dentro do dia, o de dia inteiro vem antes dos com horário', () => {
    const g = groupByDay([ev('Cedo', '2026-03-13T08:00:00', '2026-03-13T09:00:00'), { id: 'x', title: 'Dia todo', allDay: true, start: '2026-03-13', end: '2026-03-14' }], now);
    expect(g[0].events.map((e) => e.title)).toEqual(['Dia todo', 'Cedo']);
  });
});

describe('relativeSync', () => {
  it('descreve a última sincronização em palavras', () => {
    const base = new Date('2026-03-11T15:00:00');
    expect(relativeSync(null, base)).toBe('ainda não sincronizado');
    expect(relativeSync(new Date('2026-03-11T14:59:40').toISOString(), base)).toBe('agora há pouco');
    expect(relativeSync(new Date('2026-03-11T14:55:00').toISOString(), base)).toBe('há 5 min');
    expect(relativeSync(new Date('2026-03-11T12:00:00').toISOString(), base)).toBe('há 3 h');
    expect(relativeSync(new Date('2026-03-10T10:00:00').toISOString(), base)).toBe('ontem');
    expect(relativeSync(new Date('2026-03-07T10:00:00').toISOString(), base)).toBe('há 4 dias');
  });
});

describe('dias da semana', () => {
  it('segunda é 0, como na API', () => {
    expect(WEEKDAYS_FULL[0]).toBe('Segunda');
    expect(WEEKDAYS_FULL[6]).toBe('Domingo');
    expect(weekdayShort(2)).toBe('Qua');
  });
});

describe('nextDays', () => {
  it('lista 7 dias a partir de hoje, com o virar do mês e do ano', () => {
    const days = nextDays(7, new Date('2026-12-29T10:00:00'));
    expect(days.map((d) => d.key)).toEqual(['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04']);
    expect(days.map((d) => d.weekday)).toEqual(['ter', 'qua', 'qui', 'sex', 'sáb', 'dom', 'seg']);
    expect(days[0]).toMatchObject({ isToday: true, date: '29/12' });
    expect(days.slice(1).every((d) => !d.isToday)).toBe(true);
  });
});

describe('startsIn', () => {
  const block = (start, end) => ({ start: iso(start), end: iso(end) });
  it('descreve quando o bloco começa', () => {
    expect(startsIn(block('2026-03-11T14:30:00', '2026-03-11T15:30:00'), now)).toBe('acontecendo agora');
    expect(startsIn(block('2026-03-11T15:35:00', '2026-03-11T16:00:00'), now)).toBe('começa em 35 min');
    expect(startsIn(block('2026-03-11T15:00:20', '2026-03-11T16:00:00'), now)).toBe('começa em 1 min');
    expect(startsIn(block('2026-03-11T17:10:00', '2026-03-11T18:00:00'), now)).toBe('começa em 2 h 10 min');
    expect(startsIn(block('2026-03-11T20:00:00', '2026-03-11T20:45:00'), now)).toBe('começa em 5 h');
    expect(startsIn(block('2026-03-12T20:00:00', '2026-03-12T20:45:00'), now)).toBe('Amanhã · qui 12/03');
    expect(startsIn(block('2026-03-14T20:00:00', '2026-03-14T20:45:00'), now)).toBe('sáb 14/03');
  });
});
