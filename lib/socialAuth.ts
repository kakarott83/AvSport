/**
 * lib/socialAuth.ts
 *
 * - Google:  Supabase-OAuth-Flow im Browser (signInWithOAuth + PKCE +
 *            WebBrowser.openAuthSessionAsync + exchangeCodeForSession).
 *            Konfiguration liegt vollständig im Supabase-Dashboard
 *            (Authentication → Providers → Google) — kein natives SDK,
 *            keine Client-IDs in der App.
 * - Apple:   expo-apple-authentication + signInWithIdToken (nur iOS 13+),
 *            unverändert nativ.
 *
 * Bei Erfolg entsteht eine Supabase-Session; das Routing übernimmt
 * `app/(app)/_layout.tsx` (neue Nutzer → Onboarding).
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { getAuthErrorMessage } from '@/lib/authErrors';
import { supabase } from '@/services/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────

export type SocialAuthResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

// ─── Google (Supabase-OAuth im Browser) ──────────────────────────────────────

/** Deep-Link, auf den Google/Supabase nach der Anmeldung zurückspringt. */
function googleRedirectUri(): string {
  // Standalone/Dev-Client → "avorasport://auth-callback"
  return Linking.createURL('auth-callback');
}

export async function signInWithGoogle(): Promise<SocialAuthResult> {
  try {
    const redirectTo = googleRedirectUri();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });

    if (error || !data?.url) {
      return {
        ok: false,
        cancelled: false,
        message: getAuthErrorMessage(error?.message ?? 'Google-Login konnte nicht gestartet werden.'),
      };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) {
      return { ok: false, cancelled: true }; // Nutzer hat den Browser geschlossen
    }

    const { queryParams } = Linking.parse(result.url);
    const code = typeof queryParams?.code === 'string' ? queryParams.code : null;

    if (!code) {
      const desc = typeof queryParams?.error_description === 'string'
        ? decodeURIComponent(queryParams.error_description)
        : null;
      return {
        ok: false,
        cancelled: false,
        message: desc ?? 'Google hat keinen Anmelde-Code zurückgegeben.',
      };
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return { ok: false, cancelled: false, message: getAuthErrorMessage(exchangeError.message) };
    }

    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      cancelled: false,
      message: err instanceof Error ? getAuthErrorMessage(err.message) : 'Google-Login fehlgeschlagen.',
    };
  }
}

// ─── Apple (nur iOS) ─────────────────────────────────────────────────────────

export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<SocialAuthResult> {
  try {
    // Nonce gegen Replay-Angriffe: Apple bekommt den SHA-256-Hash, Supabase den Rohwert.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return { ok: false, cancelled: false, message: 'Apple hat kein Identity-Token geliefert.' };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) return { ok: false, cancelled: false, message: error.message };

    // Apple gibt den Namen NUR beim allerersten Login preis → sofort sichern.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (fullName && data.user) {
      try {
        await supabase.auth.updateUser({ data: { full_name: fullName } });
      } catch {
        /* nicht kritisch */
      }
    }

    return { ok: true };
  } catch (err: unknown) {
    // Nutzer hat den Apple-Dialog abgebrochen
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ERR_REQUEST_CANCELED') {
      return { ok: false, cancelled: true };
    }
    return {
      ok: false,
      cancelled: false,
      message: err instanceof Error ? err.message : 'Apple-Login fehlgeschlagen.',
    };
  }
}
