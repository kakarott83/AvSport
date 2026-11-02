/// <reference types="jest" />

import { sanitizeTipInput } from './tips';

const valid = {
  category: 'nutrition',
  title_de: 'Protein in jede Mahlzeit',
  body_de: 'Eine Portion Eiweiß pro Mahlzeit hält länger satt.',
  title_en: 'Protein in every meal',
  body_en: 'A serving of protein with each meal keeps you full longer.',
};

describe('sanitizeTipInput', () => {
  it('akzeptiert einen minimalen Tipp mit Standardwerten', () => {
    const r = sanitizeTipInput(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ id: null, slug: null, goals: [], gender: null, cta: null, publish_on: null, active: true });
  });

  it('trimmt Texte und entfernt doppelte Ziele', () => {
    const r = sanitizeTipInput({ ...valid, title_de: '  Titel neu  ', goals: ['lose', 'lose', 'gain'] });
    expect(r.ok && r.value.title_de).toBe('Titel neu');
    expect(r.ok && r.value.goals).toEqual(['lose', 'gain']);
  });

  it('übernimmt active=false', () => {
    const r = sanitizeTipInput({ ...valid, active: false });
    expect(r.ok && r.value.active).toBe(false);
  });

  it.each([
    [{ category: 'sleep' }, 'Kategorie'],
    [{ title_de: 'ab' }, 'Titel (DE)'],
    [{ body_en: 'x'.repeat(601) }, 'Text (EN)'],
    [{ goals: ['bulk'] }, 'Ziel'],
    [{ goals: 'lose' }, 'Liste'],
    [{ gender: 'divers' }, 'Geschlecht'],
    [{ cta: 'javascript:alert(1)' }, 'Aktions-Button'],
    [{ publish_on: '2026-02-30' }, 'Datum'],
    [{ publish_on: '02.11.2026' }, 'Datum'],
    [{ id: 'nicht-uuid' }, 'id'],
    [{ slug: 'Mit Leerzeichen' }, 'Slug'],
  ])('lehnt %j ab', (patch, message) => {
    const r = sanitizeTipInput({ ...valid, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });

  it('lehnt fehlende Eingaben ab', () => {
    expect(sanitizeTipInput(null).ok).toBe(false);
  });

  it('akzeptiert ein gültiges Datum, eine UUID und alle Optionen', () => {
    const r = sanitizeTipInput({
      ...valid,
      id: '0b9b3a4e-6a2f-4c43-9f6a-1a2b3c4d5e6f',
      slug: 'protein-every-meal',
      gender: 'female',
      cta: 'scan',
      publish_on: '2026-12-24',
    });
    expect(r.ok).toBe(true);
  });
});
