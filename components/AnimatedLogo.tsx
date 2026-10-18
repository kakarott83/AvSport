import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

interface Props {
  size?: number;
}

/**
 * Lade-Logo mit Drehung um die senkrechte Achse ("Münzwurf").
 *
 * Bewusst kein 3D-rotateY: Ohne perspective schneidet React Native dabei eine
 * Bildhälfte ab, mit perspective wird die zum Betrachter gedrehte Seite größer
 * als die abgewandte — das Logo wirkt links/rechts ungleich. Stattdessen wird
 * scaleX entlang einer Kosinuskurve von 1 über 0 auf −1 (gespiegelt) und
 * zurück animiert: optisch dieselbe Drehung, aber exakt symmetrisch.
 */
const STEPS = 32;
const INPUT = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
const SCALE_X = INPUT.map((t) => Math.cos(2 * Math.PI * t));

export function AnimatedLogo({ size = 80 }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [progress]);

  const scaleX = progress.interpolate({ inputRange: INPUT, outputRange: SCALE_X });

  return (
    <Animated.Image
      source={require('@/assets/images/Avora_Sport_Logo.png')}
      style={{
        width: size,
        height: size,
        transform: [{ scaleX }],
      }}
      resizeMode="contain"
    />
  );
}
