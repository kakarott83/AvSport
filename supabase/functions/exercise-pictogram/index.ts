/**
 * supabase/functions/exercise-pictogram
 *
 * Liefert zu einer Übung ein Piktogramm der Ausführung (Start → Endposition).
 * Existiert für den Übungs-Schlüssel schon ein Bild, wird nur dessen URL
 * zurückgegeben. Sonst wird es einmalig mit dem Gemini-Bildmodell erzeugt,
 * im öffentlichen Bucket "exercise-pictograms" gespeichert und in
 * public.exercise_pictograms vermerkt — ab dann für alle Nutzer kostenlos.
 *
 * Body: { nameEn?: string, nameDe?: string } → { ok: true, url, created }
 * Schutz: Login nötig; höchstens DAILY_NEW_PICTOGRAM_LIMIT neue Bilder pro
 * Nutzer und Tag. Fehler landen in ai_logs (feature "exercise_pictogram");
 * erfolgreiche Erzeugungen nicht (siehe unten).
 *
 * Secrets: GEMINI_API_KEY (Pflicht), PICTOGRAM_MODEL (optional,
 * Default gemini-2.5-flash-image).
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  buildPictogramPrompt,
  COST_PER_IMAGE_USD,
  DAILY_NEW_PICTOGRAM_LIMIT,
  slugifyExercise,
} from './pictogram.ts';

const BUCKET = 'exercise-pictograms';
const MODEL = Deno.env.get('PICTOGRAM_MODEL') ?? 'gemini-2.5-flash-image';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey = Deno.env.get('GEMINI_API_KEY');

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Nicht angemeldet.' }, 401);

  let body: { nameEn?: unknown; nameDe?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ungültiger Request-Body.' }, 400);
  }
  const nameEn = typeof body.nameEn === 'string' ? body.nameEn.trim() : '';
  const nameDe = typeof body.nameDe === 'string' ? body.nameDe.trim() : '';
  const name = nameEn || nameDe;
  const slug = slugifyExercise(name);
  if (!slug) return json({ error: 'Übungsname fehlt.' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(`${slug}.png`).data.publicUrl;

  // 1) Schon vorhanden → nur URL zurück
  const { data: existing } = await admin.from('exercise_pictograms').select('slug').eq('slug', slug).maybeSingle();
  if (existing) return json({ ok: true, url: publicUrl, created: false });

  if (!geminiKey) return json({ error: 'GEMINI_API_KEY ist nicht gesetzt.' }, 500);

  // 2) Tageslimit für neue Bilder pro Nutzer
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('exercise_pictograms')
    .select('slug', { count: 'exact', head: true })
    .eq('created_by', user.id)
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_NEW_PICTOGRAM_LIMIT) {
    return json({ error: 'Tageslimit für neue Piktogramme erreicht.', code: 'daily_limit' }, 429);
  }

  // 3) Erzeugen
  let png: Uint8Array;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPictogramPrompt(name) }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const result = await res.json();
    const parts = result?.candidates?.[0]?.content?.parts ?? [];
    const image = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
    if (!image) throw new Error('Gemini: kein Bild in der Antwort');
    png = base64ToBytes(image.inlineData.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[exercise-pictogram] Erzeugen fehlgeschlagen:', message);
    await admin.from('ai_logs').insert({
      user_id: user.id, model: MODEL, status: 'error', feature: 'exercise_pictogram',
      error_message: message.slice(0, 500), cost_usd: 0,
    });
    return json({ error: 'Piktogramm konnte nicht erstellt werden.' }, 502);
  }

  // 4) Speichern + vermerken
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(`${slug}.png`, png, { contentType: 'image/png', upsert: true, cacheControl: '31536000' });
  if (upErr) return json({ error: 'Speichern fehlgeschlagen: ' + upErr.message }, 500);

  // Bewusst KEIN ai_logs-"success": ai_quota_status() zählt diese Zeilen gegen
  // das KI-Tageslimit des Nutzers — das bloße Ansehen einer Übung soll das
  // Limit nicht verbrauchen. Kosten = Anzahl Einträge × COST_PER_IMAGE_USD.
  await admin.from('exercise_pictograms').upsert(
    { slug, name_en: nameEn || null, name_de: nameDe || null, model: MODEL, created_by: user.id },
    { onConflict: 'slug', ignoreDuplicates: true },
  );
  console.log(`[exercise-pictogram] erzeugt: ${slug} (~${COST_PER_IMAGE_USD} USD)`);

  return json({ ok: true, url: publicUrl, created: true });
});
