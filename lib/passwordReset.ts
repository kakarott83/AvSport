/**
 * lib/passwordReset.ts
 *
 * "Passwort vergessen" mit Code statt Link: Supabase schickt per Mail einen
 * Einmal-Code ({{ .Token }} in der Vorlage "Reset Password"), der in der App
 * eingegeben wird. Funktioniert auch, wenn die Mail am PC gelesen wird — ein
 * Deep-Link müsste dagegen die App auf demselben Gerät öffnen.
 */

import { getAuthErrorMessage } from '@/lib/authErrors';
import { supabase } from '@/services/supabaseClient';

export const MIN_PASSWORD_LENGTH = 6;

export type PasswordProblem = 'tooShort' | 'mismatch' | null;

/** Gleiche Regeln wie bei der Registrierung. */
export function validateNewPassword(password: string, confirm: string): PasswordProblem {
  if (password.length < MIN_PASSWORD_LENGTH) return 'tooShort';
  if (password !== confirm) return 'mismatch';
  return null;
}

/** Nur Ziffern, Leerzeichen/Bindestriche aus kopierten Codes entfernen. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 10);
}

export async function requestPasswordReset(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  return error ? { ok: false, message: getAuthErrorMessage(error.message) } : { ok: true };
}

export type ResetResult =
  | { ok: true }
  | { ok: false; reason: 'invalidCode' }
  | { ok: false; reason: 'update'; message: string };

/**
 * Prüft den Code (meldet den Nutzer dabei an) und setzt das neue Passwort.
 * `alreadyVerified`: Code wurde schon bestätigt, nur das Passwort-Update
 * schlug fehl (z. B. gleiches Passwort wie vorher) → Code nicht erneut prüfen,
 * er ist bereits verbraucht.
 */
export async function completePasswordReset(input: {
  email: string;
  code: string;
  password: string;
  alreadyVerified: boolean;
}): Promise<ResetResult> {
  if (!input.alreadyVerified) {
    const { error } = await supabase.auth.verifyOtp({
      email: input.email.trim(),
      token: normalizeCode(input.code),
      type: 'recovery',
    });
    if (error) return { ok: false, reason: 'invalidCode' };
  }

  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) return { ok: false, reason: 'update', message: getAuthErrorMessage(error.message) };
  return { ok: true };
}
