/**
 * app/(app)/(tabs)/cycle.tsx — "Periode"-Tab
 *
 * Erfassung der Blutungstage + Kalender mit berechneten Zyklusphasen und
 * Prognosen. Sichtbar nur, wenn im Profil gender === 'female' und
 * Zyklus-Tracking aktiv ist (siehe (tabs)/_layout.tsx + useCycleTabEnabled).
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { CycleCalendar } from '@/components/CycleCalendar';
import {
  addDays,
  buildCycleSpans,
  CONCEPTION_RISK_META,
  CYCLE_PHASE_META,
  describeInDays,
  FERTILE_WINDOW_COLOR,
  RECHNERISCHE_SICHERHEIT_HINWEIS,
  REGULARITY_LABEL,
  type PhaseKind,
} from '@/lib/cycle';
import { useCycle } from '@/hooks/useCycle';

// ─── Constants ────────────────────────────────────────────────────────────────

const FLOW_LEVELS = [
  { value: 1, label: 'Schmier' },
  { value: 2, label: 'Leicht' },
  { value: 3, label: 'Mittel' },
  { value: 4, label: 'Stark' },
] as const;

const LEGEND_ORDER: PhaseKind[] = ['menstruation', 'follicular', 'ovulation', 'luteal'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CycleScreen() {
  const today = todayISO();
  const {
    loading, overview, events, flowByDate,
    profileCycleLength, profilePeriodLength,
    phasesForRange, logFlow, removeFlow, applyAverages,
  } = useCycle();

  const [selectedDate, setSelectedDate] = useState(today);
  const [currentMonth, setCurrentMonth] = useState(today.slice(0, 7));

  // Phases for the visible month (+/- one week of padding for edge rows)
  const phases = useMemo(() => {
    const first = `${currentMonth}-01`;
    const [y, m] = currentMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return phasesForRange(addDays(first, -7), addDays(`${currentMonth}-${String(lastDay).padStart(2, '0')}`, 7));
  }, [phasesForRange, currentMonth]);

  const selectedFlow = flowByDate.get(selectedDate) ?? null;
  const selectedPhase = phases.get(selectedDate);

  const spans = useMemo(() => buildCycleSpans(events).slice().reverse().slice(0, 6), [events]);

  const { stats, nextPeriod, nextOvulation } = overview;
  const hasHistory = stats.lastStart != null;

  const suggestionVisible =
    stats.source === 'history' &&
    stats.cyclesTracked >= 2 &&
    (stats.avgCycleLength !== profileCycleLength || stats.avgPeriodLength !== profilePeriodLength);

  const onApplyAverages = () => {
    Alert.alert(
      'Durchschnitt übernehmen?',
      `Zykluslänge ${stats.avgCycleLength} Tage · Periodendauer ${stats.avgPeriodLength} Tage\n\n` +
        'Die manuellen Werte in deinem Profil werden damit überschrieben.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Übernehmen', onPress: () => void applyAverages() },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color="#FF5252" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Periode</Text>

      {/* ── Status ── */}
      {hasHistory ? (
        <View style={styles.card}>
          {selectedPhase ? (
            <View style={styles.phaseHeader}>
              <Text style={styles.phaseEmoji}>{CYCLE_PHASE_META[selectedPhase.phase].emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.phaseLabel, { color: CYCLE_PHASE_META[selectedPhase.phase].color }]}>
                  {CYCLE_PHASE_META[selectedPhase.phase].label}
                </Text>
                <Text style={styles.phaseSub}>
                  Tag {selectedPhase.cycleDay} von {selectedPhase.cycleLength}
                  {selectedPhase.predicted ? ' · Prognose' : ''}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.phaseSub}>Für diesen Tag liegt noch keine Phase vor.</Text>
          )}

          <View style={styles.separator} />

          <View style={styles.metricsRow}>
            <Metric
              label="Nächste Periode"
              value={nextPeriod ? describeInDays(nextPeriod.inDays) : '–'}
              sub={nextPeriod ? formatDate(nextPeriod.date) : undefined}
              color="#FF5252"
            />
            <Metric
              label="Eisprung"
              value={nextOvulation ? describeInDays(nextOvulation.inDays) : '–'}
              sub={nextOvulation ? formatDate(nextOvulation.date) : undefined}
              color={CYCLE_PHASE_META.ovulation.color}
            />
          </View>

          {/* Rechnerische Empfängnis-Wahrscheinlichkeit für den gewählten Tag */}
          {selectedPhase && (
            <View style={styles.riskBox}>
              <View style={styles.riskRow}>
                <View style={[styles.riskDot, { backgroundColor: CONCEPTION_RISK_META[selectedPhase.conceptionRisk].color }]} />
                <Text style={styles.riskLabel}>
                  Sex am {selectedDate === today ? 'heutigen Tag' : 'gewählten Tag'}:{' '}
                  <Text style={{ color: CONCEPTION_RISK_META[selectedPhase.conceptionRisk].color, fontWeight: '800' }}>
                    {CONCEPTION_RISK_META[selectedPhase.conceptionRisk].label}
                  </Text>
                </Text>
              </View>
              <Text style={styles.riskHint}>{CONCEPTION_RISK_META[selectedPhase.conceptionRisk].hint}</Text>
              <TouchableOpacity onPress={() => router.push('/legal')} activeOpacity={0.7}>
                <Text style={styles.riskDisclaimer}>
                  Keine Verhütungsmethode – nur rechnerische Sicherheit. Details ›
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.regularityText}>
            {stats.cyclesTracked > 0
              ? `Ø ${stats.avgCycleLength} Tage · ${REGULARITY_LABEL[stats.regularity]} · ${stats.cyclesTracked} Zyklen erfasst`
              : 'Prognose basiert auf deinen Profilwerten – erfasse mehr Zyklen für genauere Ergebnisse.'}
          </Text>
          {!stats.hasReliableHistory && stats.cyclesTracked > 0 && (
            <Text style={styles.warnText}>
              ⚠️ Weniger als 2 abgeschlossene Zyklen – die Prognose kann noch stark abweichen.
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Los geht’s</Text>
          <Text style={styles.emptyText}>
            Markiere unten den ersten Tag deiner Blutung. Sobald mehrere Zyklen erfasst sind,
            berechnet die App deine Phasen (Menstruation, Follikelphase, Eisprung, Lutealphase)
            und zeigt sie im Kalender an.
          </Text>
        </View>
      )}

      {/* ── Ø-Vorschlag ── */}
      {suggestionVisible && (
        <TouchableOpacity style={[styles.card, styles.suggestionCard]} onPress={onApplyAverages} activeOpacity={0.85}>
          <Ionicons name="sparkles-outline" size={18} color="#FFD600" />
          <Text style={styles.suggestionText}>
            Dein erfasster Durchschnitt weicht von den Profilwerten ab
            ({stats.avgCycleLength}/{stats.avgPeriodLength} Tage). Tippen zum Übernehmen.
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Erfassung ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Blutung erfassen</Text>
        <Text style={styles.selectedDateText}>{formatDate(selectedDate)}{selectedDate === today ? ' · heute' : ''}</Text>

        <View style={styles.flowRow}>
          {FLOW_LEVELS.map((lvl) => {
            const active = selectedFlow === lvl.value;
            return (
              <TouchableOpacity
                key={lvl.value}
                style={[styles.flowChip, active && styles.flowChipActive]}
                onPress={() => (active ? removeFlow(selectedDate) : logFlow(selectedDate, lvl.value))}
                activeOpacity={0.8}
              >
                <Text style={styles.flowDots}>{'🩸'.repeat(lvl.value)}</Text>
                <Text style={[styles.flowLabel, active && styles.flowLabelActive]}>{lvl.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedFlow != null && (
          <TouchableOpacity style={styles.removeRow} onPress={() => removeFlow(selectedDate)} activeOpacity={0.7}>
            <Ionicons name="close-circle-outline" size={16} color="#FF5252" />
            <Text style={styles.removeText}>Blutung für diesen Tag entfernen</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Kalender ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{formatMonth(currentMonth)}</Text>
        <CycleCalendar
          selectedDate={selectedDate}
          phases={phases}
          onDayPress={setSelectedDate}
          onMonthChange={setCurrentMonth}
        />

        {/* Legende */}
        <View style={styles.legend}>
          {LEGEND_ORDER.map((kind) => (
            <View key={kind} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: CYCLE_PHASE_META[kind].color + '4d' }]} />
              <Text style={styles.legendText}>{CYCLE_PHASE_META[kind].label}</Text>
            </View>
          ))}
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, styles.legendFertile]} />
            <Text style={styles.legendText}>Fruchtbares Fenster</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, styles.legendPredicted]} />
            <Text style={styles.legendText}>Prognose</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={styles.legendSafeDot} />
            <Text style={styles.legendText}>rechnerisch unbedenklich</Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => router.push('/legal')} activeOpacity={0.7}>
          <Text style={styles.disclaimerNote}>
            {RECHNERISCHE_SICHERHEIT_HINWEIS} Mehr unter {'„'}Rechtliches{'“'} ›
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Verlauf ── */}
      {spans.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Zyklus-Verlauf</Text>
          {spans.map((s) => (
            <View key={s.start} style={styles.historyRow}>
              <Text style={styles.historyDate}>{formatDate(s.start)}</Text>
              <Text style={styles.historyMeta}>
                {s.length != null ? `${s.length} Tage` : 'laufend'} · {s.periodDays} Blutungstage
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────────────

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      {sub && <Text style={styles.metricSub}>{sub}</Text>}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 56, gap: 16 },
  screenTitle: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  separator: { height: 1, backgroundColor: '#2a2a2a' },

  phaseHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  phaseEmoji: { fontSize: 30 },
  phaseLabel: { fontSize: 18, fontWeight: '800' },
  phaseSub: { color: '#999', fontSize: 13, marginTop: 2 },

  metricsRow: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, backgroundColor: '#252525', borderRadius: 14, padding: 12, gap: 2 },
  metricLabel: { color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  metricSub: { color: '#777', fontSize: 12 },

  regularityText: { color: '#999', fontSize: 12, lineHeight: 17 },
  warnText: { color: '#FF9100', fontSize: 12, lineHeight: 17 },

  riskBox: { backgroundColor: '#252525', borderRadius: 14, padding: 12, gap: 6 },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  riskDot: { width: 12, height: 12, borderRadius: 6 },
  riskLabel: { flex: 1, color: '#ddd', fontSize: 13 },
  riskHint: { color: '#999', fontSize: 12, lineHeight: 16 },
  riskDisclaimer: { color: '#00E5FF', fontSize: 11, fontWeight: '700', marginTop: 2 },

  disclaimerNote: { color: '#777', fontSize: 11, lineHeight: 16, marginTop: 4 },

  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  emptyText: { color: '#aaa', fontSize: 13, lineHeight: 19 },

  suggestionCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: '#FFD60044' },
  suggestionText: { flex: 1, color: '#e8e8e8', fontSize: 12, lineHeight: 17 },

  selectedDateText: { color: '#FF5252', fontSize: 14, fontWeight: '700' },
  flowRow: { flexDirection: 'row', gap: 8 },
  flowChip: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 3,
  },
  flowChipActive: { backgroundColor: '#FF525222', borderColor: '#FF5252' },
  flowDots: { fontSize: 8 },
  flowLabel: { color: '#999', fontSize: 11, fontWeight: '600' },
  flowLabelActive: { color: '#FF5252', fontWeight: '800' },
  removeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  removeText: { color: '#FF5252', fontSize: 12, fontWeight: '600' },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4 },
  legendFertile: { borderWidth: 1.5, borderColor: FERTILE_WINDOW_COLOR, borderStyle: 'dotted' },
  legendPredicted: { borderWidth: 1.5, borderColor: '#ffffff44', borderStyle: 'dashed' },
  legendSafeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50', marginHorizontal: 3 },
  legendText: { color: '#999', fontSize: 11 },

  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyDate: { color: '#ddd', fontSize: 13, fontWeight: '700' },
  historyMeta: { color: '#888', fontSize: 12 },
});
