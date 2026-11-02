/**
 * app/(app)/(tabs)/meal-plan.tsx — Tab „Speiseplan“
 *
 * KI-Mahlzeitenplan für 1–7 Tage, abgestimmt auf Kalorien- und Proteinziel.
 * Vorgaben: Ernährungsform, Mahlzeiten/Tag, Unverträglichkeiten, Kochaufwand
 * (components/mealPlan/MealPlanForm.tsx). Jeder Plan wird in public.meal_plans
 * gespeichert; Mahlzeiten lassen sich ins Ernährungstagebuch übernehmen oder
 * einzeln neu generieren, dazu eine Einkaufsliste.
 * Logik: lib/mealPlan.ts · KI: services/gemini/mealPlanProvider.ts ·
 * DB: services/mealPlans/mealPlanService.ts
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MealCard } from '@/components/mealPlan/MealCard';
import { ACCENT, MealPlanForm } from '@/components/mealPlan/MealPlanForm';
import { SavedPlansModal } from '@/components/mealPlan/SavedPlansModal';
import { ShoppingListModal } from '@/components/mealPlan/ShoppingListModal';
import { useCalorieGoal } from '@/hooks/useCalorieGoal';
import { addDays } from '@/lib/cycle';
import { localISODate } from '@/lib/cycleHealth';
import { formatNumber, getLocale, useTranslation } from '@/lib/i18n';
import {
  dayTotals,
  DEFAULT_PREFERENCES,
  normalizeIntolerances,
  planningKcal,
  proteinGoal,
  replaceMeal,
  type MealPlanData,
  type MealPlanPreferences,
  type MealPlanTargets,
  type PlannedMeal,
} from '@/lib/mealPlan';
import { isDailyLimitError, openPaywall } from '@/lib/premiumGate';
import { generateMealPlan, regenerateMeal } from '@/services/gemini/mealPlanProvider';
import {
  createMealPlan,
  deleteMealPlan,
  listMealPlans,
  logMealToJournal,
  updateMealPlan,
  type SavedMealPlan,
} from '@/services/mealPlans/mealPlanService';
import { supabase } from '@/services/supabaseClient';

type ProfileTargets = { weight_kg: number | null; protein_per_kg: number | null; calorie_goal: MealPlanTargets['goal'] };

function dayChipLabel(iso: string): { weekday: string; date: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    weekday: date.toLocaleDateString(getLocale(), { weekday: 'short' }),
    date: date.toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit' }),
  };
}

function isInvalidAiResponse(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : '';
  return e instanceof SyntaxError || msg === 'invalid_plan' || msg === 'invalid_meal' || msg === 'invalid_json';
}

export default function MealPlanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentGoal, breakdown } = useCalorieGoal(null);

  const [profile, setProfile] = useState<ProfileTargets | null>(null);
  const [plans, setPlans] = useState<SavedMealPlan[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [prefs, setPrefs] = useState<MealPlanPreferences>(DEFAULT_PREFERENCES);
  const [startOffset, setStartOffset] = useState<0 | 1>(0);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState<{ mealId: string; kind: 'log' | 'regenerate' } | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [error, setError] = useState('');
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const active = plans.find((p) => p.id === activeId) ?? null;

  const targets: MealPlanTargets = useMemo(
    () => ({
      kcal: planningKcal(currentGoal, breakdown),
      protein: proteinGoal(profile?.weight_kg ?? null, profile?.protein_per_kg ?? null),
      goal: profile?.calorie_goal ?? null,
    }),
    [currentGoal, breakdown, profile],
  );

  const load = useCallback(async () => {
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [profileRes, list] = await Promise.all([
        supabase.from('profiles').select('weight_kg, protein_per_kg, calorie_goal').eq('id', user.id).maybeSingle(),
        listMealPlans(),
      ]);
      if (profileRes.data) setProfile(profileRes.data as ProfileTargets);
      setPlans(list);
      setActiveId((prev) => (prev && list.some((p) => p.id === prev) ? prev : list[0]?.id ?? null));
      if (list.length === 0) setShowForm(true);
    } catch (e) {
      setError(t('mealPlan.errors.loadFailed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Beim Öffnen eines Plans: heutigen Tag vorauswählen, sonst den ersten
  useEffect(() => {
    if (!active) return;
    const today = localISODate(new Date());
    const idx = active.plan.days.findIndex((d) => d.date === today);
    setDayIndex(idx >= 0 ? idx : 0);
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  function openForm() {
    if (active) setPrefs({ ...DEFAULT_PREFERENCES, ...active.preferences });
    setError('');
    setShowForm(true);
  }

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    const cleanPrefs = { ...prefs, intolerances: normalizeIntolerances(prefs.intolerances) };
    const startDate = addDays(localISODate(new Date()), startOffset);
    try {
      const plan = await generateMealPlan(cleanPrefs, targets, startDate);
      const saved = await createMealPlan(startDate, cleanPrefs, targets, plan);
      setPlans((prev) => [saved, ...prev]);
      setActiveId(saved.id);
      setDayIndex(0);
      setShowForm(false);
    } catch (e) {
      if (isDailyLimitError(e)) {
        openPaywall(router);
      } else if (isInvalidAiResponse(e)) {
        setError(t('mealPlan.errors.invalid'));
      } else {
        setError(t('mealPlan.errors.generateFailed', { message: e instanceof Error ? e.message : String(e) }));
      }
    } finally {
      setGenerating(false);
    }
  }

  /** Plan lokal ändern und speichern; bei Fehler zurückrollen. */
  async function persist(planId: string, next: MealPlanData) {
    const before = plans.find((p) => p.id === planId)?.plan;
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, plan: next } : p)));
    try {
      await updateMealPlan(planId, next);
    } catch (e) {
      if (before) setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, plan: before } : p)));
      setError(t('mealPlan.errors.saveFailed', { message: e instanceof Error ? e.message : String(e) }));
    }
  }

  async function handleLog(meal: PlannedMeal) {
    if (!active) return;
    setBusy({ mealId: meal.id, kind: 'log' });
    setError('');
    try {
      await logMealToJournal(meal);
      await persist(active.id, replaceMeal(active.plan, meal.id, (m) => ({ ...m, loggedAt: new Date().toISOString() })));
    } catch (e) {
      setError(t('mealPlan.errors.logFailed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
    }
  }

  async function handleRegenerate(meal: PlannedMeal) {
    if (!active) return;
    setBusy({ mealId: meal.id, kind: 'regenerate' });
    setError('');
    try {
      const prefsForPlan = { ...DEFAULT_PREFERENCES, ...active.preferences };
      const fresh = await regenerateMeal(active.plan, meal, prefsForPlan, active.targets);
      await persist(active.id, replaceMeal(active.plan, meal.id, () => fresh));
    } catch (e) {
      if (isDailyLimitError(e)) {
        openPaywall(router);
      } else if (isInvalidAiResponse(e)) {
        setError(t('mealPlan.errors.invalid'));
      } else {
        setError(t('mealPlan.errors.regenerateFailed', { message: e instanceof Error ? e.message : String(e) }));
      }
    } finally {
      setBusy(null);
    }
  }

  function toggleShopping(key: string) {
    if (!active) return;
    const checked = active.plan.shoppingChecked.includes(key)
      ? active.plan.shoppingChecked.filter((k) => k !== key)
      : [...active.plan.shoppingChecked, key];
    void persist(active.id, { ...active.plan, shoppingChecked: checked });
  }

  async function handleDelete(id: string) {
    try {
      await deleteMealPlan(id);
      const rest = plans.filter((p) => p.id !== id);
      setPlans(rest);
      if (id === activeId) setActiveId(rest[0]?.id ?? null);
      if (rest.length === 0) {
        setHistoryOpen(false);
        setShowForm(true);
      }
    } catch (e) {
      setError(t('mealPlan.errors.saveFailed', { message: e instanceof Error ? e.message : String(e) }));
    }
  }

  const day = active?.plan.days[dayIndex] ?? null;
  const totals = day ? dayTotals(day) : null;
  const dayTarget = active?.targets.kcal ?? targets.kcal;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('mealPlan.title')}</Text>

        {loading ? (
          <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
        ) : showForm || !active ? (
          <>
            <Text style={styles.intro}>{t('mealPlan.intro')}</Text>
            <View style={styles.targetCard}>
              <MaterialIcons name="flag" size={18} color={ACCENT} />
              <View style={{ flex: 1 }}>
                <Text style={styles.targetText}>
                  {t('mealPlan.targets', { kcal: formatNumber(targets.kcal), protein: targets.protein })}
                </Text>
                <Text style={styles.hint}>
                  {breakdown && !breakdown.inputs ? t('mealPlan.profileIncomplete') : t('mealPlan.targetsHint')}
                </Text>
              </View>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <MealPlanForm
              value={prefs}
              onChange={setPrefs}
              startOffset={startOffset}
              onStartOffsetChange={setStartOffset}
              generating={generating}
              onGenerate={handleGenerate}
              onCancel={active ? () => { setShowForm(false); setError(''); } : undefined}
            />
            <Text style={styles.disclaimer}>{t('mealPlan.disclaimer')}</Text>
          </>
        ) : (
          <>
            <View style={styles.toolbar}>
              <ToolbarButton icon="auto-awesome" label={t('mealPlan.plan.newPlan')} onPress={openForm} />
              <ToolbarButton icon="shopping-cart" label={t('mealPlan.plan.shoppingList')} onPress={() => setShoppingOpen(true)} />
              <ToolbarButton icon="history" label={t('mealPlan.plan.history')} onPress={() => setHistoryOpen(true)} />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayChips}>
              {active.plan.days.map((d, i) => {
                const label = dayChipLabel(d.date);
                const selected = i === dayIndex;
                return (
                  <TouchableOpacity
                    key={d.date}
                    style={[styles.dayChip, selected && styles.dayChipActive]}
                    onPress={() => setDayIndex(i)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.dayChipWeekday, selected && styles.dayChipTextActive]}>{label.weekday}</Text>
                    <Text style={[styles.dayChipDate, selected && styles.dayChipTextActive]}>{label.date}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {totals && (
              <View style={styles.totalCard}>
                <Text style={styles.totalText}>
                  {t('mealPlan.plan.dayTotal', {
                    kcal: formatNumber(totals.calories),
                    target: formatNumber(dayTarget),
                    protein: totals.protein,
                  })}
                </Text>
                <View style={styles.progressBg}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(100, Math.round((totals.calories / Math.max(dayTarget, 1)) * 100))}%` },
                    ]}
                  />
                </View>
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {day?.meals.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                busy={busy?.mealId === meal.id ? busy.kind : null}
                disabled={busy !== null}
                onLog={() => handleLog(meal)}
                onRegenerate={() => handleRegenerate(meal)}
              />
            ))}
            <Text style={styles.disclaimer}>{t('mealPlan.disclaimer')}</Text>
          </>
        )}
      </ScrollView>

      <ShoppingListModal
        visible={shoppingOpen}
        plan={active?.plan ?? null}
        onToggle={toggleShopping}
        onClose={() => setShoppingOpen(false)}
      />
      <SavedPlansModal
        visible={historyOpen}
        plans={plans}
        activeId={activeId}
        onOpen={(id) => { setActiveId(id); setShowForm(false); setHistoryOpen(false); }}
        onDelete={handleDelete}
        onClose={() => setHistoryOpen(false)}
      />
    </View>
  );
}

function ToolbarButton({ icon, label, onPress }: { icon: ComponentProps<typeof MaterialIcons>['name']; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.toolbarBtn} onPress={onPress} activeOpacity={0.8}>
      <MaterialIcons name={icon} size={18} color={ACCENT} />
      <Text style={styles.toolbarText} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 56, gap: 14 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  intro: { color: '#bbb', fontSize: 14, lineHeight: 20 },
  hint: { color: '#777', fontSize: 12, lineHeight: 16, marginTop: 2 },
  error: { color: '#ef5350', fontSize: 13 },
  disclaimer: { color: '#666', fontSize: 11, textAlign: 'center' },

  targetCard: { flexDirection: 'row', gap: 10, backgroundColor: '#1e1e1e', borderRadius: 14, padding: 14 },
  targetText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  toolbar: { flexDirection: 'row', gap: 8 },
  toolbarBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  toolbarText: { color: '#ddd', fontSize: 12, fontWeight: '600', flexShrink: 1 },

  dayChips: { gap: 8 },
  dayChip: { backgroundColor: '#1e1e1e', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#1e1e1e' },
  dayChipActive: { borderColor: ACCENT, backgroundColor: '#0a7ea422' },
  dayChipWeekday: { color: '#999', fontSize: 12, fontWeight: '700' },
  dayChipDate: { color: '#777', fontSize: 11, marginTop: 1 },
  dayChipTextActive: { color: '#fff' },

  totalCard: { backgroundColor: '#1e1e1e', borderRadius: 14, padding: 14, gap: 8 },
  totalText: { color: '#ddd', fontSize: 13, fontWeight: '600' },
  progressBg: { height: 6, backgroundColor: '#2a2a2a', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: '#22C55E', borderRadius: 3 },
});
