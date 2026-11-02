-- Tipp des Tages: kurze Fitness- und Ernährungstipps auf dem Home-Screen
-- (lib/tips.ts, hooks/useTipOfTheDay.ts, components/TipOfTheDayCard.tsx).
-- Gepflegt über die Admin-Website (Tab „Tipps“) → Edge Function admin-api →
-- admin_*_tip()-RPCs unten (nur service_role).
--
-- Abschalten auf zwei Ebenen:
--   - tips.active          → einzelner Tipp (Admin-Website)
--   - profiles.tips_enabled → Tipp des Tages für einen User (Profil in der App)

-- ── Tipps ────────────────────────────────────────────────────────────────────

create table if not exists public.tips (
  id          uuid primary key default gen_random_uuid(),
  -- Stabiler Schlüssel für die Start-Tipps unten (idempotenter Seed); optional
  slug        text unique,
  category    text not null check (category in ('training', 'nutrition', 'recovery', 'mindset')),
  title_de    text not null check (char_length(title_de) between 3 and 80),
  body_de     text not null check (char_length(body_de) between 10 and 600),
  title_en    text not null check (char_length(title_en) between 3 and 80),
  body_en     text not null check (char_length(body_en) between 10 and 600),
  -- Teilmenge von lose / maintain / gain (profiles.calorie_goal); leer = für alle
  goals       text[] not null default '{}'
              check (goals <@ array['lose', 'maintain', 'gain']::text[]),
  -- null = für alle
  gender      text check (gender in ('male', 'female')),
  -- Aktions-Button im Detail (siehe CTA_ROUTES in lib/tips.ts); null = keiner
  cta         text check (cta in ('scan', 'day_log', 'nutrition', 'water', 'plans', 'create_plan', 'calendar', 'body_stats')),
  -- Fest als Tipp des Tages an genau diesem Datum (z. B. Neujahr); null = Rotation
  publish_on  date,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tips_publish_on on public.tips (publish_on) where publish_on is not null;

alter table public.tips enable row level security;
revoke all on public.tips from anon, authenticated;
grant select on public.tips to authenticated;

drop policy if exists tips_read_active on public.tips;
create policy tips_read_active on public.tips
  for select to authenticated
  using (active);

-- ── Interaktionen (gesehen, geöffnet, Reaktion, gemerkt) ─────────────────────

create table if not exists public.tip_interactions (
  user_id     uuid not null references auth.users(id) on delete cascade,
  tip_id      uuid not null references public.tips(id) on delete cascade,
  seen_on     date not null default current_date,
  opened      boolean not null default false,
  reaction    text check (reaction in ('like', 'dismiss')),
  saved       boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, tip_id)
);

create index if not exists tip_interactions_tip on public.tip_interactions (tip_id);

alter table public.tip_interactions enable row level security;
revoke all on public.tip_interactions from anon, authenticated;
grant select, insert, update on public.tip_interactions to authenticated;

drop policy if exists tip_interactions_owner_select on public.tip_interactions;
create policy tip_interactions_owner_select on public.tip_interactions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists tip_interactions_owner_insert on public.tip_interactions;
create policy tip_interactions_owner_insert on public.tip_interactions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists tip_interactions_owner_update on public.tip_interactions;
create policy tip_interactions_owner_update on public.tip_interactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Profil-Schalter ──────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists tips_enabled boolean not null default true;

-- ── Admin-RPCs (nur service_role, siehe supabase/functions/admin-api) ────────

create or replace function public.admin_list_tips()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.publish_on desc nulls last, t.created_at desc), '[]'::jsonb)
  from (
    select tp.*,
           coalesce(s.views, 0)     as views,
           coalesce(s.opens, 0)     as opens,
           coalesce(s.likes, 0)     as likes,
           coalesce(s.dismisses, 0) as dismisses,
           coalesce(s.saves, 0)     as saves
    from public.tips tp
    left join (
      select tip_id,
             count(*)                                  as views,
             count(*) filter (where opened)            as opens,
             count(*) filter (where reaction = 'like') as likes,
             count(*) filter (where reaction = 'dismiss') as dismisses,
             count(*) filter (where saved)             as saves
      from public.tip_interactions
      group by tip_id
    ) s on s.tip_id = tp.id
  ) t;
$$;
revoke all on function public.admin_list_tips() from public, anon, authenticated;
grant execute on function public.admin_list_tips() to service_role;

-- Legt an (ohne "id") oder aktualisiert (mit "id"). Die Edge Function prüft
-- die Werte vorher (supabase/functions/admin-api/tips.ts); die CHECKs der
-- Tabelle sind die zweite Absicherung.
create or replace function public.admin_upsert_tip(p_tip jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := nullif(p_tip->>'id', '')::uuid;
  v_goals text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_tip->'goals', '[]'::jsonb))), '{}');
begin
  if v_id is null then
    insert into public.tips (slug, category, title_de, body_de, title_en, body_en, goals, gender, cta, publish_on, active)
    values (
      nullif(p_tip->>'slug', ''),
      p_tip->>'category',
      p_tip->>'title_de', p_tip->>'body_de',
      p_tip->>'title_en', p_tip->>'body_en',
      v_goals,
      nullif(p_tip->>'gender', ''),
      nullif(p_tip->>'cta', ''),
      nullif(p_tip->>'publish_on', '')::date,
      coalesce((p_tip->>'active')::boolean, true)
    )
    returning id into v_id;
  else
    update public.tips set
      slug       = nullif(p_tip->>'slug', ''),
      category   = p_tip->>'category',
      title_de   = p_tip->>'title_de',
      body_de    = p_tip->>'body_de',
      title_en   = p_tip->>'title_en',
      body_en    = p_tip->>'body_en',
      goals      = v_goals,
      gender     = nullif(p_tip->>'gender', ''),
      cta        = nullif(p_tip->>'cta', ''),
      publish_on = nullif(p_tip->>'publish_on', '')::date,
      active     = coalesce((p_tip->>'active')::boolean, active),
      updated_at = now()
    where id = v_id;
    if not found then
      raise exception 'Tipp % nicht gefunden', v_id;
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.admin_upsert_tip(jsonb) from public, anon, authenticated;
grant execute on function public.admin_upsert_tip(jsonb) to service_role;

create or replace function public.admin_set_tip_active(p_tip_id uuid, p_active boolean)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.tips set active = p_active, updated_at = now() where id = p_tip_id;
$$;
revoke all on function public.admin_set_tip_active(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_tip_active(uuid, boolean) to service_role;

create or replace function public.admin_delete_tip(p_tip_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.tips where id = p_tip_id;
$$;
revoke all on function public.admin_delete_tip(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_tip(uuid) to service_role;

-- ── Start-Tipps (Entwürfe, bitte in der Admin-Website prüfen) ────────────────

insert into public.tips (slug, category, goals, cta, title_de, body_de, title_en, body_en) values
-- Ernährung
('protein-every-meal', 'nutrition', '{}', 'scan',
 'Protein in jede Mahlzeit',
 'Verteile dein Protein über den Tag: Eine Portion Eiweiß pro Mahlzeit, etwa Joghurt, Eier, Hülsenfrüchte oder Fisch, hält länger satt und unterstützt deine Muskeln.',
 'Protein in every meal',
 'Spread your protein across the day: a serving of protein with each meal, such as yogurt, eggs, legumes or fish, keeps you full longer and supports your muscles.'),
('water-before-meals', 'nutrition', '{lose}', 'water',
 'Ein Glas Wasser vor dem Essen',
 'Trink vor jeder Mahlzeit ein Glas Wasser. Das hilft dir, dein Trinkziel zu erreichen, und viele essen dadurch bewusster.',
 'A glass of water before eating',
 'Drink a glass of water before each meal. It helps you reach your hydration goal, and many people eat more mindfully as a result.'),
('half-plate-veggies', 'nutrition', '{lose,maintain}', null,
 'Halber Teller Gemüse',
 'Fülle die Hälfte deines Tellers mit Gemüse oder Salat. So isst du viel Volumen und Ballaststoffe bei wenig Kalorien.',
 'Half a plate of vegetables',
 'Fill half your plate with vegetables or salad. You get lots of volume and fibre for few calories.'),
('liquid-calories', 'nutrition', '{lose}', 'day_log',
 'Kalorien im Glas zählen mit',
 'Säfte, Softdrinks, Alkohol und süße Kaffeegetränke haben oft mehr Kalorien als gedacht. Trag sie mit ein, damit deine Bilanz stimmt.',
 'Drinks count too',
 'Juice, soft drinks, alcohol and sweet coffee drinks often have more calories than you think. Log them so your balance is accurate.'),
('fibre-sources', 'nutrition', '{}', null,
 'Ballaststoffe für lange Sättigung',
 'Haferflocken, Vollkornbrot, Hülsenfrüchte, Beeren und Gemüse liefern Ballaststoffe. Sie machen satt und sind gut für deine Verdauung.',
 'Fibre keeps you full',
 'Oats, wholegrain bread, legumes, berries and vegetables provide fibre. It keeps you full and is good for your digestion.'),
('surplus-gain', 'nutrition', '{gain}', 'nutrition',
 'Muskelaufbau braucht Energie',
 'Für Muskelaufbau brauchst du einen leichten Kalorienüberschuss. Ein paar hundert Kalorien über deinem Bedarf reichen meist, mehr landet eher als Fett.',
 'Building muscle needs energy',
 'To build muscle you need a slight calorie surplus. A few hundred calories above your needs is usually enough; more tends to end up as fat.'),
('easy-calories-gain', 'nutrition', '{gain}', null,
 'Leichter mehr essen',
 'Wenn dir viel Essen schwerfällt: Nüsse, Nussmus, Haferflocken, Trockenobst oder ein Shake liefern viele Kalorien in kleiner Menge.',
 'Eating more made easier',
 'If eating a lot is hard: nuts, nut butter, oats, dried fruit or a shake deliver plenty of calories in a small volume.'),
('meal-prep', 'nutrition', '{}', null,
 'Einmal kochen, zweimal essen',
 'Koch abends die doppelte Menge und nimm den Rest am nächsten Tag mit. So bist du unterwegs nicht auf spontane Snacks angewiesen.',
 'Cook once, eat twice',
 'Cook a double portion in the evening and take the rest with you the next day. That way you don''t depend on spontaneous snacks.'),
('log-right-away', 'nutrition', '{}', 'scan',
 'Gleich eintragen statt abends raten',
 'Fotografiere dein Essen direkt mit dem Scanner. Abends erinnert man sich oft nicht mehr an Snacks und Portionsgrößen.',
 'Log it now, not tonight',
 'Snap your meal straight away with the scanner. By the evening it''s easy to forget snacks and portion sizes.'),
('weekend-balance', 'nutrition', '{lose,maintain}', null,
 'Das Wochenende zählt mit',
 'Ein paar sehr großzügige Tage können eine ganze Woche ausgleichen. Plan Genuss bewusst ein, statt ihn ganz zu streichen.',
 'Weekends count too',
 'A couple of very generous days can cancel out a whole week. Plan treats deliberately instead of banning them completely.'),
('slow-eating', 'nutrition', '{lose}', null,
 'Langsamer essen',
 'Das Sättigungsgefühl kommt mit Verzögerung. Wer langsam isst und das Besteck zwischendurch ablegt, merkt früher, wann es genug ist.',
 'Eat more slowly',
 'Feeling full comes with a delay. Eating slowly and putting your cutlery down now and then helps you notice when you''ve had enough.'),
-- Training
('progressive-overload', 'training', '{gain,maintain}', 'plans',
 'Schritt für Schritt steigern',
 'Steigere dich langsam: eine Wiederholung mehr oder etwas mehr Gewicht als letzte Woche. Kleine Schritte bringen auf Dauer den größten Fortschritt.',
 'Increase step by step',
 'Progress gradually: one more rep or a little more weight than last week. Small steps add up to the biggest gains over time.'),
('warm-up', 'training', '{}', null,
 'Fünf Minuten aufwärmen',
 'Wärm dich vor dem Training 5 bis 10 Minuten auf, zum Beispiel mit lockerem Cardio und leichten Sätzen der ersten Übung.',
 'Warm up for five minutes',
 'Warm up for 5 to 10 minutes before training, for example with easy cardio and light sets of your first exercise.'),
('technique-first', 'training', '{}', null,
 'Technik vor Gewicht',
 'Saubere Ausführung ist wichtiger als schweres Gewicht. Schau dir die Piktogramme in den Übungsdetails an, wenn du unsicher bist.',
 'Technique before weight',
 'Clean form matters more than heavy weight. Check the pictograms in the exercise details if you''re unsure.'),
('steps-daily', 'training', '{lose,maintain}', null,
 'Alltagsbewegung zählt',
 'Treppe statt Aufzug, ein Spaziergang nach dem Essen, eine Station früher aussteigen: Viele kleine Wege bringen über den Tag viele Schritte.',
 'Everyday movement counts',
 'Stairs instead of the lift, a walk after meals, getting off one stop early: lots of small trips add up to many steps.'),
('fixed-training-days', 'training', '{}', 'create_plan',
 'Feste Trainingstage',
 'Leg feste Trainingstage fest und trag sie in deinen Plan ein. Ein fester Termin macht es leichter, dranzubleiben.',
 'Fixed training days',
 'Pick fixed training days and add them to your plan. A set appointment makes it easier to stay on track.'),
('strength-for-weightloss', 'training', '{lose}', 'create_plan',
 'Krafttraining auch beim Abnehmen',
 'Krafttraining hilft dir, beim Abnehmen Muskeln zu erhalten. So verlierst du vor allem Fett und nicht Kraft.',
 'Strength training while losing weight',
 'Strength training helps you keep your muscle while losing weight, so you mainly lose fat rather than strength.'),
('short-workout', 'training', '{}', 'plans',
 'Kurz ist besser als gar nicht',
 'Keine Zeit für das ganze Training? Mach 15 Minuten mit den wichtigsten Übungen. Dranbleiben zählt mehr als die perfekte Einheit.',
 'Short beats nothing',
 'No time for the full workout? Do 15 minutes of the key exercises. Consistency matters more than the perfect session.'),
('track-workouts', 'training', '{}', 'calendar',
 'Fortschritt sichtbar machen',
 'Schau regelmäßig in deinen Kalender: Wer sieht, wie oft er schon trainiert hat, bleibt leichter motiviert.',
 'Make progress visible',
 'Check your calendar regularly: seeing how often you''ve already trained makes it easier to stay motivated.'),
('full-range', 'training', '{gain,maintain}', null,
 'Volle Bewegungsamplitude',
 'Nutze bei jeder Übung den vollen Bewegungsweg, den du sauber kontrollieren kannst. Halbe Wiederholungen bringen meist weniger.',
 'Full range of motion',
 'Use the full range of motion you can control cleanly in every exercise. Half reps usually deliver less.'),
-- Erholung
('sleep-7h', 'recovery', '{}', null,
 'Schlaf ist Training',
 'Muskeln wachsen in der Erholung. Versuch, regelmäßig 7 bis 9 Stunden zu schlafen, und geh möglichst zur gleichen Zeit ins Bett.',
 'Sleep is training',
 'Muscles grow during recovery. Aim for 7 to 9 hours of sleep regularly and try to go to bed at the same time.'),
('rest-days', 'recovery', '{}', null,
 'Ruhetage gehören dazu',
 'Plane mindestens einen Ruhetag pro Woche ein. Ein lockerer Spaziergang an diesem Tag fördert die Erholung zusätzlich.',
 'Rest days are part of the plan',
 'Schedule at least one rest day a week. An easy walk on that day helps recovery even more.'),
('screen-before-bed', 'recovery', '{}', null,
 'Handy weg vor dem Schlafen',
 'Leg das Handy eine halbe Stunde vor dem Schlafengehen weg. Viele schlafen dann schneller ein und erholen sich besser.',
 'Phone away before bed',
 'Put your phone away half an hour before bed. Many people fall asleep faster and recover better.'),
('weight-fluctuates', 'recovery', '{lose}', 'body_stats',
 'Gewicht schwankt täglich',
 'Dein Gewicht kann von Tag zu Tag um ein bis zwei Kilo schwanken, etwa durch Wasser und Salz. Achte auf den Trend über Wochen, nicht auf einen einzelnen Tag.',
 'Weight fluctuates daily',
 'Your weight can vary by one to two kilos from day to day, for example due to water and salt. Watch the trend over weeks, not a single day.'),
('cycle-energy', 'recovery', '{}', 'calendar',
 'Training nach deinem Zyklus',
 'Energie und Leistung können sich im Laufe des Zyklus verändern. Hör auf deinen Körper und passe die Intensität an, wenn du dich schlapp fühlst.',
 'Train with your cycle',
 'Energy and performance can change over your cycle. Listen to your body and adjust the intensity when you feel low on energy.'),
('stretch-evening', 'recovery', '{}', null,
 'Fünf Minuten dehnen',
 'Ein paar Minuten lockeres Dehnen am Abend helfen vielen, abzuschalten, und halten dich beweglich.',
 'Five minutes of stretching',
 'A few minutes of gentle stretching in the evening helps many people unwind and keeps you mobile.'),
-- Mindset
('small-goals', 'mindset', '{}', null,
 'Kleine Ziele setzen',
 'Setz dir ein kleines Ziel für diese Woche, zum Beispiel dreimal trainieren oder jeden Tag dein Wasserziel erreichen. Kleine Erfolge motivieren.',
 'Set small goals',
 'Set yourself one small goal for this week, such as training three times or hitting your water goal every day. Small wins keep you motivated.'),
('not-perfect', 'mindset', '{}', null,
 'Ein Ausrutscher ist kein Rückschritt',
 'Ein schlechter Tag macht deinen Fortschritt nicht kaputt. Mach einfach mit der nächsten Mahlzeit oder dem nächsten Training weiter.',
 'One slip is not a setback',
 'One bad day doesn''t undo your progress. Simply carry on with your next meal or your next workout.'),
('habit-stacking', 'mindset', '{}', null,
 'Gewohnheiten verknüpfen',
 'Häng neue Gewohnheiten an feste Abläufe: Nach dem Zähneputzen ein Glas Wasser, nach dem Mittagessen zehn Minuten gehen.',
 'Stack your habits',
 'Attach new habits to fixed routines: a glass of water after brushing your teeth, a ten-minute walk after lunch.')
on conflict (slug) do nothing;

-- Zyklus-Tipp nur für Frauen
update public.tips set gender = 'female' where slug = 'cycle-energy' and gender is null;
