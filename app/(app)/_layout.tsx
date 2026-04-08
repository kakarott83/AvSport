import { Stack } from 'expo-router';

export default function AppLayout() {
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
        name="profile"
        options={{
          title: 'Mein Profil',
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
