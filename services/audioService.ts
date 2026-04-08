/**
 * audioService.ts
 *
 * Beep + Haptic feedback for timer events.
 *
 * Setup:
 *   1. npx expo install expo-av
 *   2. Add a short beep sound to assets/sounds/beep.mp3
 *
 * Falls expo-av is not yet installed or the sound file is missing,
 * the function silently falls back to Vibration only.
 */

import * as Haptics from 'expo-haptics';
import { Vibration } from 'react-native';

// Lazy-load expo-av so the app doesn't crash if it isn't installed yet.
let _soundPromise: Promise<any> | null = null;

async function getSound(): Promise<any | null> {
  if (_soundPromise) return _soundPromise;
  _soundPromise = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Audio } = require('expo-av') as typeof import('expo-av');
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../assets/sounds/beep.mp3'),
      );
      return sound;
    } catch {
      // expo-av not installed or sound file missing — fall back to Vibration
      return null;
    }
  })();
  return _soundPromise;
}

/**
 * Plays a short beep and triggers haptic feedback.
 * Call when a countdown or rest timer reaches zero.
 */
export async function playBeep(): Promise<void> {
  // Haptic fires immediately, no await needed
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

  const sound = await getSound();
  if (!sound) {
    // Fallback: double-vibrate
    Vibration.vibrate([0, 120, 80, 120]);
    return;
  }
  try {
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    Vibration.vibrate([0, 120, 80, 120]);
  }
}
