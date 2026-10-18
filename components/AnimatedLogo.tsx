import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

interface Props {
  size?: number;
}

export function AnimatedLogo({ size = 80 }: Props) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [rotation]);

  const rotateY = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.Image
      source={require('@/assets/images/Avora_Sport_Logo.png')}
      style={{
        width: size,
        height: size,
        // perspective muss VOR rotateY stehen — ohne sie schneidet React Native
        // (v. a. New Architecture) bei der 3D-Drehung eine Bildhälfte ab.
        transform: [{ perspective: 1000 }, { rotateY }],
      }}
      resizeMode="contain"
    />
  );
}
