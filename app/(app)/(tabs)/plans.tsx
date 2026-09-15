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

import { AiPlanGeneratorModal } from '@/components/AiPlanGeneratorModal';
import { resolveDayIndexForDate } from '@/services/gemini/trainingProvider';
import { supabase } from '@/services/supabaseClient';

type WorkoutPlan = {
  id: string;
  title: string;
  exercise_count: number;
  day_count: number;
  scheduled_days: number[] | null;
};

export default function PlansScreen() {
  const { selectMode } = useLocalSearchParams<{ selectMode?: string }>();
  const isSelectMode = selectMode === 'true';

  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  async function loadPlans() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('workout_plans')
      .select('id, title, scheduled_days, plan_exercises(count), plan_days(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setLoading(false);
    if (error || !data) return;

    setPlans(
      data.map((p: any) => ({
        id: p.id,
        title: p.title,
        scheduled_days: p.scheduled_days ?? null,
        exercise_count: p.plan_exercises?.[0]?.count ?? 0,
        day_count: p.plan_days?.[0]?.count ?? 0,
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

  function toggleBulkMode() {
    setBulkMode((v) => !v);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === plans.length ? new Set() : new Set(plans.map((p) => p.id)),
    );
  }

  async function deleteSelectedPlans() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    Alert.alert(
      `${ids.length} ${ids.length === 1 ? 'Plan' : 'Pläne'} löschen`,
      'Wirklich löschen? Das kann nicht rückgängig gemacht werden.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            // plan_exercises/plan_days hängen per ON DELETE CASCADE an workout_plans.
            const { error } = await supabase.from('workout_plans').delete().in('id', ids);
            if (error) { Alert.alert('Fehler', error.message); return; }
            setPlans((prev) => prev.filter((p) => !selectedIds.has(p.id)));
            setSelectedIds(new Set());
            setBulkMode(false);
          },
        },
      ],
    );
  }

  async function handlePlanPress(plan: WorkoutPlan) {
    if (bulkMode) { toggleSelected(plan.id); return; }
    if (!isSelectMode) {
      router.push({ pathname: '/create-plan', params: { planId: plan.id } });
      return;
    }

    if (plan.day_count === 0) {
      router.push({
        pathname: '/active-workout',
        params: { planId: plan.id, planName: plan.title },
      });
      return;
    }

    const dayIndex = resolveDayIndexForDate(plan.scheduled_days, new Date());
    const { data: day } = await supabase
      .from('plan_days')
      .select('id')
      .eq('plan_id', plan.id)
      .eq('day_index', dayIndex)
      .maybeSingle();

    router.push({
      pathname: '/active-workout',
      params: {
        planId: plan.id,
        planName: plan.title,
        ...(day ? { dayId: day.id } : {}),
      },
    });
  }

  return (
    <View style={styles.container}>
      <AiPlanGeneratorModal
        visible={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onSaved={() => {
          setAiModalOpen(false);
          loadPlans();
        }}
      />

      <View style={styles.header}>
        <Text style={styles.title}>
          {isSelectMode
            ? 'Plan wählen'
            : bulkMode
              ? `${selectedIds.size} ausgewählt`
              : 'Trainingspläne'}
        </Text>
      </View>

      {!isSelectMode && (
        <View style={styles.headerActions}>
          {bulkMode ? (
            <TouchableOpacity style={styles.cancelButton} onPress={toggleBulkMode}>
              <Text style={styles.cancelButtonText}>Fertig</Text>
            </TouchableOpacity>
          ) : (
            <>
              {plans.length > 0 && (
                <TouchableOpacity style={styles.selectButton} onPress={toggleBulkMode}>
                  <Text style={styles.selectButtonText}>Auswählen</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.aiButton}
                onPress={() => setAiModalOpen(true)}
              >
                <Text style={styles.aiButtonText}>✨ KI-Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => router.push('/create-plan')}
              >
                <Text style={styles.addButtonText}>+ Neu</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {bulkMode && (
        <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll}>
          <Text style={styles.selectAllText}>
            {selectedIds.size === plans.length ? 'Alle abwählen' : 'Alle auswählen'}
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator color="#0a7ea4" style={{ marginTop: 40 }} />
      ) : plans.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Noch keine Pläne vorhanden.</Text>
          {!isSelectMode && (
            <>
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => router.push('/create-plan')}
              >
                <Text style={styles.createButtonText}>Ersten Plan erstellen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.createButtonAi}
                onPress={() => setAiModalOpen(true)}
              >
                <Text style={styles.createButtonText}>✨ Plan mit KI erstellen</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: bulkMode ? 96 : 40 }}
          renderItem={({ item }) => {
            const selected = selectedIds.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.planCard, bulkMode && selected && styles.planCardSelected]}
                onPress={() => handlePlanPress(item)}
                activeOpacity={0.75}
              >
                {bulkMode && (
                  <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                    {selected && <Text style={styles.checkboxMark}>✓</Text>}
                  </View>
                )}
                <View style={styles.planInfo}>
                  <Text style={styles.planName}>{item.title}</Text>
                  <Text style={styles.planMeta}>
                    {item.day_count > 1
                      ? `${item.day_count} Tage · ${item.exercise_count} Übungen gesamt`
                      : `${item.exercise_count} Übung${item.exercise_count !== 1 ? 'en' : ''}`}
                  </Text>
                </View>
                {isSelectMode ? (
                  <Text style={styles.selectArrow}>▶</Text>
                ) : bulkMode ? null : (
                  <TouchableOpacity
                    onPress={() => deletePlan(item.id)}
                    style={styles.deleteBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.deleteText}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {bulkMode && (
        <View style={styles.bulkBar}>
          <TouchableOpacity
            style={[styles.bulkDeleteBtn, selectedIds.size === 0 && styles.bulkDeleteBtnDisabled]}
            onPress={deleteSelectedPlans}
            disabled={selectedIds.size === 0}
            activeOpacity={0.8}
          >
            <Text style={styles.bulkDeleteText}>
              {selectedIds.size > 0
                ? `${selectedIds.size} ${selectedIds.size === 1 ? 'Plan' : 'Pläne'} löschen`
                : 'Pläne auswählen'}
            </Text>
          </TouchableOpacity>
        </View>
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
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
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
  aiButton: {
    backgroundColor: '#1e1e1e',
    borderColor: '#0a7ea4',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  aiButtonText: {
    color: '#0a7ea4',
    fontWeight: '700',
    fontSize: 14,
  },
  selectButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectButtonText: {
    color: '#888',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cancelButtonText: {
    color: '#0a7ea4',
    fontWeight: '700',
    fontSize: 14,
  },
  selectAllRow: {
    alignSelf: 'flex-end',
    marginBottom: 14,
  },
  selectAllText: {
    color: '#0a7ea4',
    fontWeight: '600',
    fontSize: 13,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkboxChecked: {
    backgroundColor: '#0a7ea4',
    borderColor: '#0a7ea4',
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  bulkBar: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 24,
  },
  bulkDeleteBtn: {
    backgroundColor: '#c0392b',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  bulkDeleteBtnDisabled: {
    backgroundColor: '#3a2222',
  },
  bulkDeleteText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  createButtonAi: {
    backgroundColor: '#1e1e1e',
    borderColor: '#0a7ea4',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  planCardSelected: {
    borderColor: '#0a7ea4',
    backgroundColor: '#132a30',
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
