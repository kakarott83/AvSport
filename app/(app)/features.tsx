/**
 * app/(app)/features.tsx — "Funktionen & Tipps"
 *
 * Statische Übersicht aller App-Funktionen, damit Nutzer z. B. die
 * foto-freien Erfassungswege finden. Erreichbar über Profil → Funktionen & Tipps.
 * Neue Features hier mit aufnehmen.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

type Section = { icon: IconName; color: string; title: string; where: string; points: string[] };

const SECTIONS: Section[] = [
  {
    icon: 'home',
    color: '#00E5FF',
    title: 'Home',
    where: 'Tab „Home“',
    points: [
      'Tagesüberblick: Schritte, aktive Minuten, Kalorien und Protein von heute.',
      'Gewichtsverlauf mit Hinweisen, z. B. wenn ein Gewichtssprung auf einen Tag mit Alkohol fällt.',
      'Schnellzugriff: freies Training starten, Mahlzeit oder Körperwerte erfassen.',
    ],
  },
  {
    icon: 'fitness-center',
    color: '#FF9100',
    title: 'Training & Pläne',
    where: 'Tab „Pläne“',
    points: [
      'Trainingspläne selbst anlegen oder per „✨ KI-Plan“ erstellen lassen.',
      'Übungsbeschreibungen kommen von der KI und lassen sich anpassen.',
      'Geführtes Training mit Sätzen, Zirkeln und Pausen-Timer.',
      'Der geschätzte Kalorienverbrauch deines Trainings erhöht dein Tagesziel.',
    ],
  },
  {
    icon: 'restaurant',
    color: '#0a7ea4',
    title: 'Ernährung',
    where: 'Tab „Ernährung“',
    points: [
      'Foto-Scanner: Teller fotografieren — die KI erkennt die Zutaten, die Nährwerte kommen aus der USDA-Datenbank. Ein zweites Foto mit Hand oder Besteck macht die Portion genauer.',
      'Ohne Foto: „Stattdessen beschreiben“ im Scanner — tippen oder diktieren, was du gegessen hast, auch den ganzen Tag auf einmal. Die Nährwerte werden berechnet und jedes Gericht landet als eigener Eintrag im Journal.',
      'Tag erfassen (Listen-Symbol): mehrere bisherige Gerichte auf einmal auswählen und Portion oder kcal anpassen — oder neue Gerichte direkt selbst eintragen.',
      'Manuell erfassen über „+ Mahlzeit“, optional mit dem Wasser dazu.',
      'Kalorienziel für heute anpassen und Verlauf der letzten 7 Tage ansehen.',
      'Tippe auf „Ziel kcal“ (oder auf dem Home-Screen auf „von … kcal“), um Schritt für Schritt zu sehen, wie dein Kalorienziel berechnet wird.',
    ],
  },
  {
    icon: 'event-note',
    color: '#BB86FC',
    title: 'Kalender',
    where: 'Tab „Kalender“',
    points: [
      'Tage markieren, z. B. „Kein Alkohol“ oder „Viel Stress“, und Notizen hinzufügen.',
      'Eigene Tags anlegen, um Gewohnheiten über den Monat zu verfolgen.',
    ],
  },
  {
    icon: 'water-drop',
    color: '#FF5252',
    title: 'Zyklus & Periode',
    where: 'Tab „Kalender“ (bei weiblichem Profil mit Zyklus-Tracking)',
    points: [
      'Der Kalender zeigt deine Periode, die Prognose für die nächsten Monate, fruchtbare Tage und den Eisprung.',
      'Periodendaten werden aus Apple Health bzw. Health Connect übernommen — einmal „Periode aus … übernehmen“ antippen.',
      'Blutungstage lassen sich zusätzlich direkt im Kalender erfassen; beides zählt.',
      'Optionale Erinnerungen vor der Periode und zum fruchtbaren Fenster.',
      'In der Lutealphase erhöht sich dein Kalorienziel automatisch um einen kleinen Bonus.',
    ],
  },
  {
    icon: 'monitor-weight',
    color: '#2ecc71',
    title: 'Körperwerte',
    where: 'Home → Körperwerte erfassen',
    points: ['Gewicht und Umfänge (Brust, Bauch, Oberarme, Oberschenkel) erfassen und verfolgen.'],
  },
  {
    icon: 'person',
    color: '#aaa',
    title: 'Profil & Einstellungen',
    where: 'Tab „Profil“',
    points: [
      'Apple Health bzw. Health Connect verbinden, um Schritte automatisch zu übernehmen.',
      'Wasserziel und Trink-Erinnerungen einstellen.',
      'Premium: hebt das tägliche KI-Limit auf.',
      'Feedback direkt an uns schicken — über „Feedback geben“ oder den kleinen Sprechblasen-Button unten rechts (lange drücken blendet ihn aus).',
    ],
  },
];

export default function FeaturesScreen() {
  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Text style={s.intro}>Alles, was AvoraSport kann — und wo du es findest.</Text>
      {SECTIONS.map((sec) => (
        <View key={sec.title} style={s.card}>
          <View style={s.cardHead}>
            <View style={[s.iconCircle, { backgroundColor: `${sec.color}22` }]}>
              <MaterialIcons name={sec.icon} size={18} color={sec.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{sec.title}</Text>
              <Text style={s.where}>{sec.where}</Text>
            </View>
          </View>
          {sec.points.map((p) => (
            <View key={p} style={s.point}>
              <Text style={[s.bullet, { color: sec.color }]}>•</Text>
              <Text style={s.pointText}>{p}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  intro: { color: '#999', fontSize: 14, lineHeight: 20, marginBottom: 4 },
  card: { backgroundColor: '#1e1e1e', borderRadius: 16, padding: 16, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 15, fontWeight: '700' },
  where: { color: '#777', fontSize: 11, marginTop: 1 },
  point: { flexDirection: 'row', gap: 8 },
  bullet: { fontSize: 14, lineHeight: 19, fontWeight: '800' },
  pointText: { flex: 1, color: '#ccc', fontSize: 13, lineHeight: 19 },
});
