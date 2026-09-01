/// <reference types="jest" />

import {
  describeCycleReminders,
  planCycleReminders,
  sanitizeCycleReminderSettings,
  REMINDER_LEAD_DAYS,
} from '@/lib/cycleReminders';
import type { UpcomingEvent } from '@/lib/cycle';

const period = (date: string, inDays: number): UpcomingEvent => ({ date, inDays });

describe('sanitizeCycleReminderSettings', () => {
  it('coerces missing / partial input to all-false', () => {
    expect(sanitizeCycleReminderSettings(null)).toEqual({ periodEnabled: false, fertileEnabled: false });
    expect(sanitizeCycleReminderSettings({ periodEnabled: true })).toEqual({
      periodEnabled: true,
      fertileEnabled: false,
    });
  });
});

describe('planCycleReminders', () => {
  const today = '2026-03-10';

  it('returns nothing when both reminders are disabled', () => {
    expect(
      planCycleReminders({
        settings: { periodEnabled: false, fertileEnabled: false },
        nextPeriod: period('2026-03-26', 16),
        nextOvulation: period('2026-03-12', 2),
        today,
      }),
    ).toEqual([]);
  });

  it('schedules the period reminder one day before the predicted start', () => {
    const [reminder] = planCycleReminders({
      settings: { periodEnabled: true, fertileEnabled: false },
      nextPeriod: period('2026-03-26', 16),
      nextOvulation: null,
      today,
    });
    expect(reminder.kind).toBe('period');
    expect(reminder.fireDate).toBe('2026-03-25'); // 2026-03-26 − REMINDER_LEAD_DAYS
    expect(reminder.eventDate).toBe('2026-03-26');
    expect(REMINDER_LEAD_DAYS).toBe(1);
  });

  it('schedules the fertile reminder one day before the window opens (ovulation − 3)', () => {
    const [reminder] = planCycleReminders({
      settings: { periodEnabled: false, fertileEnabled: true },
      nextPeriod: null,
      nextOvulation: period('2026-03-20', 10),
      today,
    });
    expect(reminder.kind).toBe('fertile');
    expect(reminder.eventDate).toBe('2026-03-17'); // window start = ovulation − 3
    expect(reminder.fireDate).toBe('2026-03-16'); // − 1 more day
  });

  it('drops a reminder whose fire date is today or already past', () => {
    const result = planCycleReminders({
      settings: { periodEnabled: true, fertileEnabled: true },
      nextPeriod: period('2026-03-11', 1), // fire date 2026-03-10 == today → dropped
      nextOvulation: period('2026-03-12', 2), // window start 03-09, fire 03-08 → past → dropped
      today,
    });
    expect(result).toEqual([]);
  });

  it('can schedule both at once', () => {
    const result = planCycleReminders({
      settings: { periodEnabled: true, fertileEnabled: true },
      nextPeriod: period('2026-03-26', 16),
      nextOvulation: period('2026-03-24', 14),
      today,
    });
    expect(result.map((r) => r.kind).sort()).toEqual(['fertile', 'period']);
  });
});

describe('describeCycleReminders', () => {
  it('summarises the active reminders', () => {
    expect(describeCycleReminders(null)).toBe('Keine Zyklus-Erinnerungen aktiv.');
    expect(describeCycleReminders({ periodEnabled: true, fertileEnabled: true })).toBe(
      'Erinnerung 1 Tag vorher: Perioden-Start & fruchtbares Fenster.',
    );
  });
});
