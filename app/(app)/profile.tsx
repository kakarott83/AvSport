import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
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

import { DatePickerInput } from '@/components/DatePickerInput';
import { Toast } from '@/components/Toast';
import * as Device from 'expo-device';

import { checkAvailability, HealthManager, requestPermissions } from '@/lib/healthManager';
import { syncHealthToSupabase } from '@/lib/healthSync';
import { clampStepper, parseProfileFloat, parseProfileInt, STEPPER_BOUNDS, validateProfileForm } from '@/lib/profile';
import {
  ACTIVITY_LEVEL_LABELS,
  ACTIVITY_LEVELS,
  ActivityLevel,
  calculateDailyStepGoal,
  DEFAULT_ACTIVITY_LEVEL,
} from '@/lib/stepGoal';
import { supabase } from '@/services/supabaseClient';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

type ProfileForm = {
  display_name: string;
  gender: 'male' | 'female' | null;
  date_of_birth: string;
  height_cm: string;
  weight_kg: string;
  manual_calorie_offset: string;
  protein_per_kg: string;
  auto_adjust_calories: boolean;
  // Zyklus-Tracking
  cycle_tracking_enabled: boolean;
  cycle_length_days: number;
  period_duration_days: number;
  cycle_calorie_bonus: number;
  // Schritt-Ziel
  activity_level: ActivityLevel;
  manual_step_goal: number;
  // Integrationen
  sync_health: boolean;
};

const EMPTY: ProfileForm = {
  display_name: '',
  gender: null,
  date_of_birth: '',
  height_cm: '',
  weight_kg: '',
  manual_calorie_offset: '0',
  protein_per_kg: '2.0',
  auto_adjust_calories: false,
  cycle_tracking_enabled: false,
  cycle_length_days: 28,
  period_duration_days: 5,
  cycle_calorie_bonus: 0,
  activity_level: DEFAULT_ACTIVITY_LEVEL,
  manual_step_goal: 0,
  sync_health: false,
};

// ─────────────────────────────────────────
// Screen
// ─────────────────────────────────────────

export default function ProfileScreen() {
  const [form, setForm]       = useState<ProfileForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [toast, setToast]     = useState<string | null>(null);
  // Mirrors HealthManager._isNativeReady — the Health Connect permission
  // launcher must be fully registered before handleToggleHealth may call into
  // native code. Switch stays disabled until this becomes true.
  const [isNativeReady, setIsNativeReady] = useState(HealthManager.isNativeReady());

  // Debounce timer for stepper auto-save
  const cycleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function patch<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── Native HC init ───────────────────────────────────────────────────────────
  // Kick off HealthManager.init() as early as possible so the 1000 ms startup
  // delay runs in parallel with the Supabase profile load. The Promise resolves
  // only after the Android ActivityResultLauncher has been registered.

  useEffect(() => {
    HealthManager.init().then(() => setIsNativeReady(HealthManager.isNativeReady()));
  }, []);

  // ── Load ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from('profiles')
        .select(`display_name, gender, date_of_birth, height_cm, weight_kg,
                 manual_calorie_offset, protein_per_kg, auto_adjust_calories,
                 cycle_tracking_enabled, cycle_length_days, period_duration_days,
                 cycle_calorie_bonus, activity_level, manual_step_goal, sync_health`)
        .eq('id', user.id)
        .single();

      if (data) {
        setForm({
          display_name:            data.display_name ?? '',
          gender:                  data.gender ?? null,
          date_of_birth:           data.date_of_birth ?? '',
          height_cm:               data.height_cm != null ? String(data.height_cm) : '',
          weight_kg:               data.weight_kg != null ? String(data.weight_kg) : '',
          manual_calorie_offset:   data.manual_calorie_offset != null ? String(data.manual_calorie_offset) : '0',
          protein_per_kg:          data.protein_per_kg != null ? String(data.protein_per_kg) : '2.0',
          auto_adjust_calories:    data.auto_adjust_calories ?? false,
          cycle_tracking_enabled:  data.cycle_tracking_enabled ?? false,
          cycle_length_days:       data.cycle_length_days ?? 28,
          period_duration_days:    data.period_duration_days ?? 5,
          cycle_calorie_bonus:     data.cycle_calorie_bonus ?? 0,
          activity_level:          (data.activity_level as ActivityLevel) ?? DEFAULT_ACTIVITY_LEVEL,
          manual_step_goal:        data.manual_step_goal ?? 0,
          sync_health:             data.sync_health ?? false,
        });
      }
      setLoading(false);
    })();
  }, []);

  // ── Auto-save cycle fields (debounced for steppers, immediate for toggle) ───

  async function syncCycleField(
    patch: Partial<Pick<ProfileForm, 'cycle_tracking_enabled' | 'cycle_length_days' | 'period_duration_days' | 'cycle_calorie_bonus'>>
  ) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', user.id);
    if (error) console.log('[profile] cycle sync error:', error.message);
  }

  async function handleToggleHealth(enabled: boolean) {
    if (enabled) {
      // Simulator guard: native Health Connect calls crash in emulators because
      // there is no real sensor stack or system Activity to handle the intent.
      if (!Device.isDevice) {
        Alert.alert(
          'Simulator erkannt',
          'Health Connect kann nur auf einem echten Android-Gerät aktiviert werden.',
        );
        return;
      }

      // Native-ready guard: the Android ActivityResultLauncher needs ~1 s after
      // app start to register. Calling requestPermissions() before that causes
      // "lateinit property requestPermission has not been initialized".
      if (!isNativeReady) {
        Alert.alert(
          'Bitte einen Moment',
          'Health Connect wird gerade initialisiert. Bitte versuche es in wenigen Sekunden erneut.',
        );
        return;
      }

      try {
        // Step 1: check SDK availability before any native initialisation call.
        const availability = await checkAvailability();

        if (!availability.available) {
          if (availability.reason === 'sdk_unavailable') {
            Alert.alert(
              'Health Connect nicht installiert',
              'Für diese Funktion wird die kostenlose App „Health Connect" von Google benötigt. ' +
              'Bitte installiere sie über den Google Play Store und versuche es erneut.',
            );
          } else if (availability.reason === 'sdk_update_required') {
            Alert.alert(
              'Health Connect veraltet',
              'Bitte aktualisiere die Health Connect App im Google Play Store.',
            );
          } else if (availability.reason === 'not_android') {
            Alert.alert(
              'Nicht unterstützt',
              'Health Connect ist nur auf Android verfügbar.',
            );
          } else {
            Alert.alert(
              'Fehler',
              'Health Connect konnte nicht gestartet werden. Bitte versuche es erneut.',
            );
          }
          return;
        }

        // Step 2: request permissions — switch only activates on success.
        const granted = await requestPermissions();
        if (!granted) {
          Alert.alert(
            'Berechtigung verweigert',
            'Bitte erlaube den Zugriff auf Schritt- und Kaloriendaten in den ' +
            'Health Connect Einstellungen.',
          );
          return;
        }
      } catch (e) {
        console.error('[profile] handleToggleHealth error:', e);
        Alert.alert(
          'Fehler',
          'Health Connect konnte nicht aktiviert werden. Bitte versuche es erneut.',
        );
        return;
      }
    }

    // Supabase-Update ZUERST — UI springt nur auf den neuen Wert, wenn die DB
    // erfolgreich aktualisiert wurde. Bei Fehler bleibt der Switch wo er war.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error: dbError } = await supabase
      .from('profiles')
      .update({ sync_health: enabled })
      .eq('id', user.id);

    if (dbError) {
      console.error('[profile] sync_health update failed:', dbError.message);
      // Rollback: Switch zurück auf den vorherigen Wert setzen
      patch('sync_health', !enabled);
      Alert.alert(
        'Speichern fehlgeschlagen',
        'Die Einstellung konnte nicht gespeichert werden. Bitte prüfe deine Internetverbindung und versuche es erneut.',
      );
      return;
    }

    // Erst jetzt UI aktualisieren — DB und UI sind jetzt synchron
    patch('sync_health', enabled);

    // Initialer Sync direkt nach dem Aktivieren
    if (enabled) {
      syncHealthToSupabase();
    }
  }

  function onCycleToggle(enabled: boolean) {
    setForm((prev) => ({ ...prev, cycle_tracking_enabled: enabled }));
    syncCycleField({ cycle_tracking_enabled: enabled });
  }

  function stepperChange(
    field: 'cycle_length_days' | 'period_duration_days' | 'cycle_calorie_bonus' | 'manual_step_goal',
    delta: number,
    min: number,
    max: number
  ) {
    setForm((prev) => {
      const next = clampStepper(prev[field] as number, delta, min, max);
      const updated = { ...prev, [field]: next };

      // Debounced DB sync
      if (cycleDebounce.current) clearTimeout(cycleDebounce.current);
      cycleDebounce.current = setTimeout(() => {
        syncCycleField({ [field]: next });
      }, 800);

      return updated;
    });
  }

  // ── Full save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setError('');
    const validation = validateProfileForm({ display_name: form.display_name });
    if (!validation.valid) { setError(validation.error); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const offset     = parseProfileInt(form.manual_calorie_offset, 0);
    const proteinPkg = parseProfileFloat(form.protein_per_kg, 2.0);

    const { error: dbErr } = await supabase.from('profiles').upsert(
      {
        id:                       user.id,
        display_name:             form.display_name.trim(),
        gender:                   form.gender,
        date_of_birth:            form.date_of_birth || null,
        height_cm:                form.height_cm ? parseProfileFloat(form.height_cm, 0) : null,
        weight_kg:                form.weight_kg ? parseProfileFloat(form.weight_kg, 0) : null,
        manual_calorie_offset:    offset,
        protein_per_kg:           proteinPkg,
        auto_adjust_calories:     form.auto_adjust_calories,
        cycle_tracking_enabled:   form.cycle_tracking_enabled,
        cycle_length_days:        form.cycle_length_days,
        period_duration_days:     form.period_duration_days,
        cycle_calorie_bonus:      form.cycle_calorie_bonus,
        activity_level:           form.activity_level,
        manual_step_goal:         form.manual_step_goal > 0 ? form.manual_step_goal : null,
        sync_health:              form.sync_health,
      },
      { onConflict: 'id' }
    );

    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    setToast('Profil gespeichert!');
    setTimeout(() => router.back(), 1500);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#00E5FF" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* ── Allgemein ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Allgemein</Text>

          <Text style={styles.label}>Anzeigename</Text>
          <TextInput
            style={styles.input}
            value={form.display_name}
            onChangeText={(v) => patch('display_name', v)}
            placeholder="Wie soll ich dich nennen?"
            placeholderTextColor="#555"
          />

          <Text style={styles.label}>Geschlecht</Text>
          <View style={styles.chipRow}>
            {(['male', 'female'] as const).map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.chip, form.gender === g && styles.chipActive]}
                onPress={() => patch('gender', g)}
                activeOpacity={0.8}>
                <Text style={[styles.chipText, form.gender === g && styles.chipTextActive]}>
                  {g === 'male' ? 'Männlich' : 'Weiblich'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Geburtsdatum</Text>
          <DatePickerInput
            value={form.date_of_birth}
            onChange={(v) => patch('date_of_birth', v)}
            label="Geburtsdatum wählen"
          />
        </View>

        {/* ── Körperdaten ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Körperdaten</Text>

          <View style={styles.rowFields}>
            <View style={styles.rowField}>
              <Text style={styles.label}>Größe (cm)</Text>
              <TextInput
                style={styles.input}
                value={form.height_cm}
                onChangeText={(v) => patch('height_cm', v.replace(/[^0-9.]/g, ''))}
                placeholder="175"
                placeholderTextColor="#555"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.rowField}>
              <Text style={styles.label}>Gewicht (kg)</Text>
              <TextInput
                style={styles.input}
                value={form.weight_kg}
                onChangeText={(v) => patch('weight_kg', v.replace(/[^0-9.]/g, ''))}
                placeholder="75.0"
                placeholderTextColor="#555"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

        {/* ── Kalorien-Ziel ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kalorien-Ziel</Text>
          <Text style={styles.hint}>
            Passe dein dauerhaftes Tagesziel an. Negativ zum Abnehmen (z.B. -500), positiv zum Aufbauen (z.B. +300).
          </Text>

          <Text style={styles.label}>Standard-Offset (kcal/Tag)</Text>
          <TextInput
            style={styles.input}
            value={form.manual_calorie_offset}
            onChangeText={(v) => patch('manual_calorie_offset', v.replace(/[^0-9-]/g, ''))}
            placeholder="0"
            placeholderTextColor="#555"
            keyboardType="default"
          />
        </View>

        {/* ── Ziele & Performance ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ziele & Performance</Text>

          <Text style={styles.label}>Protein-Ziel (g pro kg Körpergewicht)</Text>
          <Text style={styles.hint}>
            Empfohlen: 1.6–2.2 g/kg beim Muskelaufbau, 1.2–1.6 g/kg beim Abnehmen.
          </Text>
          <TextInput
            style={styles.input}
            value={form.protein_per_kg}
            onChangeText={(v) => patch('protein_per_kg', v.replace(/[^0-9.]/g, ''))}
            placeholder="2.0"
            placeholderTextColor="#555"
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Trainings-Kalorien einrechnen</Text>
          <Text style={styles.hint}>
            Wenn aktiv, werden heute verbrannte Trainings-kcal zum Tageslimit addiert.
          </Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>
              {form.auto_adjust_calories ? 'Aktiviert' : 'Deaktiviert'}
            </Text>
            <Switch
              value={form.auto_adjust_calories}
              onValueChange={(v) => patch('auto_adjust_calories', v)}
              trackColor={{ false: '#2a2a2a', true: '#0a3a3a' }}
              thumbColor={form.auto_adjust_calories ? '#00E5FF' : '#555'}
            />
          </View>
        </View>

        {/* ── Schritt-Ziel ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Schritt-Ziel</Text>
          <Text style={styles.hint}>
            Wähle dein Aktivitätslevel, um ein passendes Tagesziel zu berechnen.
            Das aktuelle Ziel liegt bei{' '}
            <Text style={{ color: '#FF9100', fontWeight: '700' }}>
              {calculateDailyStepGoal(form.activity_level, form.manual_step_goal > 0 ? form.manual_step_goal : null).toLocaleString('de-DE')}
            </Text>{' '}
            Schritten/Tag.
          </Text>

          <Text style={styles.label}>Aktivitätslevel</Text>
          <View style={styles.chipRow}>
            {ACTIVITY_LEVELS.map((level) => (
              <TouchableOpacity
                key={level}
                style={[styles.chip, styles.chipNarrow, form.activity_level === level && styles.chipActiveOrange]}
                onPress={() => patch('activity_level', level)}
                activeOpacity={0.8}>
                <Text style={[styles.chipText, form.activity_level === level && styles.chipTextOrange]}>
                  {ACTIVITY_LEVEL_LABELS[level]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Manuelles Ziel (0 = automatisch)</Text>
          <Text style={styles.hint}>
            Überschreibe die Berechnung mit einem festen Wert. 0 = Automatik bleibt aktiv.
          </Text>
          <Stepper
            value={form.manual_step_goal}
            unit="Schritte"
            step={STEPPER_BOUNDS.manual_step_goal.step}
            min={STEPPER_BOUNDS.manual_step_goal.min}
            max={STEPPER_BOUNDS.manual_step_goal.max}
            onDecrement={() => stepperChange('manual_step_goal', -STEPPER_BOUNDS.manual_step_goal.step, STEPPER_BOUNDS.manual_step_goal.min, STEPPER_BOUNDS.manual_step_goal.max)}
            onIncrement={() => stepperChange('manual_step_goal', +STEPPER_BOUNDS.manual_step_goal.step, STEPPER_BOUNDS.manual_step_goal.min, STEPPER_BOUNDS.manual_step_goal.max)}
            accentColor="#FF9100"
          />
        </View>

        {/* ── Zyklus-Tracking ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Zyklus-Tracking</Text>
          <Text style={styles.hint}>
            Aktiviere die Zyklusverfolgung, um Gewichtsschwankungen im Dashboard mit deiner Periode zu korrelieren.
          </Text>

          {/* Master toggle */}
          <View style={[styles.toggleRow, { marginBottom: form.cycle_tracking_enabled ? 20 : 0 }]}>
            <View style={styles.toggleLabelGroup}>
              <Text style={styles.toggleLabel}>🩸 Zyklus-Tracking</Text>
              <Text style={styles.toggleSub}>
                {form.cycle_tracking_enabled ? 'Aktiv' : 'Inaktiv'}
              </Text>
            </View>
            <Switch
              value={form.cycle_tracking_enabled}
              onValueChange={onCycleToggle}
              trackColor={{ false: '#2a2a2a', true: '#3a0d0d' }}
              thumbColor={form.cycle_tracking_enabled ? '#FF5252' : '#555'}
            />
          </View>

          {/* Conditional fields */}
          {form.cycle_tracking_enabled && (
            <>
              <Text style={styles.label}>Zykluslänge</Text>
              <Text style={styles.hint}>Durchschnittliche Länge deines Zyklus in Tagen.</Text>
              <Stepper
                value={form.cycle_length_days}
                unit="Tage"
                min={STEPPER_BOUNDS.cycle_length_days.min}
                max={STEPPER_BOUNDS.cycle_length_days.max}
                onDecrement={() => stepperChange('cycle_length_days', -STEPPER_BOUNDS.cycle_length_days.step, STEPPER_BOUNDS.cycle_length_days.min, STEPPER_BOUNDS.cycle_length_days.max)}
                onIncrement={() => stepperChange('cycle_length_days', +STEPPER_BOUNDS.cycle_length_days.step, STEPPER_BOUNDS.cycle_length_days.min, STEPPER_BOUNDS.cycle_length_days.max)}
              />

              <View style={styles.separator} />

              <Text style={styles.label}>Periodendauer</Text>
              <Text style={styles.hint}>Wie viele Tage dauert deine Periode typischerweise?</Text>
              <Stepper
                value={form.period_duration_days}
                unit="Tage"
                min={STEPPER_BOUNDS.period_duration_days.min}
                max={STEPPER_BOUNDS.period_duration_days.max}
                onDecrement={() => stepperChange('period_duration_days', -STEPPER_BOUNDS.period_duration_days.step, STEPPER_BOUNDS.period_duration_days.min, STEPPER_BOUNDS.period_duration_days.max)}
                onIncrement={() => stepperChange('period_duration_days', +STEPPER_BOUNDS.period_duration_days.step, STEPPER_BOUNDS.period_duration_days.min, STEPPER_BOUNDS.period_duration_days.max)}
              />

              <View style={styles.separator} />

              <Text style={styles.label}>Kalorien-Bonus während Periode</Text>
              <Text style={styles.hint}>
                Optionaler Kalorienzuschlag während der Periode (z.B. 100–200 kcal für Cravings). 0 = kein Bonus.
              </Text>
              <Stepper
                value={form.cycle_calorie_bonus}
                unit="kcal"
                step={STEPPER_BOUNDS.cycle_calorie_bonus.step}
                min={STEPPER_BOUNDS.cycle_calorie_bonus.min}
                max={STEPPER_BOUNDS.cycle_calorie_bonus.max}
                onDecrement={() => stepperChange('cycle_calorie_bonus', -STEPPER_BOUNDS.cycle_calorie_bonus.step, STEPPER_BOUNDS.cycle_calorie_bonus.min, STEPPER_BOUNDS.cycle_calorie_bonus.max)}
                onIncrement={() => stepperChange('cycle_calorie_bonus', +STEPPER_BOUNDS.cycle_calorie_bonus.step, STEPPER_BOUNDS.cycle_calorie_bonus.min, STEPPER_BOUNDS.cycle_calorie_bonus.max)}
                accentColor="#FF9100"
              />
            </>
          )}
        </View>

        {/* ── Geräte & Synchronisation ── */}
        {Platform.OS !== 'web' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Geräte & Synchronisation</Text>
            <Text style={styles.hint}>
              {Platform.OS === 'ios'
                ? 'Schritte und Aktivitätskalorien aus Apple Health werden täglich eingelesen und zum Kalorienziel addiert.'
                : 'Schritte und Aktivitätskalorien aus Health Connect werden täglich eingelesen und zum Kalorienziel addiert.'}
            </Text>
            <View style={styles.toggleRow}>
              <View style={styles.toggleLabelGroup}>
                <Text style={styles.toggleLabel}>
                  {Platform.OS === 'ios' ? '🍎 Fitness-Daten teilen' : '🏃 Fitness-Daten teilen'}
                </Text>
                <Text style={styles.toggleSub}>
                  {form.sync_health
                    ? Platform.OS === 'ios' ? 'Apple Health verbunden' : 'Health Connect verbunden'
                    : 'Nicht verbunden'}
                </Text>
              </View>
              <Switch
                value={form.sync_health}
                onValueChange={handleToggleHealth}
                disabled={!isNativeReady}
                trackColor={{ false: '#2a2a2a', true: '#0a3a3a' }}
                thumbColor={
                  !isNativeReady ? '#333' : form.sync_health ? '#00E5FF' : '#555'
                }
              />
            </View>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}>
          {saving
            ? <ActivityIndicator color="#121212" />
            : <>
                <MaterialIcons name="check" size={18} color="#121212" />
                <Text style={styles.saveBtnText}>Speichern</Text>
              </>
          }
        </TouchableOpacity>

      </ScrollView>

      {toast && (
        <Toast message={toast} type="success" duration={1600} onDismiss={() => setToast(null)} />
      )}
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────
// Stepper component
// ─────────────────────────────────────────

function Stepper({
  value,
  unit,
  step = 1,
  min,
  max,
  onDecrement,
  onIncrement,
  accentColor = '#00E5FF',
}: {
  value: number;
  unit: string;
  step?: number;
  min: number;
  max: number;
  onDecrement: () => void;
  onIncrement: () => void;
  accentColor?: string;
}) {
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <View style={stepStyles.row}>
      <TouchableOpacity
        style={[stepStyles.btn, atMin && stepStyles.btnDisabled]}
        onPress={onDecrement}
        disabled={atMin}
        activeOpacity={0.7}>
        <Text style={[stepStyles.btnText, atMin && stepStyles.btnTextDisabled]}>−</Text>
      </TouchableOpacity>

      <View style={[stepStyles.valueBox, { borderColor: accentColor + '55' }]}>
        <Text style={[stepStyles.valueText, { color: accentColor }]}>{value}</Text>
        <Text style={stepStyles.unitText}>{unit}</Text>
      </View>

      <TouchableOpacity
        style={[stepStyles.btn, atMax && stepStyles.btnDisabled]}
        onPress={onIncrement}
        disabled={atMax}
        activeOpacity={0.7}>
        <Text style={[stepStyles.btnText, atMax && stepStyles.btnTextDisabled]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.3 },
  btnText:     { color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 26 },
  btnTextDisabled: { color: '#555' },
  valueBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
  },
  valueText: { fontSize: 22, fontWeight: '800' },
  unitText:  { color: '#666', fontSize: 12, fontWeight: '600' },
});

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: '#121212' },
  center:    { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },
  container: { padding: 20, paddingTop: 16, paddingBottom: 48 },

  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardTitle: {
    color: '#888', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 16,
  },

  label: {
    color: '#aaa', fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8,
  },
  hint: { color: '#555', fontSize: 12, lineHeight: 18, marginBottom: 16 },

  input: {
    backgroundColor: '#2a2a2a', borderRadius: 10,
    padding: 14, fontSize: 15, color: '#fff',
    borderWidth: 1, borderColor: '#333', marginBottom: 16,
  },

  chipRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  chip: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#2a2a2a', alignItems: 'center',
    borderWidth: 1, borderColor: '#333',
  },
  chipActive:       { backgroundColor: '#0a3a3a', borderColor: '#00E5FF' },
  chipActiveOrange: { backgroundColor: '#1a1000', borderColor: '#FF9100' },
  chipNarrow:       { paddingHorizontal: 4 },
  chipText:         { color: '#666', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  chipTextActive:   { color: '#00E5FF' },
  chipTextOrange:   { color: '#FF9100' },

  rowFields: { flexDirection: 'row', gap: 12 },
  rowField:  { flex: 1 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2a2a2a', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: '#333',
  },
  toggleLabelGroup: { gap: 2 },
  toggleLabel: { color: '#aaa', fontSize: 14, fontWeight: '600' },
  toggleSub:   { color: '#555', fontSize: 11 },

  separator: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 16 },

  error: { color: '#c0392b', fontSize: 13, textAlign: 'center', marginBottom: 16 },
  saveBtn: {
    backgroundColor: '#00E5FF', borderRadius: 14,
    padding: 16, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText:     { color: '#121212', fontSize: 16, fontWeight: '700' },
});
