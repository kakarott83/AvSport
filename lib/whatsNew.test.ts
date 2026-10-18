import { pendingRelease, releaseTextKey, RELEASES, type WhatsNewRelease } from './whatsNew';
import translations from './i18n/translations/whatsNew';

const R: WhatsNewRelease[] = [
  { id: '2026-11-01', releasedAt: '2026-11-01T10:00:00Z', items: [{ key: 'a', icon: 'star' }] },
  { id: '2026-10-18', releasedAt: '2026-10-18T22:00:00Z', items: [{ key: 'b', icon: 'star' }] },
];

describe('pendingRelease', () => {
  it('zeigt das neueste Release bestehenden Nutzern, die es noch nicht gesehen haben', () => {
    expect(pendingRelease('2026-10-18', '2026-09-01T00:00:00Z', R)?.id).toBe('2026-11-01');
    expect(pendingRelease(null, '2026-09-01T00:00:00Z', R)?.id).toBe('2026-11-01');
  });

  it('zeigt nichts, wenn das neueste Release schon gesehen wurde', () => {
    expect(pendingRelease('2026-11-01', '2026-09-01T00:00:00Z', R)).toBeNull();
  });

  it('zeigt nichts für Konten, die nach dem Release angelegt wurden', () => {
    expect(pendingRelease(null, '2026-11-02T00:00:00Z', R)).toBeNull();
  });

  it('zeigt nichts ohne Releases', () => {
    expect(pendingRelease(null, null, [])).toBeNull();
  });
});

describe('Release-Texte', () => {
  it('hat für jedes Item im neuesten Release Titel und Text in DE und EN', () => {
    const release = RELEASES[0];
    for (const lang of ['de', 'en'] as const) {
      const block = (translations[lang].releases as Record<string, Record<string, { title: string; text: string }>>)[
        releaseTextKey(release.id)
      ];
      expect(block).toBeDefined();
      for (const item of release.items) {
        expect(block[item.key]?.title).toBeTruthy();
        expect(block[item.key]?.text).toBeTruthy();
      }
    }
  });
});
