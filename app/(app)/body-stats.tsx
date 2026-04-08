import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { DatePickerInput, isoToGerman } from '@/components/DatePickerInput';
import { Toast } from '@/components/Toast';
import { supabase } from '@/services/supabaseClient';

// ─────────────────────────────────────────
// Konstanten & Types
// ─────────────────────────────────────────

const CHART_TABS = ['Gewicht', 'Bauchumfang', 'Brustumfang', 'Oberarm (links)', 'Hüfte'];

type RegionMeta = {
  label: string;
  icon: keyof typeof import('@expo/vector-icons/MaterialIcons').glyphMap;
  unit: string;
};

const REGIONS: RegionMeta[] = [
  { label: 'Bauchumfang',           icon: 'straighten',    unit: 'cm' },
  { label: 'Brustumfang',           icon: 'straighten',    unit: 'cm' },
  { label: 'Oberarm (links)',        icon: 'fitness-center',unit: 'cm' },
  { label: 'Oberarm (rechts)',       icon: 'fitness-center',unit: 'cm' },
  { label: 'Oberschenkel (links)',   icon: 'straighten',    unit: 'cm' },
  { label: 'Oberschenkel (rechts)',  icon: 'straighten',    unit: 'cm' },
  { label: 'Waden',                 icon: 'straighten',    unit: 'cm' },
  { label: 'Hüfte',                icon: 'straighten',    unit: 'cm' },
];

type Measurement = {
  id: string;
  region: string;
  value: number;
  measured_at: string;
};

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(iso: string): string {
  const today = toISODate(new Date());
  const yesterday = toISODate(new Date(Date.now() - 86400000));
  if (iso === today) return 'Heute';
  if (iso === yesterday) return 'Gestern';
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
}

function regionMeta(label: string): RegionMeta {
  return REGIONS.find((r) => r.label === label) ?? { label, icon: 'straighten', unit: 'cm' };
}

function unitFor(region: string) {
  return region === 'Gewicht' ? 'kg' : 'cm';
}

// ─────────────────────────────────────────
// Chart-Wrapper
// ─────────────────────────────────────────

const CHART_WIDTH = Dimensions.get('window').width - 40 - 56; // screen padding + card padding + y-axis

/** YYYY-MM-DD → '08.04.' */
function toShortLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
}

function buildChartPoints(data: { x: string; y: number }[]) {
  // X-Labels ausdünnen: bei >8 Punkten nur jedes n-te Label
  const step = data.length > 8 ? Math.ceil(data.length / 6) : 1;
  return data.map((d, i) => ({
    value: d.y,
    label: i % step === 0 ? toShortLabel(d.x) : '',
    dataPointText: '',
  }));
}

// ─────────────────────────────────────────
// RegionPicker
// ─────────────────────────────────────────

function RegionPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const suggestions = value.trim().length === 0
    ? REGIONS
    : REGIONS.filter((r) => r.label.toLowerCase().includes(value.toLowerCase()));

  return (
    <View style={pickerStyles.wrapper}>
      <TextInput
        ref={inputRef}
        style={pickerStyles.input}
        value={value}
        onChangeText={(v) => { onChange(v); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Region wählen oder eingeben…"
        placeholderTextColor="#555"
        returnKeyType="next"
      />
      {open && suggestions.length > 0 && (
        <View style={pickerStyles.dropdown}>
          {suggestions.map((r) => (
            <TouchableOpacity
              key={r.label}
              style={pickerStyles.item}
              onPress={() => { onChange(r.label); setOpen(false); inputRef.current?.blur(); }}
              activeOpacity={0.7}
            >
              <MaterialIcons name={r.icon} size={15} color="#0a7ea4" style={{ marginRight: 10 }} />
              <Text style={pickerStyles.itemText}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  wrapper: { marginBottom: 12, zIndex: 20 },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  dropdown: {
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0a7ea4',
    marginTop: 4,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  itemText: { color: '#fff', fontSize: 14 },
});


// ─────────────────────────────────────────
// Hauptscreen
// ─────────────────────────────────────────

export default function BodyStatsScreen() {
  // ── Gewicht-Input ──
  const [weightInput, setWeightInput] = useState('');
  const [weightDate, setWeightDate] = useState(toISODate(new Date()));
  const [weightSaving, setWeightSaving] = useState(false);
  const [weightError, setWeightError] = useState('');
  const [latestWeight, setLatestWeight] = useState<number | null>(null);

  // ── Umfang-Input ──
  const [region, setRegion] = useState('');
  const [valueInput, setValueInput] = useState('');
  const [measureDate, setMeasureDate] = useState(toISODate(new Date()));
  const [measSaving, setMeasSaving] = useState(false);
  const [measError, setMeasError] = useState('');

  // ── Chart ──
  const [activeTab, setActiveTab] = useState('Gewicht');
  const [chartData, setChartData] = useState<{ x: string; y: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // ── Historie ──
  const [history, setHistory] = useState<Measurement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ── Toast ──
  const [toast, setToast] = useState<string | null>(null);

  // ── Daten laden ──
  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Historie (letzte 20, alle Regionen)
    setHistoryLoading(true);
    const { data: hist } = await supabase
      .from('body_measurements')
      .select('id, region, value, measured_at')
      .eq('user_id', user.id)
      .order('measured_at', { ascending: false })
      .limit(20);
    setHistoryLoading(false);
    if (hist) {
      setHistory(hist);
      const latest = hist.find((m: Measurement) => m.region === 'Gewicht');
      if (latest) setLatestWeight(latest.value);
    }
  }

  async function loadChartData(tab: string) {
    setChartLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChartLoading(false); return; }

    const since = toISODate(new Date(Date.now() - 30 * 86400000));
    const { data } = await supabase
      .from('body_measurements')
      .select('value, measured_at')
      .eq('user_id', user.id)
      .eq('region', tab)
      .gte('measured_at', since)
      .order('measured_at', { ascending: true });

    setChartLoading(false);
    if (data) {
      setChartData(data.map((d: any) => ({
        x: d.measured_at,   // raw YYYY-MM-DD — toShortLabel() formats on render
        y: d.value,
      })));
    }
  }

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadChartData(activeTab); }, [activeTab]);

  // ── Gewicht speichern ──
  async function handleSaveWeight() {
    setWeightError('');
    const v = parseFloat(weightInput);
    if (!weightInput.trim() || isNaN(v) || v <= 0) {
      setWeightError('Bitte ein gültiges Gewicht eingeben.');
      return;
    }
    setWeightSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setWeightSaving(false); return; }

    const { error } = await supabase.from('body_measurements').insert({
      user_id: user.id,
      region: 'Gewicht',
      value: v,
      measured_at: weightDate,
    });
    setWeightSaving(false);
    if (error) { setWeightError(`Fehler: ${error.message}`); return; }

    setLatestWeight(v);
    setToast(`Gewicht: ${v} kg – ${isoToGerman(weightDate)} gespeichert`);
    setWeightInput('');
    loadAll();
    if (activeTab === 'Gewicht') loadChartData('Gewicht');
  }

  // ── Umfang speichern ──
  async function handleSaveMeasurement() {
    setMeasError('');
    if (!region.trim()) { setMeasError('Bitte eine Region angeben.'); return; }
    const v = parseFloat(valueInput);
    if (!valueInput.trim() || isNaN(v) || v <= 0) {
      setMeasError('Bitte einen gültigen Wert eingeben.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(measureDate)) {
      setMeasError('Datum muss im Format JJJJ-MM-TT sein.');
      return;
    }
    setMeasSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMeasSaving(false); return; }

    const { error } = await supabase.from('body_measurements').insert({
      user_id: user.id,
      region: region.trim(),
      value: v,
      measured_at: measureDate,
    });
    setMeasSaving(false);
    if (error) { setMeasError(`Fehler: ${error.message}`); return; }

    setToast(`${region.trim()}: ${v} cm – ${isoToGerman(measureDate)} gespeichert`);
    setRegion('');
    setValueInput('');
    setMeasureDate(toISODate(new Date()));
    loadAll();
    if (activeTab === region.trim()) loadChartData(region.trim());
  }

  // ── Eintrag löschen ──
  async function handleDelete(id: string) {
    await supabase.from('body_measurements').delete().eq('id', id);
    setHistory((prev) => prev.filter((m) => m.id !== id));
    loadChartData(activeTab);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >

        {/* ══ GEWICHT ══ */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <MaterialIcons name="monitor-weight" size={20} color="#0a7ea4" />
            <Text style={styles.cardTitle}>Körpergewicht</Text>
            {latestWeight !== null && (
              <Text style={styles.currentBadge}>{latestWeight} kg</Text>
            )}
          </View>

          <View style={styles.weightRow}>
            <TextInput
              style={[styles.input, styles.weightInput]}
              value={weightInput}
              onChangeText={setWeightInput}
              placeholder="z.B. 82.5"
              placeholderTextColor="#555"
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={handleSaveWeight}
            />
            <Text style={styles.unitLabel}>kg</Text>
          </View>

          <DatePickerInput value={weightDate} onChange={setWeightDate} label="Datum der Messung" />

          {weightError ? <Text style={styles.inputError}>{weightError}</Text> : null}

          <TouchableOpacity
            style={[styles.saveButton, weightSaving && styles.saveButtonDisabled]}
            onPress={handleSaveWeight}
            disabled={weightSaving}
            activeOpacity={0.8}
          >
            {weightSaving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveButtonText}>Gewicht speichern</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ══ UMFÄNGE ══ */}
        <View style={[styles.card, { zIndex: 10 }]}>
          <View style={styles.cardHeaderRow}>
            <MaterialIcons name="straighten" size={20} color="#0a7ea4" />
            <Text style={styles.cardTitle}>Körperumfang</Text>
          </View>

          <Text style={styles.label}>Region</Text>
          <RegionPicker value={region} onChange={setRegion} />

          <View style={styles.weightRow}>
            <TextInput
              style={[styles.input, styles.weightInput]}
              value={valueInput}
              onChangeText={setValueInput}
              placeholder="z.B. 85.0"
              placeholderTextColor="#555"
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={handleSaveMeasurement}
            />
            <Text style={styles.unitLabel}>cm</Text>
          </View>

          <Text style={styles.label}>Datum</Text>
          <DatePickerInput value={measureDate} onChange={setMeasureDate} label="Datum der Messung" />

          {measError ? <Text style={styles.inputError}>{measError}</Text> : null}

          <TouchableOpacity
            style={[styles.saveButton, measSaving && styles.saveButtonDisabled]}
            onPress={handleSaveMeasurement}
            disabled={measSaving}
            activeOpacity={0.8}
          >
            {measSaving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveButtonText}>Umfang speichern</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ══ VERLAUF-CHART ══ */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <MaterialIcons name="show-chart" size={20} color="#0a7ea4" />
            <Text style={styles.cardTitle}>Verlauf · 30 Tage</Text>
          </View>

          {/* Tab-Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 16 }}
            contentContainerStyle={{ gap: 8 }}
          >
            {CHART_TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabChip, activeTab === tab && styles.tabChipActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabChipText, activeTab === tab && styles.tabChipTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {chartLoading ? (
            <ActivityIndicator color="#0a7ea4" style={{ marginVertical: 24 }} />
          ) : chartData.length < 2 ? (
            <View style={styles.chartEmpty}>
              <Text style={styles.chartEmptyText}>
                Mindestens 2 Einträge für den Verlauf
              </Text>
            </View>
          ) : (
            <View style={styles.chartWrapper}>
              <LineChart
                areaChart
                data={buildChartPoints(chartData)}
                width={CHART_WIDTH}
                height={180}
                // ── Linie ──
                thickness={2.5}
                color="#0a7ea4"
                // ── Farbverlauf ──
                startFillColor="rgba(10, 126, 164, 0.45)"
                endFillColor="rgba(10, 126, 164, 0.0)"
                startOpacity={1}
                endOpacity={0}
                // ── Datenpunkte ──
                dataPointsColor="#fff"
                dataPointsRadius={4}
                // ── Achsen ──
                hideRules={false}
                rulesColor="#1e1e1e"
                noOfSections={4}
                yAxisThickness={0}
                xAxisThickness={1}
                xAxisColor="#2a2a2a"
                yAxisTextStyle={{ color: '#555', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#777', fontSize: 10 }}
                initialSpacing={16}
                endSpacing={16}
                // ── Hintergrund ──
                backgroundColor="transparent"
                // ── Kurve ──
                curved
                isAnimated
                // ── Pointer (Tooltip beim Tippen) ──
                pointerConfig={{
                  pointerStripHeight: 160,
                  pointerStripColor: 'rgba(10,126,164,0.4)',
                  pointerStripWidth: 1,
                  pointerColor: '#0a7ea4',
                  radius: 6,
                  pointerLabelWidth: 80,
                  pointerLabelHeight: 40,
                  activatePointersOnLongPress: false,
                  autoAdjustPointerLabelPosition: true,
                  pointerLabelComponent: (items: any[]) => (
                    <View style={styles.pointerLabel}>
                      <Text style={styles.pointerValue}>{items[0]?.value}</Text>
                      <Text style={styles.pointerUnit}>{unitFor(activeTab)}</Text>
                    </View>
                  ),
                }}
              />
            </View>
          )}
        </View>

        {/* ══ HISTORIE ══ */}
        <Text style={styles.sectionTitle}>Letzte Einträge</Text>

        {historyLoading ? (
          <ActivityIndicator color="#0a7ea4" style={{ marginTop: 16 }} />
        ) : history.length === 0 ? (
          <Text style={styles.emptyText}>Noch keine Messungen vorhanden.</Text>
        ) : (
          history.map((m) => {
            const meta = m.region === 'Gewicht'
              ? { icon: 'monitor-weight' as const, unit: 'kg' }
              : { icon: regionMeta(m.region).icon, unit: 'cm' };
            return (
              <View key={m.id} style={styles.historyRow}>
                <View style={styles.historyIconCircle}>
                  <MaterialIcons name={meta.icon} size={17} color="#0a7ea4" />
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyRegion}>{m.region}</Text>
                  <Text style={styles.historyDate}>{formatDisplayDate(m.measured_at)}</Text>
                </View>
                <Text style={styles.historyValue}>{m.value} {meta.unit}</Text>
                <TouchableOpacity
                  onPress={() => handleDelete(m.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.historyDelete}
                >
                  <MaterialIcons name="close" size={16} color="#444" />
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Zurück</Text>
        </TouchableOpacity>
      </ScrollView>

      {toast && (
        <Toast message={toast} type="success" duration={2000} onDismiss={() => setToast(null)} />
      )}
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#121212' },
  container: { flexGrow: 1, padding: 20, paddingTop: 16, paddingBottom: 56 },

  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  currentBadge: {
    color: '#0a7ea4',
    fontSize: 18,
    fontWeight: '800',
  },

  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 0,
  },
  weightInput: {
    flex: 1,
    marginBottom: 12,
  },
  unitLabel: {
    color: '#555',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
    minWidth: 24,
  },
  inputError: {
    color: '#c0392b',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  saveButton: {
    marginTop: 4,
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Chart tabs
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#333',
  },
  tabChipActive: {
    backgroundColor: '#0a7ea4',
    borderColor: '#0a7ea4',
  },
  tabChipText: { color: '#666', fontSize: 13, fontWeight: '600' },
  tabChipTextActive: { color: '#fff' },

  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 8,
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },

  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  historyIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1a2a30',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyInfo: { flex: 1 },
  historyRegion: { color: '#fff', fontSize: 14, fontWeight: '600' },
  historyDate: { color: '#666', fontSize: 12, marginTop: 2 },
  historyValue: {
    color: '#0a7ea4',
    fontSize: 15,
    fontWeight: '700',
    marginRight: 10,
  },
  historyDelete: { padding: 4 },

  backButton: { marginTop: 24, padding: 14, alignItems: 'center' },
  backButtonText: { color: '#555', fontSize: 15 },

  // Chart
  chartWrapper: { marginLeft: -8, marginRight: -4 },
  chartEmpty: { height: 80, alignItems: 'center', justifyContent: 'center' },
  chartEmptyText: { color: '#555', fontSize: 13 },
  pointerLabel: {
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
  },
  pointerValue: { color: '#fff', fontSize: 13, fontWeight: '700' },
  pointerUnit: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
});
