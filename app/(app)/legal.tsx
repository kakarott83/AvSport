/**
 * app/(app)/legal.tsx — "Rechtliches"
 *
 * Impressum, Nutzungsbedingungen (errechnete Werte, keine Gewähr, Haftung)
 * + rechtliche/gesundheitliche Hinweise. Der Zyklus-/Perioden-Teil
 * stellt klar, dass die Berechnungen nur eine rechnerische, keine tatsächliche
 * Sicherheit bieten (keine Verhütungsmethode).
 *
 * Texte: lib/i18n/translations/legal.ts (Deutsch ist maßgeblich, Englisch ist
 * eine Übersetzung).
 *
 * TODO(Betreiber): Die Platzhalter im Abschnitt "Impressum" mit den echten
 * Anbieter-Angaben nach § 5 DDG / § 18 MStV ersetzen.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { rechnerischeSicherheitHinweis } from '@/lib/cycle';
import { useTranslation } from '@/lib/i18n';

export default function LegalScreen() {
  const { t } = useTranslation();
  const translationNote = t('legal.translationNote');

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      {translationNote ? <Text style={styles.hint}>{translationNote}</Text> : null}

      {/* ── Impressum ── */}
      <Section title={t('legal.imprint.title')}>
        <Text style={styles.body}>{t('legal.imprint.info')}</Text>
        <Text style={styles.placeholder}>{t('legal.imprint.address')}</Text>
        <Text style={styles.body}>{t('legal.imprint.contact')}</Text>
        <Text style={styles.placeholder}>{t('legal.imprint.contactDetails')}</Text>
        <Text style={styles.hint}>{t('legal.imprint.responsible')}</Text>
      </Section>

      {/* ── Nutzungsbedingungen: errechnete Werte / Gewährleistung / Haftung ── */}
      <Section title={t('legal.terms.title')}>
        <Text style={styles.subTitle}>{t('legal.terms.calculatedTitle')}</Text>
        <Text style={styles.body}>{t('legal.terms.calculatedIntro')}</Text>
        <Text style={styles.body}>{t('legal.terms.calculatedList')}</Text>
        <Text style={styles.body}>{t('legal.terms.calculatedBasis')}</Text>

        <Text style={styles.subTitle}>{t('legal.terms.warrantyTitle')}</Text>
        <Text style={styles.body}>{t('legal.terms.warranty')}</Text>

        <Text style={styles.subTitle}>{t('legal.terms.liabilityTitle')}</Text>
        <Text style={styles.body}>{t('legal.terms.liability')}</Text>
        <Text style={styles.hint}>{t('legal.terms.asOf')}</Text>
      </Section>

      {/* ── Gesundheitshinweis Zyklus-Tracking ── */}
      <Section title={t('legal.cycle.title')}>
        <Text style={styles.body}>{rechnerischeSicherheitHinweis()}</Text>
        <Text style={styles.body}>{t('legal.cycle.method')}</Text>
        <Text style={styles.body}>{t('legal.cycle.safeDays')}</Text>
      </Section>

      {/* ── Abonnement ── */}
      <Section title={t('legal.subscription.title')}>
        <Text style={styles.body}>{t('legal.subscription.offer')}</Text>
        <Text style={styles.body}>{t('legal.subscription.billing')}</Text>
        <Text style={styles.body}>{t('legal.subscription.terms')}</Text>
      </Section>

      {/* ── Allgemein ── */}
      <Section title={t('legal.general.title')}>
        <Text style={styles.body}>{t('legal.general.body')}</Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },
  scroll: { padding: 20, gap: 16, paddingBottom: 48 },
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 16,
    gap: 10,
  },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  subTitle: { color: '#eee', fontSize: 13, fontWeight: '700', marginTop: 4 },
  body: { color: '#ccc', fontSize: 13, lineHeight: 19 },
  placeholder: {
    color: '#888',
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
    backgroundColor: '#161616',
    borderRadius: 10,
    padding: 12,
  },
  hint: { color: '#777', fontSize: 12, lineHeight: 17 },
});
