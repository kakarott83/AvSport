/**
 * app/(app)/legal.tsx — "Rechtliches"
 *
 * Impressum, Nutzungsbedingungen (errechnete Werte, keine Gewähr, Haftung)
 * + rechtliche/gesundheitliche Hinweise. Der Zyklus-/Perioden-Teil
 * stellt klar, dass die Berechnungen nur eine rechnerische, keine tatsächliche
 * Sicherheit bieten (keine Verhütungsmethode).
 *
 * TODO(Betreiber): Die Platzhalter im Abschnitt "Impressum" mit den echten
 * Anbieter-Angaben nach § 5 DDG / § 18 MStV ersetzen.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { RECHNERISCHE_SICHERHEIT_HINWEIS } from '@/lib/cycle';

export default function LegalScreen() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      {/* ── Impressum ── */}
      <Section title="Impressum">
        <Text style={styles.body}>Angaben gemäß § 5 DDG:</Text>
        <Text style={styles.placeholder}>
          [Name des Anbieters]{'\n'}
          [Straße und Hausnummer]{'\n'}
          [PLZ und Ort]{'\n'}
          [Land]
        </Text>
        <Text style={styles.body}>Kontakt:</Text>
        <Text style={styles.placeholder}>
          E-Mail: [kontakt@example.com]{'\n'}
          Telefon: [optional]
        </Text>
        <Text style={styles.hint}>
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: [Name, Anschrift].
        </Text>
      </Section>

      {/* ── Nutzungsbedingungen: errechnete Werte / Gewährleistung / Haftung ── */}
      <Section title="Nutzungsbedingungen (AGB)">
        <Text style={styles.subTitle}>1. Errechnete Werte</Text>
        <Text style={styles.body}>
          Alle in AvoraSport angezeigten Werte werden automatisch errechnet oder
          geschätzt; es handelt sich nicht um Messwerte. Dazu gehören insbesondere:
        </Text>
        <Text style={styles.body}>
          • Zyklusphasen, Periodenprognosen, fruchtbares Fenster, Eisprung und die
          Einschätzung des Empfängnisrisikos{'\n'}
          • Kalorien- und Nährwerte von Mahlzeiten (KI-Erkennung aus Fotos und
          Beschreibungen sowie Lebensmitteldatenbanken){'\n'}
          • Kalorienziel, Wasserziel und Kalorienverbrauch aus Training und Schritten{'\n'}
          • KI-erstellte Trainingspläne und Übungsbeschreibungen
        </Text>
        <Text style={styles.body}>
          Die Berechnungen beruhen auf Durchschnittswerten, deinen eigenen Angaben
          und Daten Dritter (z. B. Apple Health, Health Connect, USDA FoodData
          Central). Sie können erheblich von den tatsächlichen Werten abweichen.
        </Text>

        <Text style={styles.subTitle}>2. Keine Gewähr</Text>
        <Text style={styles.body}>
          Der Anbieter übernimmt keine Gewähr für die Richtigkeit, Vollständigkeit
          und Aktualität der errechneten Werte. Entscheidungen über Gesundheit,
          Ernährung, Training, Verhütung oder Kinderwunsch solltest du nicht allein
          auf diese Werte stützen.
        </Text>

        <Text style={styles.subTitle}>3. Haftung</Text>
        <Text style={styles.body}>
          Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit,
          bei Verletzung des Lebens, des Körpers oder der Gesundheit sowie nach dem
          Produkthaftungsgesetz. Bei leicht fahrlässiger Verletzung wesentlicher
          Vertragspflichten ist die Haftung auf den vorhersehbaren, vertragstypischen
          Schaden begrenzt. Im Übrigen ist die Haftung für Schäden, die auf der
          Verwendung errechneter Werte beruhen, ausgeschlossen.
        </Text>
        <Text style={styles.hint}>Stand: Oktober 2026</Text>
      </Section>

      {/* ── Gesundheitshinweis Zyklus-Tracking ── */}
      <Section title="Hinweis zum Zyklus- und Perioden-Tracking">
        <Text style={styles.body}>{RECHNERISCHE_SICHERHEIT_HINWEIS}</Text>
        <Text style={styles.body}>
          Die angezeigten Phasen (Menstruation, Follikelphase, Eisprung,
          Lutealphase), das fruchtbare Fenster und die Einschätzung
          {' '}{'„'}rechnerisch geringes Risiko{'“'} beruhen auf der sogenannten
          Kalendermethode. Der
          errechnete Eisprung 14 Tage nach Beginn der Blutung ist ein Mittelwert;
          der tatsächliche Eisprung kann um mehrere Tage abweichen – besonders bei
          unregelmäßigem Zyklus, nach Absetzen hormoneller Verhütung, bei Stress,
          Krankheit, Reisen, Stillzeit oder in den Wechseljahren.
        </Text>
        <Text style={styles.body}>
          Eine Tageskennzeichnung als {'„'}unbedenklich{'“'} bedeutet
          ausschließlich eine rechnerisch geringere Wahrscheinlichkeit – nicht
          Sicherheit. Zur
          Verhütung oder bei Kinderwunsch ersetzt die App keine ärztliche
          Beratung und keine anerkannte Verhütungs- bzw. Zyklusmethode.
        </Text>
      </Section>

      {/* ── Abonnement ── */}
      <Section title="AvoraSport Premium (Abonnement)">
        <Text style={styles.body}>
          AvoraSport Premium wird als automatisch verlängerndes Abonnement angeboten
          (monatlich oder jährlich). Der konkrete Preis wird vor dem Kauf im
          App Store bzw. Google Play angezeigt.
        </Text>
        <Text style={styles.body}>
          Die Zahlung wird bei Kaufbestätigung über deinen App-Store-Account abgebucht.
          Das Abo verlängert sich automatisch um den gewählten Zeitraum, sofern es nicht
          spätestens 24 Stunden vor Ablauf der laufenden Periode gekündigt wird. Die
          Verwaltung und Kündigung des Abos erfolgt in den Account-Einstellungen des
          jeweiligen Stores.
        </Text>
        <Text style={styles.body}>
          Es gelten die Standard-Nutzungsbedingungen für Apple-Media-Dienste (EULA)
          bzw. die Google-Play-Nutzungsbedingungen sowie die Datenschutzhinweise dieser App.
        </Text>
      </Section>

      {/* ── Allgemein ── */}
      <Section title="Allgemeiner Hinweis">
        <Text style={styles.body}>
          AvoraSport dient der persönlichen Information rund um Training,
          Ernährung und Zyklus. Die Inhalte stellen keine medizinische Beratung,
          Diagnose oder Therapieempfehlung dar. Bei gesundheitlichen Fragen wende
          dich an eine Ärztin oder einen Arzt.
        </Text>
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
