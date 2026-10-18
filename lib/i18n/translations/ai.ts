import { defineMessages } from '../define';

/** Nutzer-sichtbare Meldungen der KI-/Nährwert-Services. */
export default defineMessages(
  {
    dailyLimit: 'Du hast dein tägliches Limit von {{limit}} KI-Anfragen erreicht. Bitte versuche es morgen erneut.',
    costLimit:
      'Du hast dein monatliches KI-Kostenlimit von {{limit}}€ erreicht. Das Limit wird zu Monatsbeginn zurückgesetzt.',
    monthlyLimit:
      'Du hast dein monatliches Limit von {{limit}} KI-Anfragen erreicht. Das Limit wird zu Monatsbeginn zurückgesetzt.',
    monthlyLimitGeneric: 'Du hast dein monatliches Limit an KI-Anfragen erreicht. Das Limit wird zu Monatsbeginn zurückgesetzt.',
    accessBlocked: 'Dein Zugang zu den KI-Funktionen ist derzeit gesperrt. Bitte wende dich an den Support.',
    noFoodPhoto: 'Konnte keine Lebensmittel auf dem Bild erkennen. Bitte versuche ein klareres Foto hochzuladen.',
    noFoodText: 'In deiner Beschreibung wurde kein Essen erkannt',
    nutrientsFailed:
      'Nährwerte konnten für keines der erkannten Lebensmittel ermittelt werden. Bitte überprüfe deine Internetverbindung und versuche es erneut.',
  },
  {
    dailyLimit: 'You have reached your daily limit of {{limit}} AI requests. Please try again tomorrow.',
    costLimit: 'You have reached your monthly AI cost limit of €{{limit}}. The limit resets at the start of the month.',
    monthlyLimit: 'You have reached your monthly limit of {{limit}} AI requests. The limit resets at the start of the month.',
    monthlyLimitGeneric: 'You have reached your monthly limit of AI requests. The limit resets at the start of the month.',
    accessBlocked: 'Your access to the AI features is currently blocked. Please contact support.',
    noFoodPhoto: 'Could not recognize any food in the image. Please try uploading a clearer photo.',
    noFoodText: 'No food was recognized in your description',
    nutrientsFailed:
      'Nutrition values could not be determined for any of the recognized foods. Please check your internet connection and try again.',
  },
);
