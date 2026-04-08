import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { playBeep } from '@/services/audioService';
import { supabase } from '@/services/supabaseClient';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

type PlanExercise = {
  id: string;
  exercise_name: string;
  sets: number;
  reps: number;
  target_duration: number | null;
  target_weight_kg: number | null;
};

type PlanMeta = {
  is_circuit: boolean;
  circuit_rounds: number;
  rest_between_exercises_seconds: number;
  rest_between_rounds_seconds: number;
};

type LoggedSet = {
  id: string;
  exercise: string;
  weight: string;
  reps: string;
  duration: number;
};

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function formatTime(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

// ─────────────────────────────────────────
// Countdown-Kreis (Two-half rotation, pure RN Animated)
// ─────────────────────────────────────────

function CountdownRing({
  total,
  remaining,
  done,
  accentColor = '#0a7ea4',
}: {
  total: number;
  remaining: number;
  done: boolean;
  accentColor?: string;
}) {
  const SIZE = 168;
  const HALF = SIZE / 2;
  const RING = 14;
  const INNER = SIZE - RING * 2;

  const progress = total > 0 ? remaining / total : 0;
  const angle = progress * 360;

  const arcColor = done
    ? '#2a7a4a'
    : remaining <= 5
    ? '#c0392b'
    : remaining <= Math.max(total * 0.2, 10)
    ? '#e67e22'
    : accentColor;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (remaining > 0 && remaining <= 5 && !done) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.07, duration: 350, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 350, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1.0);
    }
  }, [remaining, done]);

  const rightDeg = Math.min(angle, 180) - 180;
  const leftDeg  = Math.max(angle - 180, 0) - 180;

  return (
    <Animated.View style={[styles.ringWrapper, { transform: [{ scale: pulseAnim }] }]}>
      <View style={{ position: 'absolute', width: SIZE, height: SIZE, borderRadius: HALF, backgroundColor: '#2a2a2a' }} />

      <View style={{ position: 'absolute', top: 0, right: 0, width: HALF, height: SIZE, overflow: 'hidden' }}>
        <View style={{
          position: 'absolute', top: 0, left: -HALF,
          width: SIZE, height: SIZE, borderRadius: HALF,
          backgroundColor: arcColor,
          transform: [{ rotate: `${rightDeg}deg` }],
        }} />
      </View>

      <View style={{ position: 'absolute', top: 0, left: 0, width: HALF, height: SIZE, overflow: 'hidden' }}>
        <View style={{
          position: 'absolute', top: 0, left: 0,
          width: SIZE, height: SIZE, borderRadius: HALF,
          backgroundColor: arcColor,
          transform: [{ rotate: `${leftDeg}deg` }],
        }} />
      </View>

      <View style={{
        position: 'absolute', top: RING, left: RING,
        width: INNER, height: INNER, borderRadius: INNER / 2,
        backgroundColor: '#121212',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={[styles.ringTime, { color: arcColor }]}>{formatTime(remaining)}</Text>
        <Text style={styles.ringSub}>{done ? '✓ Fertig!' : 'verbleibend'}</Text>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────
// Hauptscreen
// ─────────────────────────────────────────

export default function ActiveWorkoutScreen() {
  const { planId, planName } = useLocalSearchParams<{ planId?: string; planName?: string }>();
  const hasPlan = !!planId;

  // ── Plan-Daten ──
  const [planExercises, setPlanExercises] = useState<PlanExercise[]>([]);
  const [planMeta, setPlanMeta]           = useState<PlanMeta | null>(null);
  const [planIndex, setPlanIndex]         = useState(0);
  const [countdownFrom, setCountdownFrom] = useState(0);

  // ── Zirkel-Zustand ──
  const [currentRound, setCurrentRound] = useState(1);

  // ── Pause-Phase (zwischen Übungen oder Runden) ──
  // null = kein Rest; 'exercise' = Pause zwischen Übungen; 'round' = Pause zwischen Runden
  type RestPhase = 'exercise' | 'round' | null;
  const [restPhase, setRestPhase]         = useState<RestPhase>(null);
  const [restTotal, setRestTotal]         = useState(0);
  const [restRemaining, setRestRemaining] = useState(0);
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Gesamt-Timer ──
  const [elapsed, setElapsed]           = useState(0);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [countdownDone, setCountdownDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Eingabe ──
  const [exercise, setExercise] = useState('');
  const [weight, setWeight]     = useState('');
  const [reps, setReps]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [inputError, setInputError] = useState('');

  // ── Protokoll ──
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [setsThisExercise, setSetsThisExercise] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  // ── Plan laden ──
  useEffect(() => {
    if (!hasPlan) return;
    async function loadPlan() {
      // Plan-Meta laden
      const { data: meta } = await supabase
        .from('workout_plans')
        .select('is_circuit, circuit_rounds, rest_between_exercises_seconds, rest_between_rounds_seconds')
        .eq('id', planId)
        .single();
      if (meta) setPlanMeta(meta as PlanMeta);

      // Übungen laden
      const { data, error } = await supabase
        .from('plan_exercises')
        .select('id, exercise_name, sets, reps, target_duration, target_weight_kg')
        .eq('plan_id', planId)
        .order('order_index');
      if (error) { console.error('Plan-Übungen laden:', error.message); return; }
      if (!data || data.length === 0) return;
      setPlanExercises(data);
      setExercise(data[0].exercise_name);
      setCountdownFrom(data[0].target_duration ?? 0);
      setReps(data[0].reps ? String(data[0].reps) : '');
      const lastWeight = await loadLastWeight(data[0].exercise_name);
      setWeight(lastWeight || (data[0].target_weight_kg != null ? String(data[0].target_weight_kg) : ''));
    }
    loadPlan();
  }, [planId]);

  // ── Gesamt-Timer (läuft immer, auch in Pausen) ──
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
      setTotalElapsed((t) => t + 1);
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // ── Übungs-Countdown Ende ──
  useEffect(() => {
    if (countdownFrom > 0 && elapsed >= countdownFrom && !countdownDone) {
      setCountdownDone(true);
      playBeep();
    }
  }, [elapsed, countdownFrom, countdownDone]);

  // ── Pause-Countdown ──
  useEffect(() => {
    if (restPhase === null) return;
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    restIntervalRef.current = setInterval(() => {
      setRestRemaining((r) => {
        if (r <= 1) {
          clearInterval(restIntervalRef.current!);
          // Wird nach State-Update in separatem Effect behandelt
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); };
  }, [restPhase]);

  // ── Wenn Pause abgelaufen → nächste Übung SOFORT starten ──
  useEffect(() => {
    if (restPhase !== null && restRemaining === 0 && planExercises.length > 0) {
      playBeep();
      const targetIdx = restPhase === 'round' ? 0 : planIndex;
      setRestPhase(null);
      goToExercise(targetIdx);
    }
  }, [restRemaining, restPhase]);

  function resetSetTimer() {
    setElapsed(0);
    setCountdownDone(false);
  }

  async function loadLastWeight(exerciseName: string): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return '';
    const { data } = await supabase
      .from('exercise_logs')
      .select('weight_kg')
      .eq('user_id', user.id)
      .eq('exercise_name', exerciseName)
      .not('weight_kg', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    return data?.[0]?.weight_kg ? String(data[0].weight_kg) : '';
  }

  async function goToExercise(idx: number) {
    const next = planExercises[idx];
    if (!next) return;
    setPlanIndex(idx);
    setExercise(next.exercise_name);
    setCountdownFrom(next.target_duration ?? 0);
    setSetsThisExercise(0);
    setReps(next.reps ? String(next.reps) : '');
    resetSetTimer();
    const lastWeight = await loadLastWeight(next.exercise_name);
    setWeight(lastWeight || (next.target_weight_kg != null ? String(next.target_weight_kg) : ''));
  }

  function startRestBetweenExercises(nextExerciseIdx: number) {
    const sec = planMeta?.rest_between_exercises_seconds ?? 15;
    setPlanIndex(nextExerciseIdx); // merken, wohin wir nach der Pause gehen
    setRestPhase('exercise');
    setRestTotal(sec);
    setRestRemaining(sec);
  }

  function startRestBetweenRounds(nextRound: number) {
    const sec = planMeta?.rest_between_rounds_seconds ?? 60;
    setCurrentRound(nextRound);
    setRestPhase('round');
    setRestTotal(sec);
    setRestRemaining(sec);
  }

  async function handleSaveSet() {
    setInputError('');
    if (!exercise.trim()) { setInputError('Bitte einen Übungsnamen eingeben.'); return; }
    const isDurationEx = countdownFrom > 0;
    if (!isDurationEx && !reps.trim()) { setInputError('Bitte die Wiederholungen eingeben.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('exercise_logs').insert({
      user_id: user?.id,
      exercise_name: exercise.trim(),
      weight_kg: weight ? parseFloat(weight) : null,
      reps: reps ? parseInt(reps, 10) : null,
      duration_seconds: isDurationEx ? countdownFrom : elapsed,
      workout_total_seconds: totalElapsed,
    });

    setSaving(false);
    if (error) { setInputError(`Speichern fehlgeschlagen: ${error.message}`); return; }

    const newSetsThisEx = setsThisExercise + 1;
    setSetsThisExercise(newSetsThisEx);

    setSets((prev) => [
      {
        id: Date.now().toString(),
        exercise: exercise.trim(),
        weight,
        reps: reps || (isDurationEx ? `${countdownFrom}s` : '—'),
        duration: elapsed,
      },
      ...prev,
    ]);

    resetSetTimer();
    setReps('');

    const isCircuit = planMeta?.is_circuit ?? false;

    if (isCircuit && hasPlan) {
      // ── Zirkel-Logik ──
      const nextExIdx = planIndex + 1;
      const totalRounds = planMeta?.circuit_rounds ?? 3;

      if (nextExIdx < planExercises.length) {
        // Noch Übungen in dieser Runde → Pause zwischen Übungen
        startRestBetweenExercises(nextExIdx);
      } else {
        // Letzte Übung der Runde
        const nextRound = currentRound + 1;
        if (nextRound <= totalRounds) {
          // Weitere Runden → Pause zwischen Runden, dann Runde neu starten
          startRestBetweenRounds(nextRound);
        }
        // Wenn alle Runden durch → Workout beendet
        if (nextRound > totalRounds) {
          setIsFinished(true);
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }
    } else if (hasPlan && planExercises.length > 0) {
      // ── Standard-Logik: Auto-Weiter nach Soll-Sätzen ──
      const currentPlanEx = planExercises[planIndex];
      const targetSets = currentPlanEx?.sets ?? 1;
      const nextIdx = planIndex + 1;
      if (newSetsThisEx >= targetSets && nextIdx < planExercises.length) {
        setTimeout(() => goToExercise(nextIdx), 800);
      }
    }
  }

  function handleNextExercise() {
    const next = planIndex + 1;
    if (next >= planExercises.length) return;
    goToExercise(next);
  }

  function skipRest() {
    setRestRemaining(0);
  }

  // ── Abgeleitete Werte ──
  const isCountdownMode = countdownFrom > 0;
  const remaining       = Math.max(0, countdownFrom - elapsed);
  const currentPlanEx   = planExercises[planIndex];
  const isCircuit       = planMeta?.is_circuit ?? false;
  const totalRounds     = planMeta?.circuit_rounds ?? 3;
  const allCircuitDone  = isCircuit && currentRound > totalRounds && restPhase === null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Plan-Banner ── */}
        {hasPlan && planExercises.length > 0 && (
          <View style={[styles.planBanner, isCircuit && styles.planBannerCircuit]}>
            <View style={styles.planBannerLeft}>
              <Text style={styles.planBannerTitle}>{planName}</Text>
              {restPhase ? (
                <Text style={styles.planBannerSub}>
                  {restPhase === 'round'
                    ? `Rundenpause · Runde ${currentRound}/${totalRounds} startet gleich`
                    : `Pause · nächste Übung: ${planExercises[planIndex]?.exercise_name ?? ''}`}
                </Text>
              ) : isCircuit ? (
                <Text style={styles.planBannerSub}>
                  {allCircuitDone
                    ? 'Zirkel abgeschlossen! 🎉'
                    : `Runde ${currentRound}/${totalRounds} · Übung ${planIndex + 1}/${planExercises.length}`}
                </Text>
              ) : (
                <Text style={styles.planBannerSub}>
                  {`Übung ${planIndex + 1} von ${planExercises.length}`}
                  {currentPlanEx
                    ? ` · Satz ${setsThisExercise + 1}/${currentPlanEx.sets}` +
                      (currentPlanEx.target_duration
                        ? ` · ${currentPlanEx.target_duration}s`
                        : currentPlanEx.reps
                        ? ` · ${currentPlanEx.reps} Wdh.`
                        : '')
                    : ''}
                </Text>
              )}
            </View>
            {!isCircuit && planIndex + 1 < planExercises.length && restPhase === null && (
              <TouchableOpacity style={styles.nextExBtn} onPress={handleNextExercise}>
                <Text style={styles.nextExText}>Weiter →</Text>
              </TouchableOpacity>
            )}
            {restPhase && (
              <TouchableOpacity style={styles.skipRestBtn} onPress={skipRest}>
                <Text style={styles.skipRestText}>Überspringen</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Gesamt-Timer ── */}
        <View style={styles.totalTimerRow}>
          <Text style={styles.totalTimerLabel}>Gesamt-Zeit</Text>
          <Text style={styles.totalTimerValue}>{formatTime(totalElapsed)}</Text>
        </View>

        {/* ── Pause-Countdown (überlagert den normalen Timer) ── */}
        {restPhase ? (
          <View style={styles.ringContainer}>
            <CountdownRing
              total={restTotal}
              remaining={restRemaining}
              done={restRemaining === 0}
              accentColor={restPhase === 'round' ? '#ff9800' : '#4caf50'}
            />
            <Text style={styles.restLabel}>
              {restPhase === 'round' ? 'Pause zwischen Runden' : 'Pause zwischen Übungen'}
            </Text>
          </View>
        ) : isCountdownMode ? (
          /* Übungs-Countdown-Kreis */
          <View style={styles.ringContainer}>
            <CountdownRing
              total={countdownFrom}
              remaining={remaining}
              done={countdownDone}
            />
            {countdownDone && (
              <Text style={styles.countdownDoneHint}>Zeit abgelaufen – Satz beenden!</Text>
            )}
          </View>
        ) : (
          /* Normaler Satz-Timer */
          <View style={styles.setTimerCard}>
            <Text style={styles.setTimerLabel}>Satz-Timer</Text>
            <Text style={styles.setTimerValue}>{formatTime(elapsed)}</Text>
            <Text style={styles.setTimerSub}>
              {sets.length === 0 ? 'Erster Satz läuft' : `Pause nach Satz ${sets.length}`}
            </Text>
          </View>
        )}

        {/* ── Eingabemaske (während Pause oder nach Abschluss ausgeblendet) ── */}
        {!restPhase && !allCircuitDone && !isFinished && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {isCircuit ? `Runde ${currentRound} · Übung ${planIndex + 1}` : `Satz ${sets.length + 1}`}
            </Text>

            <Text style={styles.label}>Übungsname</Text>
            <TextInput
              style={styles.input}
              value={exercise}
              onChangeText={setExercise}
              placeholder="z.B. Bankdrücken"
              placeholderTextColor="#555"
              returnKeyType="next"
            />

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Gewicht (kg)</Text>
                <TextInput
                  style={styles.input}
                  value={weight}
                  onChangeText={setWeight}
                  placeholder="0"
                  placeholderTextColor="#555"
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>{isCountdownMode ? 'Wdh. (opt.)' : 'Wdh.'}</Text>
                <TextInput
                  style={styles.input}
                  value={reps}
                  onChangeText={setReps}
                  placeholder={isCountdownMode ? '—' : '0'}
                  placeholderTextColor="#555"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveSet}
                />
              </View>
            </View>

            {inputError ? <Text style={styles.inputError}>{inputError}</Text> : null}

            <TouchableOpacity
              style={[
                styles.saveButton,
                saving && styles.saveButtonDisabled,
                isCountdownMode && countdownDone && styles.saveButtonReady,
              ]}
              onPress={handleSaveSet}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Wird gespeichert…' : 'Satz beenden'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Zirkel abgeschlossen (mid-session banner) ── */}
        {allCircuitDone && !isFinished && (
          <View style={styles.circuitDoneCard}>
            <Text style={styles.circuitDoneEmoji}>🎉</Text>
            <Text style={styles.circuitDoneTitle}>Zirkel abgeschlossen!</Text>
            <Text style={styles.circuitDoneSub}>
              {totalRounds} {totalRounds === 1 ? 'Runde' : 'Runden'} · {planExercises.length} Übungen
            </Text>
          </View>
        )}

        {/* ── Summary ── */}
        {isFinished && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Workout beendet! 🏁</Text>
            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{formatTime(totalElapsed)}</Text>
                <Text style={styles.summaryStatLabel}>Dauer</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{Math.round(totalElapsed * 0.15)}</Text>
                <Text style={styles.summaryStatLabel}>kcal verbrannt</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>{sets.length}</Text>
                <Text style={styles.summaryStatLabel}>Sätze gesamt</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Protokoll ── */}
        {sets.length > 0 && (
          <View style={styles.logSection}>
            <Text style={styles.logTitle}>Protokoll dieser Session</Text>
            {sets.map((set, index) => (
              <View key={set.id} style={styles.logRow}>
                <View style={styles.logLeft}>
                  <Text style={styles.logIndex}>#{sets.length - index}</Text>
                  <View>
                    <Text style={styles.logExercise}>{set.exercise}</Text>
                    <Text style={styles.logDetail}>
                      {set.weight ? `${set.weight} kg · ` : ''}{set.reps}
                    </Text>
                  </View>
                </View>
                <Text style={styles.logTime}>{formatTime(set.duration)}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.finishButton, allCircuitDone && styles.finishButtonDone]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Text style={[styles.finishButtonText, allCircuitDone && styles.finishButtonTextDone]}>
            {allCircuitDone ? '🏁  Training abschließen' : 'Training beenden'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: '#121212' },
  container: { flexGrow: 1, padding: 20, paddingTop: 24, paddingBottom: 48 },

  totalTimerRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  totalTimerLabel: { color: '#666', fontSize: 13 },
  totalTimerValue: { color: '#666', fontSize: 14 },

  ringWrapper: { width: 168, height: 168 },
  ringContainer: { alignItems: 'center', marginBottom: 24, gap: 12 },
  ringTime: { fontSize: 36, fontWeight: '800', lineHeight: 42 },
  ringSub: {
    color: '#666', fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2,
  },
  countdownDoneHint: { color: '#2a7a4a', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  restLabel:         { color: '#888', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  setTimerCard: {
    backgroundColor: '#0a7ea4', borderRadius: 20,
    paddingVertical: 28, alignItems: 'center', marginBottom: 20,
  },
  setTimerLabel: {
    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  },
  setTimerValue: { color: '#fff', fontSize: 56, fontWeight: '800', lineHeight: 64 },
  setTimerSub:   { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 },

  planBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1a2a30', borderRadius: 14, padding: 14,
    marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#0a7ea4',
  },
  planBannerCircuit: { borderLeftColor: '#ff9800', backgroundColor: '#1e1a0a' },
  planBannerLeft:    { flex: 1 },
  planBannerTitle:   { color: '#0a7ea4', fontWeight: '700', fontSize: 14, marginBottom: 2 },
  planBannerSub:     { color: '#888', fontSize: 13 },
  nextExBtn: {
    backgroundColor: '#0a7ea4', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, marginLeft: 10,
  },
  nextExText:  { color: '#fff', fontSize: 13, fontWeight: '700' },
  skipRestBtn: {
    backgroundColor: '#2a2a2a', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, marginLeft: 10,
  },
  skipRestText: { color: '#aaa', fontSize: 12, fontWeight: '600' },

  card: {
    backgroundColor: '#1e1e1e', borderRadius: 16,
    padding: 20, marginBottom: 20,
  },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  label: {
    fontSize: 12, fontWeight: '600', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  input: {
    backgroundColor: '#2a2a2a', borderRadius: 10,
    padding: 14, fontSize: 16, color: '#fff',
    borderWidth: 1, borderColor: '#333', marginBottom: 12,
  },
  row:       { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },

  saveButton:         { marginTop: 8, backgroundColor: '#0a7ea4', borderRadius: 12, padding: 18, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonReady:    { backgroundColor: '#2a7a4a' },
  saveButtonText:     { color: '#fff', fontSize: 17, fontWeight: '700' },
  inputError:         { color: '#c0392b', fontSize: 13, fontWeight: '600', marginBottom: 8, textAlign: 'center' },

  circuitDoneCard: {
    backgroundColor: '#1a3a28', borderRadius: 16,
    padding: 28, alignItems: 'center', marginBottom: 20,
    borderWidth: 1, borderColor: '#2a7a4a',
  },
  circuitDoneEmoji: { fontSize: 40, marginBottom: 10 },
  circuitDoneTitle: { color: '#4caf50', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  circuitDoneSub:   { color: '#888', fontSize: 14 },

  logSection: { marginBottom: 20 },
  logTitle: {
    color: '#666', fontSize: 12, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },
  logRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1e1e1e', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6,
  },
  logLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logIndex:    { color: '#0a7ea4', fontSize: 13, fontWeight: '700', width: 28 },
  logExercise: { color: '#fff', fontSize: 15, fontWeight: '600' },
  logDetail:   { color: '#666', fontSize: 13, marginTop: 2 },
  logTime:     { color: '#555', fontSize: 13 },

  finishButton: {
    borderWidth: 1, borderColor: '#333', borderRadius: 12,
    padding: 16, alignItems: 'center',
  },
  finishButtonDone: {
    backgroundColor: '#2a7a4a', borderColor: '#2a7a4a', padding: 20,
  },
  finishButtonText:     { color: '#666', fontSize: 15, fontWeight: '600' },
  finishButtonTextDone: { color: '#fff', fontSize: 17, fontWeight: '800' },

  summaryCard: {
    backgroundColor: '#1a3a28', borderRadius: 20,
    padding: 28, marginBottom: 20,
    borderWidth: 1, borderColor: '#2a7a4a', alignItems: 'center',
  },
  summaryTitle: { color: '#4caf50', fontSize: 22, fontWeight: '800', marginBottom: 24 },
  summaryStats: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
  summaryStat:  { flex: 1, alignItems: 'center' },
  summaryStatValue: { color: '#fff', fontSize: 24, fontWeight: '800', lineHeight: 28 },
  summaryStatLabel: { color: '#666', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  summaryDivider: { width: 1, height: 40, backgroundColor: '#2a2a2a', marginHorizontal: 8 },
});
