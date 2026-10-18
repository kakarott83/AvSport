import { t } from '@/lib/i18n';
/**
 * Pure content builder for water-reminder notifications.
 * No React, no expo-notifications import — safe to unit-test directly.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WaterNotificationType = 'reminder' | 'encouragement';

export interface WaterNotificationInput {
  remainingMl: number;
  goalMl: number;
  suggestSizesMl: number[];
}

export interface WaterNotificationContent {
  type: WaterNotificationType;
  title: string;
  body: string;
  suggestedIntakeMl: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TITLE_MAX_LEN = 40;
const REMINDER_BODY_MAX_LEN = 120;
const ENCOURAGEMENT_BODY_MAX_LEN = 80;

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Picks the largest size from `sizesMl` that still fits within `remainingMl`.
 * If none fit (all sizes exceed what's left), suggests drinking the rest.
 */
function pickSuggestedIntake(remainingMl: number, sizesMl: number[]): number {
  const fitting = sizesMl.filter((size) => size <= remainingMl);
  if (fitting.length > 0) return Math.max(...fitting);
  return remainingMl;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the notification text (current app language) for the water-reminder feature.
 *
 * - `remainingMl <= 0` → type "encouragement", short congratulation.
 * - `remainingMl > 0`  → type "reminder", action-oriented, names the
 *   largest drink size (from `suggestSizesMl`) that still fits the goal.
 *
 * No emojis, no health claims — matches the app's German, concise tone.
 */
export function buildWaterNotificationContent(
  { remainingMl, goalMl, suggestSizesMl }: WaterNotificationInput,
): WaterNotificationContent {
  if (remainingMl <= 0) {
    return {
      type: 'encouragement',
      title: truncate(t('domain.waterNotification.goalReachedTitle'), TITLE_MAX_LEN),
      body: truncate(t('domain.waterNotification.goalReachedBody', { goal: goalMl }), ENCOURAGEMENT_BODY_MAX_LEN),
      suggestedIntakeMl: 0,
    };
  }

  const suggestedIntakeMl = pickSuggestedIntake(remainingMl, suggestSizesMl);

  return {
    type: 'reminder',
    title: truncate(t('domain.waterNotification.reminderTitle'), TITLE_MAX_LEN),
    body: truncate(
      t('domain.waterNotification.reminderBody', { remaining: remainingMl, suggested: suggestedIntakeMl }),
      REMINDER_BODY_MAX_LEN,
    ),
    suggestedIntakeMl,
  };
}
