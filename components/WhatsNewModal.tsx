/**
 * components/WhatsNewModal.tsx — "Neu in AvoraSport"
 *
 * Erscheint einmal pro Gerät nach einem Update mit den Neuerungen des
 * neuesten Releases (lib/whatsNew.ts). Neue Nutzer sehen es nicht.
 * Gesehen-Status in AsyncStorage (pro Gerät; best-effort).
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { t, useTranslation, type TranslationKey } from '@/lib/i18n';
import {
  pendingRelease,
  releaseTextKey,
  WHATS_NEW_STORAGE_KEY,
  type WhatsNewRelease,
} from '@/lib/whatsNew';
import { supabase } from '@/services/supabaseClient';

export function WhatsNewModal({ enabled }: { enabled: boolean }) {
  useTranslation();
  const [release, setRelease] = useState<WhatsNewRelease | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const [seen, { data: { user } }] = await Promise.all([
          AsyncStorage.getItem(WHATS_NEW_STORAGE_KEY),
          supabase.auth.getUser(),
        ]);
        if (!user || cancelled) return;
        const next = pendingRelease(seen, user.created_at);
        if (next) setRelease(next);
        // Neues Konto: Release gilt als gesehen, damit es später nicht auftaucht
        else if (!seen) await AsyncStorage.setItem(WHATS_NEW_STORAGE_KEY, '__new_user__');
      } catch {
        // best-effort — ohne Hinweis weiter
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  if (!release) return null;

  const base = `whatsNew.releases.${releaseTextKey(release.id)}`;
  const close = () => {
    AsyncStorage.setItem(WHATS_NEW_STORAGE_KEY, release.id).catch(() => {});
    setRelease(null);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.badge}>
            <MaterialIcons name="auto-awesome" size={22} color="#121212" />
          </View>
          <Text style={styles.title}>{t('whatsNew.title')}</Text>
          <Text style={styles.subtitle}>{t('whatsNew.subtitle')}</Text>

          <ScrollView style={styles.list} contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
            {release.items.map((item) => (
              <View key={item.key} style={styles.item}>
                <View style={styles.iconCircle}>
                  <MaterialIcons name={item.icon} size={20} color="#00E5FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{t(`${base}.${item.key}.title` as TranslationKey)}</Text>
                  <Text style={styles.itemText}>{t(`${base}.${item.key}.text` as TranslationKey)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.button} onPress={close} activeOpacity={0.85}>
            <Text style={styles.buttonText}>{t('whatsNew.button')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  sheet: {
    backgroundColor: '#1e1e1e', borderRadius: 22, borderWidth: 1, borderColor: '#2a2a2a',
    padding: 22, maxHeight: '85%',
  },
  badge: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#00E5FF',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#999', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  list: { flexGrow: 0 },
  item: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconCircle: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#0a2a30',
    alignItems: 'center', justifyContent: 'center',
  },
  itemTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  itemText: { color: '#aaa', fontSize: 13, lineHeight: 18, marginTop: 2 },
  button: { backgroundColor: '#00E5FF', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#121212', fontSize: 15, fontWeight: '800' },
});
