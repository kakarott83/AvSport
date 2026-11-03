/**
 * lib/cycleHealth.ts
 *
 * Reine Logik für den Abgleich von Periodendaten aus Apple Health bzw.
 * Health Connect mit `cycle_events`. Kein React, kein Netzwerk — testbar.
 *
 * Regeln ("beides zählt"):
 *  - Health-Tage werden mit source = 'health' übernommen.
 *  - Manuell erfasste Tage (source = 'manual') werden nie überschrieben
 *    oder automatisch gelöscht.
 *  - Ein früher importierter Health-Tag, der im abgeglichenen Zeitraum nicht
 *    mehr in Health vorhanden ist, wird entfernt.
 *
 * Dieselben Regeln gelten für Ovulationstests (cycle_ovulation_tests).
 */

import { addDays, mergeOvulationTests, type OvulationTestResult } from '@/lib/cycle';

export type CycleEventSource = 'manual' | 'health';

export interface StoredCycleEvent {
  date: string;
  flow: number;
  source: CycleEventSource | null;
}

export interface HealthCycleDay {
  date: string;
  flow: number;
}

export interface HealthSyncPlan {
  upserts: HealthCycleDay[];
  deletes: string[];
}

/** Lokales Kalenderdatum (YYYY-MM-DD) eines Zeitpunkts. */
export function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Health Connect MenstruationFlow.flow → App-Skala 1–4
 * (0 unbekannt, 1 leicht, 2 mittel, 3 stark). Unbekannt zählt als "Leicht".
 */
export function mapHealthConnectFlow(flow: number | null | undefined): number {
  if (flow === 3) return 4;
  if (flow === 2) return 3;
  return 2;
}

/**
 * HealthKit HKCategoryValueMenstrualFlow → App-Skala 1–4
 * (1 nicht angegeben, 2 leicht, 3 mittel, 4 stark, 5 keine).
 * `null` = keine Blutung, Tag wird nicht übernommen.
 */
export function mapHealthKitFlow(value: number): number | null {
  if (value === 5) return null;
  if (value === 4) return 4;
  if (value === 3) return 3;
  return 2;
}

/** Alle Kalendertage von `startISO` bis einschließlich `endISO`. */
export function expandDays(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  for (let d = startISO; d <= endISO; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Fasst Health-Tage zusammen: pro Datum gewinnt der stärkste Flow. */
export function mergeHealthDays(days: HealthCycleDay[]): HealthCycleDay[] {
  const byDate = new Map<string, number>();
  for (const d of days) byDate.set(d.date, Math.max(byDate.get(d.date) ?? 0, d.flow));
  return [...byDate.entries()]
    .map(([date, flow]) => ({ date, flow }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Berechnet, welche `cycle_events` für den Zeitraum [windowStart, windowEnd]
 * geschrieben bzw. gelöscht werden müssen.
 */
export function planHealthSync(
  existing: StoredCycleEvent[],
  health: HealthCycleDay[],
  windowStart: string,
  windowEnd: string,
): HealthSyncPlan {
  const inWindow = (date: string) => date >= windowStart && date <= windowEnd;
  const stored = new Map(existing.map((e) => [e.date, e]));
  const healthDates = new Set<string>();

  const upserts: HealthCycleDay[] = [];
  for (const day of mergeHealthDays(health)) {
    if (!inWindow(day.date)) continue;
    healthDates.add(day.date);
    const current = stored.get(day.date);
    if (!current) {
      upserts.push(day);
    } else if (current.source === 'health' && current.flow !== day.flow) {
      upserts.push(day);
    }
    // manuell erfasst → bleibt unverändert
  }

  const deletes = existing
    .filter((e) => e.source === 'health' && inWindow(e.date) && !healthDates.has(e.date))
    .map((e) => e.date);

  return { upserts, deletes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ovulationstests (LH) — gleiche Regeln wie bei den Blutungstagen
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthOvulationTest {
  date: string;
  result: OvulationTestResult;
}

export interface StoredOvulationTest extends HealthOvulationTest {
  source: CycleEventSource | null;
}

export interface OvulationSyncPlan {
  upserts: HealthOvulationTest[];
  deletes: string[];
}

/**
 * HealthKit HKCategoryValueOvulationTestResult → App
 * (1 negative, 2 luteinizingHormoneSurge, 3 indeterminate, 4 estrogenSurge).
 */
export function mapHealthKitOvulation(value: number): OvulationTestResult | null {
  switch (value) {
    case 1: return 'negative';
    case 2: return 'positive';
    case 3: return 'indeterminate';
    case 4: return 'estrogen';
    default: return null;
  }
}

/**
 * Health Connect OvulationTestRecord.result → App
 * (0 inconclusive, 1 positive, 2 high, 3 negative). „High“ = Östrogen- bzw.
 * beginnender LH-Anstieg, noch kein Peak → zählt nicht als positiv.
 */
export function mapHealthConnectOvulation(result: number | null | undefined): OvulationTestResult {
  switch (result) {
    case 1: return 'positive';
    case 2: return 'estrogen';
    case 3: return 'negative';
    default: return 'indeterminate';
  }
}

/** Wie planHealthSync, nur für Ovulationstests (manuelle Einträge bleiben unangetastet). */
export function planOvulationSync(
  existing: StoredOvulationTest[],
  health: HealthOvulationTest[],
  windowStart: string,
  windowEnd: string,
): OvulationSyncPlan {
  const inWindow = (date: string) => date >= windowStart && date <= windowEnd;
  const stored = new Map(existing.map((e) => [e.date, e]));
  const healthDates = new Set<string>();

  const upserts: HealthOvulationTest[] = [];
  for (const test of mergeOvulationTests(health)) {
    if (!inWindow(test.date)) continue;
    healthDates.add(test.date);
    const current = stored.get(test.date);
    if (!current || (current.source === 'health' && current.result !== test.result)) {
      upserts.push({ date: test.date, result: test.result });
    }
  }

  const deletes = existing
    .filter((e) => e.source === 'health' && inWindow(e.date) && !healthDates.has(e.date))
    .map((e) => e.date);

  return { upserts, deletes };
}
