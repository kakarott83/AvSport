import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { AnimatedLogo } from '@/components/AnimatedLogo';
import { FeedbackFab } from '@/components/FeedbackFab';
import { useTranslation } from '@/lib/i18n';
import { sanitizeMealReminderSettings } from '@/lib/mealReminder';
import { MEAL_REMINDER_TAG, syncMealReminder } from '@/services/notifications/mealReminderService';
import { supabase } from '@/services/supabaseClient';

export default function AppLayout() {
  const router = useRouter();
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  // Tippen auf die Mahlzeiten-Erinnerung (auch beim Kaltstart) → "Tag erfassen"
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponse = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !lastResponse) return;
    const { request } = lastResponse.notification;
    if (request.content.data?.tag !== MEAL_REMINDER_TAG) return;
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    if (handledResponse.current === request.identifier + lastResponse.notification.date) return;
    handledResponse.current = request.identifier + lastResponse.notification.date;
    router.push({ pathname: '/(app)/(tabs)/nutrition', params: { dayLog: String(Date.now()) } });
  }, [ready, lastResponse]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setReady(true); return; }

      supabase
        .from('profiles')
        .select('display_name, meal_reminder_enabled, meal_reminder_hour, meal_reminder_minute')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data?.display_name) {
            router.replace('/onboarding');
          } else {
            setReady(true);
            // Erinnerung nach Neuinstallation / auf neuem Gerät wieder einplanen
            void syncMealReminder(sanitizeMealReminderSettings({
              enabled: data.meal_reminder_enabled,
              hour:    data.meal_reminder_hour,
              minute:  data.meal_reminder_minute,
            }));
          }
        })
        .catch(() => setReady(true));
    });
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
        <AnimatedLogo size={120} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
    {/* iOS zeigt sonst den Routennamen "(tabs)" als Zurück-Text */}
    <Stack screenOptions={{ headerBackTitle: t('common.back') }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="body-stats"
        options={{
          title: t('nav.screens.bodyStats'),
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="active-workout"
        options={{
          title: t('nav.screens.activeWorkout'),
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="create-plan"
        options={{
          title: t('nav.screens.createPlan'),
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="workout-plans"
        options={{
          title: t('nav.screens.workoutPlans'),
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="legal"
        options={{
          title: t('nav.screens.legal'),
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="features"
        options={{
          title: t('nav.screens.features'),
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="feedback"
        options={{
          title: t('nav.screens.feedback'),
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="paywall"
        options={{
          presentation: 'modal',
          title: t('nav.screens.paywall'),
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
    </Stack>
    {/* Testphase: Feedback von jedem Screen aus (FEEDBACK_BUTTON_ENABLED) */}
    <FeedbackFab />
    </View>
  );
}
