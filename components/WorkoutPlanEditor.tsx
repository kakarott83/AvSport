import { useEffect, useRef, useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type ExerciseRow = {
  localId: string;
  name: string;
  targetSets: string;
  targetReps: string;
  targetDuration: string;
};

export type MasterExercise = {
  id: string;
  name: string;
};

export type PlanEditorProps = {
  planName: string;
  setPlanName: (name: string) => void;
  isCircuit: boolean;
  setIsCircuit: (value: boolean) => void;
  circuitRounds: string;
  setCircuitRounds: (value: string) => void;
  restBetweenExercises: string;
  setRestBetweenExercises: (value: string) => void;
  restBetweenRounds: string;
  setRestBetweenRounds: (value: string) => void;
  exercises: ExerciseRow[];
  setExercises: (
    exercises: ExerciseRow[] | ((prev: ExerciseRow[]) => ExerciseRow[]),
  ) => void;
  masterExercises: MasterExercise[];
  isEdit?: boolean;
};

// ─────────────────────────────────────────
// ExerciseNamePicker — Autocomplete Field
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
    if (!value) setQuery("");
  }, [value]);

  const suggestions =
    query.trim().length >= 1
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
  wrapper: { marginBottom: 10, zIndex: 10 },
  input: {
    backgroundColor: "#2a2a2a",
    borderRadius: 10,
    padding: 13,
    fontSize: 15,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#333",
  },
  dropdown: {
    backgroundColor: "#2a2a2a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#0a7ea4",
    marginTop: 4,
    overflow: "hidden",
  },
  suggestion: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  suggestionText: { color: "#fff", fontSize: 14 },
});

// ─────────────────────────────────────────
// WorkoutPlanEditor Component
// ─────────────────────────────────────────

export default function WorkoutPlanEditor({
  planName,
  setPlanName,
  isCircuit,
  setIsCircuit,
  circuitRounds,
  setCircuitRounds,
  restBetweenExercises,
  setRestBetweenExercises,
  restBetweenRounds,
  setRestBetweenRounds,
  exercises,
  setExercises,
  masterExercises,
  isEdit = false,
}: PlanEditorProps) {
  function newRow(): ExerciseRow {
    return {
      localId: Date.now().toString() + Math.random(),
      name: "",
      targetSets: "3",
      targetReps: "10",
      targetDuration: "",
    };
  }

  function updateRow(localId: string, field: keyof ExerciseRow, value: string) {
    setExercises((prev) =>
      prev.map((e) => (e.localId === localId ? { ...e, [field]: value } : e)),
    );
  }

  function removeRow(localId: string) {
    if (exercises.length <= 1) return;
    setExercises((prev) => prev.filter((e) => e.localId !== localId));
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>
          {isEdit ? "Plan bearbeiten" : "Neuen Plan erstellen"}
        </Text>

        {/* ── Plan Name ── */}
        <Text style={styles.label}>Planname</Text>
        <TextInput
          style={styles.input}
          value={planName}
          onChangeText={setPlanName}
          placeholder="z.B. Push-Tag, Oberkörper …"
          placeholderTextColor="#555"
          returnKeyType="next"
        />

        {/* ── Circuit Training Toggle ── */}
        <View style={styles.circuitToggleCard}>
          <View style={styles.circuitToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.circuitToggleTitle}>Zirkeltraining</Text>
              <Text style={styles.circuitToggleHint}>
                Alle Übungen werden in Runden absolviert, ohne feste Sätze pro
                Übung.
              </Text>
            </View>
            <Switch
              value={isCircuit}
              onValueChange={setIsCircuit}
              trackColor={{ false: "#2a2a2a", true: "#0a3a3a" }}
              thumbColor={isCircuit ? "#0a7ea4" : "#555"}
            />
          </View>
        </View>

        {/* ── Circuit Settings (only when is_circuit is enabled) ── */}
        {isCircuit && (
          <View style={styles.circuitSettingsCard}>
            <Text style={styles.circuitSettingsTitle}>
              Zirkel-Einstellungen
            </Text>

            <Text style={styles.sublabel}>Anzahl der Runden</Text>
            <TextInput
              style={styles.input}
              value={circuitRounds}
              onChangeText={(v) => setCircuitRounds(v.replace(/[^0-9]/g, ""))}
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
                  onChangeText={(v) =>
                    setRestBetweenExercises(v.replace(/[^0-9]/g, ""))
                  }
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
                  onChangeText={(v) =>
                    setRestBetweenRounds(v.replace(/[^0-9]/g, ""))
                  }
                  keyboardType="number-pad"
                  placeholder="60"
                  placeholderTextColor="#555"
                />
              </View>
            </View>
          </View>
        )}

        {/* ── Exercises ── */}
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
                <Text
                  style={[
                    styles.removeText,
                    exercises.length <= 1 && styles.removeDisabled,
                  ]}
                >
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            <ExerciseNamePicker
              value={ex.name}
              onChange={(v) => updateRow(ex.localId, "name", v)}
              masterList={masterExercises}
            />

            <View style={styles.row}>
              {/* Sets field only shown in non-circuit mode */}
              {!isCircuit && (
                <View style={styles.third}>
                  <Text style={styles.sublabel}>Sätze</Text>
                  <TextInput
                    style={styles.input}
                    value={ex.targetSets}
                    onChangeText={(v) => updateRow(ex.localId, "targetSets", v)}
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
                  onChangeText={(v) => updateRow(ex.localId, "targetReps", v)}
                  keyboardType="number-pad"
                  placeholder="10"
                  placeholderTextColor="#555"
                />
              </View>
              <View style={isCircuit ? styles.half : styles.third}>
                <Text style={styles.sublabel}>Dauer (s)</Text>
                <TextInput
                  style={[
                    styles.input,
                    ex.targetDuration ? styles.inputHighlight : null,
                  ]}
                  value={ex.targetDuration}
                  onChangeText={(v) =>
                    updateRow(ex.localId, "targetDuration", v)
                  }
                  keyboardType="number-pad"
                  placeholder="—"
                  placeholderTextColor="#444"
                />
              </View>
            </View>

            {ex.targetDuration ? (
              <Text style={styles.durationHint}>
                ⏱ Countdown: {ex.targetDuration}s beim Training
              </Text>
            ) : null}
          </View>
        ))}

        <TouchableOpacity
          style={styles.addExButton}
          onPress={() => setExercises((prev) => [...prev, newRow()])}
        >
          <Text style={styles.addExText}>+ Übung hinzufügen</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#121212" },
  container: { flexGrow: 1, padding: 24, paddingTop: 16, paddingBottom: 48 },
  heading: { fontSize: 26, fontWeight: "800", color: "#fff", marginBottom: 24 },

  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sublabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  sectionGap: { marginTop: 24, marginBottom: 12 },

  input: {
    backgroundColor: "#2a2a2a",
    borderRadius: 10,
    padding: 13,
    fontSize: 15,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 10,
  },
  inputHighlight: { borderColor: "#0a7ea4" },

  // Circuit toggle
  circuitToggleCard: {
    backgroundColor: "#1e1e1e",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  circuitToggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  circuitToggleTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 3,
  },
  circuitToggleHint: { color: "#555", fontSize: 12, lineHeight: 17 },

  // Circuit settings
  circuitSettingsCard: {
    backgroundColor: "#0d1f2a",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#0a7ea4",
  },
  circuitSettingsTitle: {
    color: "#0a7ea4",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },

  exerciseCard: {
    backgroundColor: "#1e1e1e",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  exerciseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  exerciseIndex: { color: "#0a7ea4", fontWeight: "700", fontSize: 14 },
  removeText: { color: "#555", fontSize: 16 },
  removeDisabled: { opacity: 0.2 },

  row: { flexDirection: "row", gap: 8 },
  third: { flex: 1 },
  half: { flex: 1 },

  durationHint: {
    color: "#0a7ea4",
    fontSize: 12,
    marginTop: 2,
    marginBottom: 4,
  },

  addExButton: {
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 12,
    borderStyle: "dashed",
    padding: 14,
    alignItems: "center",
    marginBottom: 24,
  },
  addExText: { color: "#0a7ea4", fontWeight: "600", fontSize: 15 },
});
