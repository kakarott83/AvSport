import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
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

export default function PlansScreen() {
  const { selectMode } = useLocalSearchParams<{ selectMode?: string }>();
  const isSelectMode = selectMode === 'true';

  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadPlans() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('workout_plans')
      .select('id, title, plan_exercises(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setLoading(false);
    if (error || !data) return;

    setPlans(
      data.map((p: any) => ({
        id: p.id,
        title: p.title,
        exercise_count: p.plan_exercises?.[0]?.count ?? 0,
      })),
    );
  }

  useFocusEffect(useCallback(() => { loadPlans(); }, []));

  async function deletePlan(id: string) {
    Alert.alert('Plan löschen', 'Wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('plan_exercises').delete().eq('plan_id', id);
          await supabase.from('workout_plans').delete().eq('id', id);
          setPlans((prev) => prev.filter((p) => p.id !== id));
        },
      },
    ]);
  }

  function handlePlanPress(plan: WorkoutPlan) {
    if (isSelectMode) {
      router.push({
        pathname: '/active-workout',
        params: { planId: plan.id, planName: plan.title },
      });
    } else {
      router.push({ pathname: '/create-plan', params: { planId: plan.id } });
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {isSelectMode ? 'Plan wählen' : 'Trainingspläne'}
        </Text>
        {!isSelectMode && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/create-plan')}
          >
            <Text style={styles.addButtonText}>+ Neu</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#0a7ea4" style={{ marginTop: 40 }} />
      ) : plans.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Noch keine Pläne vorhanden.</Text>
          {!isSelectMode && (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/create-plan')}
            >
              <Text style={styles.createButtonText}>Ersten Plan erstellen</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.planCard}
              onPress={() => handlePlanPress(item)}
              activeOpacity={0.75}
            >
              <View style={styles.planInfo}>
                <Text style={styles.planName}>{item.title}</Text>
                <Text style={styles.planMeta}>
                  {item.exercise_count} Übung{item.exercise_count !== 1 ? 'en' : ''}
                </Text>
              </View>
              {isSelectMode ? (
                <Text style={styles.selectArrow}>▶</Text>
              ) : (
                <TouchableOpacity
                  onPress={() => deletePlan(item.id)}
                  style={styles.deleteBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
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
    padding: 24,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#0a7ea4',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    color: '#555',
    fontSize: 15,
  },
  createButton: {
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  planMeta: {
    color: '#666',
    fontSize: 13,
  },
  selectArrow: {
    color: '#0a7ea4',
    fontSize: 14,
  },
  deleteBtn: {
    padding: 4,
  },
  deleteText: {
    color: '#444',
    fontSize: 16,
  },
});
