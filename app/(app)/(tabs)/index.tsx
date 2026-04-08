import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedProps,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { LineChart } from 'react-native-gifted-charts';
import Svg, { Circle } from 'react-native-svg';

import { supabase } from '@/services/supabaseClient';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

type Profile = {
  display_name: string | null;
  gender: 'male' | 'female' | null;
  date_of_birth: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  manual_calorie_offset: number | null;
  protein_per_kg: number | null;
  auto_adjust_calories: boolean | null;
};

type WeightEntry = { value: number; measured_at: string };
type Plan = { id: string; title: string; scheduled_days: number[] | null };

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

const CHART_W = Dimensions.get('window').width - 88;

// Triple-Ring geometry — all rings share same center (84, 84)
const RING_SIZE = 168;

const R_OUT = 74;  const W_OUT = 13;   // Outer  – calories  (#00E5FF)
const R_MID = 58;  const W_MID = 11;   // Middle – training  (#FF9100)
const R_IN  = 43;  const W_IN  = 10;   // Inner  – protein   (#FF5252)

const CIRC_OUT = 2 * Math.PI * R_OUT;
const CIRC_MID = 2 * Math.PI * R_MID;
const CIRC_IN  = 2 * Math.PI * R_IN;

const SPRING_CFG = { damping: 14, stiffness: 55, overshootClamping: false } as const;

const COLOR_CALORIES = '#00E5FF';
const COLOR_TRAINING = '#FF9100';
const COLOR_PROTEIN  = '#FF5252';
const TRAINING_GOAL_KCAL = 500; // fixed reference for middle ring

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function todayISO() { return new Date().toISOString().slice(0, 10); }
function tomorrowISO() { return new Date(Date.now() + 86400000).toISOString().slice(0, 10); }

function ageFromDOB(dob: string | null): number {
  if (!dob) return 0;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

function calcBaseTDEE(p: Profile): number {
  const age = ageFromDOB(p.date_of_birth);
  if (!p.weight_kg || !p.height_cm || !age || !p.gender) {
    return 2500 + (p.manual_calorie_offset ?? 0);
  }
  const bmr = p.gender === 'male'
    ? 88.362 + 13.397 * p.weight_kg + 4.799 * p.height_cm - 5.677 * age
    : 447.593 + 9.247 * p.weight_kg + 3.098 * p.height_cm - 4.33 * age;
  return Math.round(bmr * 1.55) + (p.manual_calorie_offset ?? 0);
}

function calcGoalKcal(p: Profile, burnedKcal: number): number {
  const base = calcBaseTDEE(p);
  if (p.auto_adjust_calories && burnedKcal > 0) return base + burnedKcal;
  return base;
}

function calcProteinGoal(p: Profile): number {
  if (!p.weight_kg) return 0;
  return Math.round(p.weight_kg * (p.protein_per_kg ?? 2.0));
}

/** ISO 'YYYY-MM-DD' → '08.04.' */
function isoToLabel(iso: string): string {
  return iso.substring(8, 10) + '.' + iso.substring(5, 7) + '.';
}

function toChartData(entries: WeightEntry[]) {
  const step = entries.length > 8 ? Math.ceil(entries.length / 6) : 1;
  return entries.map((e, i) => ({
    value: e.value,
    label: i % step === 0 ? isoToLabel(e.measured_at) : '',
    dataPointText: '',
  }));
}

// ─────────────────────────────────────────
// AnimatedCircle
// ─────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─────────────────────────────────────────
// TripleRing — three concentric SVG rings
// ─────────────────────────────────────────

function TripleRing({
  calorieProgress,
  trainingProgress,
  proteinProgress,
  calorieRatio,
}: {
  calorieProgress: number;
  trainingProgress: number;
  proteinProgress: number;
  calorieRatio: number; // for center label color
}) {
  const offOut = useSharedValue(CIRC_OUT);
  const offMid = useSharedValue(CIRC_MID);
  const offIn  = useSharedValue(CIRC_IN);

  useEffect(() => {
    offOut.value = withSpring(CIRC_OUT * (1 - Math.min(calorieProgress,  1)), SPRING_CFG);
    offMid.value = withSpring(CIRC_MID * (1 - Math.min(trainingProgress, 1)), SPRING_CFG);
    offIn.value  = withSpring(CIRC_IN  * (1 - Math.min(proteinProgress,  1)), SPRING_CFG);
  }, [calorieProgress, trainingProgress, proteinProgress]);

  const propsOut = useAnimatedProps(() => ({ strokeDashoffset: offOut.value }));
  const propsMid = useAnimatedProps(() => ({ strokeDashoffset: offMid.value }));
  const propsIn  = useAnimatedProps(() => ({ strokeDashoffset: offIn.value  }));

  const calPct = Math.round(calorieRatio * 100);

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE }}>
      <Svg
        width={RING_SIZE}
        height={RING_SIZE}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        {/* ─ Outer track + progress (calories) ─ */}
        <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R_OUT}
          stroke="#1a2a2a" strokeWidth={W_OUT} fill="none" />
        <AnimatedCircle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R_OUT}
          stroke={COLOR_CALORIES} strokeWidth={W_OUT} fill="none"
          strokeDasharray={CIRC_OUT} strokeLinecap="round"
          animatedProps={propsOut} />

        {/* ─ Middle track + progress (training) ─ */}
        <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R_MID}
          stroke="#2a1a08" strokeWidth={W_MID} fill="none" />
        <AnimatedCircle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R_MID}
          stroke={COLOR_TRAINING} strokeWidth={W_MID} fill="none"
          strokeDasharray={CIRC_MID} strokeLinecap="round"
          animatedProps={propsMid} />

        {/* ─ Inner track + progress (protein) ─ */}
        <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R_IN}
          stroke="#2a0d0d" strokeWidth={W_IN} fill="none" />
        <AnimatedCircle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R_IN}
          stroke={COLOR_PROTEIN} strokeWidth={W_IN} fill="none"
          strokeDasharray={CIRC_IN} strokeLinecap="round"
          animatedProps={propsIn} />
      </Svg>

      {/* Center: calorie % only */}
      <View style={ringStyles.center}>
        <Text style={ringStyles.pct}>{calPct}%</Text>
        <Text style={ringStyles.sub}>Kcal</Text>
      </View>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  center: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  pct:  { fontSize: 26, fontWeight: '800', color: COLOR_CALORIES, lineHeight: 28 },
  sub:  { color: '#555', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
});

// ─────────────────────────────────────────
// Screen
// ─────────────────────────────────────────

export default function HomeScreen() {
  const [profile, setProfile]           = useState<Profile | null>(null);
  const [goalKcal, setGoalKcal]         = useState(0);
  const [proteinGoal, setProteinGoal]   = useState(0);
  const [todayKcal, setTodayKcal]       = useState(0);
  const [todayProtein, setTodayProtein] = useState(0);
  const [burnedKcal, setBurnedKcal]     = useState(0);
  const [weightData, setWeightData]     = useState<WeightEntry[]>([]);
  const [scheduledPlan, setScheduledPlan] = useState<Plan | null>(null);
  const [lastPlan, setLastPlan]         = useState<Plan | null>(null);
  const [trainedToday, setTrainedToday] = useState(false);
  const [loading, setLoading]           = useState(true);

  // ── Kcal ticker ──
  const [displayKcal, setDisplayKcal] = useState(0);
  const kcalRaf = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  useEffect(() => {
    if (loading || todayKcal === 0) { setDisplayKcal(0); return; }
    const duration = 900;
    const start = Date.now();
    const target = todayKcal;
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayKcal(Math.round(target * eased));
      if (t < 1) kcalRaf.current = requestAnimationFrame(tick);
    };
    kcalRaf.current = requestAnimationFrame(tick);
    return () => { if (kcalRaf.current) cancelAnimationFrame(kcalRaf.current); };
  }, [todayKcal, loading]);

  // ── Daten laden ──
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;

        const today    = todayISO();
        const tomorrow = tomorrowISO();
        const todayDay = new Date().getDay(); // 0=Sun … 6=Sat

        const [profileRes, foodRes, weightRes, scheduledRes, lastPlanRes, trainRes, burnedRes] =
          await Promise.all([
            supabase.from('profiles')
              .select('display_name, gender, date_of_birth, height_cm, weight_kg, manual_calorie_offset, protein_per_kg, auto_adjust_calories')
              .eq('id', user.id).single(),
            supabase.from('food_logs')
              .select('calories, protein')
              .eq('user_id', user.id)
              .gte('created_at', today).lt('created_at', tomorrow),
            supabase.from('body_measurements')
              .select('value, measured_at')
              .eq('user_id', user.id).eq('region', 'Gewicht')
              .order('measured_at', { ascending: true }).limit(14),
            // Plan der heute planmäßig fällig ist
            supabase.from('workout_plans')
              .select('id, title, scheduled_days')
              .eq('user_id', user.id)
              .contains('scheduled_days', [todayDay])
              .limit(1),
            // Zuletzt erstellter Plan als Fallback
            supabase.from('workout_plans')
              .select('id, title, scheduled_days')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false }).limit(1),
            // Heute trainiert?
            supabase.from('exercise_logs')
              .select('id')
              .eq('user_id', user.id)
              .gte('created_at', today).lt('created_at', tomorrow).limit(1),
            // Heute verbrannte kcal aus abgeschlossenen Workouts
            supabase.from('exercise_logs')
              .select('calories_burned')
              .eq('user_id', user.id)
              .gte('created_at', today).lt('created_at', tomorrow),
          ]);

        if (!active) return;

        let prof: Profile | null = null;
        if (profileRes.data) {
          prof = profileRes.data as Profile;
          setProfile(prof);
        }

        const kcal   = foodRes.data?.reduce((s, l) => s + (l.calories ?? 0), 0) ?? 0;
        const prot   = foodRes.data?.reduce((s, l) => s + (l.protein  ?? 0), 0) ?? 0;
        const burned = burnedRes.data?.reduce((s, l) => s + (l.calories_burned ?? 0), 0) ?? 0;

        setTodayKcal(kcal);
        setTodayProtein(prot);
        setBurnedKcal(burned);
        setWeightData(weightRes.data ?? []);
        setScheduledPlan(scheduledRes.data?.[0] ?? null);
        setLastPlan(lastPlanRes.data?.[0] ?? null);
        setTrainedToday((trainRes.data?.length ?? 0) > 0);

        if (prof) {
          setGoalKcal(calcGoalKcal(prof, burned));
          setProteinGoal(calcProteinGoal(prof));
        }

        setLoading(false);
      })();

      return () => { active = false; };
    }, [])
  );

  async function handleLogout() { await supabase.auth.signOut(); }

  // ── Ring progress values ──
  const calorieRatio   = goalKcal > 0   ? todayKcal / goalKcal : 0;
  const trainingRatio  = burnedKcal / TRAINING_GOAL_KCAL;
  const proteinRatio   = proteinGoal > 0 ? todayProtein / proteinGoal : 0;

  const remaining  = goalKcal - displayKcal;
  const chartData  = toChartData(weightData);
  const latestWeight = weightData.length > 0 ? weightData[weightData.length - 1].value : null;

  // Der angezeigte Plan: zuerst Tagesplan, sonst letzter Plan
  const displayPlan = scheduledPlan ?? lastPlan;
  const isPlanScheduledToday = !!scheduledPlan;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* ══ HEADER ══ */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {profile?.display_name ? `Hallo, ${profile.display_name}!` : 'Hallo!'}
            </Text>
            <Text style={styles.appName}>AvoraSport</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/profile')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="person-outline" size={22} color="#888" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout}>
              <Text style={styles.logoutText}>Abmelden</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!loading && (
          <>
            {/* ── Ernährungs-Widget (Triple-Ring) ── */}
            {goalKcal > 0 && (
              <Animated.View
                entering={FadeInDown.delay(0).duration(600).springify()}
                style={styles.card}
              >
                <Text style={styles.cardLabel}>ERNÄHRUNG · HEUTE</Text>

                <View style={styles.nutritionRow}>
                  <TripleRing
                    calorieProgress={calorieRatio}
                    trainingProgress={trainingRatio}
                    proteinProgress={proteinRatio}
                    calorieRatio={calorieRatio}
                  />

                  <View style={styles.nutritionInfo}>
                    {/* Kalorien */}
                    <Text style={styles.kcalValue}>{displayKcal}</Text>
                    <Text style={styles.kcalUnit}>von {goalKcal} kcal</Text>
                    <View style={styles.kcalDivider} />

                    {/* Verbleibend */}
                    <Text style={[
                      styles.kcalRemaining,
                      { color: remaining < 0 ? '#f44336' : remaining < goalKcal * 0.15 ? '#ff9800' : '#00E5FF' },
                    ]}>
                      {remaining < 0 ? '+' : ''}{Math.abs(remaining)}
                    </Text>
                    <Text style={styles.kcalUnit}>
                      {remaining < 0 ? 'kcal überschritten' : 'kcal verfügbar'}
                    </Text>

                    {/* Legenden-Chips */}
                    <View style={styles.legendRow}>
                      {burnedKcal > 0 && (
                        <View style={styles.legendChip}>
                          <View style={[styles.legendDot, { backgroundColor: COLOR_TRAINING }]} />
                          <Text style={styles.legendText}>{burnedKcal} kcal</Text>
                        </View>
                      )}
                      {proteinGoal > 0 && (
                        <View style={styles.legendChip}>
                          <View style={[styles.legendDot, { backgroundColor: COLOR_PROTEIN }]} />
                          <Text style={styles.legendText}>{Math.round(todayProtein)}/{proteinGoal}g P</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.cardLink}
                  onPress={() => router.push('/(app)/(tabs)/nutrition')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cardLinkText}>Mahlzeit erfassen</Text>
                  <MaterialIcons name="chevron-right" size={15} color={COLOR_CALORIES} />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── Gewichtsverlauf ── */}
            {chartData.length >= 2 && (
              <Animated.View
                entering={FadeInDown.delay(120).duration(600).springify()}
                style={styles.card}
              >
                <View style={styles.cardLabelRow}>
                  <Text style={styles.cardLabel}>GEWICHTSVERLAUF</Text>
                  {latestWeight !== null && (
                    <View style={styles.weightBadge}>
                      <Text style={styles.weightBadgeText}>{latestWeight} kg</Text>
                    </View>
                  )}
                </View>
                <LineChart
                  data={chartData}
                  areaChart
                  width={CHART_W}
                  height={90}
                  color={COLOR_CALORIES}
                  thickness={2.5}
                  curved
                  startFillColor="rgba(0,229,255,0.30)"
                  endFillColor="rgba(0,229,255,0.0)"
                  startOpacity={1}
                  endOpacity={0}
                  dataPointsColor="#fff"
                  dataPointsRadius={3}
                  hideRules
                  yAxisThickness={0}
                  xAxisThickness={1}
                  xAxisColor="#2a2a2a"
                  yAxisTextStyle={{ color: '#555', fontSize: 9 }}
                  xAxisLabelTextStyle={{ color: '#666', fontSize: 9 }}
                  initialSpacing={12}
                  endSpacing={12}
                  noOfSections={3}
                  backgroundColor="transparent"
                  isAnimated
                  animationDuration={900}
                />
                <TouchableOpacity
                  style={styles.cardLink}
                  onPress={() => router.push('/body-stats')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cardLinkText}>Körperwerte erfassen</Text>
                  <MaterialIcons name="chevron-right" size={15} color={COLOR_CALORIES} />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── Training ── */}
            <Animated.View entering={FadeInDown.delay(240).duration(600).springify()}>
              <Text style={styles.sectionTitle}>Training</Text>

              {trainedToday && (
                <View style={[styles.card, styles.cardGreen]}>
                  <View style={styles.row}>
                    <MaterialIcons name="check-circle" size={18} color="#4caf50" />
                    <Text style={styles.successText}>Heute schon aktiv — stark!</Text>
                  </View>
                </View>
              )}

              {displayPlan && (
                <View style={[styles.card, { marginBottom: 12 }]}>
                  <Text style={styles.cardLabel}>
                    {isPlanScheduledToday ? 'PLAN FÜR HEUTE' : trainedToday ? 'LETZTER PLAN' : 'BEREIT FÜR HEUTE'}
                  </Text>
                  <View style={styles.planRow}>
                    <View style={styles.planIcon}>
                      <MaterialIcons name="fitness-center" size={18} color={COLOR_CALORIES} />
                    </View>
                    <Text style={styles.planTitle} numberOfLines={1}>{displayPlan.title}</Text>
                    <TouchableOpacity
                      style={styles.planStartBtn}
                      onPress={() => router.push({
                        pathname: '/active-workout',
                        params: { planId: displayPlan.id, planName: displayPlan.title },
                      })}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="play-arrow" size={17} color="#fff" />
                      <Text style={styles.planStartText}>Starten</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionPrimary]}
                  onPress={() => router.push('/active-workout')}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="fitness-center" size={18} color="#fff" />
                  <Text style={styles.actionText}>Freies Training</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionSecondary]}
                  onPress={() => router.push('/workout-plans')}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="list-alt" size={18} color={COLOR_CALORIES} />
                  <Text style={[styles.actionText, { color: COLOR_CALORIES }]}>Mit Plan</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#121212' },
  container: { padding: 24, paddingTop: 56, paddingBottom: 56 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 24,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center',
  },
  greeting: { fontSize: 22, fontWeight: '800', color: '#fff' },
  appName:  { fontSize: 12, color: COLOR_CALORIES, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
  logoutText: { color: '#555', fontSize: 13 },

  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardGreen: { borderColor: '#1a3a28', backgroundColor: '#0d1f14', padding: 14, marginBottom: 12 },
  cardLabel: {
    color: '#555', fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16,
  },
  cardLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  cardLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    borderTopWidth: 1, borderTopColor: '#2a2a2a',
    paddingTop: 12, marginTop: 8, gap: 2,
  },
  cardLinkText: { color: COLOR_CALORIES, fontSize: 12, fontWeight: '600' },

  // Nutrition widget
  nutritionRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 12 },
  nutritionInfo: { flex: 1 },
  kcalValue:     { color: '#fff', fontSize: 30, fontWeight: '800', lineHeight: 34 },
  kcalUnit:      { color: '#666', fontSize: 11, marginBottom: 2 },
  kcalDivider:   { height: 1, backgroundColor: '#2a2a2a', marginVertical: 10 },
  kcalRemaining: { fontSize: 22, fontWeight: '800', lineHeight: 26 },

  legendRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:  { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: '#666', fontSize: 10, fontWeight: '600' },

  // Weight chart
  weightBadge: {
    backgroundColor: '#0a1a1e', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1, borderColor: COLOR_CALORIES,
  },
  weightBadgeText: { color: COLOR_CALORIES, fontSize: 12, fontWeight: '700' },

  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12 },

  row:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  successText: { color: '#4caf50', fontSize: 13, fontWeight: '600' },

  planRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#0a1a1e', alignItems: 'center', justifyContent: 'center',
  },
  planTitle: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' },
  planStartBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLOR_CALORIES, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  planStartText: { color: '#121212', fontSize: 13, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 15,
  },
  actionPrimary:   { backgroundColor: COLOR_CALORIES },
  actionSecondary: { backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: COLOR_CALORIES },
  actionText:      { color: '#121212', fontSize: 14, fontWeight: '700' },
});
