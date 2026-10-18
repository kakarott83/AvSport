import { getLanguage, getLocale, setLanguage, t, tList } from '@/lib/i18n';
import { dictionaries } from '@/lib/i18n/translations';
import { describeReminderSchedule } from '@/lib/waterReminders';
import { ACTIVITY_LEVEL_LABELS } from '@/lib/stepGoal';

afterEach(() => setLanguage('de', { persist: false }));

/** Alle Blatt-Pfade eines Wörterbuchs, z.B. "profile.general.title". */
function leafPaths(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string' || Array.isArray(node)) return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('Wörterbücher', () => {
  it('Deutsch und Englisch haben exakt dieselben Keys', () => {
    expect(leafPaths(dictionaries.en).sort()).toEqual(leafPaths(dictionaries.de).sort());
  });

  it('Listen haben in beiden Sprachen dieselbe Länge', () => {
    for (const path of leafPaths(dictionaries.de)) {
      const de = path.split('.').reduce<any>((n, k) => n[k], dictionaries.de);
      const en = path.split('.').reduce<any>((n, k) => n[k], dictionaries.en);
      if (Array.isArray(de)) expect([path, en.length]).toEqual([path, de.length]);
    }
  });

  it('Platzhalter stimmen zwischen Deutsch und Englisch überein', () => {
    for (const path of leafPaths(dictionaries.de)) {
      const de = path.split('.').reduce<any>((n, k) => n[k], dictionaries.de);
      const en = path.split('.').reduce<any>((n, k) => n[k], dictionaries.en);
      if (typeof de !== 'string') continue;
      const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
      expect([path, vars(en)]).toEqual([path, vars(de)]);
    }
  });
});

describe('t()', () => {
  it('liefert den Text der aktuellen Sprache', () => {
    expect(t('common.save')).toBe('Speichern');
    setLanguage('en', { persist: false });
    expect(getLanguage()).toBe('en');
    expect(t('common.save')).toBe('Save');
  });

  it('ersetzt Platzhalter', () => {
    expect(t('home.greetingName', { name: 'Anna' })).toBe('Hallo, Anna!');
  });

  it('nutzt die _one-Variante bei count = 1', () => {
    expect(t('nutrition.dishesSaved', { count: 1 })).toBe('Gericht gespeichert!');
    expect(t('nutrition.dishesSaved', { count: 3 })).toBe('3 Gerichte gespeichert!');
  });

  it('liefert Listen über tList()', () => {
    setLanguage('en', { persist: false });
    expect(tList('common.weekdaysShort')[1]).toBe('Mon');
  });

  it('setzt die Locale passend zur Sprache', () => {
    expect(getLocale()).toBe('de-DE');
    setLanguage('en', { persist: false });
    expect(getLocale()).toBe('en-GB');
  });
});

describe('Logik-Module folgen der Sprache', () => {
  it('Labels und Zusammenfassungen wechseln mit', () => {
    expect(ACTIVITY_LEVEL_LABELS.light).toBe('Leicht aktiv');
    setLanguage('en', { persist: false });
    expect(ACTIVITY_LEVEL_LABELS.light).toBe('Lightly active');
    expect(describeReminderSchedule({ enabled: false })).toBe('Reminders are turned off.');
  });
});
