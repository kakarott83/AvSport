/**
 * components/TipDetailModal.tsx — ganzer „Tipp des Tages“ mit Reaktionen
 * (Hilfreich, Merken, Nicht relevant) und optionalem Aktions-Button.
 * Gleicher Bottom-Sheet-Stil wie components/CalorieBreakdownModal.tsx.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTranslation } from '@/lib/i18n';
import { TIP_CATEGORY_COLORS, TIP_CATEGORY_ICONS, localizeTip, type Tip, type TipCta, type TipReaction } from '@/lib/tips';
import type { TipUserState } from '@/services/tips/tipService';

function haptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function TipDetailModal({
  visible, tip, state, onClose, onReact, onToggleSaved, onCta,
}: {
  visible: boolean;
  tip: Tip | null;
  state: TipUserState;
  onClose: () => void;
  onReact: (reaction: TipReaction) => void;
  onToggleSaved: () => void;
  onCta: (cta: TipCta) => void;
}) {
  const { t, language } = useTranslation();
  if (!tip) return null;
  const { title, body } = localizeTip(tip, language);
  const color = TIP_CATEGORY_COLORS[tip.category];
  const liked = state.reaction === 'like';
  const dismissed = state.reaction === 'dismiss';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MaterialIcons
                name={TIP_CATEGORY_ICONS[tip.category] as keyof typeof MaterialIcons.glyphMap}
                size={18}
                color={color}
              />
              <Text style={[styles.category, { color }]}>
                {t('tips.label')} · {t(`tips.categories.${tip.category}`)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.text}>{body}</Text>

            {tip.cta && (
              <TouchableOpacity
                style={[styles.ctaBtn, { backgroundColor: color }]}
                onPress={() => { haptic(); onCta(tip.cta!); }}
                activeOpacity={0.85}
              >
                <Text style={styles.ctaText}>{t(`tips.cta.${tip.cta}`)}</Text>
                <MaterialIcons name="arrow-forward" size={18} color="#121212" />
              </TouchableOpacity>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.chip, liked && styles.chipActive]}
                onPress={() => { haptic(); onReact('like'); }}
              >
                <MaterialIcons name={liked ? 'thumb-up' : 'thumb-up-off-alt'} size={16} color={liked ? '#00E5FF' : '#aaa'} />
                <Text style={[styles.chipText, liked && styles.chipTextActive]}>{t('tips.helpful')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, state.saved && styles.chipActive]}
                onPress={() => { haptic(); onToggleSaved(); }}
              >
                <MaterialIcons name={state.saved ? 'bookmark' : 'bookmark-border'} size={16} color={state.saved ? '#00E5FF' : '#aaa'} />
                <Text style={[styles.chipText, state.saved && styles.chipTextActive]}>
                  {state.saved ? t('tips.saved') : t('tips.save')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, dismissed && styles.chipActive]}
                onPress={() => { haptic(); onReact('dismiss'); }}
              >
                <MaterialIcons name="block" size={16} color={dismissed ? '#00E5FF' : '#aaa'} />
                <Text style={[styles.chipText, dismissed && styles.chipTextActive]}>{t('tips.notRelevant')}</Text>
              </TouchableOpacity>
            </View>

            {dismissed && <Text style={styles.hint}>{t('tips.notRelevantHint')}</Text>}
            <Text style={styles.hint}>{t('tips.disableHint')}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1a1a1a', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    maxHeight: '80%', paddingTop: 18,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  category: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  closeText: { color: '#888', fontSize: 18 },
  body: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  text: { color: '#ccc', fontSize: 15, lineHeight: 23 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 14, marginTop: 22,
  },
  ctaText: { color: '#121212', fontSize: 15, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#222', borderRadius: 20, borderWidth: 1, borderColor: '#333',
    paddingHorizontal: 14, paddingVertical: 9,
  },
  chipActive: { backgroundColor: '#0a2a30', borderColor: '#00E5FF' },
  chipText: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#00E5FF' },
  hint: { color: '#777', fontSize: 12, marginTop: 14, lineHeight: 17 },
});
