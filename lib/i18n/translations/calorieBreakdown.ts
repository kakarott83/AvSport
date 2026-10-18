import { defineMessages } from '../define';

export default defineMessages(
  {
    title: 'So entsteht dein Kalorienziel',
    bmrTitle: '1 · Grundumsatz',
    bmrText:
      'Die Energie, die dein Körper in völliger Ruhe verbraucht. Berechnet mit der Harris-Benedict-Formel aus deinen Profildaten:',
    male: 'Mann',
    female: 'Frau',
    years: 'Jahre',
    tdeeTitle: '2 · Gesamtumsatz',
    tdeeText:
      'Der Grundumsatz wird mit einem Aktivitätsfaktor für normale Alltagsbewegung multipliziert. AvoraSport rechnet mit {{factor}} („mäßig aktiv“).',
    incomplete:
      'Dein Profil ist unvollständig, deshalb wird pauschal mit {{kcal}} kcal gerechnet. Trage Geschlecht, Geburtsdatum, Größe und Gewicht im Profil ein, um deinen persönlichen Bedarf zu erhalten.',
    goalTitle: '{{n}} · Dein Tagesziel heute',
    tdee: 'Gesamtumsatz',
    goal: 'Ziel: {{goal}}',
    deficit: 'Moderates Defizit',
    surplus: 'Leichter Überschuss',
    manual: 'Manuelle Anpassung',
    fromProfile: 'Aus deinem Profil',
    workoutToday: 'Training heute',
    workoutCounted: 'Geschätzter Verbrauch deiner Workouts',
    workoutNotCounted: 'Nicht eingerechnet – „Trainings-Kalorien einrechnen“ ist im Profil aus',
    healthActivity: 'Aktivität aus {{source}}',
    healthHint: 'Heute gemessene Aktivitätskalorien',
    cycleBonus: 'Zyklus-Bonus',
    lutealPhase: 'Lutealphase',
    todayOnly: 'Anpassung nur für heute',
    dailyGoal: 'Tagesziel',
    footnote:
      'Alle Werte sind Schätzungen. Der tatsächliche Bedarf kann individuell um mehrere hundert kcal abweichen.',
  },
  {
    title: 'How your calorie goal is calculated',
    bmrTitle: '1 · Basal metabolic rate',
    bmrText:
      'The energy your body uses at complete rest. Calculated with the Harris-Benedict formula from your profile data:',
    male: 'Male',
    female: 'Female',
    years: 'years',
    tdeeTitle: '2 · Total energy expenditure',
    tdeeText:
      'The basal metabolic rate is multiplied by an activity factor for normal everyday movement. AvoraSport uses {{factor}} (“moderately active”).',
    incomplete:
      'Your profile is incomplete, so a flat {{kcal}} kcal is used. Enter gender, date of birth, height and weight in your profile to get your personal requirement.',
    goalTitle: '{{n}} · Your daily goal today',
    tdee: 'Total expenditure',
    goal: 'Goal: {{goal}}',
    deficit: 'Moderate deficit',
    surplus: 'Slight surplus',
    manual: 'Manual adjustment',
    fromProfile: 'From your profile',
    workoutToday: 'Training today',
    workoutCounted: 'Estimated burn of your workouts',
    workoutNotCounted: 'Not counted – “Include training calories” is off in your profile',
    healthActivity: 'Activity from {{source}}',
    healthHint: 'Active calories measured today',
    cycleBonus: 'Cycle bonus',
    lutealPhase: 'Luteal phase',
    todayOnly: 'Adjustment for today only',
    dailyGoal: 'Daily goal',
    footnote: 'All values are estimates. Your actual requirement may differ by several hundred kcal.',
  },
);
