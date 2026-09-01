/**
 * Unit-Tests: reine Hilfsfunktionen aus trainingProvider.ts
 * (sanitizeScheduledDays, resolveDayIndexForDate)
 */

jest.mock('@/services/supabaseClient');

import { resolveDayIndexForDate, sanitizeScheduledDays } from './trainingProvider';

describe('sanitizeScheduledDays', () => {
  it('sortiert aufsteigend und entfernt Duplikate', () => {
    expect(sanitizeScheduledDays([5, 1, 1, 3])).toEqual([1, 3, 5]);
  });

  it('filtert Werte außerhalb 0–6 heraus', () => {
    expect(sanitizeScheduledDays([-1, 2, 7, 9])).toEqual([2]);
  });

  it('gibt null zurück bei leerem Ergebnis', () => {
    expect(sanitizeScheduledDays([])).toBeNull();
    expect(sanitizeScheduledDays([-1, 8])).toBeNull();
  });
});

describe('resolveDayIndexForDate', () => {
  // Mo=1, Mi=3, Fr=5 → sortiert [1,3,5] → Position 0,1,2 → day_index 1,2,3
  const scheduled = [5, 1, 3];

  // Lokale Konstruktoren (statt ISO-Strings) — vermeidet UTC/Timezone-Verschiebung des Wochentags.
  it('ordnet den Wochentag der richtigen Position im sortierten Split zu', () => {
    expect(resolveDayIndexForDate(scheduled, new Date(2026, 7, 24))).toBe(1); // Mo
    expect(resolveDayIndexForDate(scheduled, new Date(2026, 7, 26))).toBe(2); // Mi
    expect(resolveDayIndexForDate(scheduled, new Date(2026, 7, 28))).toBe(3); // Fr
  });

  it('gibt Tag 1 zurück wenn der Wochentag nicht im Split enthalten ist', () => {
    expect(resolveDayIndexForDate(scheduled, new Date(2026, 7, 25))).toBe(1); // Di — nicht geplant
  });

  it('gibt Tag 1 zurück ohne feste Tage (leer/null)', () => {
    expect(resolveDayIndexForDate([], new Date(2026, 7, 24))).toBe(1);
    expect(resolveDayIndexForDate(null, new Date(2026, 7, 24))).toBe(1);
  });
});
