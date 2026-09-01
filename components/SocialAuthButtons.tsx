/**
 * components/SocialAuthButtons.tsx
 *
 * Google- (+ auf iOS Apple-) Anmeldebuttons plus "oder"-Trenner. Wird in
 * login.tsx und register.tsx über dem E-Mail-Formular eingebunden.
 *
 * Bei Erfolg entsteht eine Supabase-Session; das Routing macht (app)/_layout.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  isAppleAuthAvailable,
  isGoogleConfigured,
  signInWithApple,
  signInWithGoogle,
  type SocialAuthResult,
} from '@/lib/socialAuth';

type Provider = 'google' | 'apple';

export function SocialAuthButtons({
  onBusyChange,
}: {
  /** Meldet dem Elternscreen, ob gerade ein Social-Login läuft (Formular sperren). */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const googleAvailable = isGoogleConfigured();

  useEffect(() => {
    isAppleAuthAvailable().then(setAppleAvailable);
  }, []);

  async function run(provider: Provider, fn: () => Promise<SocialAuthResult>) {
    setError(null);
    setBusy(provider);
    onBusyChange?.(true);
    try {
      const res = await fn();
      if (!res.ok && !res.cancelled) setError(res.message);
      // Erfolg: onAuthStateChange → (app)/_layout leitet weiter.
    } finally {
      setBusy(null);
      onBusyChange?.(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[
          styles.button,
          styles.googleButton,
          (!!busy || !googleAvailable) && styles.disabled,
        ]}
        onPress={() => run('google', signInWithGoogle)}
        disabled={!!busy || !googleAvailable}
        activeOpacity={0.85}
      >
        {busy === 'google' ? (
          <ActivityIndicator color="#1f1f1f" />
        ) : (
          <>
            <View style={styles.googleGlyph}>
              <Text style={styles.googleG}>G</Text>
            </View>
            <Text style={styles.googleText}>Mit Google fortfahren</Text>
          </>
        )}
      </TouchableOpacity>

      {appleAvailable && Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={12}
          style={styles.appleButton}
          onPress={() => run('apple', signInWithApple)}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>oder</Text>
        <View style={styles.dividerLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  disabled: { opacity: 0.4 },
  googleButton: { backgroundColor: '#fff' },
  googleGlyph: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: { color: '#4285F4', fontSize: 16, fontWeight: '900' },
  googleText: { color: '#1f1f1f', fontSize: 15, fontWeight: '700' },
  appleButton: { height: 48, marginBottom: 10 },
  error: { color: '#e0938a', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#333' },
  dividerText: { color: '#666', fontSize: 12, fontWeight: '600' },
});
