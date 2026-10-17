import {
  expandDays,
  mapHealthConnectFlow,
  mapHealthKitFlow,
  mergeHealthDays,
  planHealthSync,
  type StoredCycleEvent,
} from './cycleHealth';

describe('Flow-Mapping', () => {
  it('Health Connect: unbekannt/leicht → 2, mittel → 3, stark → 4', () => {
    expect([0, 1, 2, 3, undefined].map(mapHealthConnectFlow)).toEqual([2, 2, 3, 4, 2]);
  });

  it('HealthKit: "keine" wird nicht übernommen', () => {
    expect([1, 2, 3, 4, 5].map(mapHealthKitFlow)).toEqual([2, 2, 3, 4, null]);
  });
});

describe('expandDays / mergeHealthDays', () => {
  it('liefert alle Tage inklusive Ende, auch über Monatsgrenzen', () => {
    expect(expandDays('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });

  it('nimmt pro Tag den stärksten Flow und sortiert', () => {
    expect(mergeHealthDays([
      { date: '2026-10-02', flow: 2 },
      { date: '2026-10-01', flow: 3 },
      { date: '2026-10-02', flow: 4 },
    ])).toEqual([{ date: '2026-10-01', flow: 3 }, { date: '2026-10-02', flow: 4 }]);
  });
});

describe('planHealthSync', () => {
  const W = ['2026-09-01', '2026-10-17'] as const;
  const ev = (date: string, flow: number, source: StoredCycleEvent['source']): StoredCycleEvent => ({ date, flow, source });

  it('übernimmt neue Health-Tage', () => {
    const plan = planHealthSync([], [{ date: '2026-10-01', flow: 3 }], ...W);
    expect(plan).toEqual({ upserts: [{ date: '2026-10-01', flow: 3 }], deletes: [] });
  });

  it('überschreibt manuell erfasste Tage nie', () => {
    const plan = planHealthSync([ev('2026-10-01', 1, 'manual')], [{ date: '2026-10-01', flow: 4 }], ...W);
    expect(plan.upserts).toEqual([]);
  });

  it('aktualisiert importierte Tage, wenn sich der Flow in Health geändert hat', () => {
    const plan = planHealthSync([ev('2026-10-01', 2, 'health')], [{ date: '2026-10-01', flow: 4 }], ...W);
    expect(plan.upserts).toEqual([{ date: '2026-10-01', flow: 4 }]);
  });

  it('lässt unveränderte importierte Tage in Ruhe', () => {
    const plan = planHealthSync([ev('2026-10-01', 3, 'health')], [{ date: '2026-10-01', flow: 3 }], ...W);
    expect(plan).toEqual({ upserts: [], deletes: [] });
  });

  it('löscht importierte Tage, die in Health entfernt wurden — manuelle nie', () => {
    const plan = planHealthSync(
      [ev('2026-10-01', 3, 'health'), ev('2026-10-02', 3, 'manual'), ev('2026-10-03', 3, null)],
      [],
      ...W,
    );
    expect(plan.deletes).toEqual(['2026-10-01']);
  });

  it('ignoriert alles außerhalb des Abgleich-Zeitraums', () => {
    const plan = planHealthSync(
      [ev('2026-08-15', 3, 'health')],
      [{ date: '2026-08-20', flow: 2 }],
      ...W,
    );
    expect(plan).toEqual({ upserts: [], deletes: [] });
  });
});
