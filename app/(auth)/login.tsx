import { useRouter } from 'expo-router';
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

import { Toast } from '@/components/Toast';
import { supabase } from '@/services/supabaseClient';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(message: string) {
    setToastMessage(null);
    // kurze Verzögerung damit die Animation neu startet, falls bereits eine aktiv ist
    setTimeout(() => setToastMessage(message), 50);
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      showToast('Bitte E-Mail und Passwort eingeben.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      console.error('Login Fehler:', error);
      const isNoAccount =
        error.message.toLowerCase().includes('invalid login credentials') ||
        error.message.toLowerCase().includes('user not found');

      showToast(
        isNoAccount
          ? 'Kein Konto gefunden. Bitte zuerst registrieren.'
          : `Fehler: ${error.message}`,
      );
    } else {
      console.log('Login erfolgreich, Session:', data.session?.user?.email);
    }
    // Bei Erfolg: _layout.tsx leitet automatisch zu /(app)/(tabs) weiter
  }

  async function debugSession() {
    const { data, error } = await supabase.auth.getSession();
    console.log('=== SESSION DEBUG ===');
    console.log('Session:', JSON.stringify(data.session, null, 2));
    if (error) console.error('Session Fehler:', error);
    showToast(
      data.session
        ? `Session aktiv: ${data.session.user.email}`
        : 'Keine aktive Session gefunden.',
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo}>AvoraSport</Text>
          <Text style={styles.tagline}>Dein Fitness-Begleiter</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Willkommen zurück</Text>

          <Text style={styles.label}>E-Mail</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="deine@email.de"
            placeholderTextColor="#555"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={[styles.label, styles.labelSpacing]}>Passwort</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#555"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Anmelden</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Noch kein Konto? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.footerLink}>Registrieren</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.debugButton} onPress={debugSession}>
          <Text style={styles.debugText}>Session prüfen</Text>
        </TouchableOpacity>

        {toastMessage && (
          <Toast
            message={toastMessage}
            type="error"
            onDismiss={() => setToastMessage(null)}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#121212',
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0a7ea4',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  labelSpacing: {
    marginTop: 16,
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  button: {
    marginTop: 24,
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  footerLink: {
    color: '#0a7ea4',
    fontSize: 14,
    fontWeight: '600',
  },
  debugButton: {
    marginTop: 32,
    alignItems: 'center',
    padding: 10,
  },
  debugText: {
    color: '#444',
    fontSize: 12,
  },
});
