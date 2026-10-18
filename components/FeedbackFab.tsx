/**
 * components/FeedbackFab.tsx
 *
 * Kleiner schwebender Button, der auf jedem Screen das Feedback-Formular
 * öffnet (Testphase, Schalter: FEEDBACK_BUTTON_ENABLED in lib/feedback.ts).
 * Lange drücken blendet ihn bis zum nächsten App-Start aus.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FEEDBACK_BUTTON_ENABLED } from '@/lib/feedback';
import { useTranslation } from '@/lib/i18n';

/** Screens, auf denen der Button stören würde. */
const HIDDEN_ON = ['/feedback', '/paywall', '/active-workout'];

// Über Navigationen hinweg merken, aber nicht dauerhaft speichern.
let hiddenForSession = false;

export function FeedbackFab() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(hiddenForSession);

  if (!FEEDBACK_BUTTON_ENABLED || hidden || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <TouchableOpacity
      style={[styles.fab, { bottom: insets.bottom + 64 }]}
      onPress={() => router.push('/feedback')}
      onLongPress={() => { hiddenForSession = true; setHidden(true); }}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t('profile.menu.feedback')}
      accessibilityHint={t('feedback.fabHint')}
    >
      <MaterialIcons name="chat-bubble-outline" size={18} color="#00E5FF" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(18,18,18,0.85)',
    borderWidth: 1,
    borderColor: '#00E5FF66',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
