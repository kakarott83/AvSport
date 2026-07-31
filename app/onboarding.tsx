import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { DatePickerInput } from '@/components/DatePickerInput';
import {
  ACTIVITY_LEVEL_LABELS,
  ACTIVITY_LEVELS,
  ActivityLevel,
  DEFAULT_ACTIVITY_LEVEL,
} from '@/lib/stepGoal';
import { supabase } from '@/services/supabaseClient';

const TOTAL_STEPS = 5;

export default function OnboardingScreen() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [dob, setDob] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(DEFAULT_ACTIVITY_LEVEL);
  const [saving, setSaving] = useState(false);

  const isOptional = step > 1;
  const isLast = step === TOTAL_STEPS;

  function canAdvance() {
    if (step === 1) return name.trim().length >= 2;
    return true;
  }

  async function finish() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    await supabase.from('profiles').upsert(
      {
        id: user.id,
        display_name: name.trim(),
        gender: gender ?? null,
        date_of_birth: dob || null,
        height_cm: height ? parseFloat(height) : null,
        weight_kg: weight ? parseFloat(weight) : null,
        activity_level: activityLevel,
      },
      { onConflict: 'id' },
    );

    setSaving(false);
    router.replace('/(app)/(tabs)');
  }

  function next() {
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        {/* Progress dots */}
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i < step && styles.dotActive]}
            />
          ))}
        </View>

        {/* Step content */}
        <View style={styles.content}>
          {step === 1 && (
            <StepName name={name} onChange={setName} />
          )}
          {step === 2 && (
            <StepGender name={name} gender={gender} onChange={setGender} />
          )}
          {step === 3 && (
            <StepDob dob={dob} onChange={setDob} />
          )}
          {step === 4 && (
            <StepBody height={height} weight={weight} onHeight={setHeight} onWeight={setWeight} />
          )}
          {step === 5 && (
            <StepActivity activityLevel={activityLevel} onChange={setActivityLevel} />
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.nextBtn, !canAdvance() && styles.nextBtnDisabled]}
            onPress={next}
            disabled={!canAdvance() || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#121212" />
              : <Text style={styles.nextBtnText}>
                  {isLast ? 'Los geht\'s 🚀' : 'Weiter →'}
                </Text>
            }
          </TouchableOpacity>

          {isOptional && (
            <TouchableOpacity onPress={next} activeOpacity={0.6} style={styles.skipBtn}>
              <Text style={styles.skipText}>Überspringen</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Step 1: Name ────────────────────────────────────────────────────────────

function StepName({ name, onChange }: { name: string; onChange: (v: string) => void }) {
  return (
    <View>
      <Text style={styles.emoji}>👋</Text>
      <Text style={styles.heading}>Herzlich willkommen!</Text>
      <Text style={styles.sub}>Wie soll ich dich nennen?</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={onChange}
        placeholder="Dein Name"
        placeholderTextColor="#555"
        autoFocus
        returnKeyType="done"
      />
    </View>
  );
}

// ─── Step 2: Gender ───────────────────────────────────────────────────────────

function StepGender({
  name,
  gender,
  onChange,
}: {
  name: string;
  gender: 'male' | 'female' | null;
  onChange: (v: 'male' | 'female' | null) => void;
}) {
  return (
    <View>
      <Text style={styles.emoji}>🙋</Text>
      <Text style={styles.heading}>Hey {name}!</Text>
      <Text style={styles.sub}>Was ist dein biologisches Geschlecht?</Text>
      <View style={styles.chipRow}>
        {(['male', 'female'] as const).map((g) => (
          <TouchableOpacity
            key={g}
            style={[styles.chip, gender === g && styles.chipActive]}
            onPress={() => onChange(g)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, gender === g && styles.chipTextActive]}>
              {g === 'male' ? '♂ Männlich' : '♀ Weiblich'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Step 3: Date of birth ───────────────────────────────────────────────────

function StepDob({ dob, onChange }: { dob: string; onChange: (v: string) => void }) {
  return (
    <View>
      <Text style={styles.emoji}>🎂</Text>
      <Text style={styles.heading}>Wann bist du geboren?</Text>
      <Text style={styles.sub}>
        Damit berechne ich deinen Kalorienbedarf genauer.
      </Text>
      <DatePickerInput
        value={dob}
        onChange={onChange}
        label="Geburtsdatum wählen"
      />
    </View>
  );
}

// ─── Step 4: Body data ───────────────────────────────────────────────────────

function StepBody({
  height,
  weight,
  onHeight,
  onWeight,
}: {
  height: string;
  weight: string;
  onHeight: (v: string) => void;
  onWeight: (v: string) => void;
}) {
  return (
    <View>
      <Text style={styles.emoji}>📏</Text>
      <Text style={styles.heading}>Körperdaten</Text>
      <Text style={styles.sub}>
        Größe und Gewicht helfen mir, dein Kalorienziel zu berechnen.
      </Text>
      <View style={styles.rowFields}>
        <View style={styles.rowField}>
          <Text style={styles.fieldLabel}>Größe (cm)</Text>
          <TextInput
            style={styles.input}
            value={height}
            onChangeText={(v) => onHeight(v.replace(/[^0-9.]/g, ''))}
            placeholder="175"
            placeholderTextColor="#555"
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.rowField}>
          <Text style={styles.fieldLabel}>Gewicht (kg)</Text>
          <TextInput
            style={styles.input}
            value={weight}
            onChangeText={(v) => onWeight(v.replace(/[^0-9.]/g, ''))}
            placeholder="75"
            placeholderTextColor="#555"
            keyboardType="decimal-pad"
          />
        </View>
      </View>
    </View>
  );
}

// ─── Step 5: Activity level ──────────────────────────────────────────────────

function StepActivity({
  activityLevel,
  onChange,
}: {
  activityLevel: ActivityLevel;
  onChange: (v: ActivityLevel) => void;
}) {
  return (
    <View>
      <Text style={styles.emoji}>⚡</Text>
      <Text style={styles.heading}>Wie aktiv bist du?</Text>
      <Text style={styles.sub}>
        Dein Aktivitätslevel bestimmt dein tägliches Schrittziel.
      </Text>
      <View style={styles.activityGrid}>
        {ACTIVITY_LEVELS.map((level) => (
          <TouchableOpacity
            key={level}
            style={[styles.activityChip, activityLevel === level && styles.activityChipActive]}
            onPress={() => onChange(level)}
            activeOpacity={0.8}
          >
            <Text style={[styles.activityChipText, activityLevel === level && styles.activityChipTextActive]}>
              {ACTIVITY_LEVEL_LABELS[level]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: '#121212' },
  container: { flex: 1, padding: 28, paddingTop: 64, justifyContent: 'space-between' },

  dots:    { flexDirection: 'row', gap: 8, marginBottom: 48 },
  dot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2a2a2a' },
  dotActive: { backgroundColor: '#00E5FF' },

  content: { flex: 1 },

  emoji:   { fontSize: 44, marginBottom: 16 },
  heading: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 10, lineHeight: 34 },
  sub:     { fontSize: 15, color: '#888', lineHeight: 22, marginBottom: 28 },

  input:   { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 16, fontSize: 16, color: '#fff', borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 12 },

  chipRow:      { flexDirection: 'row', gap: 12 },
  chip:         { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: '#1e1e1e', alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a' },
  chipActive:   { backgroundColor: '#0a3a3a', borderColor: '#00E5FF' },
  chipText:     { color: '#666', fontSize: 15, fontWeight: '600' },
  chipTextActive: { color: '#00E5FF' },

  rowFields: { flexDirection: 'row', gap: 12 },
  rowField:  { flex: 1 },
  fieldLabel: { color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },

  activityGrid:         { gap: 10 },
  activityChip:         { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#2a2a2a' },
  activityChipActive:   { backgroundColor: '#1a1000', borderColor: '#FF9100' },
  activityChipText:     { color: '#666', fontSize: 14, fontWeight: '600' },
  activityChipTextActive: { color: '#FF9100' },

  actions:  { paddingBottom: 16 },
  nextBtn:  { backgroundColor: '#00E5FF', borderRadius: 16, padding: 18, alignItems: 'center' },
  nextBtnDisabled: { opacity: 0.35 },
  nextBtnText: { color: '#121212', fontSize: 17, fontWeight: '700' },
  skipBtn:  { alignItems: 'center', paddingTop: 16 },
  skipText: { color: '#444', fontSize: 14 },
});
