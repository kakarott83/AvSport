/**
 * app/(auth)/forgot-password.tsx — "Passwort vergessen"
 *
 * Schritt 1: E-Mail eingeben → Supabase schickt einen Code.
 * Schritt 2: Code + neues Passwort → verifyOtp (meldet an) → updateUser.
 * Logik: lib/passwordReset.ts. Während dieses Screens leitet app/_layout.tsx
 * eine frisch entstandene Session nicht automatisch weiter, damit das neue
 * Passwort erst gesetzt werden kann.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
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
import { loadCredentials, saveCredentials } from "@/lib/credentialStore";
import { useTranslation } from "@/lib/i18n";
import {
  completePasswordReset,
  normalizeCode,
  requestPasswordReset,
  validateNewPassword,
} from "@/lib/passwordReset";

type Step = "email" | "code";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ email?: string }>();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "error" | "success" } | null>(null);

  function showToast(text: string, type: "error" | "success" = "error") {
    setToast(null);
    setTimeout(() => setToast({ text, type }), 50);
  }

  async function sendCode(isResend = false) {
    if (!email.trim()) {
      showToast(t("auth.reset.enterEmail"));
      return;
    }
    setLoading(true);
    const res = await requestPasswordReset(email);
    setLoading(false);
    if (!res.ok) {
      showToast(res.message);
      return;
    }
    setStep("code");
    if (isResend) showToast(t("auth.reset.resent"), "success");
  }

  async function submit() {
    if (!verified && normalizeCode(code).length < 6) {
      showToast(t("auth.reset.enterCode"));
      return;
    }
    const problem = validateNewPassword(password, confirm);
    if (problem === "tooShort") return showToast(t("auth.passwordTooShort"));
    if (problem === "mismatch") return showToast(t("auth.passwordMismatch"));

    setLoading(true);
    const res = await completePasswordReset({ email, code, password, alreadyVerified: verified });
    setLoading(false);

    if (!res.ok) {
      if (res.reason === "invalidCode") {
        showToast(t("auth.reset.invalidCode"));
      } else {
        setVerified(true); // Code ist verbraucht, nur das Passwort erneut versuchen
        showToast(res.message);
      }
      return;
    }

    // Gespeichertes Passwort (Login "Passwort speichern") nachziehen
    const saved = await loadCredentials();
    if (saved && saved.email.toLowerCase() === email.trim().toLowerCase()) {
      await saveCredentials(saved.email, password);
    }

    showToast(t("auth.reset.success"), "success");
    setTimeout(() => router.replace("/(app)/(tabs)"), 900);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>AvoraSport</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t("auth.reset.title")}</Text>

          {step === "email" ? (
            <>
              <Text style={styles.intro}>{t("auth.reset.intro")}</Text>
              <Text style={styles.label}>{t("auth.email")}</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder={t("auth.emailPlaceholder")}
                placeholderTextColor="#555"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus={!email}
                returnKeyType="send"
                onSubmitEditing={() => sendCode()}
              />
              <PrimaryButton label={t("auth.reset.sendCode")} loading={loading} onPress={() => sendCode()} />
            </>
          ) : (
            <>
              <Text style={styles.intro}>{t("auth.reset.codeSentTo", { email: email.trim() })}</Text>

              {!verified && (
                <>
                  <Text style={styles.label}>{t("auth.reset.code")}</Text>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    value={code}
                    onChangeText={(v) => setCode(normalizeCode(v))}
                    placeholder={t("auth.reset.codePlaceholder")}
                    placeholderTextColor="#555"
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </>
              )}

              <Text style={[styles.label, styles.labelSpacing]}>{t("auth.reset.newPassword")}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={t("auth.passwordPlaceholderMin")}
                placeholderTextColor="#555"
                secureTextEntry
                textContentType="newPassword"
                autoComplete="password-new"
              />

              <Text style={[styles.label, styles.labelSpacing]}>{t("auth.reset.confirmNewPassword")}</Text>
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="••••••••"
                placeholderTextColor="#555"
                secureTextEntry
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={submit}
              />

              <PrimaryButton label={t("auth.reset.submit")} loading={loading} onPress={submit} />

              {!verified && (
                <View style={styles.secondaryRow}>
                  <TouchableOpacity onPress={() => sendCode(true)} disabled={loading}>
                    <Text style={styles.link}>{t("auth.reset.resend")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setStep("email"); setCode(""); }} disabled={loading}>
                    <Text style={styles.link}>{t("auth.reset.changeEmail")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>{t("auth.reset.backToLogin")}</Text>
        </TouchableOpacity>
      </ScrollView>

      {toast && <Toast message={toast.text} type={toast.type} onDismiss={() => setToast(null)} />}
    </KeyboardAvoidingView>
  );
}

function PrimaryButton({ label, loading, onPress }: { label: string; loading: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.button, loading && styles.buttonDisabled]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </TouchableOpacity>
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
  labelSpacing: { marginTop: 16 },
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
  secondaryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  link: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  back: { alignItems: "center", marginTop: 24, padding: 8 },
  backText: { color: "#666", fontSize: 14 },
});
