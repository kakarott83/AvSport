import { formatReminderTime, sanitizeMealReminderSettings } from './mealReminder';

describe('sanitizeMealReminderSettings', () => {
  it('nimmt gültige Werte unverändert', () => {
    expect(sanitizeMealReminderSettings({ enabled: true, hour: 19, minute: 30 }))
      .toEqual({ enabled: true, hour: 19, minute: 30 });
  });

  it('begrenzt Stunde und Minute und rundet', () => {
    expect(sanitizeMealReminderSettings({ enabled: true, hour: 27, minute: -5 }))
      .toEqual({ enabled: true, hour: 23, minute: 0 });
    expect(sanitizeMealReminderSettings({ enabled: true, hour: 7.6, minute: 59.9 }))
      .toEqual({ enabled: true, hour: 8, minute: 59 });
  });

  it('fällt bei fehlenden Werten auf aus / 20:00 zurück', () => {
    expect(sanitizeMealReminderSettings(null)).toEqual({ enabled: false, hour: 20, minute: 0 });
    expect(sanitizeMealReminderSettings({ hour: NaN })).toEqual({ enabled: false, hour: 20, minute: 0 });
  });
});

describe('formatReminderTime', () => {
  it('formatiert zweistellig', () => {
    expect(formatReminderTime(7, 5)).toBe('07:05');
    expect(formatReminderTime(20, 0)).toBe('20:00');
  });
});
