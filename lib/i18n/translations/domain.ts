import { defineMessages } from '../define';

/** Texte aus den reinen Logik-Modulen in lib/ (Labels, Erinnerungen, Validierung). */
export default defineMessages(
  {
    activityLevel: {
      sedentary: 'Sitzend',
      light: 'Leicht aktiv',
      active: 'Aktiv',
      very_active: 'Sehr aktiv',
    },
    calorieGoal: {
      lose: 'Abnehmen',
      maintain: 'Halten',
      gain: 'Muskelaufbau',
    },
    profile: {
      displayNameRequired: 'Bitte einen Anzeigenamen eingeben.',
    },
    waterSchedule: {
      off: 'Erinnerungen sind ausgeschaltet.',
      summary: 'Alle {{interval}} h zwischen {{start}}:00 und {{end}}:00 Uhr ({{count}}×).',
    },
    mealNotification: {
      title: 'Mahlzeiten erfassen',
      body: 'Hast du schon eingetragen, was du heute gegessen hast? Tippe hier, um deine Mahlzeiten zu erfassen.',
    },
    waterNotification: {
      goalReachedTitle: 'Tagesziel erreicht',
      goalReachedBody: 'Super gemacht! Du hast dein Trinkziel von {{goal}} ml heute erreicht.',
      reminderTitle: 'Zeit zu trinken',
      reminderBody: 'Noch {{remaining}} ml bis zum Tagesziel — trink jetzt {{suggested}} ml.',
      dailyBody: 'Denk an dein Wasser.',
      dailyBodyWithGoal: 'Denk an dein Wasser — Tagesziel {{goal}} ml.',
    },
    cycleNotification: {
      periodTitle: 'Deine Periode steht bevor',
      periodBody: 'Voraussichtlich beginnt deine Periode morgen. Denk an deine Vorbereitung. 🩸',
      fertileTitle: 'Fruchtbares Fenster beginnt bald',
      fertileBody: 'Ab morgen beginnt dein fruchtbares Fenster rund um den Eisprung. 🌱',
      summaryPeriod: 'Perioden-Start',
      summaryFertile: 'fruchtbares Fenster',
      summaryNone: 'Keine Zyklus-Erinnerungen aktiv.',
      summary: 'Erinnerung 1 Tag vorher: {{parts}}.',
    },
    feedback: {
      empty: 'Bitte gib dein Feedback ein.',
      tooLong: 'Feedback ist zu lang (max. {{max}} Zeichen).',
      network: 'Senden fehlgeschlagen. Bitte prüfe deine Internetverbindung.',
      failed: 'Senden fehlgeschlagen.',
    },
    socialAuth: {
      googleStartFailed: 'Google-Login konnte nicht gestartet werden.',
      googleNoCode: 'Google hat keinen Anmelde-Code zurückgegeben.',
      googleFailed: 'Google-Login fehlgeschlagen.',
      appleNoToken: 'Apple hat kein Identity-Token geliefert.',
      appleFailed: 'Apple-Login fehlgeschlagen.',
    },
  },
  {
    activityLevel: {
      sedentary: 'Sedentary',
      light: 'Lightly active',
      active: 'Active',
      very_active: 'Very active',
    },
    calorieGoal: {
      lose: 'Lose weight',
      maintain: 'Maintain',
      gain: 'Build muscle',
    },
    profile: {
      displayNameRequired: 'Please enter a display name.',
    },
    waterSchedule: {
      off: 'Reminders are turned off.',
      summary: 'Every {{interval}} h between {{start}}:00 and {{end}}:00 ({{count}}×).',
    },
    mealNotification: {
      title: 'Log your meals',
      body: 'Have you logged what you ate today? Tap here to log your meals.',
    },
    waterNotification: {
      goalReachedTitle: 'Daily goal reached',
      goalReachedBody: 'Well done! You reached your hydration goal of {{goal}} ml today.',
      reminderTitle: 'Time to drink',
      reminderBody: '{{remaining}} ml left to your daily goal — drink {{suggested}} ml now.',
      dailyBody: 'Remember to drink water.',
      dailyBodyWithGoal: 'Remember to drink water — daily goal {{goal}} ml.',
    },
    cycleNotification: {
      periodTitle: 'Your period is coming up',
      periodBody: 'Your period is expected to start tomorrow. Time to get prepared. 🩸',
      fertileTitle: 'Fertile window starts soon',
      fertileBody: 'Your fertile window around ovulation starts tomorrow. 🌱',
      summaryPeriod: 'period start',
      summaryFertile: 'fertile window',
      summaryNone: 'No cycle reminders active.',
      summary: 'Reminder 1 day before: {{parts}}.',
    },
    feedback: {
      empty: 'Please enter your feedback.',
      tooLong: 'Feedback is too long (max. {{max}} characters).',
      network: 'Sending failed. Please check your internet connection.',
      failed: 'Sending failed.',
    },
    socialAuth: {
      googleStartFailed: 'Google sign-in could not be started.',
      googleNoCode: 'Google did not return a sign-in code.',
      googleFailed: 'Google sign-in failed.',
      appleNoToken: 'Apple did not provide an identity token.',
      appleFailed: 'Apple sign-in failed.',
    },
  },
);
