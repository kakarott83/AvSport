/**
 * lib/socialAuth.ts
 *
 * Native Google-/Apple-Anmeldung über Supabase `signInWithIdToken`.
 *
 * - Google:  @react-native-google-signin/google-signin  (Android + iOS)
 * - Apple:   expo-apple-authentication                    (nur iOS 13+)
 *
 * Voraussetzungen (siehe .env + docs):
 *   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID   – OAuth-Client "Web" aus Google Cloud
 *   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID   – OAuth-Client "iOS" (nur iOS)
 *   Supabase-Dashboard: Provider Google + Apple aktiviert.
 *
 * Bei Erfolg entsteht eine Supabase-Session; das Routing übernimmt
 * `app/(app)/_layout.tsx` (neue Nutzer → Onboarding).
 */

import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { supabase } from '@/services/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────

export type SocialAuthResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

// ─── Google ──────────────────────────────────────────────────────────────────

let googleConfigured = false;

function configureGoogle() {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    scopes: ['openid', 'email', 'profile'],
  });
  googleConfigured = true;
}

export function isGoogleConfigured(): boolean {
  return GOOGLE_WEB_CLIENT_ID.length > 0;
}

export async function signInWithGoogle(): Promise<SocialAuthResult> {
  if (!isGoogleConfigured()) {
    return {
      ok: false,
      cancelled: false,
      message: 'Google-Login ist noch nicht eingerichtet (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID fehlt).',
    };
  }

  try {
    configureGoogle();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      return { ok: false, cancelled: true }; // Nutzer hat abgebrochen
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      return { ok: false, cancelled: false, message: 'Google hat kein ID-Token geliefert.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) return { ok: false, cancelled: false, message: error.message };

    return { ok: true };
  } catch (err: unknown) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return { ok: false, cancelled: true };
      if (err.code === statusCodes.IN_PROGRESS) return { ok: false, cancelled: true };
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { ok: false, cancelled: false, message: 'Google Play-Dienste sind nicht verfügbar.' };
      }
    }
    return {
      ok: false,
      cancelled: false,
      message: err instanceof Error ? err.message : 'Google-Login fehlgeschlagen.',
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
