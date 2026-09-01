/**
 * app/(app)/feedback.tsx — "Feedback"
 *
 * Freitext-Feedback an den Support. Geht an die Edge Function `send-feedback`
 * (speichert + mailt an support@milan.mus.de). Erreichbar über Profil → Feedback.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';

import { Toast } from '@/components/Toast';
import { FEEDBACK_MAX_LENGTH, sendFeedback } from '@/lib/feedback';

export default function FeedbackScreen() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const canSend = message.trim().length > 0 && !sending;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    const res = await sendFeedback({ subject, message });
    setSending(false);

    if (res.ok) {
      setToast({ text: 'Danke für dein Feedback!', type: 'success' });
      setTimeout(() => router.back(), 1500);
    } else {
      setToast({ text: res.message, type: 'error' });
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Was gefällt dir, was fehlt, was nervt? Jede Rückmeldung hilft uns weiter.
          Bei Fehlern gerne beschreiben, was du gemacht hast.
        </Text>

        <Text style={styles.label}>Betreff (optional)</Text>
        <TextInput
          style={styles.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="z. B. Idee, Bug, Lob…"
          placeholderTextColor="#555"
          maxLength={200}
          returnKeyType="next"
        />

        <Text style={[styles.label, { marginTop: 18 }]}>Dein Feedback</Text>
        <TextInput
          style={[styles.input, styles.messageInput]}
          value={message}
          onChangeText={setMessage}
          placeholder="Schreib uns…"
          placeholderTextColor="#555"
          multiline
          textAlignVertical="top"
          maxLength={FEEDBACK_MAX_LENGTH}
        />
        <Text style={styles.counter}>{message.length} / {FEEDBACK_MAX_LENGTH}</Text>

        <TouchableOpacity
          style={[styles.button, !canSend && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.85}
        >
          {sending ? (
            <ActivityIndicator color="#121212" />
          ) : (
            <Text style={styles.buttonText}>Absenden</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>
          Deine E-Mail-Adresse wird mitgesendet, damit wir dir antworten können.
        </Text>
      </ScrollView>

      {toast && (
        <Toast
          message={toast.text}
          type={toast.type}
          duration={toast.type === 'success' ? 1400 : 2600}
          onDismiss={() => setToast(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },
  scroll: { padding: 20, paddingBottom: 48 },
  intro: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 22 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BBBBBB',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    color: '#fff',
    fontSize: 15,
    padding: 14,
  },
  messageInput: { minHeight: 160 },
  counter: { color: '#555', fontSize: 11, textAlign: 'right', marginTop: 6 },
  button: {
    marginTop: 22,
    backgroundColor: '#00E5FF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#121212', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  hint: { color: '#666', fontSize: 11, lineHeight: 16, marginTop: 16, textAlign: 'center' },
});
