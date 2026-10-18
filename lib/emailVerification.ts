/**
 * lib/emailVerification.ts
 *
 * E-Mail-Bestätigung nach der Registrierung mit Code statt Link: Die Vorlage
 * "Confirm signup" enthält {{ .Token }}, der Code wird in der App eingegeben
 * (app/(auth)/verify-email.tsx). Ein Link würde auf die Site-URL führen und
 * müsste die App auf demselben Gerät öffnen.
 *
 * Voraussetzung: Supabase → Authentication → Email → "Confirm email" an.
 */

import { getAuthErrorMessage } from '@/lib/authErrors';
import { normalizeCode } from '@/lib/passwordReset';
import { supabase } from '@/services/supabaseClient';

/** Login mit noch nicht bestätigter E-Mail-Adresse? */
export function isEmailNotConfirmedError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message ?? '');
}

/** Prüft den Code; bei Erfolg entsteht eine Session (Routing übernimmt app/_layout.tsx). */
export async function verifySignupCode(email: string, code: string): Promise<{ ok: true } | { ok: false }> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: normalizeCode(code),
    type: 'email',
  });
  return error ? { ok: false } : { ok: true };
}

export async function resendSignupCode(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
  return error ? { ok: false, message: getAuthErrorMessage(error.message) } : { ok: true };
}
