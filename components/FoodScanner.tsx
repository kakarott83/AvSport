import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { AnimatedLogo } from '@/components/AnimatedLogo';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

// ─── Ring constants ───────────────────────────────────────────────────────────

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

type Phase = 'camera' | 'tip' | 'camera2' | 'review' | 'analyzing' | 'result' | 'saving';
type CapturedPhoto = { base64: string; uri: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  onDetected: (data: FoodAnalysis) => void;
  dailyKcalGoal?: number;
  proteinGoal?: number;
};

// ─── MealRing ─────────────────────────────────────────────────────────────────

function MealRing({
  calProgress, carbProgress, protProgress, calPct,
}: {
  calProgress: number; carbProgress: number; protProgress: number; calPct: number;
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
  const [image1, setImage1] = useState<CapturedPhoto | null>(null);
  const [image2, setImage2] = useState<CapturedPhoto | null>(null);
  const [notes,  setNotes]  = useState('');
  const [result, setResult] = useState<FoodAnalysis | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  function reset() {
    setPhase('camera');
    setImage1(null);
    setImage2(null);
    setNotes('');
    setResult(null);
    setError(null);
    setIsCapturing(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function capturePhoto(): Promise<CapturedPhoto | null> {
    if (!cameraRef.current || isCapturing) return null;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.2 });
      if (!photo?.base64 || !photo?.uri) throw new Error('Kein Bild erhalten');
      return { base64: photo.base64, uri: photo.uri };
    } finally {
      setIsCapturing(false);
    }
  }

  async function handleCapture() {
    setError(null);
    try {
      const photo = await capturePhoto();
      if (!photo) return;
      setImage1(photo);
      setPhase('tip');
    } catch (e: any) {
      setError(e?.message || 'Aufnahme fehlgeschlagen');
    }
  }

  async function handleCapture2() {
    setError(null);
    try {
      const photo = await capturePhoto();
      if (!photo) return;
      setImage2(photo);
      setPhase('review');
    } catch (e: any) {
      setError(e?.message || 'Aufnahme fehlgeschlagen');
    }
  }

  async function handleAnalyze() {
    if (!image1) return;
    setError(null);
    setPhase('analyzing');
    try {
      const data = await analyzeFoodImage(
        image1.base64,
        image2?.base64,
        notes.trim() || undefined,
      );
      setResult(data);
      setPhase('result');
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('503')) {
        setError('Die KI ist gerade stark ausgelastet. Bitte versuch es gleich nochmal! ☕');
      } else if (e instanceof TypeError || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
        setError('Verbindung fehlgeschlagen. Prüfe dein Internet.');
      } else {
        setError(msg || 'Analyse fehlgeschlagen');
      }
      setPhase('review');
    }
  }

  async function handleSave() {
    if (!result) return;
    setError(null);
    setPhase('saving');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Nicht eingeloggt — Mahlzeit konnte nicht gespeichert werden.');
      setPhase('result');
      return;
    }

    const { error: dbErr } = await supabase.from('food_logs').insert({
      user_id:   user.id,
      meal_name: result.name,
      calories:  result.calories,
      protein:   result.protein,
      carbs:     result.carbs,
      fat:       result.fat,
    });

    if (dbErr) {
      setError(`Speichern fehlgeschlagen: ${dbErr.message}`);
      setPhase('result');
      return;
    }

    const saved = result;
    reset();
    onClose();
    onDetected(saved);
  }

  if (!permission) return null;

  const calPct       = result ? Math.round((result.calories / dailyKcalGoal) * 100) : 0;
  const calProgress  = result ? result.calories / dailyKcalGoal : 0;
  const carbProgress = result ? result.carbs / CARBS_REF : 0;
  const protProgress = result ? result.protein / proteinGoal : 0;

  const isCameraPhase = phase === 'camera' || phase === 'camera2';

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <View style={s.root}>

        {/* ── Camera phases ── */}
        {isCameraPhase && (
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

            {permission.granted && (
              <View style={s.controls}>
                {phase === 'camera2' && (
                  <View style={s.camera2Banner}>
                    <MaterialIcons name="straighten" size={14} color="#FF9100" />
                    <Text style={s.camera2BannerText}>
                      Referenzobjekt (z. B. Hand oder Besteck) neben den Teller legen
                    </Text>
                  </View>
                )}
                {error && <Text style={s.errorText}>{error}</Text>}
                <TouchableOpacity
                  style={[s.shutterBtn, isCapturing && s.shutterDisabled]}
                  onPress={phase === 'camera' ? handleCapture : handleCapture2}
                  disabled={isCapturing}
                  activeOpacity={0.85}
                >
                  <View style={s.shutterInner} />
                </TouchableOpacity>
                {phase === 'camera2' && (
                  <TouchableOpacity style={s.skipBtn} onPress={() => setPhase('review')} activeOpacity={0.7}>
                    <Text style={s.skipText}>Überspringen</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}

        {/* ── Tip phase ── */}
        {phase === 'tip' && image1 && (
          <View style={s.centeredBox}>
            <Image source={{ uri: image1.uri }} style={s.tipThumb} resizeMode="cover" />

            <View style={s.tipBox}>
              <MaterialIcons name="lightbulb-outline" size={18} color="#FF9100" style={{ marginTop: 1 }} />
              <Text style={s.tipText}>
                Tipp: Mache ein zweites Foto mit einem Referenzobjekt (z.{' '}B. Hand oder Besteck) neben dem Teller für eine genauere Schätzung.
              </Text>
            </View>

            <TouchableOpacity style={s.primaryBtn} onPress={() => setPhase('camera2')} activeOpacity={0.85}>
              <MaterialIcons name="add-a-photo" size={18} color="#121212" />
              <Text style={s.primaryBtnText}>Zweites Foto aufnehmen</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.skipBtn} onPress={() => setPhase('review')} activeOpacity={0.7}>
              <Text style={s.skipText}>Überspringen</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Review phase ── */}
        {phase === 'review' && image1 && (
          <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: '#121212' }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              contentContainerStyle={s.reviewContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={s.sectionLabel}>MAHLZEIT ÜBERPRÜFEN</Text>

              <View style={s.thumbnailRow}>
                {/* image1 */}
                <View style={s.thumbSlot}>
                  <Image source={{ uri: image1.uri }} style={s.thumbImg} resizeMode="cover" />
                  <View style={s.thumbBadge}>
                    <MaterialIcons name="check" size={11} color="#4caf50" />
                    <Text style={s.thumbBadgeText}>Mahlzeit</Text>
                  </View>
                </View>

                {/* image2 or empty slot */}
                {image2 ? (
                  <View style={s.thumbSlot}>
                    <Image source={{ uri: image2.uri }} style={s.thumbImg} resizeMode="cover" />
                    <View style={[s.thumbBadge, { backgroundColor: '#0a1a1e' }]}>
                      <MaterialIcons name="straighten" size={11} color={COLOR_CALORIES} />
                      <Text style={[s.thumbBadgeText, { color: COLOR_CALORIES }]}>Referenz</Text>
                    </View>
                    <TouchableOpacity style={s.removeThumbBtn} onPress={() => setImage2(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <MaterialIcons name="close" size={13} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={[s.thumbSlot, s.emptySlot]} onPress={() => { setError(null); setPhase('camera2'); }} activeOpacity={0.7}>
                    <MaterialIcons name="add-a-photo" size={22} color="#444" />
                    <Text style={s.emptySlotTitle}>Optional</Text>
                    <Text style={s.emptySlotSub}>Referenzobjekt</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={s.notesSection}>
                <Text style={s.notesLabel}>DETAILS (OPTIONAL)</Text>
                <TextInput
                  style={s.notesInput}
                  placeholder={'z. B. „200g Reis, Dressing separat“'}
                  placeholderTextColor="#444"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {error && <Text style={s.errorText}>{error}</Text>}

              <TouchableOpacity style={s.analyzeBtn} onPress={handleAnalyze} activeOpacity={0.85}>
                <MaterialIcons name="auto-awesome" size={18} color="#121212" />
                <Text style={s.analyzeBtnText}>Analysieren</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.retryBtn} onPress={reset} activeOpacity={0.7}>
                <Text style={s.retryText}>Nochmal aufnehmen</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* ── Analyzing phase ── */}
        {phase === 'analyzing' && (
          <View style={[s.centeredBox, { justifyContent: 'center', alignItems: 'center' }]}>
            <AnimatedLogo size={90} />
            <Text style={s.analyzingText}>KI analysiert…</Text>
            {image2 && (
              <Text style={s.analyzingSubText}>Beide Bilder werden ausgewertet</Text>
            )}
          </View>
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

            {error && <Text style={s.errorText}>{error}</Text>}

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

  controls: {
    position: 'absolute',
    bottom: 64,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 14,
  },
  camera2Banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a2800',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 24,
  },
  camera2BannerText: {
    color: '#FF9100',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 17,
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
  shutterDisabled: { opacity: 0.5 },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

  centeredBox: {
    flex: 1,
    backgroundColor: '#121212',
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 48,
    gap: 16,
  },
  permText: { color: '#aaa', fontSize: 15, textAlign: 'center', lineHeight: 22 },

  // Tip
  tipThumb: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    backgroundColor: '#1e1e1e',
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#1a1200',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3a2800',
    padding: 14,
  },
  tipText: {
    flex: 1,
    color: '#ccc',
    fontSize: 13,
    lineHeight: 19,
  },

  // Review
  reviewContent: {
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 48,
    gap: 16,
  },
  sectionLabel: {
    color: '#999',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  thumbnailRow: {
    flexDirection: 'row',
    gap: 12,
  },
  thumbSlot: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    position: 'relative',
  },
  thumbImg: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  thumbBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0d2a14',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  thumbBadgeText: {
    color: '#4caf50',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  removeThumbBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlot: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 120,
    borderStyle: 'dashed',
    borderColor: '#333',
  },
  emptySlotTitle: { color: '#555', fontSize: 12, fontWeight: '700' },
  emptySlotSub:   { color: '#3a3a3a', fontSize: 10 },

  notesSection: { gap: 8 },
  notesLabel: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  notesInput: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
  },

  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLOR_CALORIES,
    borderRadius: 16,
    paddingVertical: 16,
  },
  analyzeBtnText: { color: '#121212', fontSize: 16, fontWeight: '800' },

  analyzingText:    { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 16, textAlign: 'center' },
  analyzingSubText: { color: '#555', fontSize: 12, marginTop: 4, textAlign: 'center' },

  // Result card
  previewCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardLabel: {
    color: '#999',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  nutritionRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 12 },
  nutritionInfo: { flex: 1 },
  mealName:  { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 6, lineHeight: 18 },
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

  // Shared
  errorText: { color: '#FF5252', fontSize: 13, fontWeight: '600', textAlign: 'center', paddingHorizontal: 8 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLOR_CALORIES,
    borderRadius: 16,
    paddingVertical: 16,
  },
  primaryBtnText: { color: '#121212', fontSize: 16, fontWeight: '800' },
  skipBtn:  { alignItems: 'center', paddingVertical: 8 },
  skipText: { color: '#555', fontSize: 14, fontWeight: '600' },
  retryBtn:  { alignItems: 'center', paddingVertical: 10 },
  retryText: { color: '#555', fontSize: 14, fontWeight: '600' },

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
