import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Toast } from '@/components/Toast';
import { supabase } from '@/services/supabaseClient';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

type ExerciseRow = {
  localId: string;
  name: string;
  targetSets: string;
  targetReps: string;
  targetDuration: string;
  targetWeight: string;
};

type MasterExercise = {
  id: string;
  name: string;
};

function newRow(): ExerciseRow {
  return {
    localId: Date.now().toString() + Math.random(),
    name: '',
    targetSets: '3',
    targetReps: '10',
    targetDuration: '',
    targetWeight: '',
  };
}

// ─────────────────────────────────────────
// ExerciseNamePicker — Autocomplete-Feld
// ─────────────────────────────────────────

type PickerProps = {
  value: string;
  onChange: (v: string) => void;
  masterList: MasterExercise[];
};

function ExerciseNamePicker({ value, onChange, masterList }: PickerProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!value) setQuery('');
  }, [value]);

  const suggestions = query.trim().length >= 1
    ? masterList
        .filter((ex) => ex.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
    : [];

  function handleChangeText(v: string) {
    setQuery(v);
    onChange(v);
    setOpen(true);
  }

  function handleSelect(ex: MasterExercise) {
    setQuery(ex.name);
    onChange(ex.name);
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <View style={pickerStyles.wrapper}>
      <TextInput
        ref={inputRef}
        style={pickerStyles.input}
        value={query}
        onChangeText={handleChangeText}
        onFocus={() => query.trim().length >= 1 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Übungsname suchen oder eingeben…"
        placeholderTextColor="#555"
        returnKeyType="next"
      />
      {open && suggestions.length > 0 && (
        <View style={pickerStyles.dropdown}>
          {suggestions.map((ex) => (
            <TouchableOpacity
              key={ex.id}
              style={pickerStyles.suggestion}
              onPress={() => handleSelect(ex)}
              activeOpacity={0.7}
            >
              <Text style={pickerStyles.suggestionText}>{ex.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  wrapper:    { marginBottom: 10, zIndex: 10 },
  input: {
    backgroundColor: '#2a2a2a', borderRadius: 10,
    padding: 13, fontSize: 15, color: '#fff',
    borderWidth: 1, borderColor: '#333',
  },
  dropdown: {
    backgroundColor: '#2a2a2a', borderRadius: 10,
    borderWidth: 1, borderColor: '#0a7ea4',
    marginTop: 4, overflow: 'hidden',
  },
  suggestion: {
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#333',
  },
  suggestionText: { color: '#fff', fontSize: 14 },
});

// ─────────────────────────────────────────
// Hauptscreen
// ─────────────────────────────────────────

export default function CreatePlanScreen() {
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const isEdit = !!planId;

  const [planName, setPlanName] = useState('');
  const [exercises, setExercises] = useState<ExerciseRow[]>([newRow()]);
  const [masterExercises, setMasterExercises] = useState<MasterExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // ── Zirkel-Einstellungen ──
  const [isCircuit, setIsCircuit] = useState(false);
  const [circuitRounds, setCircuitRounds] = useState('3');
  const [restBetweenExercises, setRestBetweenExercises] = useState('15');
  const [restBetweenRounds, setRestBetweenRounds] = useState('60');

  // ── Daten laden ──
  useEffect(() => {
    async function load() {
      const { data: master } = await supabase
        .from('exercises_master')
        .select('id, name')
        .order('name');
      if (master) setMasterExercises(master);

      if (isEdit) {
        const { data: plan, error: planError } = await supabase
          .from('workout_plans')
          .select('title, is_circuit, circuit_rounds, rest_between_exercises_seconds, rest_between_rounds_seconds')
          .eq('id', planId)
          .single();

        if (planError) {
          console.error('Plan laden fehlgeschlagen:', planError.message);
          setInitialLoading(false);
          return;
        }

        const { data: exs } = await supabase
          .from('plan_exercises')
          .select('id, exercise_name, sets, reps, target_duration, target_weight_kg')
          .eq('plan_id', planId);

        if (plan) {
          setPlanName(plan.title);
          setIsCircuit(plan.is_circuit ?? false);
          setCircuitRounds(plan.circuit_rounds ? String(plan.circuit_rounds) : '3');
          setRestBetweenExercises(plan.rest_between_exercises_seconds ? String(plan.rest_between_exercises_seconds) : '15');
          setRestBetweenRounds(plan.rest_between_rounds_seconds ? String(plan.rest_between_rounds_seconds) : '60');
        }
        if (exs && exs.length > 0) {
          setExercises(
            exs.map((e: any) => ({
              localId: e.id,
              name: e.exercise_name,
              targetSets: String(e.sets ?? 3),
              targetReps: String(e.reps ?? 10),
              targetDuration: e.target_duration ? String(e.target_duration) : '',
              targetWeight: e.target_weight_kg != null ? String(e.target_weight_kg) : '',
            })),
          );
        }
      }

      setInitialLoading(false);
    }

    load();
  }, [planId]);

  function updateRow(localId: string, field: keyof ExerciseRow, value: string) {
    setExercises((prev) =>
      prev.map((e) => (e.localId === localId ? { ...e, [field]: value } : e)),
    );
  }

  function removeRow(localId: string) {
    if (exercises.length <= 1) return;
    setExercises((prev) => prev.filter((e) => e.localId !== localId));
  }

  async function handleSave() {
    if (!planName.trim()) {
      Alert.alert('Pflichtfeld', 'Bitte einen Plannamen eingeben.');
      return;
    }
    const filled = exercises.filter((e) => e.name.trim());
    if (filled.length === 0) {
      Alert.alert('Pflichtfeld', 'Mindestens eine Übung angeben.');
      return;
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const planPayload = {
      title: planName.trim(),
      is_circuit: isCircuit,
      circuit_rounds: isCircuit ? (parseInt(circuitRounds, 10) || 3) : null,
      rest_between_exercises_seconds: isCircuit ? (parseInt(restBetweenExercises, 10) || 15) : null,
      rest_between_rounds_seconds: isCircuit ? (parseInt(restBetweenRounds, 10) || 60) : null,
    };

    let targetPlanId: string | undefined = planId;

    if (isEdit) {
      const { error } = await supabase
        .from('workout_plans')
        .update(planPayload)
        .eq('id', planId);

      if (error) {
        Alert.alert('Fehler beim Aktualisieren', error.message);
        setSaving(false);
        return;
      }
      await supabase.from('plan_exercises').delete().eq('plan_id', planId);
    } else {
      const { data: newPlan, error } = await supabase
        .from('workout_plans')
        .insert({ user_id: user.id, ...planPayload })
        .select('id')
        .single();

      if (error || !newPlan) {
        Alert.alert('Fehler beim Erstellen', error?.message ?? 'Unbekannter Fehler');
        setSaving(false);
        return;
      }
      targetPlanId = newPlan.id;
    }

    const inserts = filled.map((e) => ({
      plan_id: targetPlanId,
      exercise_name: e.name.trim(),
      // Im Zirkel-Modus: sets wird vom Plan selbst (circuit_rounds) gesteuert
      sets: isCircuit ? 1 : (parseInt(e.targetSets, 10) || 3),
      reps: parseInt(e.targetReps, 10) || 0,
      target_duration: e.targetDuration.trim() ? parseInt(e.targetDuration, 10) : null,
      target_weight_kg: e.targetWeight.trim() ? parseFloat(e.targetWeight) : null,
    }));

    const { error: exError } = await supabase
      .from('plan_exercises')
      .insert(inserts);

    setSaving(false);

    if (exError) {
      Alert.alert('Fehler beim Speichern der Übungen', `${exError.message}\n\nCode: ${exError.code ?? '—'}`);
      return;
    }

    setToastMsg(`"${planName.trim()}" wurde gespeichert!`);
    setTimeout(() => router.back(), 1600);
  }

  if (initialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0a7ea4" />
      </View>
    );
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
        <Text style={styles.heading}>
          {isEdit ? 'Plan bearbeiten' : 'Neuen Plan erstellen'}
        </Text>

        {/* ── Planname ── */}
        <Text style={styles.label}>Planname</Text>
        <TextInput
          style={styles.input}
          value={planName}
          onChangeText={setPlanName}
          placeholder="z.B. Push-Tag, Oberkörper …"
          placeholderTextColor="#555"
          returnKeyType="next"
        />

        {/* ── Zirkeltraining-Toggle ── */}
        <View style={styles.circuitToggleCard}>
          <View style={styles.circuitToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.circuitToggleTitle}>Zirkeltraining</Text>
              <Text style={styles.circuitToggleHint}>
                Alle Übungen werden in Runden absolviert, ohne feste Sätze pro Übung.
              </Text>
            </View>
            <Switch
              value={isCircuit}
              onValueChange={setIsCircuit}
              trackColor={{ false: '#2a2a2a', true: '#0a3a3a' }}
              thumbColor={isCircuit ? '#0a7ea4' : '#555'}
            />
          </View>
        </View>

        {/* ── Zirkel-Einstellungen (nur wenn is_circuit aktiv) ── */}
        {isCircuit && (
          <View style={styles.circuitSettingsCard}>
            <Text style={styles.circuitSettingsTitle}>Zirkel-Einstellungen</Text>

            <Text style={styles.sublabel}>Anzahl der Runden</Text>
            <TextInput
              style={styles.input}
              value={circuitRounds}
              onChangeText={(v) => setCircuitRounds(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="3"
              placeholderTextColor="#555"
            />

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.sublabel}>Pause zw. Übungen (Sek.)</Text>
                <TextInput
                  style={styles.input}
                  value={restBetweenExercises}
                  onChangeText={(v) => setRestBetweenExercises(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="15"
                  placeholderTextColor="#555"
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.sublabel}>Pause zw. Runden (Sek.)</Text>
                <TextInput
                  style={styles.input}
                  value={restBetweenRounds}
                  onChangeText={(v) => setRestBetweenRounds(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="60"
                  placeholderTextColor="#555"
                />
              </View>
            </View>
          </View>
        )}

        {/* ── Übungen ── */}
        <Text style={[styles.label, styles.sectionGap]}>Übungen</Text>

        {exercises.map((ex, index) => (
          <View key={ex.localId} style={styles.exerciseCard}>
            <View style={styles.exerciseHeader}>
              <Text style={styles.exerciseIndex}>{index + 1}. Übung</Text>
              <TouchableOpacity
                onPress={() => removeRow(ex.localId)}
                disabled={exercises.length <= 1}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.removeText, exercises.length <= 1 && styles.removeDisabled]}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <ExerciseNamePicker
              value={ex.name}
              onChange={(v) => updateRow(ex.localId, 'name', v)}
              masterList={masterExercises}
            />

            <View style={styles.row}>
              {/* Sätze-Feld nur im Nicht-Zirkel-Modus */}
              {!isCircuit && (
                <View style={styles.third}>
                  <Text style={styles.sublabel}>Sätze</Text>
                  <TextInput
                    style={styles.input}
                    value={ex.targetSets}
                    onChangeText={(v) => updateRow(ex.localId, 'targetSets', v)}
                    keyboardType="number-pad"
                    placeholder="3"
                    placeholderTextColor="#555"
                  />
                </View>
              )}
              <View style={isCircuit ? styles.half : styles.third}>
                <Text style={styles.sublabel}>Wdh.</Text>
                <TextInput
                  style={styles.input}
                  value={ex.targetReps}
                  onChangeText={(v) => updateRow(ex.localId, 'targetReps', v)}
                  keyboardType="number-pad"
                  placeholder="10"
                  placeholderTextColor="#555"
                />
              </View>
              <View style={isCircuit ? styles.half : styles.third}>
                <Text style={styles.sublabel}>Dauer (s)</Text>
                <TextInput
                  style={[styles.input, ex.targetDuration ? styles.inputHighlight : null]}
                  value={ex.targetDuration}
                  onChangeText={(v) => updateRow(ex.localId, 'targetDuration', v)}
                  keyboardType="number-pad"
                  placeholder="—"
                  placeholderTextColor="#444"
                />
              </View>
            </View>

            <View style={[styles.row, { marginTop: 2 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sublabel}>Gewicht (kg)</Text>
                <TextInput
                  style={styles.input}
                  value={ex.targetWeight}
                  onChangeText={(v) => updateRow(ex.localId, 'targetWeight', v.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor="#444"
                />
              </View>
              {ex.targetDuration ? (
                <View style={{ flex: 2, justifyContent: 'flex-end', paddingBottom: 10 }}>
                  <Text style={styles.durationHint}>⏱ Countdown: {ex.targetDuration}s</Text>
                </View>
              ) : <View style={{ flex: 2 }} />}
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.addExButton}
          onPress={() => setExercises((prev) => [...prev, newRow()])}
        >
          <Text style={styles.addExText}>+ Übung hinzufügen</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Plan speichern</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Abbrechen</Text>
        </TouchableOpacity>
      </ScrollView>

      {toastMsg && (
        <Toast
          message={toastMsg}
          type="success"
          duration={1500}
          onDismiss={() => setToastMsg(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: '#121212' },
  center: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },
  container: { flexGrow: 1, padding: 24, paddingTop: 16, paddingBottom: 48 },
  heading: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 24 },

  label: {
    fontSize: 13, fontWeight: '600', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  sublabel: {
    fontSize: 11, fontWeight: '600', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
  },
  sectionGap: { marginTop: 24, marginBottom: 12 },

  input: {
    backgroundColor: '#2a2a2a', borderRadius: 10,
    padding: 13, fontSize: 15, color: '#fff',
    borderWidth: 1, borderColor: '#333', marginBottom: 10,
  },
  inputHighlight: { borderColor: '#0a7ea4' },

  // Circuit toggle
  circuitToggleCard: {
    backgroundColor: '#1e1e1e', borderRadius: 14,
    padding: 16, marginBottom: 12,
  },
  circuitToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  circuitToggleTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 3 },
  circuitToggleHint:  { color: '#555', fontSize: 12, lineHeight: 17 },

  // Circuit settings
  circuitSettingsCard: {
    backgroundColor: '#0d1f2a', borderRadius: 14,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#0a7ea4',
  },
  circuitSettingsTitle: {
    color: '#0a7ea4', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16,
  },

  exerciseCard: {
    backgroundColor: '#1e1e1e', borderRadius: 14,
    padding: 16, marginBottom: 12,
  },
  exerciseHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  exerciseIndex:  { color: '#0a7ea4', fontWeight: '700', fontSize: 14 },
  removeText:     { color: '#555', fontSize: 16 },
  removeDisabled: { opacity: 0.2 },

  row:   { flexDirection: 'row', gap: 8 },
  third: { flex: 1 },
  half:  { flex: 1 },

  durationHint: { color: '#0a7ea4', fontSize: 12, marginTop: 2, marginBottom: 4 },

  addExButton: {
    borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 12,
    borderStyle: 'dashed', padding: 14,
    alignItems: 'center', marginBottom: 24,
  },
  addExText: { color: '#0a7ea4', fontWeight: '600', fontSize: 15 },

  saveButton: {
    backgroundColor: '#0a7ea4', borderRadius: 12,
    padding: 18, alignItems: 'center', marginBottom: 12,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelButton:       { padding: 14, alignItems: 'center' },
  cancelText:         { color: '#555', fontSize: 15 },
});
