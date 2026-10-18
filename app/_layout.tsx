import type { Session } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { AnimatedLogo } from "@/components/AnimatedLogo";
import { PremiumProvider } from "@/hooks/usePremium";
import { loadStoredLanguage, useTranslation } from "@/lib/i18n";
import { configurePurchases, identifyUser, resetUser } from "@/lib/purchases";
import { supabase } from "@/services/supabaseClient";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [languageReady, setLanguageReady] = useState(false);
  // Abonniert die Sprache, damit der Root-Baum beim Wechsel neu rendert.
  useTranslation();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    loadStoredLanguage().finally(() => setLanguageReady(true));
  }, []);

  useEffect(() => {
    configurePurchases();

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        if (session?.user) void identifyUser(session.user.id);
      })
      .catch(() => setSession(null));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        void identifyUser(session.user.id);
      } else if (event === "SIGNED_OUT") {
        void resetUser();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined || !languageReady) return;

    const inAuthGroup = segments[0] === "(auth)";
    // Passwort-Reset: der Code meldet an, bevor das neue Passwort gesetzt ist —
    // der Screen leitet nach Erfolg selbst weiter.
    const inPasswordReset = inAuthGroup && (segments as string[])[1] === "forgot-password";
    if (inPasswordReset) return;

    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/(app)/(tabs)");
    }
  }, [session, segments, languageReady]);

  if (session === undefined || !languageReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
        <AnimatedLogo size={120} />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <PremiumProvider>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
      </Stack>
      <StatusBar style="light" />
    </PremiumProvider>
  );
}
