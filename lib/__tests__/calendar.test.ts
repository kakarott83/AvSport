/**
 * Tests for lib/calendar.ts
 *
 * Covers:
 *  - daysInMonth: regular months, leap year, non-leap February
 *  - computeMonthStats: counts, sorting, empty result, unknown tag IDs (no crash)
 *  - buildMarked: dot generation, note-only rows, unknown tags, selected marker
 */

jest.mock('@/services/supabaseClient');
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

import {
  buildMarked,
  computeMonthStats,
  daysInMonth,
  type LogRow,
  type Tag,
} from '@/lib/calendar';

import { defaultTagsFixture, noteOnlyLogFixture } from '@/__mocks__/supabase-fixtures';

// ── daysInMonth ───────────────────────────────────────────────────────────────

describe('daysInMonth', () => {
  it('April hat 30 Tage', () => {
    expect(daysInMonth('2026-04')).toBe(30);
  });

  it('März hat 31 Tage', () => {
    expect(daysInMonth('2026-03')).toBe(31);
  });

  it('Februar hat 28 Tage in einem Nicht-Schaltjahr', () => {
    expect(daysInMonth('2025-02')).toBe(28);
  });

  it('Februar hat 29 Tage in einem Schaltjahr', () => {
    expect(daysInMonth('2024-02')).toBe(29);
  });

  it('Dezember hat 31 Tage', () => {
    expect(daysInMonth('2026-12')).toBe(31);
  });
});

// ── computeMonthStats ─────────────────────────────────────────────────────────

describe('computeMonthStats', () => {
  it('gibt leeres Array zurück wenn keine Logs vorhanden sind', () => {
    const result = computeMonthStats([], '2026-04', defaultTagsFixture);
    expect(result).toHaveLength(0);
  });

  it('gibt leeres Array zurück wenn keine Logs im gewählten Monat liegen', () => {
    const logs: LogRow[] = [
      { date: '2026-03-10', tag_ids: ['period'], note: null },
    ];
    const result = computeMonthStats(logs, '2026-04', defaultTagsFixture);
    expect(result).toHaveLength(0);
  });

  it('zählt Tags im Monat korrekt', () => {
    const logs: LogRow[] = [
      { date: '2026-04-01', tag_ids: ['period'], note: null },
      { date: '2026-04-02', tag_ids: ['period'], note: null },
      { date: '2026-04-05', tag_ids: ['stress'],  note: null },
    ];
    const result = computeMonthStats(logs, '2026-04', defaultTagsFixture);

    const periodStat = result.find(s => s.tag.id === 'period');
    const stressStat = result.find(s => s.tag.id === 'stress');

    expect(periodStat?.count).toBe(2);
    expect(stressStat?.count).toBe(1);
  });

  it('schließt Tags mit count = 0 aus dem Ergebnis aus', () => {
    const logs: LogRow[] = [
      { date: '2026-04-01', tag_ids: ['period'], note: null },
    ];
    const result = computeMonthStats(logs, '2026-04', defaultTagsFixture);

    // Only 'period' should appear; no_alcohol and stress have count 0
    expect(result.every(s => s.count > 0)).toBe(true);
    expect(result.find(s => s.tag.id === 'no_alcohol')).toBeUndefined();
  });

  it('sortiert Ergebnisse absteigend nach count', () => {
    const logs: LogRow[] = [
      { date: '2026-04-01', tag_ids: ['stress'], note: null },
      { date: '2026-04-02', tag_ids: ['stress'], note: null },
      { date: '2026-04-03', tag_ids: ['stress'], note: null },
      { date: '2026-04-04', tag_ids: ['period'], note: null },
      { date: '2026-04-05', tag_ids: ['period'], note: null },
    ];
    const result = computeMonthStats(logs, '2026-04', defaultTagsFixture);

    expect(result[0].tag.id).toBe('stress');   // count 3
    expect(result[1].tag.id).toBe('period');   // count 2
  });

  it('enthält das total-Feld (Tage im Monat) für die Progress-Bar', () => {
    const logs: LogRow[] = [{ date: '2026-04-01', tag_ids: ['period'], note: null }];
    const result = computeMonthStats(logs, '2026-04', defaultTagsFixture);

    expect(result[0].total).toBe(30); // April has 30 days
  });

  it('stürzt NICHT ab wenn Logs unbekannte Tag-IDs enthalten', () => {
    const logs: LogRow[] = [
      { date: '2026-04-01', tag_ids: ['unknown-tag-xyz', 'another-unknown'], note: null },
    ];
    // Should not throw; unknown IDs contribute to no known-tag counts
    expect(() => computeMonthStats(logs, '2026-04', defaultTagsFixture)).not.toThrow();

    const result = computeMonthStats(logs, '2026-04', defaultTagsFixture);
    expect(result).toHaveLength(0); // unknown IDs don't match any tag
  });

  it('ignoriert Logs aus anderen Monaten zuverlässig', () => {
    const logs: LogRow[] = [
      { date: '2026-03-31', tag_ids: ['period'], note: null }, // previous month
      { date: '2026-04-01', tag_ids: ['period'], note: null }, // current month
      { date: '2026-05-01', tag_ids: ['period'], note: null }, // next month
    ];
    const result = computeMonthStats(logs, '2026-04', defaultTagsFixture);

    expect(result[0].count).toBe(1); // only the April entry
  });

  it('funktioniert mit einem leeren Tags-Array', () => {
    const logs: LogRow[] = [{ date: '2026-04-01', tag_ids: ['period'], note: null }];
    expect(() => computeMonthStats(logs, '2026-04', [])).not.toThrow();
    expect(computeMonthStats(logs, '2026-04', [])).toHaveLength(0);
  });
});

// ── buildMarked ───────────────────────────────────────────────────────────────

describe('buildMarked', () => {
  const tagMap = new Map<string, Tag>(defaultTagsFixture.map(t => [t.id, t]));

  it('markiert das activeDate immer als selected', () => {
    const result = buildMarked([], tagMap, '2026-04-12');
    expect(result['2026-04-12']?.selected).toBe(true);
    expect(result['2026-04-12']?.selectedColor).toBe('#00E5FF');
  });

  it('erzeugt einen farbigen Dot für jeden bekannten Tag', () => {
    const rows: LogRow[] = [
      { date: '2026-04-10', tag_ids: ['period', 'stress'], note: null },
    ];
    const result = buildMarked(rows, tagMap, '2026-04-12');
    const dots = result['2026-04-10']?.dots ?? [];

    expect(dots).toHaveLength(2);
    expect(dots.find(d => d.key === 'period')?.color).toBe('#FF5252');
    expect(dots.find(d => d.key === 'stress')?.color).toBe('#FF9100');
  });

  it('erzeugt einen grauen "note"-Dot wenn nur eine Notiz vorhanden ist', () => {
    const result = buildMarked([noteOnlyLogFixture], tagMap, '2026-04-12');
    const dots = result['2026-04-10']?.dots ?? [];

    expect(dots).toHaveLength(1);
    expect(dots[0].key).toBe('note');
    expect(dots[0].color).toBe('#888');
  });

  it('stürzt NICHT ab bei unbekannten Tag-IDs in Logs', () => {
    const rows: LogRow[] = [
      { date: '2026-04-10', tag_ids: ['unknown-id-999'], note: null },
    ];
    expect(() => buildMarked(rows, tagMap, '2026-04-12')).not.toThrow();
  });

  it('zeigt keinen Dot für unbekannte Tag-IDs (überspringt sie lautlos)', () => {
    const rows: LogRow[] = [
      { date: '2026-04-10', tag_ids: ['unknown-id-999'], note: null },
    ];
    const result = buildMarked(rows, tagMap, '2026-04-12');
    // No dots → the date entry should not appear in the map at all
    expect(result['2026-04-10']).toBeUndefined();
  });

  it('überschreibt einen vorhandenen Eintrag des activeDates korrekt (selected + dots)', () => {
    const rows: LogRow[] = [
      { date: '2026-04-12', tag_ids: ['period'], note: null },
    ];
    const result = buildMarked(rows, tagMap, '2026-04-12');

    expect(result['2026-04-12']?.selected).toBe(true);
    expect(result['2026-04-12']?.dots).toBeDefined();
    expect(result['2026-04-12']?.dots?.length).toBeGreaterThan(0);
  });

  it('gibt ein leeres Objekt zurück wenn keine Zeilen und kein activeDate-Eintrag', () => {
    const result = buildMarked([], new Map(), '2026-04-01');
    // Only the activeDate entry should exist
    expect(Object.keys(result)).toEqual(['2026-04-01']);
  });

  it('ignoriert Zeilen ohne Tags und ohne Notiz (kein Dot-Eintrag)', () => {
    const rows: LogRow[] = [
      { date: '2026-04-08', tag_ids: [], note: null },
    ];
    const result = buildMarked(rows, tagMap, '2026-04-12');
    expect(result['2026-04-08']).toBeUndefined();
  });
});
