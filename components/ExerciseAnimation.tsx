/**
 * components/ExerciseAnimation.tsx
 *
 * Zeigt die Bewegung einer Übung als simples "Mini-Video": die zwei
 * Positions-Frames aus der free-exercise-db (Start ↔ Ende) werden per
 * Crossfade in einer Schleife durchgewechselt. Bei nur einem Frame ein
 * statisches Bild, bei keinem nichts.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

const HOLD_MS = 900; // wie lange jede Position steht
const FADE_MS = 350; // Übergangsdauer

export function ExerciseAnimation({ frames }: { frames: string[] }) {
  const t = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(frames.length < 2);

  // Beide Frames vorladen, damit der erste Wechsel nicht flackert.
  useEffect(() => {
    if (frames.length < 2) return;
    let active = true;
    Promise.all(frames.map((f) => Image.prefetch(f).catch(() => false))).then(() => {
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, [frames]);

  useEffect(() => {
    if (frames.length < 2 || !ready) return;
    let target = 1;
    const step = () => {
      Animated.timing(t, { toValue: target, duration: FADE_MS, useNativeDriver: true }).start();
      target = target === 1 ? 0 : 1;
    };
    step();
    const id = setInterval(step, HOLD_MS);
    return () => clearInterval(id);
  }, [frames, ready, t]);

  if (frames.length === 0) return null;

  if (frames.length === 1) {
    return <Image source={{ uri: frames[0] }} style={styles.box} resizeMode="contain" />;
  }

  return (
    <Animated.View style={styles.box}>
      <Animated.Image
        source={{ uri: frames[0] }}
        resizeMode="contain"
        style={[styles.layer, { opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
      />
      <Animated.Image
        source={{ uri: frames[1] }}
        resizeMode="contain"
        style={[styles.layer, { opacity: t }]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    height: 190,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
});
