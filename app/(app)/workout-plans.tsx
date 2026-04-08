import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '@/services/supabaseClient';

type WorkoutPlan = {
  id: string;
  title: string;
  exercise_count: number;
};

export default function WorkoutPlansScreen() {
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadPlans() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('workout_plans')
      .select('id, title, plan_exercises(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setLoading(false);
    if (error || !data) { console.error(error?.message); return; }

    setPlans(
      data.map((p: any) => ({
        id: p.id,
        title: p.title,
        exercise_count: p.plan_exercises?.[0]?.count ?? 0,
      })),
    );
  }

  useFocusEffect(useCallback(() => { loadPlans(); }, []));

  async function handleDelete(id: string, title: string) {
    Alert.alert(`"${title}" löschen?`, 'Alle Übungen werden mit entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          // ON DELETE CASCADE übernimmt plan_exercises, aber zur Sicherheit:
          await supabase.from('plan_exercises').delete().eq('plan_id', id);
          const { error } = await supabase.from('workout_plans').delete().eq('id', id);
          if (!error) setPlans((prev) => prev.filter((p) => p.id !== id));
        },
      },
    ]);
  }

  function handleStartTraining(plan: WorkoutPlan) {
    router.push({
      pathname: '/active-workout',
      params: { planId: plan.id, planName: plan.title },
    });
  }

  function handleEdit(plan: WorkoutPlan) {
    router.push({ pathname: '/create-plan', params: { planId: plan.id } });
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.pageTitle}>Trainingspläne</Text>
        <TouchableOpacity
          style={styles.newButton}
          onPress={() => router.push('/create-plan')}
        >
          <Text style={styles.newButtonText}>+ Neu</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#0a7ea4" style={{ marginTop: 48 }} />
      ) : plans.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Keine Pläne vorhanden</Text>
          <Text style={styles.emptySubtitle}>
            Erstelle deinen ersten Trainingsplan.
          </Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => router.push('/create-plan')}
          >
            <Text style={styles.createBtnText}>Plan erstellen</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {/* Plan-Info */}
              <View style={styles.cardHeader}>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardMeta}>
                    {item.exercise_count} Übung{item.exercise_count !== 1 ? 'en' : ''}
                  </Text>
                </View>
                {/* Bearbeiten */}
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => handleEdit(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.editBtnText}>✎</Text>
                </TouchableOpacity>
              </View>

              {/* Action-Buttons */}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.startButton}
                  onPress={() => handleStartTraining(item)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.startButtonText}>▶  Training starten</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(item.id, item.title)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.deleteButtonText}>Löschen</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
  },
  newButton: {
    backgroundColor: '#0a7ea4',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  newButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 80,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
  },
  createBtn: {
    marginTop: 8,
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  createBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  // Plan-Karte
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardInfo: { flex: 1 },
  cardTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardMeta: {
    color: '#666',
    fontSize: 13,
  },
  editBtn: {
    paddingLeft: 12,
    paddingTop: 2,
  },
  editBtnText: {
    color: '#0a7ea4',
    fontSize: 18,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  startButton: {
    flex: 1,
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  deleteButtonText: {
    color: '#888',
    fontWeight: '600',
    fontSize: 14,
  },
});
