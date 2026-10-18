import { defineMessages } from '../define';

/**
 * Texte für das "Was ist neu?"-Fenster. Pro Release ein Block unter
 * `releases`, Schlüssel = Release-ID aus lib/whatsNew.ts (Punkte durch _ ersetzt).
 */
export default defineMessages(
  {
    title: 'Neu in AvoraSport',
    subtitle: 'Das hat sich mit diesem Update geändert:',
    button: "Los geht's",
    releases: {
      r2026_10_18: {
        pictograms: {
          title: 'Übungen als Piktogramm',
          text: 'Im Training und in den Übungsdetails zeigt ein Piktogramm Start- und Endposition jeder Übung.',
        },
        mealReminder: {
          title: 'Mahlzeiten-Erinnerung',
          text: 'Lass dich täglich zu deiner Wunschzeit erinnern, deine Mahlzeiten einzutragen – im Profil einstellbar.',
        },
        dayLogAi: {
          title: 'Mahlzeiten am Tag erfassen',
          text: 'Unter „Tag erfassen“ einfach aufschreiben oder diktieren, was du gegessen hast – die KI listet die Gerichte und berechnet die Nährwerte.',
        },
        calendarTrend: {
          title: 'Verlauf im Kalender',
          text: 'Die Kalender-Statistik zeigt jetzt auch den Verlauf über die letzten 6 Monate.',
        },
        passwordToggle: {
          title: 'Passwort anzeigen',
          text: 'Beim Anmelden und Registrieren kannst du dein Passwort per Augen-Symbol einblenden.',
        },
      },
    },
  },
  {
    title: "What's new in AvoraSport",
    subtitle: 'This update brings:',
    button: "Let's go",
    releases: {
      r2026_10_18: {
        pictograms: {
          title: 'Exercise pictograms',
          text: 'During training and in exercise details, a pictogram shows the start and end position of each exercise.',
        },
        mealReminder: {
          title: 'Meal reminder',
          text: 'Get a daily reminder at your preferred time to log your meals – set it up in your profile.',
        },
        dayLogAi: {
          title: "Log today's meals",
          text: 'In “Log day”, just type or dictate what you ate – the AI lists the dishes and calculates the nutrition.',
        },
        calendarTrend: {
          title: 'Calendar trend',
          text: 'The calendar stats now also show the trend over the last 6 months.',
        },
        passwordToggle: {
          title: 'Show password',
          text: 'When logging in or signing up, tap the eye icon to reveal your password.',
        },
      },
    },
  },
);
