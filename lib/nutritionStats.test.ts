import { chartBuckets, computeNutritionStats, enumerateDays, presetRange, type StatsLog } from './nutritionStats';

// Lokale Mittagszeit → Datum unabhängig von der Zeitzone der Testumgebung
const at = (date: string, h = 12) => new Date(`${date}T${String(h).padStart(2, '0')}:00:00`).toISOString();
const log = (date: string, calories: number, p = 0, c = 0, f = 0, meal_name = 'X'): StatsLog =>
  ({ meal_name, calories, protein: p, carbs: c, fat: f, created_at: at(date) });

describe('enumerateDays / presetRange', () => {
  it('zählt inklusive Start und Ende, auch über Monatsgrenzen', () => {
    expect(enumerateDays('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });

  it('liefert die Schnellauswahl-Zeiträume bis heute', () => {
    expect(presetRange('7d', '2026-10-19')).toEqual({ from: '2026-10-13', to: '2026-10-19' });
    expect(presetRange('30d', '2026-10-19').from).toBe('2026-09-20');
    expect(presetRange('month', '2026-10-19')).toEqual({ from: '2026-10-01', to: '2026-10-19' });
    expect(presetRange('year', '2026-10-19')).toEqual({ from: '2026-01-01', to: '2026-10-19' });
  });
});

describe('computeNutritionStats', () => {
  const logs = [
    log('2026-10-01', 600, 30, 60, 20, 'Müsli'),
    log('2026-10-01', 1500, 80, 150, 50, 'Pasta'),
    log('2026-10-03', 1800, 100, 180, 60, 'Pasta'),
    log('2026-09-30', 999), // außerhalb
  ];
  const s = computeNutritionStats(logs, '2026-10-01', '2026-10-04', 2000);

  it('summiert nur Einträge im Zeitraum', () => {
    expect(s.totals).toEqual({ kcal: 3900, protein: 210, carbs: 390, fat: 130 });
    expect(s.totalDays).toBe(4);
    expect(s.loggedDays).toBe(2);
  });

  it('bildet den Schnitt über Tage MIT Einträgen', () => {
    expect(s.avgPerLoggedDay).toEqual({ kcal: 1950, protein: 105, carbs: 195, fat: 65 });
  });

  it('zählt Tage über/unter dem Ziel nur unter den erfassten Tagen', () => {
    expect(s.daysOverGoal).toBe(1); // 2100 am 1.10.
    expect(s.daysUnderGoal).toBe(1); // 1800 am 3.10.
  });

  it('berechnet die Makro-Verteilung nach kcal (4/4/9)', () => {
    // Protein 840, KH 1560, Fett 1170 kcal → 3570
    expect(s.macroSplit).toEqual({ protein: 24, carbs: 44, fat: 33 });
  });

  it('listet die Top-Gerichte nach kcal, Groß-/Kleinschreibung zusammengefasst', () => {
    expect(s.topMeals[0]).toEqual({ name: 'Pasta', kcal: 3300, count: 2 });
    expect(s.topMeals[1].name).toBe('Müsli');
  });

  it('liefert Nullen ohne Einträge', () => {
    const empty = computeNutritionStats([], '2026-10-01', '2026-10-02', 2000);
    expect(empty.avgPerLoggedDay).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
    expect(empty.macroSplit).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });
});

describe('chartBuckets', () => {
  it('zeigt bis 31 Tage jeden Tag einzeln', () => {
    const s = computeNutritionStats([log('2026-10-02', 1000)], '2026-10-01', '2026-10-07', 0);
    const b = chartBuckets(s.days);
    expect(b).toHaveLength(7);
    expect(b[1]).toMatchObject({ start: '2026-10-02', kcal: 1000, loggedDays: 1 });
  });

  it('fasst längere Zeiträume zu Wochen mit Ø pro erfasstem Tag zusammen', () => {
    const logs = [log('2026-01-01', 2000), log('2026-01-02', 1000)];
    const s = computeNutritionStats(logs, '2026-01-01', '2026-03-31', 0);
    const b = chartBuckets(s.days);
    expect(b).toHaveLength(13);
    expect(b[0]).toMatchObject({ start: '2026-01-01', end: '2026-01-07', kcal: 1500, loggedDays: 2 });
  });
});
