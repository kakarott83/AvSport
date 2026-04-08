import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { supabase } from "@/services/supabaseClient";

export function BodyStatsForm() {
  const [weight, setWeight] = useState("");
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const userId = user?.id ?? "test-user-id";

    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, weight_kg: weight, goal }, { onConflict: "id" });

    setLoading(false);

    if (error) {
      Alert.alert("Fehler", error.message);
    } else {
      Alert.alert("Gespeichert", "Deine Daten wurden erfolgreich gespeichert.");
    }
  }

  return (
    <View style={styles.container}>
      <ThemedText type="subtitle" style={styles.heading}>
        Körperdaten
      </ThemedText>

      <ThemedText style={styles.label}>Gewicht (kg)</ThemedText>
      <TextInput
        style={styles.input}
        value={weight}
        onChangeText={setWeight}
        placeholder="z.B. 75"
        keyboardType="decimal-pad"
        placeholderTextColor="#9BA1A6"
      />

      <ThemedText style={styles.label}>Dein Ziel</ThemedText>
      <TextInput
        style={styles.input}
        value={goal}
        onChangeText={setGoal}
        placeholder="z.B. Muskelaufbau"
        placeholderTextColor="#9BA1A6"
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.buttonText}>Speichern</ThemedText>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 8,
  },
  heading: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#687076",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#11181C",
  },
  button: {
    marginTop: 20,
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
