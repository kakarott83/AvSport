/**
 * Reine Hilfsfunktionen für supabase/functions/exercise-pictogram
 * (ohne Deno-/Netzwerk-Abhängigkeiten, damit sie mit Jest testbar sind).
 */

/** Neue Piktogramme pro Nutzer und Tag (bereits vorhandene zählen nicht). */
export const DAILY_NEW_PICTOGRAM_LIMIT = 15;

/** Geschätzte Kosten pro erzeugtem Bild (gemini-2.5-flash-image, Stand 10/2026). */
export const COST_PER_IMAGE_USD = 0.039;

/**
 * Stabiler Schlüssel pro Übung: kleingeschrieben, Umlaute vereinfacht, nur
 * a–z/0–9 mit Bindestrichen. "Barbell Squat" und "barbell  squat!" → "barbell-squat".
 */
export function slugifyExercise(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Einheitliche Bildvorgabe, damit alle Piktogramme gleich aussehen. */
export function buildPictogramPrompt(exerciseName: string): string {
  const name = exerciseName.replace(/["\n\r]/g, ' ').trim().slice(0, 120);
  return (
    `Minimal flat fitness pictogram explaining the exercise "${name}". ` +
    'Show exactly two phases side by side: LEFT the start position, RIGHT the end position, ' +
    'with a small light-grey arrow between them. ' +
    'BOTH figures drawn in the SAME view (side profile unless the movement is only clear from the front), ' +
    'same size, standing on the same invisible baseline. ' +
    'The athlete is a simple faceless pictogram figure (round head, rounded limb capsules) filled solid cyan #00E5FF; ' +
    'equipment (barbell, dumbbells, bench, machine, band) in light grey #BBBBBB. ' +
    'Background: one flat solid dark grey #1E1E1E filling the whole image. ' +
    'No text, no letters, no numbers, no labels, no shadows, no gradients, no floor, no frame. ' +
    'Clean vector icon style, generous padding, square.'
  );
}
