/**
 * lib/feedback.ts
 *
 * Schickt Nutzer-Feedback an die Edge Function `send-feedback` (speichert es
 * dort + mailt es an den Support). Der Access-Token wird von
 * `supabase.functions.invoke` automatisch mitgesendet.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/services/supabaseClient';

export type FeedbackResult =
  | { ok: true; emailed: boolean }
  | { ok: false; message: string };

export const FEEDBACK_MAX_LENGTH = 5000;

export async function sendFeedback(input: {
  subject: string;
  message: string;
}): Promise<FeedbackResult> {
  const message = input.message.trim();
  if (!message) return { ok: false, message: 'Bitte gib dein Feedback ein.' };
  if (message.length > FEEDBACK_MAX_LENGTH) {
    return { ok: false, message: `Feedback ist zu lang (max. ${FEEDBACK_MAX_LENGTH} Zeichen).` };
  }

  const { data, error } = await supabase.functions.invoke('send-feedback', {
    body: {
      subject: input.subject.trim(),
      message,
      appVersion: Constants.expoConfig?.version ?? null,
      platform: Platform.OS,
    },
  });

  if (error) {
    return { ok: false, message: 'Senden fehlgeschlagen. Bitte prüfe deine Internetverbindung.' };
  }
  if (data && typeof data === 'object' && 'ok' in data && data.ok) {
    return { ok: true, emailed: !!(data as { emailed?: boolean }).emailed };
  }
  return {
    ok: false,
    message: (data as { error?: string })?.error ?? 'Senden fehlgeschlagen.',
  };
}
