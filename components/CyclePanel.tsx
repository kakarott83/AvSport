/**
 * components/CyclePanel.tsx
 *
 * Zyklus-Bereich im Kalender-Tab (ehemals eigener "Periode"-Tab): Status für
 * den gewählten Tag, Blutung erfassen, Verknüpfung mit Apple Health /
 * Health Connect, Ø-Vorschlag und Zyklus-Verlauf. Datenquelle: useCycle().
 *
 * `CycleLegend` gehört direkt unter den Kalender.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { CycleResult } from '@/hooks/useCycle';
import {
  buildCycleSpans,
  CONCEPTION_RISK_META,
  CYCLE_PHASE_META,
  describeInDays,
  FERTILE_WINDOW_COLOR,
  RECHNERISCHE_SICHERHEIT_HINWEIS,
  REGULARITY_LABEL,
  type DayPhase,
} from '@/lib/cycle';

export const PERIOD_COLOR = '#FF5252';

const FLOW_LEVELS = [
  { value: 1, label: 'Schmier' },
  { value: 2, label: 'Leicht' },
  { value: 3, label: 'Mittel' },
  { value: 4, label: 'Stark' },
] as const;

const HEALTH_NAME = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function CyclePanel({
  cycle,
  selectedDate,
  selectedPhase,
  today,
}: {
  cycle: CycleResult;
  selectedDate: string;
  selectedPhase: DayPhase | undefined;
  today: string;
}) {
  const {
    loading, overview, events, flowByDate, healthDates, healthLinked, linkHealth,
    profileCycleLength, profilePeriodLength, logFlow, removeFlow, applyAverages,
  } = cycle;
  const [linking, setLinking] = useState(false);

  const spans = useMemo(() => buildCycleSpans(events).slice().reverse().slice(0, 6), [events]);
  const { stats, nextPeriod, nextOvulation } = overview;
  const hasHistory = stats.lastStart != null;
  const selectedFlow = flowByDate.get(selectedDate) ?? null;
  const fromHealth = healthDates.has(selectedDate);
  const isFuture = selectedDate > today;

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

  const onLinkHealth = async () => {
    setLinking(true);
    const ok = await linkHealth();
    setLinking(false);
    if (!ok) {
      Alert.alert(
        `${HEALTH_NAME} nicht verbunden`,
        Platform.OS === 'ios'
          ? 'Bitte erlaube AvoraSport in Apple Health das Lesen von „Menstruation“ (Einstellungen › Health › Datenzugriff & Geräte).'
          : 'Bitte erlaube AvoraSport in Health Connect das Lesen von „Menstruation“.',
      );
    }
  };

  if (loading) {
    return (
      <View style={[styles.card, styles.centered]}>
        <ActivityIndicator color={PERIOD_COLOR} />
      </View>
    );
  }

  return (
    <>
      {/* ── Status für den gewählten Tag ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Zyklus · {formatDate(selectedDate)}{selectedDate === today ? ' · heute' : ''}</Text>

        {hasHistory ? (
          <>
            {selectedPhase ? (
              <View style={styles.phaseHeader}>
                <Text style={styles.phaseEmoji}>{CYCLE_PHASE_META[selectedPhase.phase].emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.phaseLabel, { color: CYCLE_PHASE_META[selectedPhase.phase].color }]}>
                    {CYCLE_PHASE_META[selectedPhase.phase].label}
                    {selectedPhase.fertileWindow ? ' · fruchtbar' : ''}
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

            <View style={styles.metricsRow}>
              <Metric
                label="Nächste Periode"
                value={nextPeriod ? describeInDays(nextPeriod.inDays) : '–'}
                sub={nextPeriod ? formatDate(nextPeriod.date) : undefined}
                color={PERIOD_COLOR}
              />
              <Metric
                label="Eisprung"
                value={nextOvulation ? describeInDays(nextOvulation.inDays) : '–'}
                sub={nextOvulation ? formatDate(nextOvulation.date) : undefined}
                color={CYCLE_PHASE_META.ovulation.color}
              />
            </View>

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
                  <Text style={styles.riskDisclaimer}>Keine Verhütungsmethode – nur rechnerische Sicherheit. Details ›</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.regularityText}>
              {stats.cyclesTracked > 0
                ? `Ø ${stats.avgCycleLength} Tage · ${REGULARITY_LABEL[stats.regularity]} · ${stats.cyclesTracked} Zyklen erfasst`
                : 'Prognose basiert auf deinen Profilwerten – erfasse mehr Zyklen für genauere Ergebnisse.'}
            </Text>
            {!stats.hasReliableHistory && stats.cyclesTracked > 0 && (
              <Text style={styles.warnText}>⚠️ Weniger als 2 abgeschlossene Zyklen – die Prognose kann noch stark abweichen.</Text>
            )}
          </>
        ) : (
          <Text style={styles.emptyText}>
            Markiere unten den ersten Tag deiner Blutung{healthLinked ? '' : ` oder verbinde ${HEALTH_NAME}`}. Danach zeigt der
            Kalender deine Periode, fruchtbaren Tage und die Prognose für die nächsten Monate.
          </Text>
        )}

        {/* ── Blutung erfassen ── */}
        {!isFuture && (
          <>
            <View style={styles.separator} />
            <Text style={styles.sectionLabel}>BLUTUNG</Text>
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
            {fromHealth && (
              <Text style={styles.healthHint}>
                Aus {HEALTH_NAME} übernommen. Änderungen am besten dort vornehmen – gelöschte Tage werden sonst beim
                nächsten Abgleich wieder übernommen.
              </Text>
            )}
            {selectedFlow != null && (
              <TouchableOpacity style={styles.removeRow} onPress={() => removeFlow(selectedDate)} activeOpacity={0.7}>
                <Ionicons name="close-circle-outline" size={16} color={PERIOD_COLOR} />
                <Text style={styles.removeText}>Blutung für diesen Tag entfernen</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── Health-Verknüpfung ── */}
        {Platform.OS !== 'web' && (
          healthLinked ? (
            <View style={styles.healthRow}>
              <Ionicons name="checkmark-circle" size={15} color="#4CAF50" />
              <Text style={styles.healthLinkedText}>Periodendaten werden aus {HEALTH_NAME} übernommen</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.healthBtn} onPress={onLinkHealth} disabled={linking} activeOpacity={0.8}>
              {linking ? (
                <ActivityIndicator color={PERIOD_COLOR} size="small" />
              ) : (
                <>
                  <Ionicons name="heart-circle-outline" size={18} color={PERIOD_COLOR} />
                  <Text style={styles.healthBtnText}>Periode aus {HEALTH_NAME} übernehmen</Text>
                </>
              )}
            </TouchableOpacity>
          )
        )}
      </View>

      {/* ── Ø-Vorschlag ── */}
      {suggestionVisible && (
        <TouchableOpacity style={[styles.card, styles.suggestionCard]} onPress={onApplyAverages} activeOpacity={0.85}>
          <Ionicons name="sparkles-outline" size={18} color="#FFD600" />
          <Text style={styles.suggestionText}>
            Dein erfasster Durchschnitt weicht von den Profilwerten ab ({stats.avgCycleLength}/{stats.avgPeriodLength} Tage).
            Tippen zum Übernehmen.
          </Text>
        </TouchableOpacity>
      )}

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
    </>
  );
}

// ─── Legende (unter dem Kalender) ─────────────────────────────────────────────

export function CycleLegend() {
  return (
    <View style={styles.legendWrap}>
      <View style={styles.legend}>
        <LegendItem swatch={[styles.swatch, { backgroundColor: PERIOD_COLOR + '66' }]} label="Periode" />
        <LegendItem swatch={[styles.swatch, styles.swatchPredicted]} label="Periode (Prognose)" />
        <LegendItem swatch={[styles.swatch, styles.swatchFertile]} label="Fruchtbar" />
        <View style={styles.legendItem}>
          <Text style={styles.legendEgg}>🥚</Text>
          <Text style={styles.legendText}>Eisprung</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => router.push('/legal')} activeOpacity={0.7}>
        <Text style={styles.disclaimerNote}>
          {RECHNERISCHE_SICHERHEIT_HINWEIS} Mehr unter {'„'}Rechtliches{'“'} ›
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function LegendItem({ swatch, label }: { swatch: any; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={swatch} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      {sub && <Text style={styles.metricSub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 16,
    gap: 12,
  },
  centered: { alignItems: 'center', justifyContent: 'center', minHeight: 80 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  separator: { height: 1, backgroundColor: '#2a2a2a' },
  sectionLabel: { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  phaseHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  phaseEmoji: { fontSize: 30 },
  phaseLabel: { fontSize: 17, fontWeight: '800' },
  phaseSub: { color: '#999', fontSize: 13, marginTop: 2 },

  metricsRow: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, backgroundColor: '#252525', borderRadius: 14, padding: 12, gap: 2 },
  metricLabel: { color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  metricSub: { color: '#777', fontSize: 12 },

  regularityText: { color: '#999', fontSize: 12, lineHeight: 17 },
  warnText: { color: '#FF9100', fontSize: 12, lineHeight: 17 },
  emptyText: { color: '#aaa', fontSize: 13, lineHeight: 19 },

  riskBox: { backgroundColor: '#252525', borderRadius: 14, padding: 12, gap: 6 },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  riskDot: { width: 12, height: 12, borderRadius: 6 },
  riskLabel: { flex: 1, color: '#ddd', fontSize: 13 },
  riskHint: { color: '#999', fontSize: 12, lineHeight: 16 },
  riskDisclaimer: { color: '#00E5FF', fontSize: 11, fontWeight: '700', marginTop: 2 },

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
  flowChipActive: { backgroundColor: PERIOD_COLOR + '22', borderColor: PERIOD_COLOR },
  flowDots: { fontSize: 8 },
  flowLabel: { color: '#999', fontSize: 11, fontWeight: '600' },
  flowLabelActive: { color: PERIOD_COLOR, fontWeight: '800' },
  removeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  removeText: { color: PERIOD_COLOR, fontSize: 12, fontWeight: '600' },
  healthHint: { color: '#888', fontSize: 11, lineHeight: 16 },

  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  healthLinkedText: { color: '#888', fontSize: 12 },
  healthBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: PERIOD_COLOR + '55', borderRadius: 12, paddingVertical: 11,
  },
  healthBtnText: { color: PERIOD_COLOR, fontSize: 13, fontWeight: '700' },

  suggestionCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: '#FFD60044' },
  suggestionText: { flex: 1, color: '#e8e8e8', fontSize: 12, lineHeight: 17 },

  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyDate: { color: '#ddd', fontSize: 13, fontWeight: '700' },
  historyMeta: { color: '#888', fontSize: 12 },

  legendWrap: { gap: 6, marginTop: 8, paddingHorizontal: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  swatchPredicted: { backgroundColor: PERIOD_COLOR + '18', borderWidth: 1.5, borderColor: PERIOD_COLOR + '99', borderStyle: 'dashed' },
  swatchFertile: { backgroundColor: FERTILE_WINDOW_COLOR + '14', borderWidth: 1.5, borderColor: FERTILE_WINDOW_COLOR, borderStyle: 'dotted' },
  legendEgg: { fontSize: 11 },
  legendText: { color: '#999', fontSize: 11 },
  disclaimerNote: { color: '#777', fontSize: 11, lineHeight: 16 },
});
