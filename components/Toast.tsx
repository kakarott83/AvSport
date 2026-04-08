import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

type Props = {
  message: string;
  type?: 'error' | 'info' | 'success';
  duration?: number;
  onDismiss: () => void;
};

export function Toast({ message, type = 'error', duration = 3500, onDismiss }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 16, duration: 280, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onDismiss();
      });
    }, duration);

    return () => clearTimeout(timer);
  }, []);

  const bgColor =
    type === 'error' ? '#c0392b' : type === 'success' ? '#1a7a4a' : '#1e4a6e';

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: bgColor, opacity, transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    zIndex: 999,
    elevation: 8,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
});
