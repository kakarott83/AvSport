/// <reference types="jest" />

/**
 * Tests for lib/cycle.ts — pure menstrual-cycle logic.
 *
 * Covers: date helpers, series grouping, cycle spans, stats (history vs.
 * profile fallback, regularity, clamping), predictions, and the phase
 * calendar (menstruation / follicular / ovulation / luteal boundaries,
 * fertile window, predicted flag, projected future cycles).
 */

import {
  addDays,
  buildCycleSpans,
  buildPhaseCalendar,
  computeCycleStats,
  conceptionRiskFor,
  DEFAULT_CYCLE_LENGTH_DAYS,
  DEFAULT_PERIOD_LENGTH_DAYS,
  describeDayPhase,
  describeInDays,
  diffDays,
  getCycleOverview,
  groupBleedingSeries,
  OVULATION_OFFSET_DAYS,
  predictNextOvulation,
  predictNextPeriod,
  type CycleEvent,
  type CycleProfile,
} from '@/lib/cycle';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NO_PROFILE: CycleProfile = { cycle_length_days: null, period_duration_days: null };

/** Build `count` consecutive daily bleeding events starting at `start`. */
function bleeding(start: string, count: number, flow = 2): CycleEvent[] {
  return Array.from({ length: count }, (_, i) => ({ date: addDays(start, i), flow }));
}

/** Three tidy 28-day cycles: starts 01-01, 01-29, 02-26; 5 period days each. */
const THREE_REGULAR_CYCLES: CycleEvent[] = [
  ...bleeding('2026-01-01', 5),
  ...bleeding('2026-01-29', 5),
  ...bleeding('2026-02-26', 5),
];

// ── Date helpers ──────────────────────────────────────────────────────────────

describe('date helpers', () => {
  it('addDays crosses month and year boundaries (UTC)', () => {
    expect(addDays('2026-01-29', 3)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('diffDays is signed and symmetric', () => {
    expect(diffDays('2026-01-01', '2026-01-29')).toBe(28);
    expect(diffDays('2026-01-29', '2026-01-01')).toBe(-28);
    expect(diffDays('2026-02-27', '2026-03-01')).toBe(2); // 2026 is not a leap year
  });
});

// ── groupBleedingSeries ───────────────────────────────────────────────────────

describe('groupBleedingSeries', () => {
  it('groups consecutive days into one series', () => {
    const series = groupBleedingSeries(bleeding('2026-01-01', 5));
    expect(series).toHaveLength(1);
    expect(series[0]).toHaveLength(5);
  });

  it('tolerates a single missed log (gap of 2 days)', () => {
    const series = groupBleedingSeries([
      { date: '2026-01-01', flow: 2 },
      { date: '2026-01-03', flow: 2 },
    ]);
    expect(series).toHaveLength(1);
  });

  it('splits when the gap exceeds the tolerance', () => {
    const series = groupBleedingSeries([
      { date: '2026-01-01', flow: 2 },
      { date: '2026-01-04', flow: 2 },
    ]);
    expect(series).toHaveLength(2);
  });

  it('deduplicates and sorts unordered input', () => {
    const series = groupBleedingSeries([
      { date: '2026-01-03', flow: 2 },
      { date: '2026-01-01', flow: 2 },
      { date: '2026-01-03', flow: 4 },
      { date: '2026-01-02', flow: 2 },
    ]);
    expect(series).toEqual([['2026-01-01', '2026-01-02', '2026-01-03']]);
  });

  it('returns [] for no events', () => {
    expect(groupBleedingSeries([])).toEqual([]);
  });
});

// ── buildCycleSpans ───────────────────────────────────────────────────────────

describe('buildCycleSpans', () => {
  it('derives start / end / length from consecutive series', () => {
    const spans = buildCycleSpans(THREE_REGULAR_CYCLES);
    expect(spans).toHaveLength(3);

    expect(spans[0]).toMatchObject({ start: '2026-01-01', end: '2026-01-28', length: 28, periodDays: 5 });
    expect(spans[1]).toMatchObject({ start: '2026-01-29', end: '2026-02-25', length: 28, periodDays: 5 });
    // last span is still open
    expect(spans[2]).toMatchObject({ start: '2026-02-26', end: null, length: null, periodDays: 5 });
  });

  it('keeps the logged series dates for confirmed-day lookups', () => {
    const spans = buildCycleSpans(bleeding('2026-01-01', 3));
    expect(spans[0].seriesDates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });
});

// ── computeCycleStats ─────────────────────────────────────────────────────────

describe('computeCycleStats', () => {
  it('falls back to profile values when there is no history', () => {
    const stats = computeCycleStats([], { cycle_length_days: 30, period_duration_days: 6 });
    expect(stats).toMatchObject({
      avgCycleLength: 30,
      avgPeriodLength: 6,
      cyclesTracked: 0,
      lastStart: null,
      regularity: 'unknown',
      hasReliableHistory: false,
      source: 'profile',
    });
  });

  it('falls back to the built-in defaults when profile values are null too', () => {
    const stats = computeCycleStats([], NO_PROFILE);
    expect(stats.avgCycleLength).toBe(DEFAULT_CYCLE_LENGTH_DAYS);
    expect(stats.avgPeriodLength).toBe(DEFAULT_PERIOD_LENGTH_DAYS);
  });

  it('clamps an out-of-range profile value', () => {
    const stats = computeCycleStats([], { cycle_length_days: 100, period_duration_days: 99 });
    expect(stats.avgCycleLength).toBe(45);
    expect(stats.avgPeriodLength).toBe(10);
  });

  it('averages completed cycles from history', () => {
    const events: CycleEvent[] = [
      ...bleeding('2026-01-01', 4),
      ...bleeding('2026-01-27', 6), // 26-day cycle
      ...bleeding('2026-03-02', 5), // 34-day cycle
    ];
    const stats = computeCycleStats(events, NO_PROFILE);
    expect(stats.avgCycleLength).toBe(30); // (26 + 34) / 2
    expect(stats.avgPeriodLength).toBe(5); // round((4 + 6 + 5) / 3)
    expect(stats.cyclesTracked).toBe(2);
    expect(stats.lastStart).toBe('2026-03-02');
    expect(stats.source).toBe('history');
  });

  it('rates a tight spread as regular and a wide one as irregular', () => {
    const regular = computeCycleStats(THREE_REGULAR_CYCLES, NO_PROFILE);
    expect(regular.regularity).toBe('high');
    expect(regular.hasReliableHistory).toBe(true);

    const irregular = computeCycleStats(
      [...bleeding('2026-01-01', 5), ...bleeding('2026-01-27', 5), ...bleeding('2026-03-05', 5)],
      NO_PROFILE,
    );
    expect(irregular.regularity).toBe('low'); // lengths 26 and 37 → spread 11
  });

  it('reports regularity "unknown" with only one completed cycle', () => {
    const stats = computeCycleStats(
      [...bleeding('2026-01-01', 5), ...bleeding('2026-01-29', 5)],
      NO_PROFILE,
    );
    expect(stats.regularity).toBe('unknown');
    expect(stats.cyclesTracked).toBe(1);
    expect(stats.hasReliableHistory).toBe(false);
  });
});

// ── predictions ───────────────────────────────────────────────────────────────

describe('predictNextPeriod / predictNextOvulation', () => {
  const stats = computeCycleStats(THREE_REGULAR_CYCLES, NO_PROFILE); // avg 28, lastStart 2026-02-26

  it('returns null without history', () => {
    const empty = computeCycleStats([], NO_PROFILE);
    expect(predictNextPeriod(empty, '2026-03-10')).toBeNull();
    expect(predictNextOvulation(empty, '2026-03-10')).toBeNull();
  });

  it('projects the next period start after today', () => {
    expect(predictNextPeriod(stats, '2026-03-10')).toEqual({ date: '2026-03-26', inDays: 16 });
  });

  it('rolls forward across several missed cycles', () => {
    expect(predictNextPeriod(stats, '2026-05-01')).toEqual({ date: '2026-05-21', inDays: 20 });
  });

  it('places ovulation 14 days after the current cycle start', () => {
    // current cycle started 2026-02-26 → ovulation 2026-03-12
    expect(predictNextOvulation(stats, '2026-03-10')).toEqual({ date: '2026-03-12', inDays: 2 });
  });

  it('moves to the next cycle once this ovulation has passed', () => {
    expect(predictNextOvulation(stats, '2026-03-20')).toEqual({ date: '2026-04-09', inDays: 20 });
  });
});

// ── buildPhaseCalendar ────────────────────────────────────────────────────────

describe('buildPhaseCalendar', () => {
  const byDate = (events: CycleEvent[], from: string, to: string, today: string) => {
    const map = new Map(
      buildPhaseCalendar(events, NO_PROFILE, from, to, today).map((d) => [d.date, d]),
    );
    return map;
  };

  it('returns [] when there is no logged bleeding to anchor on', () => {
    expect(buildPhaseCalendar([], NO_PROFILE, '2026-01-01', '2026-01-31', '2026-01-15')).toEqual([]);
  });

  it('omits days before the first logged cycle', () => {
    const map = byDate(THREE_REGULAR_CYCLES, '2025-12-01', '2026-01-05', '2026-03-10');
    expect(map.has('2025-12-15')).toBe(false);
    expect(map.get('2026-01-01')?.phase).toBe('menstruation');
  });

  it('classifies the four phases of a real cycle', () => {
    // cycle start 2026-02-26, ovulation 2026-03-12
    const map = byDate(THREE_REGULAR_CYCLES, '2026-02-26', '2026-03-25', '2026-04-01');

    expect(map.get('2026-02-26')?.phase).toBe('menstruation'); // day 1, logged
    expect(map.get('2026-03-02')?.phase).toBe('menstruation'); // day 5, logged
    expect(map.get('2026-03-06')?.phase).toBe('follicular');   // day 9
    expect(map.get('2026-03-12')?.phase).toBe('ovulation');    // day 15 = start + 14
    expect(map.get('2026-03-18')?.phase).toBe('luteal');       // day 21
  });

  it('marks the fertile window as ovulation ± 3 days', () => {
    const map = byDate(THREE_REGULAR_CYCLES, '2026-03-01', '2026-03-25', '2026-04-01');
    expect(map.get('2026-03-08')?.fertileWindow).toBe(false); // day 11
    expect(map.get('2026-03-09')?.fertileWindow).toBe(true);  // day 12 (ovu - 3)
    expect(map.get('2026-03-12')?.fertileWindow).toBe(true);  // ovulation
    expect(map.get('2026-03-15')?.fertileWindow).toBe(true);  // day 18 (ovu + 3)
    expect(map.get('2026-03-16')?.fertileWindow).toBe(false); // day 19
  });

  it('flags confirmed vs. predicted days relative to today', () => {
    const map = byDate(THREE_REGULAR_CYCLES, '2026-02-26', '2026-03-25', '2026-03-10');
    expect(map.get('2026-03-05')?.predicted).toBe(false); // past, real cycle
    expect(map.get('2026-03-10')?.predicted).toBe(false); // today
    expect(map.get('2026-03-11')?.predicted).toBe(true);  // future
  });

  it('projects future cycles past the end of the logged history', () => {
    // last logged start 2026-02-26; a projected cycle should start 2026-03-26
    const map = byDate(THREE_REGULAR_CYCLES, '2026-03-26', '2026-04-30', '2026-03-10');
    expect(map.get('2026-03-26')?.phase).toBe('menstruation');
    expect(map.get('2026-03-26')?.cycleDay).toBe(1);
    expect(map.get('2026-03-26')?.predicted).toBe(true);
    expect(map.get('2026-04-09')?.phase).toBe('ovulation'); // 2026-03-26 + 14
  });

  it('uses the real (not average) length for a completed historical cycle', () => {
    const events: CycleEvent[] = [
      ...bleeding('2026-01-01', 5),
      ...bleeding('2026-01-22', 5), // short 21-day cycle
      ...bleeding('2026-03-01', 5),
    ];
    const map = byDate(events, '2026-01-01', '2026-01-21', '2026-06-01');
    expect(map.get('2026-01-01')?.cycleLength).toBe(21);
    expect(map.get('2026-01-21')?.cycleDay).toBe(21);
  });
});

// ── getCycleOverview ──────────────────────────────────────────────────────────

describe('getCycleOverview', () => {
  it('returns an empty-but-safe shape without history', () => {
    const overview = getCycleOverview([], NO_PROFILE, '2026-03-10');
    expect(overview.today).toBeNull();
    expect(overview.nextPeriod).toBeNull();
    expect(overview.nextOvulation).toBeNull();
    expect(overview.stats.source).toBe('profile');
  });

  it('resolves today’s phase and the next events', () => {
    const overview = getCycleOverview(THREE_REGULAR_CYCLES, NO_PROFILE, '2026-03-10');
    expect(overview.today?.phase).toBe('follicular');
    expect(overview.today?.cycleDay).toBe(13); // 2026-02-26 → 2026-03-10
    expect(overview.nextPeriod?.date).toBe('2026-03-26');
    expect(overview.nextOvulation?.date).toBe('2026-03-12');
  });
});

// ── conception risk (calendar method) ────────────────────────────────────────

describe('conceptionRiskFor', () => {
  it('is "high" across the fertile window and sperm-survival span', () => {
    expect(conceptionRiskFor(0, false)).toBe('high');   // ovulation day
    expect(conceptionRiskFor(-5, false)).toBe('high');  // 5 days before
    expect(conceptionRiskFor(3, false)).toBe('high');   // 3 days after
  });

  it('is "elevated" just outside the fertile window', () => {
    expect(conceptionRiskFor(-8, false)).toBe('elevated');
    expect(conceptionRiskFor(5, false)).toBe('elevated');
  });

  it('is "low" well clear of ovulation for a regular cycle', () => {
    expect(conceptionRiskFor(-12, false)).toBe('low'); // menstruation-ish
    expect(conceptionRiskFor(9, false)).toBe('low');   // late luteal
  });

  it('never returns "low" when the history is capped as unreliable', () => {
    expect(conceptionRiskFor(-12, true)).toBe('elevated');
    expect(conceptionRiskFor(9, true)).toBe('elevated');
    expect(conceptionRiskFor(0, true)).toBe('high'); // high is unaffected
  });
});

describe('buildPhaseCalendar — conceptionRisk field', () => {
  it('marks the fertile window "high" and clear luteal days "low" for a regular history', () => {
    const map = new Map(
      buildPhaseCalendar(THREE_REGULAR_CYCLES, NO_PROFILE, '2026-02-26', '2026-03-25', '2026-06-01')
        .map((d) => [d.date, d]),
    );
    expect(map.get('2026-03-12')?.conceptionRisk).toBe('high'); // ovulation
    expect(map.get('2026-03-24')?.conceptionRisk).toBe('low');  // late luteal, day ~27
  });

  it('never reports "low" when only one cycle has been tracked', () => {
    const events: CycleEvent[] = [...bleeding('2026-01-01', 5), ...bleeding('2026-01-29', 5)];
    const risks = buildPhaseCalendar(events, NO_PROFILE, '2026-01-29', '2026-02-25', '2026-06-01')
      .map((d) => d.conceptionRisk);
    expect(risks).not.toContain('low');
    expect(risks).toContain('high');
  });
});

// ── formatting helpers ────────────────────────────────────────────────────────

describe('formatting helpers', () => {
  it('describeInDays handles the near-term cases', () => {
    expect(describeInDays(0)).toBe('heute');
    expect(describeInDays(1)).toBe('morgen');
    expect(describeInDays(-1)).toBe('gestern');
    expect(describeInDays(5)).toBe('in 5 Tagen');
    expect(describeInDays(-3)).toBe('vor 3 Tagen');
  });

  it('describeDayPhase renders label, emoji and progress', () => {
    const [day] = buildPhaseCalendar(THREE_REGULAR_CYCLES, NO_PROFILE, '2026-03-18', '2026-03-18', '2026-03-01');
    expect(describeDayPhase(day)).toBe('🌙 Lutealphase · Tag 21 von 28');
  });

  it('OVULATION_OFFSET_DAYS is the documented 14', () => {
    expect(OVULATION_OFFSET_DAYS).toBe(14);
  });
});
