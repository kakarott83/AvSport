-- Trainingsmethode je Plan (HIIT, CrossFit, Zirkel, …).
-- Wird vom KI-Coach (AiPlanGeneratorModal) gesetzt und steuert dort Prompt,
-- Satz-/Pausen-Struktur und is_circuit. Nullable, weil manuell angelegte Pläne
-- (create-plan.tsx) und alle Bestandspläne keine Methode haben.

alter table public.workout_plans
  add column if not exists training_method text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workout_plans'::regclass
      and conname  = 'workout_plans_training_method_check'
  ) then
    alter table public.workout_plans
      add constraint workout_plans_training_method_check
      check (training_method in (
        'klassisch', 'hiit', 'crossfit', 'zirkel', 'calisthenics', 'ausdauer'
      ));
  end if;
end $$;
