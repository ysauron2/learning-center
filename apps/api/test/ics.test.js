import { describe, it, expect } from 'vitest';
import { buildIcs, escapeText, foldLine } from '../src/modules/calendar/ics.js';

const now = new Date('2026-03-11T15:00:00Z');
const ev = (over = {}) => ({
  uid: 'plan-1-2026-03-16@learning-center',
  start: new Date('2026-03-16T12:00:00Z'),
  end: new Date('2026-03-16T13:00:00Z'),
  summary: '📚 Estudar: Redes',
  description: 'Bloco de estudo.',
  alarmMin: 10,
  ...over,
});
/** Desdobra as linhas longas (RFC 5545) e devolve as linhas lógicas. */
const lines = (ics) => ics.replace(/\r\n[ \t]/g, '').split('\r\n').filter((l, i, a) => !(i === a.length - 1 && l === ''));

describe('escapeText', () => {
  it('escapa barra, ponto e vírgula, vírgula e quebra de linha', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    expect(escapeText('linha1\r\nlinha2')).toBe('linha1\\nlinha2');
    expect(escapeText('')).toBe('');
  });
});

describe('foldLine', () => {
  it('não passa de 75 bytes por linha e continua com um espaço', () => {
    const long = `SUMMARY:${'x'.repeat(200)}`;
    const parts = foldLine(long).split('\r\n');
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) expect(Buffer.byteLength(p)).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(long);
  });
  it('não corta um caractere no meio (acentos e emoji de vários bytes)', () => {
    const text = `SUMMARY:${'ção📚'.repeat(40)}`;
    const folded = foldLine(text);
    for (const p of folded.split('\r\n')) expect(Buffer.byteLength(p)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(text);
  });
  it('linha curta fica como está', () => {
    expect(foldLine('BEGIN:VEVENT')).toBe('BEGIN:VEVENT');
  });
});

describe('buildIcs', () => {
  it('monta um calendário válido: cabeçalho, nome, atualização a cada 15 min, linhas com CRLF', () => {
    const ics = buildIcs({ name: 'Learning Center · Estudos', events: [ev()], now });
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/); // nenhuma quebra de linha sem CR
    const l = lines(ics);
    expect(l[0]).toBe('BEGIN:VCALENDAR');
    expect(l.at(-1)).toBe('END:VCALENDAR');
    expect(l).toEqual(expect.arrayContaining(['VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISHED'.replace('PUBLISHED', 'PUBLISH'), 'X-WR-CALNAME:Learning Center · Estudos', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M']));
    expect(l.find((x) => x.startsWith('PRODID:'))).toContain('Learning Center');
  });

  it('cada evento tem UID estável, horários em UTC, título, descrição e lembrete', () => {
    const l = lines(buildIcs({ name: 'x', events: [ev()], now }));
    const i = l.indexOf('BEGIN:VEVENT');
    const block = l.slice(i, l.indexOf('END:VEVENT') + 1);
    expect(block).toEqual(expect.arrayContaining([
      'UID:plan-1-2026-03-16@learning-center', 'DTSTAMP:20260311T150000Z', 'DTSTART:20260316T120000Z', 'DTEND:20260316T130000Z',
      'SUMMARY:📚 Estudar: Redes', 'DESCRIPTION:Bloco de estudo.', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT10M', 'END:VALARM',
    ]));
  });

  it('sem lembrete (sessão já feita) não cria alarme', () => {
    const l = lines(buildIcs({ name: 'x', events: [ev({ alarmMin: 0 })], now }));
    expect(l).not.toContain('BEGIN:VALARM');
  });

  it('texto com vírgula, ponto e vírgula e quebra de linha é escapado (não quebra o arquivo)', () => {
    const l = lines(buildIcs({ name: 'a, b; c', events: [ev({ summary: 'Redes, TCP; IP', description: 'Linha 1\nLinha 2' })], now }));
    expect(l).toContain('X-WR-CALNAME:a\\, b\\; c');
    expect(l).toContain('SUMMARY:Redes\\, TCP\\; IP');
    expect(l).toContain('DESCRIPTION:Linha 1\\nLinha 2');
  });

  it('texto que tenta injetar linhas do calendário vira só texto', () => {
    const evil = 'x\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:falso';
    const l = lines(buildIcs({ name: 'x', events: [ev({ summary: evil })], now }));
    expect(l.filter((x) => x === 'END:VEVENT')).toHaveLength(1);
    expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(l.find((x) => x.startsWith('SUMMARY:'))).toBe('SUMMARY:x\\nEND:VEVENT\\nBEGIN:VEVENT\\nSUMMARY:falso');
  });

  it('título longo é dobrado em várias linhas, mas desdobra de volta idêntico', () => {
    const summary = `Estudar ${'muito '.repeat(40)}`;
    const raw = buildIcs({ name: 'x', events: [ev({ summary })], now });
    expect(raw.split('\r\n').every((p) => Buffer.byteLength(p) <= 75)).toBe(true);
    expect(lines(raw).find((x) => x.startsWith('SUMMARY:'))).toBe(`SUMMARY:${escapeText(summary)}`);
  });

  it('sem eventos ainda é um calendário válido (para a assinatura não dar erro)', () => {
    const l = lines(buildIcs({ name: 'x', events: [], now }));
    expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(0);
    expect(l.at(-1)).toBe('END:VCALENDAR');
  });

  it('vários eventos mantêm UIDs distintos', () => {
    const l = lines(buildIcs({ name: 'x', events: [ev(), ev({ uid: 'plan-1-2026-03-23@learning-center' })], now }));
    const uids = l.filter((x) => x.startsWith('UID:'));
    expect(new Set(uids).size).toBe(2);
  });
});
