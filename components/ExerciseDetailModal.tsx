/**
 * components/ExerciseDetailModal.tsx
 *
 * Zeigt die KI-generierten Übungsdetails (Wirkung/Technik, Anleitung,
 * Modifikationen, Sicherheitshinweis, Tipps) in einem Bottom-Sheet-Modal.
 * Wird sowohl im aktiven Training (active-workout.tsx) als auch im
 * Plan-Editor (create-plan.tsx) verwendet.
 *
 * Ergänzend wird beim Öffnen ein passendes Übungsbild aus der offenen
 * wger.de-Datenbank nachgeladen (services/wger/exerciseImage.ts) — ohne
 * Treffer bleibt der Bildbereich einfach leer.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';

import { fetchExerciseImage } from '@/services/wger/exerciseImage';

export type ExerciseDetailData = {
  exercise_name: string;
  short?:            string | null;
  detail_markdown?:  string | null;
  instructions?:     string[] | null;
  modifications?:    { beginner: string; advanced: string } | null;
  safety?:           string | null;
  tips?:             string[] | null;
};

function stripMarkdownBold(s: string): string {
  return s.replace(/\*\*(.*?)\*\*/g, '$1');
}

export function ExerciseDetailModal({
  visible, exercise, onClose,
}: {
  visible: boolean;
  exercise: ExerciseDetailData | null;
  onClose: () => void;
}) {
  const exerciseName = exercise?.exercise_name ?? null;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    if (!visible || !exerciseName) {
      setImageUrl(null);
      setImageLoading(false);
      return;
    }

    let cancelled = false;
    setImageUrl(null);
    setImageLoading(true);

    fetchExerciseImage(exerciseName)
      .then((url) => { if (!cancelled) setImageUrl(url); })
      .finally(() => { if (!cancelled) setImageLoading(false); });

    return () => { cancelled = true; };
  }, [visible, exerciseName]);

  if (!exercise) return null;

  const blocks = (exercise.detail_markdown ?? '')
    .split('\n\n')
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{exercise.exercise_name}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {imageLoading && (
              <View style={styles.imageBox}>
                <ActivityIndicator color="#0a7ea4" />
              </View>
            )}
            {!imageLoading && !!imageUrl && (
              <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />
            )}

            {!!exercise.short && <Text style={styles.short}>{exercise.short}</Text>}

            {blocks.map((block, i) => {
              const lines = block.split('\n').filter((l) => l.trim().length > 0);
              const isBulletBlock = lines.length > 0 && lines.every((l) => l.trim().startsWith('- '));

              if (isBulletBlock) {
                return (
                  <View key={i} style={styles.bulletBlock}>
                    {lines.map((line, j) => (
                      <Text key={j} style={styles.bulletText}>
                        •  {stripMarkdownBold(line.trim().replace(/^- /, ''))}
                      </Text>
                    ))}
                  </View>
                );
              }
              return (
                <Text key={i} style={styles.paragraph}>{stripMarkdownBold(block)}</Text>
              );
            })}

            {!!exercise.instructions?.length && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Ausführung</Text>
                {exercise.instructions.map((step, i) => (
                  <Text key={i} style={styles.stepText}>{i + 1}. {step}</Text>
                ))}
              </View>
            )}

            {!!exercise.modifications && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Anpassungen</Text>
                <Text style={styles.modText}>Anfänger: {exercise.modifications.beginner}</Text>
                <Text style={styles.modText}>Fortgeschritten: {exercise.modifications.advanced}</Text>
              </View>
            )}

            {!!exercise.safety && (
              <View style={styles.safetyBox}>
                <Text style={styles.safetyText}>⚠️ {exercise.safety}</Text>
              </View>
            )}

            {!!exercise.tips?.length && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Tipps</Text>
                {exercise.tips.map((tip, i) => (
                  <Text key={i} style={styles.tipText}>•  {tip}</Text>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1a1a1a', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    maxHeight: '82%', paddingTop: 18,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
  },
  title:      { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1, marginRight: 12 },
  closeText:  { color: '#888', fontSize: 18 },
  body:       { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  image:      { width: '100%', height: 190, borderRadius: 12, backgroundColor: '#fff', marginBottom: 16 },
  imageBox: {
    width: '100%', height: 190, borderRadius: 12, backgroundColor: '#222',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  short:      { color: '#0a7ea4', fontSize: 14, fontWeight: '600', marginBottom: 14, lineHeight: 20 },
  paragraph:  { color: '#ccc', fontSize: 14, lineHeight: 21, marginBottom: 12 },
  bulletBlock: { marginBottom: 16, gap: 6 },
  bulletText:  { color: '#aaa', fontSize: 13, lineHeight: 19 },
  section:      { marginBottom: 18 },
  sectionTitle: {
    color: '#0a7ea4', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  stepText: { color: '#ccc', fontSize: 14, lineHeight: 21, marginBottom: 4 },
  modText:  { color: '#ccc', fontSize: 13, lineHeight: 20, marginBottom: 6 },
  safetyBox: {
    backgroundColor: '#2a1a1a', borderRadius: 12, borderWidth: 1, borderColor: '#c0392b',
    padding: 12, marginBottom: 18,
  },
  safetyText: { color: '#e0938a', fontSize: 13, lineHeight: 19 },
  tipText:    { color: '#ccc', fontSize: 13, lineHeight: 20, marginBottom: 4 },
});
