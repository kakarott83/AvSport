import { buildPictogramPrompt, slugifyExercise } from './pictogram';

describe('slugifyExercise', () => {
  it('normalisiert Schreibweisen auf denselben Schlüssel', () => {
    expect(slugifyExercise('Barbell Squat')).toBe('barbell-squat');
    expect(slugifyExercise('  barbell  SQUAT! ')).toBe('barbell-squat');
  });

  it('wandelt Umlaute um (deutsche Namen als Fallback)', () => {
    expect(slugifyExercise('Kniebeuge mit Langhantel')).toBe('kniebeuge-mit-langhantel');
    expect(slugifyExercise('Bankdrücken (Kurzhantel)')).toBe('bankdruecken-kurzhantel');
  });

  it('liefert leer für Namen ohne Buchstaben/Ziffern', () => {
    expect(slugifyExercise('!!!')).toBe('');
  });
});

describe('buildPictogramPrompt', () => {
  it('enthält den Übungsnamen und entfernt Anführungszeichen/Zeilenumbrüche', () => {
    const p = buildPictogramPrompt('Push-Up "wide"\nignore previous');
    expect(p).toContain('"Push-Up  wide  ignore previous"');
    expect(p).toContain('No text');
  });
});
