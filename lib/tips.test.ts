import { hashString, localDateISO, localizeTip, pickTipOfTheDay, tipMatchesUser, type Tip } from './tips';

function tip(id: string, extra: Partial<Tip> = {}): Tip {
  return {
    id,
    category: 'nutrition',
    title_de: `Titel ${id}`,
    body_de: `Text ${id}`,
    title_en: `Title ${id}`,
    body_en: `Body ${id}`,
    goals: [],
    gender: null,
    cta: null,
    publish_on: null,
    active: true,
    ...extra,
  };
}

const base = { date: '2026-11-02', userId: 'user-1' };

describe('tipMatchesUser', () => {
  it('lässt Tipps ohne Zielgruppe für alle zu', () => {
    expect(tipMatchesUser(tip('a'), null, null)).toBe(true);
  });
  it('filtert nach Ziel', () => {
    const t = tip('a', { goals: ['lose'] });
    expect(tipMatchesUser(t, 'lose', null)).toBe(true);
    expect(tipMatchesUser(t, 'gain', null)).toBe(false);
    expect(tipMatchesUser(t, null, null)).toBe(false);
  });
  it('filtert nach Geschlecht', () => {
    const t = tip('a', { gender: 'female' });
    expect(tipMatchesUser(t, null, 'female')).toBe(true);
    expect(tipMatchesUser(t, null, 'male')).toBe(false);
    expect(tipMatchesUser(t, null, null)).toBe(false);
  });
  it('ignoriert inaktive Tipps', () => {
    expect(tipMatchesUser(tip('a', { active: false }), null, null)).toBe(false);
  });
});

describe('pickTipOfTheDay', () => {
  it('liefert null ohne passende Tipps', () => {
    expect(pickTipOfTheDay({ ...base, tips: [] })).toBeNull();
    expect(pickTipOfTheDay({ ...base, tips: [tip('a', { active: false })] })).toBeNull();
  });

  it('bevorzugt den für heute geplanten Tipp', () => {
    const tips = [tip('a'), tip('b', { publish_on: '2026-11-02' }), tip('c')];
    expect(pickTipOfTheDay({ ...base, tips })?.id).toBe('b');
  });

  it('nimmt Tipps mit anderem Datum nicht in die Rotation', () => {
    const tips = [tip('a', { publish_on: '2026-12-24' })];
    expect(pickTipOfTheDay({ ...base, tips })).toBeNull();
  });

  it('ist deterministisch für Datum und User', () => {
    const tips = ['a', 'b', 'c', 'd', 'e'].map((id) => tip(id));
    const first = pickTipOfTheDay({ ...base, tips });
    const shuffled = [...tips].reverse();
    expect(pickTipOfTheDay({ ...base, tips: shuffled })?.id).toBe(first?.id);
  });

  it('überspringt kürzlich gesehene Tipps', () => {
    const tips = [tip('a'), tip('b'), tip('c')];
    const seen = { a: '2026-10-30', b: '2026-10-01' };
    expect(pickTipOfTheDay({ ...base, tips, seen })?.id).toBe('c');
  });

  it('heute gesehene Tipps bleiben wählbar (gleicher Tipp beim zweiten Öffnen)', () => {
    const tips = [tip('a'), tip('b'), tip('c')];
    const first = pickTipOfTheDay({ ...base, tips });
    const again = pickTipOfTheDay({ ...base, tips, seen: { [first!.id]: '2026-11-02' } });
    expect(again?.id).toBe(first?.id);
  });

  it('nimmt den am längsten nicht gesehenen, wenn alle kürzlich gesehen wurden', () => {
    const tips = [tip('a'), tip('b'), tip('c')];
    const seen = { a: '2026-11-01', b: '2026-10-20', c: '2026-10-25' };
    expect(pickTipOfTheDay({ ...base, tips, seen })?.id).toBe('b');
  });

  it('wählt nach 60 Tagen wieder aus allen', () => {
    const tips = [tip('a')];
    expect(pickTipOfTheDay({ ...base, tips, seen: { a: '2026-08-01' } })?.id).toBe('a');
  });

  it('beachtet Ziel und Geschlecht', () => {
    const tips = [tip('a', { goals: ['gain'] }), tip('b', { gender: 'male' }), tip('c', { goals: ['lose'] })];
    expect(pickTipOfTheDay({ ...base, tips, goal: 'lose', gender: 'female' })?.id).toBe('c');
  });
});

describe('helpers', () => {
  it('localizeTip wählt die Sprache', () => {
    expect(localizeTip(tip('a'), 'en')).toEqual({ title: 'Title a', body: 'Body a' });
    expect(localizeTip(tip('a'), 'de')).toEqual({ title: 'Titel a', body: 'Text a' });
  });
  it('localDateISO formatiert lokal', () => {
    expect(localDateISO(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
  it('hashString ist stabil', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});
