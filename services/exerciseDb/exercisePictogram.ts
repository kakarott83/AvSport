/**
 * services/exerciseDb/exercisePictogram.ts
 *
 * Holt die URL des KI-Piktogramms zu einer Übung von der Edge Function
 * `exercise-pictogram` (erzeugt es beim allerersten Abruf einmalig für alle
 * Nutzer). URLs werden pro Übung in AsyncStorage gemerkt, damit spätere
 * Aufrufe ohne Netzwerkanfrage auskommen. Fehler → null (UI blendet aus).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/services/supabaseClient';

const CACHE_PREFIX = 'exercise-pictogram:v1:';
const memory = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(nameEn?: string | null, nameDe?: string | null): string {
  return (nameEn || nameDe || '').trim().toLowerCase();
}

export async function fetchExercisePictogram(
  nameEn?: string | null,
  nameDe?: string | null,
): Promise<string | null> {
  const key = cacheKey(nameEn, nameDe);
  if (!key) return null;
  if (memory.has(key)) return memory.get(key)!;
  if (inflight.has(key)) return inflight.get(key)!;

  const task = (async () => {
    try {
      const stored = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (stored) { memory.set(key, stored); return stored; }

      const { data, error } = await supabase.functions.invoke('exercise-pictogram', {
        body: { nameEn: nameEn ?? undefined, nameDe: nameDe ?? undefined },
      });
      const url = !error && data && typeof data.url === 'string' ? data.url : null;
      if (url) {
        memory.set(key, url);
        await AsyncStorage.setItem(CACHE_PREFIX + key, url).catch(() => {});
      }
      return url;
    } catch (err) {
      console.warn('[ExercisePictogram] Laden fehlgeschlagen:', err);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}
