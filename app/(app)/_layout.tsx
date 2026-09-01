import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AnimatedLogo } from '@/components/AnimatedLogo';
import { supabase } from '@/services/supabaseClient';

export default function AppLayout() {
  const router = useRouter();
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
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="body-stats"
        options={{
          title: 'Körperwerte',
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="active-workout"
        options={{
          title: 'Training',
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="create-plan"
        options={{
          title: 'Trainingsplan',
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="workout-plans"
        options={{
          title: 'Trainingspläne',
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="legal"
        options={{
          title: 'Rechtliches',
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="feedback"
        options={{
          title: 'Feedback',
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
