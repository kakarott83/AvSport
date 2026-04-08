import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
};

// ─────────────────────────────────────────
// Screen
// ─────────────────────────────────────────

export default function ProfileScreen() {
  const [form, setForm]     = useState<ProfileForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [toast, setToast]     = useState<string | null>(null);

  function patch<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from('profiles')
        .select('display_name, gender, date_of_birth, height_cm, weight_kg, manual_calorie_offset, protein_per_kg, auto_adjust_calories')
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
          auto_adjust_calories: data.auto_adjust_calories ?? false,
        });
      }
      setLoading(false);
    })();
  }, []);

  async function handleSave() {
    setError('');
    if (!form.display_name.trim()) { setError('Bitte einen Anzeigenamen eingeben.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const offset     = parseInt(form.manual_calorie_offset, 10);
    const proteinPkg = parseFloat(form.protein_per_kg);

    const { error: dbErr } = await supabase.from('profiles').upsert(
      {
        id:                        user.id,
        display_name:              form.display_name.trim(),
        gender:                    form.gender,
        date_of_birth:             form.date_of_birth || null,
        height_cm:                 form.height_cm ? parseFloat(form.height_cm) : null,
        weight_kg:                 form.weight_kg ? parseFloat(form.weight_kg) : null,
        manual_calorie_offset:     isNaN(offset) ? 0 : offset,
        protein_per_kg:            isNaN(proteinPkg) ? 2.0 : proteinPkg,
        auto_adjust_calories:      form.auto_adjust_calories,
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
        <ActivityIndicator color="#0a7ea4" />
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
                activeOpacity={0.8}
              >
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
            Passe dein dauerhaftes Tagesziel an. Negativ zum Abnehmen (z.B. -500), positiv zum Aufbauen (z.B. +300). 0 = reiner Erhaltungsbedarf.
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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
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
  chipActive:     { backgroundColor: '#0a3a3a', borderColor: '#00E5FF' },
  chipText:       { color: '#666', fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#00E5FF' },

  rowFields: { flexDirection: 'row', gap: 12 },
  rowField:  { flex: 1 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2a2a2a', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: '#333',
  },
  toggleLabel: { color: '#aaa', fontSize: 14, fontWeight: '600' },

  error: {
    color: '#c0392b', fontSize: 13, textAlign: 'center', marginBottom: 16,
  },
  saveBtn: {
    backgroundColor: '#00E5FF', borderRadius: 14,
    padding: 16, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText:     { color: '#121212', fontSize: 16, fontWeight: '700' },
});
