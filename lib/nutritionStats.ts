/**
 * lib/nutritionStats.ts — Auswertung der Ernährung über einen frei wählbaren
 * Zeitraum (app/(app)/nutrition-stats.tsx). Reine Funktionen, testbar.
 *
 * Tage werden nach LOKALEM Datum gezählt (Uhrzeit des Eintrags auf dem Gerät).
 * Durchschnitte beziehen sich auf Tage MIT Einträgen — ein vergessener Tag soll
 * den Schnitt nicht auf "fast nichts gegessen" drücken.
 */

import { addDays } from '@/lib/cycle';
import { localISODate } from '@/lib/cycleHealth';

export type StatsLog = {
  meal_name?: string | null;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  created_at: string;
};

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

export type DayStat = Macros & { date: string; entries: number };

export type RangePreset = '7d' | '30d' | '90d' | 'month' | 'year';

export type NutritionStats = {
  days: DayStat[];
  totals: Macros;
  totalDays: number;
  loggedDays: number;
  /** Ø pro Tag mit Einträgen (gerundet: kcal ganz, Makros auf 1 g) */
  avgPerLoggedDay: Macros;
  /** Anteil der Kalorien aus den Makros in % (Protein/KH 4 kcal/g, Fett 9 kcal/g) */
  macroSplit: { protein: number; carbs: number; fat: number };
  daysOverGoal: number;
  daysUnderGoal: number;
  topMeals: { name: string; kcal: number; count: number }[];
};

export type ChartBucket = { start: string; end: string; kcal: number; loggedDays: number };

const EMPTY: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Alle Tage von `from` bis `to` (inklusive), ISO YYYY-MM-DD. */
export function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Zeitraum für eine Schnellauswahl, endend heute. */
export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
  switch (preset) {
    case '7d': return { from: addDays(today, -6), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case '90d': return { from: addDays(today, -89), to: today };
    case 'month': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

export function computeNutritionStats(
  logs: StatsLog[],
  from: string,
  to: string,
  goalKcal: number,
): NutritionStats {
  const byDate = new Map<string, DayStat>();
  for (const date of enumerateDays(from, to)) byDate.set(date, { date, ...EMPTY, entries: 0 });

  const meals = new Map<string, { name: string; kcal: number; count: number }>();

  for (const log of logs) {
    const date = localISODate(new Date(log.created_at));
    const day = byDate.get(date);
    if (!day) continue; // außerhalb des Zeitraums
    day.kcal += log.calories || 0;
    day.protein += log.protein ?? 0;
    day.carbs += log.carbs ?? 0;
    day.fat += log.fat ?? 0;
    day.entries += 1;

    const name = (log.meal_name ?? '').trim();
    if (name) {
      const k = name.toLowerCase();
      const m = meals.get(k) ?? { name, kcal: 0, count: 0 };
      m.kcal += log.calories || 0;
      m.count += 1;
      meals.set(k, m);
    }
  }

  const days = [...byDate.values()];
  const logged = days.filter((d) => d.entries > 0);
  const totals = days.reduce<Macros>(
    (acc, d) => ({ kcal: acc.kcal + d.kcal, protein: acc.protein + d.protein, carbs: acc.carbs + d.carbs, fat: acc.fat + d.fat }),
    { ...EMPTY },
  );

  const n = logged.length;
  const avgPerLoggedDay: Macros = n === 0 ? { ...EMPTY } : {
    kcal: Math.round(totals.kcal / n),
    protein: Math.round(totals.protein / n),
    carbs: Math.round(totals.carbs / n),
    fat: Math.round(totals.fat / n),
  };

  const macroKcal = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9;
  const pct = (v: number) => (macroKcal > 0 ? Math.round((v / macroKcal) * 100) : 0);

  return {
    days,
    totals: {
      kcal: Math.round(totals.kcal),
      protein: Math.round(totals.protein),
      carbs: Math.round(totals.carbs),
      fat: Math.round(totals.fat),
    },
    totalDays: days.length,
    loggedDays: n,
    avgPerLoggedDay,
    macroSplit: { protein: pct(totals.protein * 4), carbs: pct(totals.carbs * 4), fat: pct(totals.fat * 9) },
    daysOverGoal: goalKcal > 0 ? logged.filter((d) => d.kcal > goalKcal).length : 0,
    daysUnderGoal: goalKcal > 0 ? logged.filter((d) => d.kcal <= goalKcal).length : 0,
    topMeals: [...meals.values()].sort((a, b) => b.kcal - a.kcal).slice(0, 5),
  };
}

/**
 * Balken fürs Diagramm: bis `maxDaily` Tage einzeln, darüber in 7-Tage-Blöcken
 * (ab Zeitraum-Beginn). Wert = Ø kcal pro erfasstem Tag im Block.
 */
export function chartBuckets(days: DayStat[], maxDaily = 31): ChartBucket[] {
  const size = days.length <= maxDaily ? 1 : 7;
  const out: ChartBucket[] = [];
  for (let i = 0; i < days.length; i += size) {
    const chunk = days.slice(i, i + size);
    const logged = chunk.filter((d) => d.entries > 0);
    const sum = logged.reduce((s, d) => s + d.kcal, 0);
    out.push({
      start: chunk[0].date,
      end: chunk[chunk.length - 1].date,
      kcal: logged.length ? Math.round(sum / logged.length) : 0,
      loggedDays: logged.length,
    });
  }
  return out;
}
