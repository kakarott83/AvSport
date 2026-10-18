/**
 * Leichtgewichtige i18n für AvoraSport (Deutsch / Englisch).
 *
 * - `t(key, params)` funktioniert überall (auch außerhalb von React, z.B. in
 *   Notification-Texten oder KI-Prompts) und liest die aktuell gewählte Sprache.
 * - Komponenten rufen `useTranslation()` auf, damit sie beim Sprachwechsel neu
 *   rendern.
 * - Die Wahl wird in AsyncStorage gespeichert; ohne gespeicherte Wahl gilt die
 *   Gerätesprache (Deutsch, sonst Englisch).
 *
 * Platzhalter: `{{name}}`. Plural: existiert `<key>_one` und ist
 * `params.count === 1`, wird diese Variante verwendet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { dictionaries, type Dictionary } from './translations';

export type Language = 'de' | 'en';
export const LANGUAGES: Language[] = ['de', 'en'];

/** Name jeder Sprache in ihrer eigenen Sprache (für die Auswahl). */
export const LANGUAGE_NAMES: Record<Language, string> = {
  de: 'Deutsch',
  en: 'English',
};

const STORAGE_KEY = 'app_language';

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | readonly string[]
    ? `${P}${K}`
    : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<Dictionary>;
export type TranslationParams = Record<string, string | number>;

function detectDeviceLanguage(): Language {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    return locale.toLowerCase().startsWith('de') ? 'de' : 'en';
  } catch {
    return 'de';
  }
}

let current: Language = detectDeviceLanguage();
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

/** BCP-47-Locale für Datums- und Zahlenformatierung. */
export function getLocale(lang: Language = current): string {
  return lang === 'de' ? 'de-DE' : 'en-GB';
}

export function setLanguage(lang: Language, options: { persist?: boolean } = {}): void {
  if (!LANGUAGES.includes(lang)) return;
  const changed = lang !== current;
  current = lang;
  if (options.persist !== false) {
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
  }
  if (changed) listeners.forEach((l) => l());
}

/** Lädt die gespeicherte Sprachwahl (einmal beim App-Start). */
export async function loadStoredLanguage(): Promise<Language> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'de' || stored === 'en') setLanguage(stored, { persist: false });
  } catch {
    // Gerätesprache bleibt aktiv
  }
  return current;
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function lookup(lang: Language, key: string): unknown {
  let node: unknown = dictionaries[lang];
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function resolve(key: string, params?: TranslationParams): string {
  if (params && params.count === 1) {
    const one = lookup(current, `${key}_one`) ?? lookup('de', `${key}_one`);
    if (typeof one === 'string') return one;
  }
  const value = lookup(current, key) ?? lookup('de', key);
  return typeof value === 'string' ? value : key;
}

export function t(key: TranslationKey, params?: TranslationParams): string {
  const text = resolve(key, params);
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    params[name] != null ? String(params[name]) : match,
  );
}

/** Für Einträge, die als Liste hinterlegt sind (z.B. Monatsnamen). */
export function tList(key: TranslationKey): string[] {
  const value = lookup(current, key) ?? lookup('de', key);
  return Array.isArray(value) ? (value as string[]) : [];
}

/** Zahl im Format der aktuellen Sprache (z.B. 10.000 vs. 10,000). */
export function formatNumber(n: number, options?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(getLocale(), options);
}

export function useTranslation() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
  return { t, tList, language, locale: getLocale(language), setLanguage };
}
