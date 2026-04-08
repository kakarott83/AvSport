import { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

/** YYYY-MM-DD → { day, month, year } */
function isoToParts(iso: string): { day: string; month: string; year: string } {
  const [y, m, d] = iso.split('-');
  return { day: d ?? '', month: m ?? '', year: y ?? '' };
}

/** { day, month, year } → YYYY-MM-DD (oder '' wenn ungültig) */
function partsToIso(day: string, month: string, year: string): string {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (
    isNaN(d) || isNaN(m) || isNaN(y) ||
    d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2100
  ) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** YYYY-MM-DD → dd.mm.yyyy */
export function isoToGerman(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// ─────────────────────────────────────────
// Komponente
// ─────────────────────────────────────────

type Props = {
  value: string;       // YYYY-MM-DD
  onChange: (v: string) => void;
  label?: string;
};

export function DatePickerInput({ value, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const parts = isoToParts(value);
  const [day, setDay] = useState(parts.day);
  const [month, setMonth] = useState(parts.month);
  const [year, setYear] = useState(parts.year);
  const [error, setError] = useState('');

  function openModal() {
    const p = isoToParts(value);
    setDay(p.day);
    setMonth(p.month);
    setYear(p.year);
    setError('');
    setOpen(true);
  }

  function handleConfirm() {
    const iso = partsToIso(day, month, year);
    if (!iso) {
      setError('Bitte ein gültiges Datum eingeben (TT MM JJJJ).');
      return;
    }
    onChange(iso);
    setOpen(false);
  }

  function handleCancel() {
    setOpen(false);
    setError('');
  }

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={openModal} activeOpacity={0.8}>
        <Text style={styles.triggerText}>
          {value ? isoToGerman(value) : 'Datum wählen'}
        </Text>
        <Text style={styles.triggerIcon}>📅</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleCancel}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleCancel}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label ?? 'Datum wählen'}</Text>

            <View style={styles.fieldsRow}>
              {/* Tag */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Tag</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={day}
                  onChangeText={(v) => setDay(v.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="TT"
                  placeholderTextColor="#555"
                  textAlign="center"
                />
              </View>

              <Text style={styles.dot}>.</Text>

              {/* Monat */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Monat</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={month}
                  onChangeText={(v) => setMonth(v.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="MM"
                  placeholderTextColor="#555"
                  textAlign="center"
                />
              </View>

              <Text style={styles.dot}>.</Text>

              {/* Jahr */}
              <View style={[styles.fieldWrap, styles.fieldWrapYear]}>
                <Text style={styles.fieldLabel}>Jahr</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={year}
                  onChangeText={(v) => setYear(v.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="JJJJ"
                  placeholderTextColor="#555"
                  textAlign="center"
                />
              </View>
            </View>

            {/* Schnell-Buttons */}
            <View style={styles.quickRow}>
              {[
                { label: 'Heute', offset: 0 },
                { label: 'Gestern', offset: -1 },
                { label: 'Vorgestern', offset: -2 },
              ].map(({ label: l, offset }) => {
                const d = new Date(Date.now() + offset * 86400000);
                return (
                  <TouchableOpacity
                    key={l}
                    style={styles.quickChip}
                    onPress={() => {
                      setDay(String(d.getDate()).padStart(2, '0'));
                      setMonth(String(d.getMonth() + 1).padStart(2, '0'));
                      setYear(String(d.getFullYear()));
                      setError('');
                    }}
                  >
                    <Text style={styles.quickChipText}>{l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                <Text style={styles.confirmBtnText}>Übernehmen</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
  },
  triggerText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  triggerIcon: { fontSize: 16 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },

  fieldsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 16,
  },
  fieldWrap: { alignItems: 'center', width: 58 },
  fieldWrapYear: { width: 82 },
  fieldLabel: {
    color: '#666',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0a7ea4',
    padding: 12,
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    width: '100%',
  },
  dot: { color: '#555', fontSize: 22, fontWeight: '700', marginBottom: 12 },

  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  quickChipText: { color: '#aaa', fontSize: 12, fontWeight: '600' },

  error: {
    color: '#c0392b',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },

  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#888', fontSize: 15, fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#0a7ea4',
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
