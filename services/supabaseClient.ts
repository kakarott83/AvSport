import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

// Nutzt die Umgebungsvariablen aus deiner .env Datei
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Session im Gerät persistieren (SecureStore-Wrapper wäre schöner, aber
    // AsyncStorage reicht und ist der von Supabase dokumentierte Standard).
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // PKCE: nötig für den Google-OAuth-Browserflow (signInWithOAuth →
    // exchangeCodeForSession) in lib/socialAuth.ts.
    flowType: "pkce",
    // In React Native gibt es keine URL, aus der eine Session automatisch
    // gelesen werden müsste – den OAuth-Rücklauf werten wir selbst aus.
    detectSessionInUrl: false,
  },
});

// Access-Token nur auffrischen, solange die App im Vordergrund ist.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
