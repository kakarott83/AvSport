import { defineMessages } from '../define';

/** Übungs-Details: lokaler Fallback-Text + Detail-Modal. */
export default defineMessages(
  {
    fallback: {
      defaultMuscle: 'die Zielmuskulatur',
      defaultEquipment: 'Körpergewicht',
      dosageSeconds: '{{sets}} × {{seconds}} Sekunden',
      dosageReps: '{{sets}} × {{reps}} Wiederholungen',
      short: '{{name}} kräftigt {{muscle}} — {{dosage}}, {{equipment}}.',
      detail:
        '{{name}} trainiert vorrangig {{muscle}}. Bewegung kontrolliert und in vollem Bewegungsumfang ausführen, ohne Schwung.\n\n- **Haltung**: Rumpf stabil anspannen, Wirbelsäule neutral halten.\n- **Häufiger Fehler**: Zu schnelles Tempo oder unvollständiger Bewegungsumfang.',
      step1: 'Startposition einnehmen und Rumpf stabilisieren.',
      step2: '{{dosage}} langsam und kontrolliert ausführen.',
      step3: 'Kurz in der Endposition halten, dann zurückführen.',
      beginner: 'Weniger Wiederholungen oder ohne Zusatzgewicht ausführen.',
      advanced: 'Tempo verlangsamen oder Zusatzgewicht/Wiederholungen erhöhen.',
      safety: 'Bei Schmerzen oder Unsicherheit die Übung abbrechen und Technik überprüfen.',
      tip1: 'Auf gleichmäßige, ruhige Atmung achten.',
      tip2: 'Lieber sauber und langsam als schnell und unsauber ausführen.',
    },
    modal: {
      execution: 'Ausführung',
      modifications: 'Anpassungen',
      beginner: 'Einsteiger',
      advanced: 'Fortgeschritten',
      tips: 'Tipps',
    },
  },
  {
    fallback: {
      defaultMuscle: 'the target muscles',
      defaultEquipment: 'bodyweight',
      dosageSeconds: '{{sets}} × {{seconds}} seconds',
      dosageReps: '{{sets}} × {{reps}} reps',
      short: '{{name}} strengthens {{muscle}} — {{dosage}}, {{equipment}}.',
      detail:
        '{{name}} mainly trains {{muscle}}. Perform the movement with control and through the full range of motion, without momentum.\n\n- **Posture**: Brace your core, keep your spine neutral.\n- **Common mistake**: Going too fast or using an incomplete range of motion.',
      step1: 'Get into the starting position and brace your core.',
      step2: 'Perform {{dosage}} slowly and with control.',
      step3: 'Hold briefly at the end position, then return.',
      beginner: 'Do fewer reps or skip the extra weight.',
      advanced: 'Slow down the tempo or add weight/reps.',
      safety: 'Stop the exercise if you feel pain or are unsure, and check your technique.',
      tip1: 'Keep your breathing steady and calm.',
      tip2: 'Better clean and slow than fast and sloppy.',
    },
    modal: {
      execution: 'How to',
      modifications: 'Modifications',
      beginner: 'Beginner',
      advanced: 'Advanced',
      tips: 'Tips',
    },
  },
);
