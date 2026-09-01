/**
 * components/CycleCalendar.tsx
 *
 * Monatskalender mit ganztägiger Phasen-Einfärbung. Bekommt die vorberechneten
 * Phasen (lib/cycle.ts → buildPhaseCalendar) als Map<ISO-Datum, DayPhase>.
 *
 * - Hintergrundfarbe = Phasenfarbe (CYCLE_PHASE_META).
 * - Bestätigte Tage: deckende Füllung. Prognosen: blasse Füllung + gestrichelter
 *   Rand.
 * - Fruchtbares Fenster: gepunkteter gelber Rand; Eisprungtag: 🥚.
 * - Blutungstag: 🩸 (Intensität über die Deckkraft).
 * - "Heute": cyan Rand. Ausgewählter Tag: cyan Kreis um die Zahl.
 */

import { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { CYCLE_PHASE_META, FERTILE_WINDOW_COLOR, type DayPhase } from '@/lib/cycle';

type DateData = { dateString: string; day: number; month: number; year: number; timestamp: number };

interface Props {
  /** ISO date currently selected. */
  selectedDate: string;
  /** Phases keyed by ISO date. */
  phases: Map<string, DayPhase>;
  onDayPress: (date: string) => void;
  onMonthChange: (yearMonth: string) => void;
}

const CALENDAR_THEME = {
  backgroundColor: '#1e1e1e',
  calendarBackground: '#1e1e1e',
  textSectionTitleColor: '#888',
  arrowColor: '#00E5FF',
  monthTextColor: '#fff',
  indicatorColor: '#00E5FF',
  textMonthFontWeight: '800' as const,
  textDayHeaderFontWeight: '600' as const,
};

export function CycleCalendar({ selectedDate, phases, onDayPress, onMonthChange }: Props) {
  const DayCellRenderer = useCallback(
    (props: any) => (
      <PhaseDayCell {...props} phases={phases} selectedDate={selectedDate} onDayPress={onDayPress} />
    ),
    [phases, selectedDate, onDayPress],
  );

  return (
    <Calendar
      current={selectedDate}
      onMonthChange={(m: { dateString: string }) => onMonthChange(m.dateString.slice(0, 7))}
      dayComponent={DayCellRenderer}
      theme={CALENDAR_THEME}
      style={styles.calendar}
    />
  );
}

// ─── Day cell ─────────────────────────────────────────────────────────────────

function PhaseDayCell({
  date,
  state,
  phases,
  selectedDate,
  onDayPress,
}: {
  date?: DateData;
  state?: 'disabled' | 'today' | '';
  phases: Map<string, DayPhase>;
  selectedDate: string;
  onDayPress: (date: string) => void;
}) {
  if (!date) return <View style={styles.cell} />;

  const phase = phases.get(date.dateString);
  const isSelected = date.dateString === selectedDate;
  const isToday = state === 'today';
  const isDisabled = state === 'disabled';

  const meta = phase ? CYCLE_PHASE_META[phase.phase] : null;
  const fillAlpha = phase?.predicted ? '22' : '4d'; // ~13% vs ~30%
  const showFertileRing = phase?.fertileWindow && phase.phase !== 'ovulation';

  return (
    <TouchableOpacity
      style={styles.cell}
      activeOpacity={0.7}
      disabled={isDisabled}
      onPress={() => !isDisabled && onDayPress(date.dateString)}
    >
      <View
        style={[
          styles.fill,
          meta ? { backgroundColor: meta.color + fillAlpha } : null,
          phase?.predicted ? styles.predictedBorder : null,
          showFertileRing ? { borderColor: FERTILE_WINDOW_COLOR, borderStyle: 'dotted', borderWidth: 1.5 } : null,
          isToday ? styles.todayBorder : null,
        ]}
      >
        <View style={[styles.numberCircle, isSelected && styles.numberCircleSelected]}>
          <Text
            style={[
              styles.dayText,
              isDisabled && styles.dayDisabled,
              isSelected && styles.daySelected,
              isToday && !isSelected && styles.dayToday,
            ]}
          >
            {date.day}
          </Text>
        </View>

        <View style={styles.markerRow}>
          {phase?.bleeding && <Text style={styles.marker}>🩸</Text>}
          {phase?.phase === 'ovulation' && <Text style={styles.marker}>🥚</Text>}
          {phase && !phase.bleeding && phase.conceptionRisk === 'low' && (
            <View style={styles.safeDot} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  calendar: { borderRadius: 12, paddingBottom: 6 },
  cell: {
    width: 40,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    width: 38,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  predictedBorder: { borderColor: '#ffffff22', borderStyle: 'dashed' },
  todayBorder: { borderColor: '#00E5FF' },
  numberCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberCircleSelected: { backgroundColor: '#00E5FF' },
  dayText: { fontSize: 13, fontWeight: '600', color: '#eee' },
  daySelected: { color: '#121212', fontWeight: '800' },
  dayToday: { color: '#00E5FF', fontWeight: '800' },
  dayDisabled: { color: '#555' },
  markerRow: { flexDirection: 'row', alignItems: 'center', height: 12, marginTop: 1 },
  marker: { fontSize: 9, lineHeight: 11 },
  // "rechnerisch unbedenklicher" Tag
  safeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#4CAF50' },
});
