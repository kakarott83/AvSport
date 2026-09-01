/// <reference types="jest" />

import {
  computeReminderHours,
  describeReminderSchedule,
  MAX_REMINDERS_PER_DAY,
  sanitizeWaterReminderSettings,
} from '@/lib/waterReminders';

describe('sanitizeWaterReminderSettings', () => {
  it('füllt fehlende Felder mit den Defaults', () => {
    expect(sanitizeWaterReminderSettings(null)).toEqual({
      enabled: false, startHour: 8, endHour: 20, intervalHours: 2,
    });
  });

  it('erzwingt endHour >= startHour', () => {
    const s = sanitizeWaterReminderSettings({ enabled: true, startHour: 18, endHour: 9, intervalHours: 2 });
    expect(s.endHour).toBe(18);
  });

  it('klemmt Stunden auf 0–23 und das Intervall auf >= 1', () => {
    const s = sanitizeWaterReminderSettings({ enabled: true, startHour: -5, endHour: 40, intervalHours: 0 });
    expect(s.startHour).toBe(0);
    expect(s.endHour).toBe(23);
    expect(s.intervalHours).toBe(1);
  });
});

describe('computeReminderHours', () => {
  it('gibt [] zurück, wenn Erinnerungen deaktiviert sind', () => {
    expect(computeReminderHours({ enabled: false, startHour: 8, endHour: 20, intervalHours: 2 })).toEqual([]);
  });

  it('verteilt Erinnerungen im Intervall über das Fenster (inklusive Endstunde)', () => {
    expect(computeReminderHours({ enabled: true, startHour: 8, endHour: 20, intervalHours: 2 }))
      .toEqual([8, 10, 12, 14, 16, 18, 20]);
  });

  it('liefert mindestens die Startstunde bei degeneriertem Fenster', () => {
    expect(computeReminderHours({ enabled: true, startHour: 10, endHour: 10, intervalHours: 3 })).toEqual([10]);
  });

  it('überschreitet nie das Tageslimit', () => {
    const hours = computeReminderHours({ enabled: true, startHour: 0, endHour: 23, intervalHours: 1 });
    expect(hours.length).toBeLessThanOrEqual(MAX_REMINDERS_PER_DAY);
  });
});

describe('describeReminderSchedule', () => {
  it('meldet den Aus-Zustand', () => {
    expect(describeReminderSchedule({ enabled: false })).toMatch(/ausgeschaltet/i);
  });

  it('nennt Intervall, Fenster und Anzahl', () => {
    const text = describeReminderSchedule({ enabled: true, startHour: 8, endHour: 20, intervalHours: 2 });
    expect(text).toContain('2 h');
    expect(text).toContain('08:00');
    expect(text).toContain('20:00');
    expect(text).toContain('7');
  });
});
