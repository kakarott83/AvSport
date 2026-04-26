import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { analyzeFoodImage } from '@/services/gemini/nutritionProvider';
import { supabase } from '@/services/supabaseClient';
import type { FoodAnalysis } from '@/types/vision';

// ─── Ring constants (mirrors Dashboard proportions) ───────────────────────────

const RING_SIZE = 140;
const R_OUT = 62;  const W_OUT = 11;
const R_MID = 48;  const W_MID = 9;
const R_IN  = 35;  const W_IN  = 8;

const CIRC_OUT = 2 * Math.PI * R_OUT;
const CIRC_MID = 2 * Math.PI * R_MID;
const CIRC_IN  = 2 * Math.PI * R_IN;

const SPRING_CFG = { damping: 14, stiffness: 55, overshootClamping: false } as const;

const COLOR_CALORIES = '#00E5FF';
const COLOR_CARBS    = '#FF9100';
const COLOR_PROTEIN  = '#FF5252';
const CARBS_REF      = 250;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'camera' | 'analyzing' | 'result' | 'saving';

type Props = {
  visible: boolean;
  onClose: () => void;
  onDetected: (data: FoodAnalysis) => void;
  dailyKcalGoal?: number;
  proteinGoal?: number;
};

// ─── MealRing ─────────────────────────────────────────────────────────────────

function MealRing({
  calProgress,
  carbProgress,
  protProgress,
  calPct,
}: {
  calProgress: number;
  carbProgress: number;
  protProgress: number;
  calPct: number;
}) {
  const offOut = useSharedValue(CIRC_OUT);
  const offMid = useSharedValue(CIRC_MID);
  const offIn  = useSharedValue(CIRC_IN);

  useEffect(() => {
    offOut.value = withSpring(CIRC_OUT * (1 - Math.min(calProgress,  1)), SPRING_CFG);
    offMid.value = withSpring(CIRC_MID * (1 - Math.min(carbProgress, 1)), SPRING_CFG);
    offIn.value  = withSpring(CIRC_IN  * (1 - Math.min(protProgress, 1)), SPRING_CFG);
  }, [calProgress, carbProgress, protProgress]);

  const propsOut = useAnimatedProps(() => ({ strokeDashoffset: offOut.value }));
  const propsMid = useAnimatedProps(() => ({ strokeDashoffset: offMid.value }));
  const propsIn  = useAnimatedProps(() => ({ strokeDashoffset: offIn.value }));

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE }}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R_OUT} stroke="#1a2a2a" strokeWidth={W_OUT} fill="none" />
        <AnimatedCircle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R_OUT} stroke={COLOR_CALORIES} strokeWidth={W_OUT} fill="none" strokeDasharray={CIRC_OUT} strokeLinecap="round" animatedProps={propsOut} />
        <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R_MID} stroke="#2a1a08" strokeWidth={W_MID} fill="none" />
        <AnimatedCircle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R_MID} stroke={COLOR_CARBS} strokeWidth={W_MID} fill="none" strokeDasharray={CIRC_MID} strokeLinecap="round" animatedProps={propsMid} />
        <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R_IN} stroke="#2a0d0d" strokeWidth={W_IN} fill="none" />
        <AnimatedCircle cx={RING_SIZE/2} cy={RING_SIZE/2} r={R_IN} stroke={COLOR_PROTEIN} strokeWidth={W_IN} fill="none" strokeDasharray={CIRC_IN} strokeLinecap="round" animatedProps={propsIn} />
      </Svg>
      <View style={ring.center}>
        <Text style={ring.pct}>{calPct}%</Text>
        <Text style={ring.sub}>KCAL</Text>
      </View>
    </View>
  );
}

const ring = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pct:    { fontSize: 22, fontWeight: '800', color: COLOR_CALORIES, lineHeight: 24 },
  sub:    { color: '#555', fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
});

// ─── Component ────────────────────────────────────────────────────────────────

export function FoodScanner({
  visible,
  onClose,
  onDetected,
  dailyKcalGoal = 2000,
  proteinGoal   = 150,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase,  setPhase]  = useState<Phase>('camera');
  const [result, setResult] = useState<FoodAnalysis | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const cameraRef           = useRef<CameraView>(null);

  function reset() {
    setPhase('camera');
    setResult(null);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleCapture() {
    if (!cameraRef.current) return;
    setError(null);
    setPhase('analyzing');
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.2 });
      if (!photo?.base64) throw new Error('Kein Bild-Daten erhalten');
      const data = await analyzeFoodImage(photo.base64);
      setResult(data);
      setPhase('result');
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('503')) {
        setError('Die KI ist gerade stark ausgelastet. Bitte versuch es in ein paar Sekunden noch einmal! ☕');
      } else if (e instanceof TypeError || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
        setError('Verbindung fehlgeschlagen. Prüfe dein Internet.');
      } else {
        setError(msg || 'Analyse fehlgeschlagen');
      }
    } finally {
      setPhase(p => p === 'analyzing' ? 'camera' : p);
    }
  }

  async function handleSave() {
    if (!result) return;
    setPhase('saving');

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('food_logs').insert({
        user_id:   user.id,
        meal_name: result.name,
        calories:  result.calories,
        protein:   result.protein,
        carbs:     result.carbs,
        fat:       result.fat,
      });
    }

    const saved = result;
    reset();
    onClose();
    onDetected(saved);
  }

  if (!permission) return null;

  const calPct      = result ? Math.round((result.calories / dailyKcalGoal) * 100) : 0;
  const calProgress = result ? result.calories / dailyKcalGoal : 0;
  const carbProgress = result ? result.carbs / CARBS_REF : 0;
  const protProgress = result ? result.protein / proteinGoal : 0;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <View style={s.root}>

        {/* ── Camera / Analyzing phase ── */}
        {(phase === 'camera' || phase === 'analyzing') && (
          <>
            {permission.granted ? (
              <CameraView ref={cameraRef} style={s.camera} facing="back" />
            ) : (
              <View style={s.centeredBox}>
                <Text style={s.permText}>Kamera-Zugriff wird benötigt</Text>
                <TouchableOpacity style={s.primaryBtn} onPress={requestPermission} activeOpacity={0.8}>
                  <Text style={s.primaryBtnText}>Erlauben</Text>
                </TouchableOpacity>
              </View>
            )}

            {phase === 'analyzing' ? (
              <View style={s.overlay}>
                <ActivityIndicator size="large" color="#00E5FF" />
                <Text style={s.overlayText}>KI analysiert…</Text>
              </View>
            ) : (
              permission.granted && (
                <View style={s.controls}>
                  {error && <Text style={s.errorText}>{error}</Text>}
                  <TouchableOpacity style={s.shutterBtn} onPress={handleCapture} activeOpacity={0.85}>
                    <View style={s.shutterInner} />
                  </TouchableOpacity>
                </View>
              )
            )}
          </>
        )}

        {/* ── Result / Saving phase ── */}
        {(phase === 'result' || phase === 'saving') && result && (
          <View style={s.centeredBox}>
            <View style={s.previewCard}>
              <Text style={s.cardLabel}>ERNÄHRUNG · VORSCHAU</Text>

              <View style={s.nutritionRow}>
                <MealRing
                  calProgress={calProgress}
                  carbProgress={carbProgress}
                  protProgress={protProgress}
                  calPct={calPct}
                />

                <View style={s.nutritionInfo}>
                  <Text style={s.mealName} numberOfLines={2}>{result.name}</Text>
                  <Text style={s.kcalValue}>{result.calories}</Text>
                  <Text style={s.kcalUnit}>kcal dieser Mahlzeit</Text>
                  <View style={s.kcalDivider} />
                  <View style={s.legendChip}>
                    <View style={[s.legendDot, { backgroundColor: COLOR_PROTEIN }]} />
                    <Text style={s.legendText}>{result.protein}/{proteinGoal}g P</Text>
                  </View>
                  <View style={s.legendChip}>
                    <View style={[s.legendDot, { backgroundColor: COLOR_CARBS }]} />
                    <Text style={s.legendText}>{result.carbs}g KH</Text>
                  </View>
                  <View style={s.legendChip}>
                    <View style={[s.legendDot, { backgroundColor: '#c0392b' }]} />
                    <Text style={s.legendText}>{result.fat}g Fett</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={s.cardLink}
                onPress={handleSave}
                disabled={phase === 'saving'}
                activeOpacity={0.7}
              >
                {phase === 'saving' ? (
                  <ActivityIndicator size="small" color={COLOR_CALORIES} />
                ) : (
                  <>
                    <Text style={s.cardLinkText}>Mahlzeit bestätigen</Text>
                    <MaterialIcons name="chevron-right" size={15} color={COLOR_CALORIES} />
                  </>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.retryBtn} onPress={reset} activeOpacity={0.7}>
              <Text style={s.retryText}>Nochmal aufnehmen</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Close ── */}
        <TouchableOpacity
          style={s.closeBtn}
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>

      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  overlayText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  controls: {
    position: 'absolute',
    bottom: 64,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 14,
  },
  shutterBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  errorText: { color: '#FF5252', fontSize: 13, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24 },

  centeredBox: {
    flex: 1,
    backgroundColor: '#121212',
    paddingHorizontal: 20,
    paddingVertical: 48,
    justifyContent: 'center',
    gap: 16,
  },
  permText: { color: '#aaa', fontSize: 15, textAlign: 'center', lineHeight: 22 },

  // Preview card (matches Dashboard card style)
  previewCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  nutritionRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 12 },
  nutritionInfo: { flex: 1 },
  mealName: { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 6, lineHeight: 18 },
  kcalValue: { color: '#fff', fontSize: 28, fontWeight: '800', lineHeight: 32 },
  kcalUnit:  { color: '#666', fontSize: 11, marginBottom: 2 },
  kcalDivider: { height: 1, backgroundColor: '#2a2a2a', marginVertical: 8 },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  legendDot:  { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: '#666', fontSize: 10, fontWeight: '600' },

  cardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    paddingTop: 12,
    marginTop: 4,
    gap: 2,
  },
  cardLinkText: { color: COLOR_CALORIES, fontSize: 12, fontWeight: '600' },

  retryBtn:  { alignItems: 'center', paddingVertical: 10 },
  retryText: { color: '#555', fontSize: 14, fontWeight: '600' },

  // Permission grant
  primaryBtn: { backgroundColor: '#00E5FF', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: '#121212', fontSize: 16, fontWeight: '800' },

  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
