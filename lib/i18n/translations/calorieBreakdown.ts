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
      'Der Grundumsatz wird mit dem Aktivitätsfaktor deines Aktivitätslevels aus dem Profil multipliziert: {{level}} = {{factor}}.',
    stepNote:
      'Alltagsbewegung bis zu deinem Schrittziel von {{goal}} Schritten ist in diesem Faktor schon enthalten. Nur Schritte darüber erhöhen dein Tagesziel.',
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
    stepsExtra: 'Schritte über deinem Ziel',
    stepsExtraHint: '{{steps}} von {{goal}} Schritten ({{source}}) · {{extra}} × {{perStep}} kcal',
    stepsToday: 'Schritte heute',
    stepsBelowHint: '{{steps}} von {{goal}} Schritten ({{source}}) – Extra-kcal erst über dem Ziel',
    stepsOffHint: 'Health-Synchronisation aus – Schritte werden nicht eingerechnet',
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
      'The basal metabolic rate is multiplied by the activity factor of the activity level in your profile: {{level}} = {{factor}}.',
    stepNote:
      'Everyday movement up to your step goal of {{goal}} steps is already included in this factor. Only steps beyond it increase your daily goal.',
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
    stepsExtra: 'Steps beyond your goal',
    stepsExtraHint: '{{steps}} of {{goal}} steps ({{source}}) · {{extra}} × {{perStep}} kcal',
    stepsToday: 'Steps today',
    stepsBelowHint: '{{steps}} of {{goal}} steps ({{source}}) – extra kcal only beyond the goal',
    stepsOffHint: 'Health sync off – steps are not included',
    cycleBonus: 'Cycle bonus',
    lutealPhase: 'Luteal phase',
    todayOnly: 'Adjustment for today only',
    dailyGoal: 'Daily goal',
    footnote: 'All values are estimates. Your actual requirement may differ by several hundred kcal.',
  },
);
