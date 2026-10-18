/**
 * components/ExercisePictogram.tsx
 *
 * Zeigt das KI-Piktogramm zur Ausführung einer Übung (Start → Endposition).
 * Beim allerersten Abruf einer Übung wird es serverseitig erzeugt (einige
 * Sekunden) — währenddessen ein Platzhalter. Kein Bild → nichts anzeigen.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';
import { fetchExercisePictogram } from '@/services/exerciseDb/exercisePictogram';

export function ExercisePictogram({
  nameEn,
  nameDe,
  maxSize = 260,
}: {
  nameEn?: string | null;
  nameDe?: string | null;
  maxSize?: number;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    if (!nameEn && !nameDe) return;
    setLoading(true);
    fetchExercisePictogram(nameEn, nameDe).then((u) => {
      if (cancelled) return;
      setUrl(u);
      setFailed(!u);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [nameEn, nameDe]);

  if (failed || (!loading && !url)) return null;

  return (
    <View style={[styles.box, { maxWidth: maxSize }]}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel={t('workout.pictogramA11y', { name: nameDe || nameEn || '' })}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.placeholder}>
          <ActivityIndicator color="#00E5FF" />
          <Text style={styles.placeholderText}>{t('workout.pictogramLoading')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    aspectRatio: 1,
    alignSelf: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 },
  placeholderText: { color: '#777', fontSize: 12, textAlign: 'center' },
});
