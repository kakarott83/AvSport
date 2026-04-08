import type { Session } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";

import { supabase } from "@/services/supabaseClient";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Initiale Session laden
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("Initial session:", session?.user?.email ?? "keine");
      setSession(session);
    });

    // Live-Updates bei Login / Logout
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event, session?.user?.email ?? "kein User");
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return; // noch am Laden

    const inAuthGroup = segments[0] === "(auth)";
    console.log(
      "Redirect check — inAuthGroup:",
      inAuthGroup,
      "| session:",
      !!session,
    );

    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/(app)/(tabs)");
    }
  }, [session, segments]);

  return (
    <>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
