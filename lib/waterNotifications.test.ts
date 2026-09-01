/// <reference types="jest" />

import { buildWaterNotificationContent } from '@/lib/waterNotifications';

const SIZES = [150, 250, 500];

describe('buildWaterNotificationContent — Ziel erreicht', () => {
  it('liefert type "encouragement" bei remainingMl = 0', () => {
    const result = buildWaterNotificationContent({ remainingMl: 0, goalMl: 2000, suggestSizesMl: SIZES });
    expect(result.type).toBe('encouragement');
    expect(result.suggestedIntakeMl).toBe(0);
  });

  it('hält das 80-Zeichen-Limit für die Gratulationsnachricht ein', () => {
    const result = buildWaterNotificationContent({ remainingMl: 0, goalMl: 2000, suggestSizesMl: SIZES });
    expect(result.body.length).toBeLessThanOrEqual(80);
  });

  it('enthält keine Emojis', () => {
    const result = buildWaterNotificationContent({ remainingMl: 0, goalMl: 2000, suggestSizesMl: SIZES });
    expect(result.title).toMatch(/^[\x00-\x7Fa-zA-ZäöüÄÖÜß\s.,!?-]*$/);
  });
});

describe('buildWaterNotificationContent — Erinnerung', () => {
  it('liefert type "reminder" bei remainingMl > 0', () => {
    const result = buildWaterNotificationContent({ remainingMl: 800, goalMl: 2000, suggestSizesMl: SIZES });
    expect(result.type).toBe('reminder');
  });

  it('wählt die größte passende Trinkgröße ≤ remainingMl', () => {
    const result = buildWaterNotificationContent({ remainingMl: 800, goalMl: 2000, suggestSizesMl: SIZES });
    expect(result.suggestedIntakeMl).toBe(500);
  });

  it('schlägt eine kleinere Größe vor, wenn nur wenig übrig ist', () => {
    const result = buildWaterNotificationContent({ remainingMl: 200, goalMl: 2000, suggestSizesMl: SIZES });
    expect(result.suggestedIntakeMl).toBe(150);
  });

  it('schlägt die Restmenge vor, wenn keine Größe passt', () => {
    const result = buildWaterNotificationContent({ remainingMl: 80, goalMl: 2000, suggestSizesMl: SIZES });
    expect(result.suggestedIntakeMl).toBe(80);
  });

  it('nennt die Restmenge im Text', () => {
    const result = buildWaterNotificationContent({ remainingMl: 800, goalMl: 2000, suggestSizesMl: SIZES });
    expect(result.body).toContain('800');
  });

  it('hält das 120-Zeichen-Limit für den Erinnerungstext ein', () => {
    const result = buildWaterNotificationContent({ remainingMl: 1234567, goalMl: 2000, suggestSizesMl: SIZES });
    expect(result.body.length).toBeLessThanOrEqual(120);
  });

  it('hält das 40-Zeichen-Limit für den Titel ein', () => {
    const result = buildWaterNotificationContent({ remainingMl: 800, goalMl: 2000, suggestSizesMl: SIZES });
    expect(result.title.length).toBeLessThanOrEqual(40);
  });
});
