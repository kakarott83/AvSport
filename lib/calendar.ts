/**
 * Pure calendar / tag-system helpers.
 * No React, no React Native — safe to import from tests.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type Tag = {
  id: string;
  label: string;
  emoji: string;
  color: string;
  /** 'striped' renders a diagonal-hatch pattern instead of a solid bar. */
  pattern?: 'solid' | 'striped';
};

export type LogRow = {
  date: string;
  tag_ids: string[];
  note: string | null;
};

export type MarkedDates = Record<
  string,
  { dots?: { key: string; color: string }[]; selected?: boolean; selectedColor?: string }
>;

export type MonthStat = {
  tag: Tag;
  count: number;
  /** Total days in the month — used by the UI progress bar. */
  total: number;
};

// ── Functions ──────────────────────────────────────────────────────────────────

/** Number of days in a YYYY-MM month string (e.g. "2026-04" → 30). */
export function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Compute per-tag counts for `currentMonth`.
 *
 * - Only logs whose `date` falls inside `currentMonth` are counted.
 * - Tags with zero occurrences are excluded from the result.
 * - Unknown tag IDs in log rows are silently ignored (no crash).
 * - Result is sorted descending by count.
 */
export function computeMonthStats(
  allLogs: LogRow[],
  currentMonth: string,
  tags: Tag[],
): MonthStat[] {
  const prefix  = currentMonth + '-';
  const total   = daysInMonth(currentMonth);
  const inMonth = allLogs.filter(r => r.date.startsWith(prefix));

  return tags
    .map(tag => ({
      tag,
      count: inMonth.filter(r => r.tag_ids.includes(tag.id)).length,
      total,
    }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Convert log rows into the react-native-calendars `markedDates` object.
 *
 * Rules:
 * - Each known tag ID becomes a colored dot.
 * - Unknown tag IDs are silently skipped.
 * - If a row has no known tags but has a note, a grey "note" dot is shown.
 * - `activeDate` is always marked as selected (overrides any existing entry).
 */
export function buildMarked(
  rows: LogRow[],
  tagMap: Map<string, Tag>,
  activeDate: string,
): MarkedDates {
  const map: MarkedDates = {};

  for (const row of rows) {
    const dots: { key: string; color: string }[] = [];

    for (const id of row.tag_ids) {
      const tag = tagMap.get(id);
      if (tag) dots.push({ key: id, color: tag.color });
      // Unknown IDs → silently skipped, no crash
    }

    if (dots.length === 0 && row.note) {
      dots.push({ key: 'note', color: '#888' });
    }

    if (dots.length > 0) {
      map[row.date] = { dots };
    }
  }

  map[activeDate] = { ...(map[activeDate] ?? {}), selected: true, selectedColor: '#00E5FF' };
  return map;
}

// ── Verlauf über mehrere Monate ────────────────────────────────────────────────

export type MonthTrendPoint = {
  /** YYYY-MM */
  month: string;
  /** Tage im Monat, an denen der Tag gesetzt war. */
  count: number;
  /** Tage im Monat. */
  total: number;
};

/** "2026-03" + n Monate (n darf negativ sein). */
export function shiftMonth(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Wie oft ein Tag in den `months` Monaten bis einschließlich `endMonth`
 * gesetzt war — chronologisch, ältester Monat zuerst.
 */
export function computeMonthTrend(
  logs: LogRow[],
  tagId: string,
  endMonth: string,
  months = 6,
): MonthTrendPoint[] {
  const counts = new Map<string, number>();
  for (const row of logs) {
    if (!row.tag_ids.includes(tagId)) continue;
    const month = row.date.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return Array.from({ length: months }, (_, i) => {
    const month = shiftMonth(endMonth, i - (months - 1));
    return { month, count: counts.get(month) ?? 0, total: daysInMonth(month) };
  });
}
