/**
 * AiPlanGeneratorModal.tsx
 * Coach-Modal: Ziel → Umgebung → (Geräte) → Fokus → Dauer → Trainingstage →
 *              Einheiten-Länge → (Level) → Einschränkungen → Laden → Vorschau → Speichern
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AnimatedLogo } from '@/components/AnimatedLogo';

import { generateAiPlan, saveAiPlan } from '@/services/gemini/aiTrainingService';
import { FITNESS_LEVEL_LABEL } from '@/services/gemini/trainingProvider';
import { supabase } from '@/services/supabaseClient';
import type {
  AiPlanInput, Environment, FitnessGoal, FitnessLevel, FocusArea,
  SessionMinutes, TargetWeeks, WorkoutPlanInsert,
} from '@/types/workout';

// ─── Konstanten ───────────────────────────────────────────────────────────────

const C_BG     = '#121212';
const C_CARD   = '#1e1e1e';
const C_INPUT  = '#2a2a2a';
const C_ACCENT = '#00E5FF';
const C_ORANGE = '#FF9100';
const C_TEXT   = '#fff';
const C_MUTED  = '#888';
const C_BORDER = '#2a2a2a';

// DB-Mapping: 0=So, 1=Mo … 6=Sa  (wie Date.getDay() / create-plan.tsx)
const WEEK_DAYS = [
  { label: 'Mo', value: 1 },
  { label: 'Di', value: 2 },
  { label: 'Mi', value: 3 },
  { label: 'Do', value: 4 },
  { label: 'Fr', value: 5 },
  { label: 'Sa', value: 6 },
  { label: 'So', value: 0 },
] as const;

const EQUIPMENT_OPTIONS = [
  'Kurzhanteln', 'Langhantel', 'Widerstandsbänder', 'Klimmzugstange', 'Kettlebell', 'Trainingsbank',
] as const;

const SESSION_OPTIONS: SessionMinutes[] = [30, 45, 60, 90];

const FITNESS_LEVEL_OPTIONS: FitnessLevel[] = ['anfaenger', 'fortgeschritten', 'profi'];

type Step =
  | 'goal' | 'environment' | 'equipment' | 'focus' | 'weeks' | 'days'
  | 'duration' | 'level' | 'restrictions' | 'loading' | 'preview';

const LOADING_MESSAGES = [
  'Coach analysiert Daten...',
  'Trainingsplan wird erstellt...',
  'Tage & Übungen werden verteilt...',
  'Fast fertig...',
];

/** Frage-Schritte in Reihenfolge — hängt von Umgebung (Geräte-Schritt) und bekanntem Fitnesslevel ab. */
function questionSteps(environment: Environment | null, needsLevelStep: boolean): Step[] {
  const steps: Step[] = ['goal', 'environment'];
  if (environment === 'home') steps.push('equipment');
  steps.push('focus', 'weeks', 'days', 'duration');
  if (needsLevelStep) steps.push('level');
  steps.push('restrictions');
  return steps;
}

function prevStep(step: Step, environment: Environment | null, needsLevelStep: boolean): Step | undefined {
  switch (step) {
    case 'environment':  return 'goal';
    case 'equipment':    return 'environment';
    case 'focus':        return environment === 'home' ? 'equipment' : 'environment';
    case 'weeks':        return 'focus';
    case 'days':         return 'weeks';
    case 'duration':     return 'days';
    case 'level':        return 'duration';
    case 'restrictions': return needsLevelStep ? 'level' : 'duration';
    default:              return undefined;
  }
}

// ─── Chip-Komponente ──────────────────────────────────────────────────────────

function OptionChip({
  label, sub, selected, onPress, icon,
}: {
  label: string; sub?: string; selected: boolean; onPress: () => void; icon?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon && (
        <MaterialIcons
          name={icon as any}
          size={20}
          color={selected ? C_ACCENT : C_MUTED}
          style={{ marginBottom: 4 }}
        />
      )}
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
      {sub && (
        <Text style={[styles.chipSub, selected && styles.chipSubSelected]}>{sub}</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Step-Dots ────────────────────────────────────────────────────────────────

function StepDots({ current, steps }: { current: Step; steps: Step[] }) {
  const idx = steps.indexOf(current);
  if (idx < 0) return null;
  return (
    <View style={styles.dots}>
      {steps.map((_, i) => (
        <View key={i} style={[styles.dot, i <= idx && styles.dotActive]} />
      ))}
    </View>
  );
}

// ─── Übungszeile in der Vorschau ──────────────────────────────────────────────

function ExercisePreviewRow({ name, description, muscleGroup, equipmentType, sets, reps, duration, rest }: {
  name: string; description: string; muscleGroup: string; equipmentType: string;
  sets: number; reps: number; duration: number | null; rest: number | null;
}) {
  const detail = duration ? `${sets} × ${duration}s` : `${sets} × ${reps} Wdh.`;
  const tag = [muscleGroup, equipmentType].filter(Boolean).join(' / ');
  return (
    <View style={styles.exRow}>
      {!!tag && (
        <View style={styles.pictoBox}>
          <Text style={styles.pictoText} numberOfLines={2}>{tag}</Text>
        </View>
      )}
      <View style={styles.exBody}>
        <Text style={styles.exName} numberOfLines={1}>{name}</Text>
        {!!description && (
          <Text style={styles.exDescription} numberOfLines={1}>{description}</Text>
        )}
      </View>
      <View style={styles.exMetaCol}>
        <Text style={styles.exDetail}>{detail}</Text>
        {rest != null && <Text style={styles.exRest}>{rest}s Pause</Text>}
      </View>
    </View>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: (planId: string, planTitle: string) => void;
};

export function AiPlanGeneratorModal({ visible, onClose, onSaved }: Props) {
  const [step,          setStep]          = useState<Step>('goal');
  const [goal,          setGoal]          = useState<FitnessGoal | null>(null);
  const [environment,   setEnvironment]   = useState<Environment | null>(null);
  const [equipment,     setEquipment]     = useState<string[]>([]);
  const [focusArea,     setFocusArea]     = useState<FocusArea | null>(null);
  const [weeks,         setWeeks]         = useState<TargetWeeks | null>(null);
  const [scheduledDays, setScheduledDays] = useState<number[]>([]);
  const [sessionMinutes, setSessionMinutes] = useState<SessionMinutes | null>(null);
  const [fitnessLevel,  setFitnessLevel]  = useState<FitnessLevel | null>(null);
  const [restrictions,  setRestrictions]  = useState('');
  const [plan,          setPlan]          = useState<WorkoutPlanInsert | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // undefined = wird noch geladen, null = im Profil nicht gesetzt, sonst bekannter Wert
  const [profileFitnessLevel, setProfileFitnessLevel] = useState<FitnessLevel | null | undefined>(undefined);

  // Lade-Text-Rotation
  const loadingOpacity = useRef(new Animated.Value(1)).current;
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const msgIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step !== 'loading') {
      if (msgIntervalRef.current) clearInterval(msgIntervalRef.current);
      return;
    }
    setLoadingMsgIdx(0);
    msgIntervalRef.current = setInterval(
      () => setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length),
      1800,
    );
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(loadingOpacity, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(loadingOpacity, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      if (msgIntervalRef.current) clearInterval(msgIntervalRef.current);
    };
  }, [step]);

  // Reset beim Öffnen + bekanntes Fitnesslevel aus dem Profil laden
  useEffect(() => {
    if (!visible) return;
    setStep('goal');
    setGoal(null);
    setEnvironment(null);
    setEquipment([]);
    setFocusArea(null);
    setWeeks(null);
    setScheduledDays([]);
    setSessionMinutes(null);
    setFitnessLevel(null);
    setRestrictions('');
    setPlan(null);
    setError(null);
    setProfileFitnessLevel(undefined);

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setProfileFitnessLevel(null); return; }
      const { data } = await supabase.from('profiles').select('fitness_level').eq('id', user.id).single();
      const level = data?.fitness_level;
      const known: FitnessLevel | null =
        level === 'anfaenger' || level === 'fortgeschritten' || level === 'profi' ? level : null;
      setProfileFitnessLevel(known);
      if (known) setFitnessLevel(known);
    })();
  }, [visible]);

  // Fehlt der Level-Schritt, weil er noch lädt? Dann sicherheitshalber fragen.
  const needsLevelStep = profileFitnessLevel !== undefined ? profileFitnessLevel === null : true;
  const steps = questionSteps(environment, needsLevelStep);

  // ── Toggles ──────────────────────────────────────────────────────────────────

  function toggleDay(value: number) {
    setScheduledDays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    );
  }

  function toggleEquipment(name: string) {
    setEquipment((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name],
    );
  }

  // ── API-Call ─────────────────────────────────────────────────────────────────

  async function triggerGeneration() {
    if (!goal || !environment || !focusArea || !weeks || !sessionMinutes) return;
    const level = fitnessLevel ?? 'anfaenger';
    setStep('loading');
    setError(null);

    const input: AiPlanInput = {
      goal,
      focusArea,
      targetWeeks:    weeks,
      scheduledDays,
      environment,
      equipment:      environment === 'home' ? equipment : [],
      sessionMinutes,
      fitnessLevel:   level,
      restrictions:   restrictions.trim() || null,
    };

    try {
      const generated = await generateAiPlan(input);
      setPlan(generated);
      setStep('preview');

      // Fitnesslevel erstmals erfragt → im Profil merken, künftig nicht mehr fragen
      if (profileFitnessLevel === null) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) void supabase.from('profiles').update({ fitness_level: level }).eq('id', user.id);
      }
    } catch (e: any) {
      setError(e?.message || 'Plan konnte nicht generiert werden. Bitte versuche es erneut.');
      setStep('restrictions');
    }
  }

  // ── Speichern ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht eingeloggt.');
      const id = await saveAiPlan(plan, user.id, supabase);
      onSaved(id, plan.title);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

  // ── Header-Titel ─────────────────────────────────────────────────────────────

  const headerTitle =
    step === 'loading' ? 'Coach arbeitet...' :
    step === 'preview' ? 'Dein KI-Plan'     :
                         'Neuer KI-Plan';

  const goBack = prevStep(step, environment, needsLevelStep);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {goBack !== undefined && (
              <TouchableOpacity
                onPress={() => setStep(goBack)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons name="arrow-back" size={22} color={C_MUTED} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="close" size={22} color={C_MUTED} />
          </TouchableOpacity>
        </View>

        {/* Fortschritts-Punkte (nur bei Frage-Schritten) */}
        {steps.includes(step) && <StepDots current={step} steps={steps} />}

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

          {/* ── SCHRITT: Ziel ── */}
          {step === 'goal' && (
            <>
              <Text style={styles.coachText}>Was ist dein Trainingsziel? 💪</Text>
              <View style={styles.chipRow}>
                <OptionChip
                  label="Abnehmen"
                  sub="Fettverbrennung & Ausdauer"
                  icon="local-fire-department"
                  selected={goal === 'abnehmen'}
                  onPress={() => { setGoal('abnehmen'); setStep('environment'); }}
                />
                <OptionChip
                  label="Muskeln aufbauen"
                  sub="Kraft & Hypertrophie"
                  icon="fitness-center"
                  selected={goal === 'muskeln'}
                  onPress={() => { setGoal('muskeln'); setStep('environment'); }}
                />
              </View>
            </>
          )}

          {/* ── SCHRITT: Trainingsumgebung ── */}
          {step === 'environment' && (
            <>
              <Text style={styles.coachText}>Wo trainierst du? 🏋️</Text>
              <View style={styles.chipRow}>
                <OptionChip
                  label="Fitnessstudio"
                  sub="Geräte & Freigewichte"
                  icon="fitness-center"
                  selected={environment === 'gym'}
                  onPress={() => { setEnvironment('gym'); setEquipment([]); setStep('focus'); }}
                />
                <OptionChip
                  label="Zuhause"
                  sub="Eigene Ausstattung"
                  icon="home"
                  selected={environment === 'home'}
                  onPress={() => { setEnvironment('home'); setStep('equipment'); }}
                />
              </View>
            </>
          )}

          {/* ── SCHRITT: Geräte (nur Zuhause) ── */}
          {step === 'equipment' && (
            <>
              <Text style={styles.coachText}>Welche Geräte hast du zur Verfügung?</Text>
              <Text style={styles.coachSub}>Mehrfachauswahl möglich — der Coach plant nur damit.</Text>

              <View style={styles.dayRow}>
                {EQUIPMENT_OPTIONS.map((name) => {
                  const active = equipment.includes(name);
                  return (
                    <TouchableOpacity
                      key={name}
                      style={[styles.equipChip, active && styles.equipChipActive]}
                      onPress={() => toggleEquipment(name)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.equipChipText, active && styles.equipChipTextActive]}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.nextBtn} onPress={() => setStep('focus')} activeOpacity={0.8}>
                <Text style={styles.nextBtnText}>Weiter</Text>
                <MaterialIcons name="arrow-forward" size={17} color="#121212" />
              </TouchableOpacity>

              {equipment.length === 0 && (
                <Text style={styles.skipHint}>
                  Ohne Auswahl plant der Coach nur Körpergewichtsübungen.
                </Text>
              )}
            </>
          )}

          {/* ── SCHRITT: Fokus ── */}
          {step === 'focus' && (
            <>
              <Text style={styles.coachText}>Welchen Bereich fokussierst du?</Text>
              <View style={styles.chipRow}>
                <OptionChip label="Bauch"      icon="crop-free"          selected={focusArea === 'bauch'}       onPress={() => { setFocusArea('bauch');       setStep('weeks'); }} />
                <OptionChip label="Beine"      icon="directions-run"     selected={focusArea === 'beine'}       onPress={() => { setFocusArea('beine');       setStep('weeks'); }} />
                <OptionChip label="Oberkörper" icon="sports-gymnastics"  selected={focusArea === 'oberkoerper'} onPress={() => { setFocusArea('oberkoerper'); setStep('weeks'); }} />
                <OptionChip label="Ganzkörper" icon="self-improvement"   selected={focusArea === 'ganzkörper'}  onPress={() => { setFocusArea('ganzkörper');  setStep('weeks'); }} />
              </View>
            </>
          )}

          {/* ── SCHRITT: Programmdauer ── */}
          {step === 'weeks' && (
            <>
              <Text style={styles.coachText}>Wie lange soll der Plan laufen?</Text>
              <View style={styles.chipRow}>
                {([4, 8, 12] as TargetWeeks[]).map((w) => (
                  <OptionChip
                    key={w}
                    label={`${w} Wochen`}
                    sub={w === 4 ? 'Schnell-Start' : w === 8 ? 'Empfohlen' : 'Intensiv'}
                    selected={weeks === w}
                    onPress={() => { setWeeks(w); setStep('days'); }}
                  />
                ))}
              </View>
            </>
          )}

          {/* ── SCHRITT: Trainingstage ── */}
          {step === 'days' && (
            <>
              <Text style={styles.coachText}>Wann trainierst du?</Text>
              <Text style={styles.coachSub}>
                Wähle deine Wochentage — die Anzahl bestimmt, wie viele Tage dein Split hat.
              </Text>

              <View style={styles.dayRow}>
                {WEEK_DAYS.map(({ label, value }) => {
                  const active = scheduledDays.includes(value);
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[styles.dayChip, active && styles.dayChipActive]}
                      onPress={() => toggleDay(value)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {scheduledDays.length > 0 && (
                <View style={styles.daySummary}>
                  <MaterialIcons name="info-outline" size={13} color={C_MUTED} />
                  <Text style={styles.daySummaryText}>
                    {scheduledDays.length}× pro Woche
                    {scheduledDays.length >= 4
                      ? ' · Split-Training'
                      : scheduledDays.length === 3
                        ? ' · Push/Pull/Beine'
                        : ' · Ganzkörper'}
                  </Text>
                </View>
              )}

              <TouchableOpacity style={styles.nextBtn} onPress={() => setStep('duration')} activeOpacity={0.8}>
                <Text style={styles.nextBtnText}>Weiter</Text>
                <MaterialIcons name="arrow-forward" size={17} color="#121212" />
              </TouchableOpacity>

              {scheduledDays.length === 0 && (
                <Text style={styles.skipHint}>
                  Ohne Auswahl erstellt der Coach einen 3-Tage-Split zum flexiblen Einteilen.
                </Text>
              )}
            </>
          )}

          {/* ── SCHRITT: Dauer pro Einheit ── */}
          {step === 'duration' && (
            <>
              <Text style={styles.coachText}>Wie viel Zeit hast du pro Training?</Text>
              <View style={styles.chipRow}>
                {SESSION_OPTIONS.map((m) => (
                  <OptionChip
                    key={m}
                    label={`${m} Min`}
                    selected={sessionMinutes === m}
                    onPress={() => { setSessionMinutes(m); setStep(needsLevelStep ? 'level' : 'restrictions'); }}
                  />
                ))}
              </View>
            </>
          )}

          {/* ── SCHRITT: Trainingsniveau (nur falls im Profil unbekannt) ── */}
          {step === 'level' && (
            <>
              <Text style={styles.coachText}>Wie schätzt du dein Trainingsniveau ein?</Text>
              <Text style={styles.coachSub}>Wird für künftige Pläne im Profil gemerkt.</Text>
              <View style={styles.chipRow}>
                {FITNESS_LEVEL_OPTIONS.map((lvl) => (
                  <OptionChip
                    key={lvl}
                    label={FITNESS_LEVEL_LABEL[lvl]}
                    selected={fitnessLevel === lvl}
                    onPress={() => { setFitnessLevel(lvl); setStep('restrictions'); }}
                  />
                ))}
              </View>
            </>
          )}

          {/* ── SCHRITT: Einschränkungen ── */}
          {step === 'restrictions' && (
            <>
              <Text style={styles.coachText}>Gibt es Einschränkungen?</Text>
              <Text style={styles.coachSub}>
                Z. B. Verletzungen oder Übungen, die du meiden willst — optional.
              </Text>
              {error && <Text style={styles.errorText}>{error}</Text>}

              <TextInput
                style={styles.restrictionsInput}
                value={restrictions}
                onChangeText={setRestrictions}
                placeholder="z. B. Knieprobleme, kein Springen…"
                placeholderTextColor="#555"
                multiline
                maxLength={200}
              />

              <TouchableOpacity
                style={styles.nextBtn}
                onPress={triggerGeneration}
                activeOpacity={0.8}
              >
                <MaterialIcons name="auto-awesome" size={17} color="#121212" />
                <Text style={styles.nextBtnText}>Plan generieren</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── LADE-ANIMATION ── */}
          {step === 'loading' && (
            <View style={styles.loadingContainer}>
              <AnimatedLogo size={90} />
              <Animated.Text style={[styles.loadingText, { opacity: loadingOpacity }]}>
                {LOADING_MESSAGES[loadingMsgIdx]}
              </Animated.Text>
              <Text style={styles.loadingSubText}>
                Gemini erstellt deinen personalisierten Plan
              </Text>
              {goal && focusArea && weeks && (
                <View style={styles.loadingMeta}>
                  <Text style={styles.loadingMetaText}>
                    {goal === 'abnehmen' ? 'Fettverbrennung' : 'Muskelaufbau'}
                    {'  ·  '}
                    {focusArea === 'ganzkörper' ? 'Ganzkörper' : focusArea === 'oberkoerper' ? 'Oberkörper' : focusArea.charAt(0).toUpperCase() + focusArea.slice(1)}
                    {'  ·  '}{weeks} Wo.
                    {'  ·  '}{environment === 'gym' ? 'Studio' : 'Zuhause'}
                    {scheduledDays.length > 0 ? `  ·  ${scheduledDays.length}×/Woche` : ''}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── VORSCHAU ── */}
          {step === 'preview' && plan && (
            <>
              <View style={styles.previewHeader}>
                <MaterialIcons name="auto-awesome" size={20} color={C_ACCENT} />
                <Text style={styles.previewTitle}>{plan.title}</Text>
              </View>

              <View style={styles.previewMeta}>
                <View style={styles.metaChip}>
                  <Text style={styles.metaText}>{plan.target_weeks} Wochen</Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaText}>
                    {plan.fitness_goal === 'abnehmen' ? 'Fettverbrennung' : 'Muskelaufbau'}
                  </Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaText}>
                    {plan.environment === 'gym' ? 'Studio' : 'Zuhause'}
                  </Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaText}>{plan.estimated_duration_minutes} Min/Einheit</Text>
                </View>
                {plan.is_circuit && (
                  <View style={[styles.metaChip, { borderColor: C_ORANGE }]}>
                    <Text style={[styles.metaText, { color: C_ORANGE }]}>Zirkel</Text>
                  </View>
                )}
              </View>

              {plan.scheduled_days && plan.scheduled_days.length > 0 && (
                <View style={styles.scheduleDays}>
                  {WEEK_DAYS.filter(({ value }) => plan.scheduled_days!.includes(value)).map(({ label, value }) => (
                    <View key={value} style={styles.scheduleDayChip}>
                      <Text style={styles.scheduleDayText}>{label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {plan.restrictions && (
                <View style={styles.noteBox}>
                  <MaterialIcons name="health-and-safety" size={14} color={C_ORANGE} />
                  <Text style={styles.noteBoxText}>Berücksichtigt: {plan.restrictions}</Text>
                </View>
              )}

              {plan.progression_notes && (
                <View style={styles.noteBox}>
                  <MaterialIcons name="trending-up" size={14} color={C_ACCENT} />
                  <Text style={styles.noteBoxText}>{plan.progression_notes}</Text>
                </View>
              )}

              {plan.days.map((day) => (
                <View key={day.day_index} style={styles.dayCard}>
                  <Text style={styles.dayCardTitle}>Tag {day.day_index} · {day.label}</Text>

                  {day.warmup && (
                    <Text style={styles.dayCardSub}>🔥 Warm-up: {day.warmup}</Text>
                  )}

                  <View style={styles.exerciseList}>
                    {day.exercises.map((ex, i) => (
                      <ExercisePreviewRow
                        key={i}
                        name={ex.exercise_name}
                        description={ex.short || ex.description}
                        muscleGroup={ex.muscle_group}
                        equipmentType={ex.equipment_type}
                        sets={ex.sets}
                        reps={ex.reps}
                        duration={ex.target_duration}
                        rest={ex.rest_seconds}
                      />
                    ))}
                  </View>

                  {day.cooldown && (
                    <Text style={styles.dayCardSub}>🧊 Cool-down: {day.cooldown}</Text>
                  )}
                </View>
              ))}

              {error && <Text style={styles.errorText}>{error}</Text>}

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#121212" />
                  : <>
                      <MaterialIcons name="check" size={18} color="#121212" />
                      <Text style={styles.saveBtnText}>Plan speichern</Text>
                    </>
                }
              </TouchableOpacity>

              <TouchableOpacity style={styles.regenerateBtn} onPress={() => setStep('goal')} activeOpacity={0.7}>
                <MaterialIcons name="refresh" size={16} color={C_MUTED} />
                <Text style={styles.regenerateBtnText}>Neu generieren</Text>
              </TouchableOpacity>
            </>
          )}

        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C_BG },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 20,
    paddingTop:        56,
    paddingBottom:     12,
    borderBottomWidth: 1,
    borderBottomColor: C_BORDER,
  },
  headerLeft:  { width: 32 },
  headerTitle: { color: C_TEXT, fontSize: 16, fontWeight: '700' },

  dots:      { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  dot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: C_INPUT },
  dotActive: { backgroundColor: C_ACCENT },

  body: { padding: 24, paddingBottom: 48 },

  coachText: { color: C_TEXT, fontSize: 20, fontWeight: '700', marginBottom: 8, lineHeight: 28 },
  coachSub:  { color: C_MUTED, fontSize: 13, marginBottom: 20 },

  // Auswahl-Chips (Ziel / Umgebung / Fokus / Wochen / Dauer / Level)
  chipRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip:              { flex: 1, minWidth: '44%', backgroundColor: C_CARD, borderRadius: 14, borderWidth: 1, borderColor: C_BORDER, padding: 16, alignItems: 'center' },
  chipSelected:      { borderColor: C_ACCENT, backgroundColor: '#051e22' },
  chipLabel:         { color: C_MUTED, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  chipLabelSelected: { color: C_ACCENT },
  chipSub:           { color: '#555', fontSize: 11, marginTop: 4, textAlign: 'center' },
  chipSubSelected:   { color: '#4a9ca8' },

  // Wochentage
  dayRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  dayChip: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: C_INPUT, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C_BORDER,
  },
  dayChipActive:     { backgroundColor: '#051e22', borderColor: C_ACCENT },
  dayChipText:       { color: C_MUTED, fontSize: 12, fontWeight: '700' },
  dayChipTextActive: { color: C_ACCENT },

  // Geräte-Auswahl (Mehrfachauswahl, variable Breite)
  equipChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: C_INPUT, borderWidth: 1, borderColor: C_BORDER,
  },
  equipChipActive:     { backgroundColor: '#051e22', borderColor: C_ACCENT },
  equipChipText:       { color: C_MUTED, fontSize: 13, fontWeight: '600' },
  equipChipTextActive: { color: C_ACCENT },

  daySummary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 20,
  },
  daySummaryText: { color: C_MUTED, fontSize: 12 },

  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C_ACCENT, borderRadius: 16, paddingVertical: 15,
    marginTop: 4,
  },
  nextBtnText: { color: '#121212', fontSize: 15, fontWeight: '700' },

  skipHint: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 10 },

  restrictionsInput: {
    backgroundColor: C_INPUT, borderRadius: 14, borderWidth: 1, borderColor: C_BORDER,
    color: C_TEXT, fontSize: 14, padding: 14, minHeight: 90, textAlignVertical: 'top',
    marginBottom: 20,
  },

  // Loading
  loadingContainer: { alignItems: 'center', paddingTop: 60, gap: 16 },
  loadingText:      { color: C_ACCENT, fontSize: 18, fontWeight: '700', marginTop: 8 },
  loadingSubText:   { color: C_MUTED, fontSize: 13, textAlign: 'center' },
  loadingMeta: {
    marginTop: 8, backgroundColor: C_CARD, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  loadingMetaText: { color: '#555', fontSize: 12, textAlign: 'center' },

  // Vorschau
  previewHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  previewTitle:   { color: C_TEXT, fontSize: 18, fontWeight: '700', flex: 1 },
  previewMeta:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metaChip:       { borderWidth: 1, borderColor: C_ACCENT, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  metaText:       { color: C_ACCENT, fontSize: 12, fontWeight: '600' },

  scheduleDays:    { flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  scheduleDayChip: { backgroundColor: '#0d2a14', borderRadius: 8, borderWidth: 1, borderColor: '#4caf50', paddingHorizontal: 10, paddingVertical: 4 },
  scheduleDayText: { color: '#4caf50', fontSize: 12, fontWeight: '700' },

  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: C_CARD, borderRadius: 10, padding: 12, marginBottom: 12,
  },
  noteBoxText: { color: C_MUTED, fontSize: 12, flex: 1, lineHeight: 17 },

  dayCard: {
    backgroundColor: C_CARD, borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: C_BORDER,
  },
  dayCardTitle: { color: C_ACCENT, fontSize: 13, fontWeight: '700', marginBottom: 8, letterSpacing: 0.3 },
  dayCardSub:   { color: '#777', fontSize: 11, lineHeight: 16, marginTop: 8 },

  exerciseList:        { gap: 10 },
  exRow:               { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pictoBox:            { width: 66, minHeight: 36, borderRadius: 8, borderWidth: 1, borderColor: C_ACCENT, backgroundColor: '#051e22', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 4 },
  pictoText:           { color: C_ACCENT, fontSize: 9, fontWeight: '700', textAlign: 'center', lineHeight: 12 },
  exBody:              { flex: 1, gap: 3 },
  exName:              { color: C_TEXT, fontSize: 13, fontWeight: '700' },
  exDescription:       { color: C_MUTED, fontSize: 11 },
  exMetaCol:           { alignItems: 'flex-end' },
  exDetail:            { color: C_MUTED, fontSize: 12, fontWeight: '600' },
  exRest:              { color: '#555', fontSize: 10, marginTop: 1 },

  saveBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C_ACCENT, borderRadius: 16, paddingVertical: 15, marginBottom: 12, marginTop: 8 },
  saveBtnText:     { color: '#121212', fontSize: 15, fontWeight: '700' },
  regenerateBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  regenerateBtnText: { color: C_MUTED, fontSize: 13 },

  errorText: { color: '#FF5252', fontSize: 13, marginBottom: 12, textAlign: 'center' },
});
