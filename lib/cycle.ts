/**
 * Pure menstrual-cycle helpers.
 * No React, no React Native, no network — safe to import from tests and hooks.
 *
 * The user logs bleeding days (`cycle_events`). Consecutive logged days
 * (gap <= SERIES_GAP_TOLERANCE_DAYS) form one "bleeding series"; the first day
 * of a series is cycle day 1 = the start of a new cycle.
 *
 * Phase model (per the product spec — deliberately the simple, fixed rule):
 *
 *   ovulation date  = cycle start + OVULATION_OFFSET_DAYS  (14 days → cycle day 15)
 *   fertile window  = ovulation date ± FERTILE_WINDOW_RADIUS_DAYS  (cycle day 12–18)
 *   menstruation    = cycle day 1 … period length (or any logged bleeding day)
 *   follicular      = after menstruation, before ovulation
 *   luteal          = after ovulation, until the next cycle starts
 *
 * Averages (cycle length, period length) come from the most recent
 * MAX_HISTORY_CYCLES completed cycles; before enough history exists the manual
 * profile values are used as a fallback.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_CYCLE_LENGTH_DAYS = 28;
export const DEFAULT_PERIOD_LENGTH_DAYS = 5;

/** Ovulation = cycle start + 14 days (strict, independent of cycle length). */
export const OVULATION_OFFSET_DAYS = 14;

/** Fertile window spans the ovulation date ± this many days. */
export const FERTILE_WINDOW_RADIUS_DAYS = 3;

/** A logged bleeding day may be up to this many days after the previous one
 *  and still count as the same series (tolerates a missed log). */
export const SERIES_GAP_TOLERANCE_DAYS = 1;

/** Averages use at most this many of the most recent completed cycles. */
export const MAX_HISTORY_CYCLES = 6;

/** How many future cycles `buildPhaseCalendar` projects past the last real one. */
export const PREDICTION_CYCLES = 3;

/** At least this many completed cycles are needed for a "reliable" prediction. */
export const RELIABLE_HISTORY_CYCLES = 2;

// Clamp ranges — mirror STEPPER_BOUNDS in lib/profile.ts so a computed average
// can never fall outside what the profile form allows.
const MIN_CYCLE_LENGTH = 18;
const MAX_CYCLE_LENGTH = 45;
const MIN_PERIOD_LENGTH = 1;
const MAX_PERIOD_LENGTH = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PhaseKind = 'menstruation' | 'follicular' | 'ovulation' | 'luteal';

export type Regularity = 'unknown' | 'low' | 'medium' | 'high';

/**
 * Purely calendar-derived estimate of the pregnancy probability for a day.
 * This is the (unreliable) "Kalendermethode" — never a contraceptive method.
 * See RECHNERISCHE_SICHERHEIT_HINWEIS for the wording shown to the user.
 */
export type ConceptionRisk = 'low' | 'elevated' | 'high';

export interface CycleEvent {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** 1 = light … 4 = heavy. */
  flow: number;
}

export interface CycleProfile {
  cycle_length_days: number | null | undefined;
  period_duration_days: number | null | undefined;
}

export interface CycleSpan {
  /** Cycle day 1 — first day of the leading bleeding series. */
  start: string;
  /** Last day before the next cycle starts; null for the current/last cycle. */
  end: string | null;
  /** Full length in days; null while the cycle is still open. */
  length: number | null;
  /** Number of logged bleeding days in the leading series. */
  periodDays: number;
  /** Every logged bleeding date in the leading series. */
  seriesDates: string[];
}

export interface CycleStats {
  avgCycleLength: number;
  avgPeriodLength: number;
  /** Number of completed cycles (with a known length). */
  cyclesTracked: number;
  /** ISO date of the most recent cycle start, or null. */
  lastStart: string | null;
  regularity: Regularity;
  /** True once there is enough history for a meaningful prediction. */
  hasReliableHistory: boolean;
  /** Source of the averages — 'history' or 'profile' fallback. */
  source: 'history' | 'profile';
}

export interface DayPhase {
  date: string;
  phase: PhaseKind;
  /** 1-based day within the cycle. */
  cycleDay: number;
  /** Length of the cycle this day belongs to (real length or the average). */
  cycleLength: number;
  /** True when this day falls in the fertile window (ovulation ± 3). */
  fertileWindow: boolean;
  /** True when this day is a (logged or expected) bleeding day. */
  bleeding: boolean;
  /** True when this day is a projection rather than confirmed data. */
  predicted: boolean;
  /**
   * Calendar-only pregnancy-probability estimate. Capped at 'elevated' (never
   * 'low') while the cycle history is short or irregular. NOT contraception.
   */
  conceptionRisk: ConceptionRisk;
}

export interface UpcomingEvent {
  date: string;
  /** Whole days from the reference date (`today`); 0 = today, negative = past. */
  inDays: number;
}

export interface CycleOverview {
  stats: CycleStats;
  /** Phase of `today`, or null when there is no history to anchor on. */
  today: DayPhase | null;
  nextPeriod: UpcomingEvent | null;
  nextOvulation: UpcomingEvent | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase display metadata (single source of truth for calendar, legend, cards)
// ─────────────────────────────────────────────────────────────────────────────

export const CYCLE_PHASE_META: Record<
  PhaseKind,
  { label: string; emoji: string; color: string }
> = {
  menstruation: { label: 'Menstruation',  emoji: '🩸', color: '#FF5252' },
  follicular:   { label: 'Follikelphase', emoji: '🌱', color: '#4CAF50' },
  ovulation:    { label: 'Eisprung',      emoji: '🥚', color: '#FF9100' },
  luteal:       { label: 'Lutealphase',   emoji: '🌙', color: '#AB47BC' },
};

/** Outline colour for fertile-window days that are not the ovulation day. */
export const FERTILE_WINDOW_COLOR = '#FFD600';

export const CONCEPTION_RISK_META: Record<
  ConceptionRisk,
  { label: string; color: string; hint: string }
> = {
  low: {
    label: 'rechnerisch geringes Risiko',
    color: '#4CAF50',
    hint: 'Außerhalb des berechneten fruchtbaren Fensters – rein rechnerisch.',
  },
  elevated: {
    label: 'erhöhtes Risiko',
    color: '#FF9100',
    hint: 'Nahe am fruchtbaren Fenster oder Zyklus zu unregelmäßig für eine Aussage.',
  },
  high: {
    label: 'hohe Wahrscheinlichkeit',
    color: '#FF5252',
    hint: 'Fruchtbares Fenster rund um den Eisprung.',
  },
};

/** Standard disclaimer shown wherever the conception risk / fertile window appears. */
export const RECHNERISCHE_SICHERHEIT_HINWEIS =
  'Dies ist keine Verhütungsmethode. Die Angaben beruhen ausschließlich auf ' +
  'einer Kalenderberechnung aus deinen bisherigen Zyklusdaten und bieten nur ' +
  'eine rechnerische, keine tatsächliche Sicherheit. Der Eisprung kann sich ' +
  'verschieben. Verlasse dich zur Verhütung nicht darauf.';

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers — all UTC, all on 'YYYY-MM-DD' strings (no timezone drift)
// ─────────────────────────────────────────────────────────────────────────────

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

/** Signed day difference `to - from` (positive when `to` is later). */
export function diffDays(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function mean(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function uniqueSortedDates(events: CycleEvent[]): string[] {
  return Array.from(new Set(events.map((e) => e.date))).sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// Series & spans
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Group logged bleeding dates into series. Two consecutive logged dates belong
 * to the same series when they are at most `SERIES_GAP_TOLERANCE_DAYS + 1` days
 * apart (i.e. one missed log is tolerated).
 */
export function groupBleedingSeries(events: CycleEvent[]): string[][] {
  const dates = uniqueSortedDates(events);
  const series: string[][] = [];
  for (const date of dates) {
    const current = series[series.length - 1];
    if (current && diffDays(current[current.length - 1], date) <= SERIES_GAP_TOLERANCE_DAYS + 1) {
      current.push(date);
    } else {
      series.push([date]);
    }
  }
  return series;
}

/**
 * Turn bleeding series into cycle spans. Each series start is a cycle start;
 * the cycle ends the day before the next series starts. The last span is left
 * open (`end` / `length` null).
 */
export function buildCycleSpans(events: CycleEvent[]): CycleSpan[] {
  const series = groupBleedingSeries(events);
  return series.map((s, i) => {
    const start = s[0];
    const nextStart = series[i + 1]?.[0] ?? null;
    return {
      start,
      end: nextStart ? addDays(nextStart, -1) : null,
      length: nextStart ? diffDays(start, nextStart) : null,
      periodDays: s.length,
      seriesDates: s,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

function computeRegularity(lengths: number[]): Regularity {
  if (lengths.length < RELIABLE_HISTORY_CYCLES) return 'unknown';
  const spread = Math.max(...lengths) - Math.min(...lengths);
  if (spread <= 3) return 'high';
  if (spread <= 7) return 'medium';
  return 'low';
}

/**
 * Average cycle & period length from history, falling back to the manual
 * profile values (then the built-in defaults) when there is not enough data.
 */
export function computeCycleStats(events: CycleEvent[], profile: CycleProfile): CycleStats {
  const spans = buildCycleSpans(events);
  const completed = spans.filter((s): s is CycleSpan & { length: number } => s.length != null);
  const recent = completed.slice(-MAX_HISTORY_CYCLES);
  const lengths = recent.map((s) => s.length);

  const profileCycle = profile.cycle_length_days ?? DEFAULT_CYCLE_LENGTH_DAYS;
  const profilePeriod = profile.period_duration_days ?? DEFAULT_PERIOD_LENGTH_DAYS;

  const hasHistory = lengths.length > 0;

  // Period length: prefer logged series (last N), else the profile value.
  const recentPeriodDays = spans
    .slice(-MAX_HISTORY_CYCLES)
    .map((s) => s.periodDays)
    .filter((n) => n > 0);

  const avgCycleLength = hasHistory
    ? clamp(Math.round(mean(lengths)), MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH)
    : clamp(Math.round(profileCycle), MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH);

  const avgPeriodLength = recentPeriodDays.length > 0
    ? clamp(Math.round(mean(recentPeriodDays)), MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH)
    : clamp(Math.round(profilePeriod), MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH);

  return {
    avgCycleLength,
    avgPeriodLength,
    cyclesTracked: completed.length,
    lastStart: spans.length > 0 ? spans[spans.length - 1].start : null,
    regularity: computeRegularity(lengths),
    hasReliableHistory: completed.length >= RELIABLE_HISTORY_CYCLES,
    source: hasHistory ? 'history' : 'profile',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Predictions
// ─────────────────────────────────────────────────────────────────────────────

/** The cycle start on or before `today`, projecting forward from `lastStart`. */
function currentCycleStart(lastStart: string, avgCycleLength: number, today: string): string {
  let start = lastStart;
  while (diffDays(start, today) >= avgCycleLength) {
    start = addDays(start, avgCycleLength);
  }
  return start;
}

/** Next period start strictly after `today` (or the first future start). */
export function predictNextPeriod(stats: CycleStats, today: string): UpcomingEvent | null {
  if (!stats.lastStart) return null;
  let date = stats.lastStart;
  while (diffDays(today, date) <= 0) {
    date = addDays(date, stats.avgCycleLength);
  }
  return { date, inDays: diffDays(today, date) };
}

/** Next ovulation on or after `today`. */
export function predictNextOvulation(stats: CycleStats, today: string): UpcomingEvent | null {
  if (!stats.lastStart) return null;
  let start = currentCycleStart(stats.lastStart, stats.avgCycleLength, today);
  let ovulation = addDays(start, OVULATION_OFFSET_DAYS);
  if (diffDays(today, ovulation) < 0) {
    start = addDays(start, stats.avgCycleLength);
    ovulation = addDays(start, OVULATION_OFFSET_DAYS);
  }
  return { date: ovulation, inDays: diffDays(today, ovulation) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase calendar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calendar-only pregnancy-probability estimate for one day.
 *
 * `distToOvulation` is negative before the predicted ovulation, positive after.
 * Sperm survive up to ~5 days and the egg ~1 day, so the biologically fertile
 * span is roughly ovulation −5 … +1; we widen it for the ±3 day ovulation
 * uncertainty. When the recorded history is too short or irregular to trust,
 * `capLow` forces the result up to 'elevated' — we never claim 'low'.
 */
export function conceptionRiskFor(distToOvulation: number, capLow: boolean): ConceptionRisk {
  const d = distToOvulation;
  if (d >= -5 && d <= 3) return 'high';
  if (d >= -8 && d <= 5) return 'elevated';
  return capLow ? 'elevated' : 'low';
}

function classifyDay(
  date: string,
  cStart: string,
  cycleLength: number,
  periodLen: number,
  loggedSet: Set<string>,
  isRealCycle: boolean,
  today: string,
  capLowRisk: boolean,
): DayPhase {
  const cycleDay = diffDays(cStart, date) + 1;
  const ovulationDate = addDays(cStart, OVULATION_OFFSET_DAYS);
  const distToOvulation = diffDays(ovulationDate, date);
  const fertileWindow = Math.abs(distToOvulation) <= FERTILE_WINDOW_RADIUS_DAYS;
  const isFuture = diffDays(today, date) > 0;

  // Confirmed bleeding for past days of a real cycle only comes from the log;
  // future days (or projected cycles) fall back to the expected period length.
  const bleeding = isRealCycle
    ? loggedSet.has(date) || (isFuture && cycleDay >= 1 && cycleDay <= periodLen)
    : cycleDay >= 1 && cycleDay <= periodLen;

  let phase: PhaseKind;
  if (bleeding) phase = 'menstruation';
  else if (distToOvulation === 0) phase = 'ovulation';
  else if (distToOvulation < 0) phase = 'follicular';
  else phase = 'luteal';

  return {
    date,
    phase,
    cycleDay,
    cycleLength,
    fertileWindow,
    bleeding,
    predicted: !isRealCycle || isFuture,
    conceptionRisk: conceptionRiskFor(distToOvulation, capLowRisk),
  };
}

/**
 * Classify every day in `[rangeStart, rangeEnd]` into a cycle phase.
 *
 * Real cycles (anchored on logged bleeding series) use their actual length;
 * once history runs out, cycles are projected forward with `avgCycleLength`
 * for up to `PREDICTION_CYCLES` beyond `rangeEnd`. Days before the first
 * logged cycle cannot be classified and are omitted.
 */
export function buildPhaseCalendar(
  events: CycleEvent[],
  profile: CycleProfile,
  rangeStart: string,
  rangeEnd: string,
  today: string,
): DayPhase[] {
  const stats = computeCycleStats(events, profile);
  const spans = buildCycleSpans(events);
  if (spans.length === 0) return [];

  const { avgCycleLength, avgPeriodLength } = stats;

  // The calendar method is only defensible for a settled, regular cycle.
  // Otherwise never show a "low risk" day.
  const capLowRisk = !stats.hasReliableHistory || stats.regularity === 'low' || stats.regularity === 'unknown';

  // Build the ordered list of cycle starts: real ones + projections.
  const starts: string[] = spans.map((s) => s.start);
  const horizon = addDays(rangeEnd, avgCycleLength * PREDICTION_CYCLES);
  let s = starts[starts.length - 1];
  while (s < horizon) {
    s = addDays(s, avgCycleLength);
    starts.push(s);
  }

  const out: DayPhase[] = [];

  for (let i = 0; i < starts.length - 1; i++) {
    const cStart = starts[i];
    const cEnd = starts[i + 1]; // exclusive
    const span = spans[i];
    const isRealCycle = i < spans.length;
    const cycleLength = span?.length ?? diffDays(cStart, cEnd);
    const periodLen = span && span.periodDays > 0 ? span.periodDays : avgPeriodLength;
    const loggedSet = new Set(span?.seriesDates ?? []);

    const from = cStart > rangeStart ? cStart : rangeStart;
    const to = addDays(cEnd, -1) < rangeEnd ? addDays(cEnd, -1) : rangeEnd;

    for (let d = from; d <= to; d = addDays(d, 1)) {
      out.push(classifyDay(d, cStart, cycleLength, periodLen, loggedSet, isRealCycle, today, capLowRisk));
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level overview (used by the hook / status card)
// ─────────────────────────────────────────────────────────────────────────────

export function getCycleOverview(
  events: CycleEvent[],
  profile: CycleProfile,
  today: string,
): CycleOverview {
  const stats = computeCycleStats(events, profile);

  let todayPhase: DayPhase | null = null;
  if (stats.lastStart) {
    const phases = buildPhaseCalendar(events, profile, today, today, today);
    todayPhase = phases.find((p) => p.date === today) ?? null;
  }

  return {
    stats,
    today: todayPhase,
    nextPeriod: predictNextPeriod(stats, today),
    nextOvulation: predictNextOvulation(stats, today),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/** e.g. "Lutealphase · Tag 22 von 29". */
export function describeDayPhase(day: DayPhase): string {
  const meta = CYCLE_PHASE_META[day.phase];
  return `${meta.emoji} ${meta.label} · Tag ${day.cycleDay} von ${day.cycleLength}`;
}

/** e.g. "in 5 Tagen", "morgen", "heute", "vor 2 Tagen". */
export function describeInDays(inDays: number): string {
  if (inDays === 0) return 'heute';
  if (inDays === 1) return 'morgen';
  if (inDays === -1) return 'gestern';
  if (inDays > 1) return `in ${inDays} Tagen`;
  return `vor ${Math.abs(inDays)} Tagen`;
}

export const REGULARITY_LABEL: Record<Regularity, string> = {
  unknown: 'noch nicht genug Daten',
  low: 'unregelmäßig',
  medium: 'leicht schwankend',
  high: 'regelmäßig',
};
