import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AnimatedLogo } from '@/components/AnimatedLogo';
import { FeedbackFab } from '@/components/FeedbackFab';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/services/supabaseClient';

export default function AppLayout() {
  const router = useRouter();
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setReady(true); return; }

      supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data?.display_name) {
            router.replace('/onboarding');
          } else {
            setReady(true);
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
    <Stack>
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
