import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '@/services/supabaseClient';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!email.trim() || !password) {
      Alert.alert('Pflichtfelder', 'Bitte E-Mail und Passwort eingeben.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwörter stimmen nicht überein', 'Bitte beide Felder prüfen.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Passwort zu kurz', 'Mindestens 6 Zeichen erforderlich.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Registrierung fehlgeschlagen', error.message);
    } else {
      router.replace('/(auth)/login');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>AvoraSport</Text>
          <Text style={styles.tagline}>Starte deine Fitness-Reise</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Konto erstellen</Text>

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
            placeholder="Mindestens 6 Zeichen"
            placeholderTextColor="#555"
            secureTextEntry
            returnKeyType="next"
          />

          <Text style={[styles.label, styles.labelSpacing]}>Passwort bestätigen</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="••••••••"
            placeholderTextColor="#555"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Registrieren</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Bereits ein Konto? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.footerLink}>Anmelden</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#121212',
  },
  container: {
    flexGrow: 1,
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
});
