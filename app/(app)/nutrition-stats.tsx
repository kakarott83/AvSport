/**
 * app/(app)/nutrition-stats.tsx — "Auswertung"
 *
 * Ernährung über einen frei wählbaren Zeitraum: Summe und Ø pro Tag (kcal,
 * Makros), erfasste Tage, Tage über/unter dem Kalorienziel, kcal-Verlauf als
 * Diagramm (ab 32 Tagen wochenweise), Makro-Verteilung und Top-Gerichte.
 * Berechnung: lib/nutritionStats.ts. Erreichbar über Ernährung → Auswertung.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import { DatePickerInput } from '@/components/DatePickerInput';
import { useCalorieGoal } from '@/hooks/useCalorieGoal';
import { addDays, diffDays } from '@/lib/cycle';
import { localISODate } from '@/lib/cycleHealth';
import { formatNumber, getLocale, useTranslation, type TranslationKey } from '@/lib/i18n';
import {
  chartBuckets,
  computeNutritionStats,
  presetRange,
  type RangePreset,
  type StatsLog,
} from '@/lib/nutritionStats';
import { supabase } from '@/services/supabaseClient';

type Mode = RangePreset | 'custom';

const MODES: { mode: Mode; label: TranslationKey }[] = [
  { mode: '7d', label: 'nutritionStats.presets.d7' },
  { mode: '30d', label: 'nutritionStats.presets.d30' },
  { mode: '90d', label: 'nutritionStats.presets.d90' },
  { mode: 'month', label: 'nutritionStats.presets.month' },
  { mode: 'year', label: 'nutritionStats.presets.year' },
  { mode: 'custom', label: 'nutritionStats.presets.custom' },
];

const MAX_DAYS = 366;
const PAGE = 1000;

const COLOR_KCAL = '#0a7ea4';
const COLOR_PROTEIN = '#0a7ea4';
const COLOR_CARBS = '#e67e22';
const COLOR_FAT = '#c0392b';
const COLOR_GOAL = '#e67e22';

// Diagramm passend zur Karte (wie im Ernährungs-Tab): Y-Achse + Randabstand abziehen
const CARD_INNER = Dimensions.get('window').width - 40 - 40;
const Y_LABEL_W = 34;
const END_SPACING = 6;
const INIT_SPACING = 6;
const PLOT_WIDTH = CARD_INNER - Y_LABEL_W - END_SPACING;

/** Lokale Tagesgrenzen → ISO-Zeitpunkte für die Abfrage. */
function rangeToIso(from: string, to: string): { start: string; end: string } {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = addDays(to, 1).split('-').map(Number);
  return {
    start: new Date(fy, fm - 1, fd).toISOString(),
    end: new Date(ty, tm - 1, td).toISOString(),
  };
}

function formatShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit' });
}

export default function NutritionStatsScreen() {
  const { t } = useTranslation();
  const today = localISODate(new Date());
  const { currentGoal } = useCalorieGoal(null);

  const [mode, setMode] = useState<Mode>('30d');
  const [customFrom, setCustomFrom] = useState(addDays(today, -29));
  const [customTo, setCustomTo] = useState(today);
  const [logs, setLogs] = useState<StatsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = mode === 'custom' ? { from: customFrom, to: customTo } : presetRange(mode, today);
  const rangeError =
    range.from > range.to ? t('nutritionStats.rangeInvalid')
      : diffDays(range.from, range.to) + 1 > MAX_DAYS ? t('nutritionStats.rangeTooLong')
        : '';

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { start, end } = rangeToIso(from, to);
      const all: StatsLog[] = [];
      // In Seiten laden — ein Jahr kann mehr als 1000 Einträge haben
      for (let offset = 0; ; offset += PAGE) {
        const { data, error: dbErr } = await supabase
          .from('food_logs')
          .select('meal_name, calories, protein, carbs, fat, created_at')
          .eq('user_id', user.id)
          .gte('created_at', start)
          .lt('created_at', end)
          .order('created_at', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (dbErr) throw new Error(dbErr.message);
        all.push(...((data ?? []) as StatsLog[]));
        if (!data || data.length < PAGE) break;
      }
      setLogs(all);
    } catch (e) {
      setError(t('nutritionStats.loadFailed', { message: e instanceof Error ? e.message : String(e) }));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!rangeError) void load(range.from, range.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, rangeError]);

  const stats = useMemo(
    () => (rangeError ? null : computeNutritionStats(logs, range.from, range.to, currentGoal)),
    [logs, range.from, range.to, currentGoal, rangeError],
  );
  const buckets = useMemo(() => (stats ? chartBuckets(stats.days) : []), [stats]);
  const weekly = stats ? stats.days.length > 31 : false;

  const bars = useMemo(() => {
    const n = buckets.length;
    const spacing = n > 20 ? 3 : n > 10 ? 5 : 8;
    const barWidth = Math.max(4, Math.floor((PLOT_WIDTH - INIT_SPACING - spacing * (n - 1)) / Math.max(n, 1)));
    const labelEvery = n > 20 ? 5 : n > 10 ? 2 : 1;
    return {
      spacing,
      barWidth,
      data: buckets.map((b, i) => ({
        value: b.kcal,
        label: i % labelEvery === 0 ? formatShort(b.start) : '',
        frontColor: b.loggedDays === 0 ? '#252525' : currentGoal > 0 && b.kcal > currentGoal ? COLOR_FAT : COLOR_KCAL,
      })),
    };
  }, [buckets, currentGoal]);

  const maxVal = Math.max(currentGoal * 1.2, ...buckets.map((b) => b.kcal), 500);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* ── Zeitraum ── */}
      <View style={styles.chips}>
        {MODES.map(({ mode: m, label }) => (
          <TouchableOpacity
            key={m}
            style={[styles.chip, mode === m && styles.chipActive]}
            onPress={() => setMode(m)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, mode === m && styles.chipTextActive]}>{t(label)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'custom' && (
        <View style={styles.card}>
          <DatePickerInput value={customFrom} onChange={setCustomFrom} label={t('nutritionStats.from')} showQuickDates={false} />
          <DatePickerInput value={customTo} onChange={setCustomTo} label={t('nutritionStats.to')} showQuickDates={false} />
        </View>
      )}

      <Text style={styles.rangeText}>
        {formatShort(range.from)} – {formatShort(range.to)}
        {stats ? ` · ${t('nutritionStats.loggedDays', { logged: stats.loggedDays, total: stats.totalDays })}` : ''}
      </Text>

      {rangeError ? <Text style={styles.error}>{rangeError}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={COLOR_KCAL} style={{ marginTop: 40 }} />
      ) : stats && stats.loggedDays === 0 ? (
        <Text style={styles.empty}>{t('nutritionStats.empty')}</Text>
      ) : stats ? (
        <>
          {/* ── Ø pro Tag ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('nutritionStats.avgPerDay')}</Text>
            <View style={styles.kpiRow}>
              <Kpi value={formatNumber(stats.avgPerLoggedDay.kcal)} unit="kcal" label={t('nutritionStats.kcal')} color={COLOR_KCAL} big />
            </View>
            <View style={styles.kpiRow}>
              <Kpi value={formatNumber(stats.avgPerLoggedDay.protein)} unit="g" label={t('nutritionStats.protein')} color={COLOR_PROTEIN} />
              <Kpi value={formatNumber(stats.avgPerLoggedDay.carbs)} unit="g" label={t('nutritionStats.carbs')} color={COLOR_CARBS} />
              <Kpi value={formatNumber(stats.avgPerLoggedDay.fat)} unit="g" label={t('nutritionStats.fat')} color={COLOR_FAT} />
            </View>
            <Text style={styles.hint}>{t('nutritionStats.avgHint')}</Text>
          </View>

          {/* ── Ziel ── */}
          {currentGoal > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('nutritionStats.goalTitle')}</Text>
              <Text style={styles.body}>
                {t('nutritionStats.goalSummary', {
                  over: stats.daysOverGoal, under: stats.daysUnderGoal, goal: formatNumber(currentGoal),
                })}
              </Text>
              <Text style={styles.hint}>{t('nutritionStats.goalHint')}</Text>
            </View>
          )}

          {/* ── Verlauf ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{weekly ? t('nutritionStats.chartWeekly') : t('nutritionStats.chartDaily')}</Text>
            <BarChart
              data={bars.data}
              width={PLOT_WIDTH}
              yAxisLabelWidth={Y_LABEL_W}
              barWidth={bars.barWidth}
              spacing={bars.spacing}
              initialSpacing={INIT_SPACING}
              endSpacing={END_SPACING}
              roundedTop
              noOfSections={4}
              maxValue={maxVal}
              showReferenceLine1={currentGoal > 0}
              referenceLine1Position={currentGoal}
              referenceLine1Config={{ color: COLOR_GOAL, dashWidth: 4, dashGap: 4, thickness: 1.5, zIndex: 2 }}
              yAxisColor="transparent"
              xAxisColor="#2a2a2a"
              yAxisTextStyle={{ color: '#BBBBBB', fontSize: 9 }}
              xAxisLabelTextStyle={{ color: '#BBBBBB', fontSize: 9, width: 40 }}
              backgroundColor="transparent"
              rulesColor="#1e1e1e"
              isAnimated
            />
          </View>

          {/* ── Makro-Verteilung ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('nutritionStats.macroTitle')}</Text>
            <View style={styles.splitBar}>
              {stats.macroSplit.protein > 0 && <View style={{ flex: stats.macroSplit.protein, backgroundColor: COLOR_PROTEIN }} />}
              {stats.macroSplit.carbs > 0 && <View style={{ flex: stats.macroSplit.carbs, backgroundColor: COLOR_CARBS }} />}
              {stats.macroSplit.fat > 0 && <View style={{ flex: stats.macroSplit.fat, backgroundColor: COLOR_FAT }} />}
            </View>
            <View style={styles.legend}>
              <Legend color={COLOR_PROTEIN} text={`${t('nutritionStats.protein')} ${stats.macroSplit.protein} %`} />
              <Legend color={COLOR_CARBS} text={`${t('nutritionStats.carbs')} ${stats.macroSplit.carbs} %`} />
              <Legend color={COLOR_FAT} text={`${t('nutritionStats.fat')} ${stats.macroSplit.fat} %`} />
            </View>
          </View>

          {/* ── Summe ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('nutritionStats.total')}</Text>
            <View style={styles.kpiRow}>
              <Kpi value={formatNumber(stats.totals.kcal)} unit="kcal" label={t('nutritionStats.kcal')} color={COLOR_KCAL} />
              <Kpi value={formatNumber(stats.totals.protein)} unit="g" label={t('nutritionStats.protein')} color={COLOR_PROTEIN} />
            </View>
            <View style={styles.kpiRow}>
              <Kpi value={formatNumber(stats.totals.carbs)} unit="g" label={t('nutritionStats.carbs')} color={COLOR_CARBS} />
              <Kpi value={formatNumber(stats.totals.fat)} unit="g" label={t('nutritionStats.fat')} color={COLOR_FAT} />
            </View>
          </View>

          {/* ── Top-Gerichte ── */}
          {stats.topMeals.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('nutritionStats.topTitle')}</Text>
              {stats.topMeals.map((m) => (
                <View key={m.name} style={styles.topRow}>
                  <Text style={styles.topName} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.topCount}>{t('nutritionStats.topCount', { count: m.count })}</Text>
                  <Text style={styles.topKcal}>{formatNumber(m.kcal)} kcal</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function Kpi({ value, unit, label, color, big }: { value: string; unit: string; label: string; color: string; big?: boolean }) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, { color }, big && styles.kpiValueBig]}>
        {value} <Text style={styles.kpiUnit}>{unit}</Text>
      </Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },
  content: { padding: 20, paddingBottom: 48, gap: 14 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: '#0a7ea422', borderColor: COLOR_KCAL },
  chipText: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  rangeText: { color: '#888', fontSize: 12 },
  error: { color: COLOR_FAT, fontSize: 13 },
  empty: { color: '#888', fontSize: 14, textAlign: 'center', marginTop: 30 },

  card: { backgroundColor: '#1e1e1e', borderRadius: 18, padding: 20, gap: 10 },
  cardTitle: { color: '#999', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  body: { color: '#ddd', fontSize: 14, lineHeight: 20 },
  hint: { color: '#666', fontSize: 11, lineHeight: 15 },

  kpiRow: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, backgroundColor: '#252525', borderRadius: 12, padding: 12 },
  kpiValue: { fontSize: 18, fontWeight: '800' },
  kpiValueBig: { fontSize: 28 },
  kpiUnit: { fontSize: 12, fontWeight: '600', color: '#888' },
  kpiLabel: { color: '#888', fontSize: 11, marginTop: 2 },

  splitBar: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: '#2a2a2a' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { color: '#bbb', fontSize: 12 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  topName: { flex: 1, color: '#ddd', fontSize: 14 },
  topCount: { color: '#777', fontSize: 12 },
  topKcal: { color: COLOR_KCAL, fontSize: 13, fontWeight: '700', minWidth: 80, textAlign: 'right' },
});
