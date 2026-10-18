/**
 * lib/whatsNew.ts — "Was ist neu?" nach einem Update.
 *
 * Bei JEDEM Build mit nutzerrelevanten Änderungen oben in RELEASES einen
 * Eintrag ergänzen (+ Texte in lib/i18n/translations/whatsNew.ts unter
 * releases.r<id mit _>). Das Fenster erscheint einmal pro Gerät für Nutzer,
 * deren Konto VOR `releasedAt` angelegt wurde — neue Nutzer sehen es nicht.
 */

export type WhatsNewIcon =
  | 'directions-run' | 'notifications-active' | 'auto-awesome' | 'insights' | 'visibility'
  | 'restaurant' | 'event' | 'fitness-center' | 'star';

export interface WhatsNewRelease {
  /** Eindeutige ID, z. B. "2026-10-18". */
  id: string;
  /** Zeitpunkt der Veröffentlichung (ISO) — Konten danach sehen das Fenster nicht. */
  releasedAt: string;
  /** Reihenfolge + Symbol; Texte unter whatsNew.releases.r<id>.<key>.title/text */
  items: { key: string; icon: WhatsNewIcon }[];
}

/** Neueste zuerst. */
export const RELEASES: WhatsNewRelease[] = [
  {
    id: '2026-10-18',
    releasedAt: '2026-10-18T22:00:00Z',
    items: [
      { key: 'pictograms', icon: 'directions-run' },
      { key: 'mealReminder', icon: 'notifications-active' },
      { key: 'dayLogAi', icon: 'auto-awesome' },
      { key: 'calendarTrend', icon: 'insights' },
      { key: 'passwordToggle', icon: 'visibility' },
    ],
  },
];

export const WHATS_NEW_STORAGE_KEY = 'whats_new_seen_release';

/** Schlüssel der Release-Texte in den Übersetzungen ("2026-10-18" → "r2026_10_18"). */
export function releaseTextKey(id: string): string {
  return 'r' + id.replace(/[^0-9a-zA-Z]/g, '_');
}

/**
 * Welche Release-Neuigkeiten jetzt angezeigt werden sollen (oder null).
 * - schon gesehen → null
 * - Konto erst nach dem Release angelegt → null (neue Nutzer)
 */
export function pendingRelease(
  lastSeenId: string | null,
  userCreatedAt: string | null | undefined,
  releases: WhatsNewRelease[] = RELEASES,
): WhatsNewRelease | null {
  const latest = releases[0];
  if (!latest || lastSeenId === latest.id) return null;
  if (userCreatedAt && Date.parse(userCreatedAt) >= Date.parse(latest.releasedAt)) return null;
  return latest;
}
