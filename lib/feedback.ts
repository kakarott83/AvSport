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
import { t } from '@/lib/i18n';

export type FeedbackResult =
  | { ok: true; emailed: boolean }
  | { ok: false; message: string };

export const FEEDBACK_MAX_LENGTH = 5000;

/**
 * Schwebender Feedback-Button auf allen Screens (components/FeedbackFab.tsx)
 * für die Testphase. Vor dem öffentlichen Store-Release auf `false` setzen —
 * "Profil → Feedback geben" bleibt davon unberührt.
 */
export const FEEDBACK_BUTTON_ENABLED = true;

export async function sendFeedback(input: {
  subject: string;
  message: string;
}): Promise<FeedbackResult> {
  const message = input.message.trim();
  if (!message) return { ok: false, message: t('domain.feedback.empty') };
  if (message.length > FEEDBACK_MAX_LENGTH) {
    return { ok: false, message: t('domain.feedback.tooLong', { max: FEEDBACK_MAX_LENGTH }) };
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
    return { ok: false, message: t('domain.feedback.network') };
  }
  if (data && typeof data === 'object' && 'ok' in data && data.ok) {
    return { ok: true, emailed: !!(data as { emailed?: boolean }).emailed };
  }
  return {
    ok: false,
    message: (data as { error?: string })?.error ?? t('domain.feedback.failed'),
  };
}
