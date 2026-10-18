/**
 * app/(auth)/verify-email.tsx — "E-Mail bestätigen"
 *
 * Nach der Registrierung (oder einem Login mit unbestätigter Adresse) den
 * Code aus der Bestätigungs-Mail eingeben. Bei Erfolg entsteht eine Session;
 * app/_layout.tsx leitet dann automatisch in die App (bzw. ins Onboarding).
 * Logik: lib/emailVerification.ts.
 *
 * Params: email, resend=1 → beim Öffnen sofort einen neuen Code anfordern
 * (Login mit unbestätigter Adresse verschickt selbst keine Mail).
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Toast } from "@/components/Toast";
import { resendSignupCode, verifySignupCode } from "@/lib/emailVerification";
import { useTranslation } from "@/lib/i18n";
import { normalizeCode } from "@/lib/passwordReset";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ email?: string; resend?: string }>();
  const email = typeof params.email === "string" ? params.email : "";

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "error" | "success" | "info" } | null>(null);
  const resentOnOpen = useRef(false);

  function showToast(text: string, type: "error" | "success" | "info" = "error") {
    setToast(null);
    setTimeout(() => setToast({ text, type }), 50);
  }

  async function resend(message: string) {
    setLoading(true);
    const res = await resendSignupCode(email);
    setLoading(false);
    showToast(res.ok ? message : res.message, res.ok ? "info" : "error");
  }

  useEffect(() => {
    if (params.resend === "1" && email && !resentOnOpen.current) {
      resentOnOpen.current = true;
      void resend(t("auth.verify.notConfirmed"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (normalizeCode(code).length < 6) {
      showToast(t("auth.verify.enterCode"));
      return;
    }
    setLoading(true);
    const res = await verifySignupCode(email, code);
    setLoading(false);
    if (!res.ok) showToast(t("auth.verify.invalidCode"));
    // Erfolg: Session ist aktiv → app/_layout.tsx übernimmt die Weiterleitung
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>AvoraSport</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t("auth.verify.title")}</Text>
          <Text style={styles.intro}>{t("auth.verify.intro", { email })}</Text>

          <Text style={styles.label}>{t("auth.verify.code")}</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={(v) => setCode(normalizeCode(v))}
            placeholder="123456"
            placeholderTextColor="#555"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={submit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t("auth.verify.submit")}</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resend}
            onPress={() => resend(t("auth.verify.resent"))}
            disabled={loading || !email}
          >
            <Text style={styles.link}>{t("auth.verify.resend")}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.back} onPress={() => router.replace("/(auth)/login")}>
          <Text style={styles.backText}>{t("auth.verify.backToLogin")}</Text>
        </TouchableOpacity>
      </ScrollView>

      {toast && <Toast message={toast.text} type={toast.type} onDismiss={() => setToast(null)} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#121212" },
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  header: { alignItems: "center", marginBottom: 32 },
  logo: { fontSize: 36, fontWeight: "800", color: "#0a7ea4", letterSpacing: 1 },
  card: { backgroundColor: "#1e1e1e", borderRadius: 20, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 12 },
  intro: { color: "#999", fontSize: 14, lineHeight: 20, marginBottom: 20 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#2a2a2a",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#333",
  },
  codeInput: { fontSize: 22, letterSpacing: 6, textAlign: "center", fontWeight: "700" },
  button: { marginTop: 24, backgroundColor: "#0a7ea4", borderRadius: 12, padding: 16, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  resend: { alignItems: "center", marginTop: 18 },
  link: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  back: { alignItems: "center", marginTop: 24, padding: 8 },
  backText: { color: "#666", fontSize: 14 },
});
