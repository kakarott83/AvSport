-- Geschätzte USD-Kosten pro Gemini-Anfrage (siehe estimateCostUsd() in
-- services/gemini/client.ts). Summiert über den laufenden Kalendermonat ist das
-- die Grundlage für den monatlichen Kosten-Deckel für Premium-Abonnenten
-- (PREMIUM_MONTHLY_COST_CAP_USD, aktuell 10) — Nicht-Premium-Accounts bleiben
-- beim bestehenden täglichen Anfragelimit (DAILY_REQUEST_LIMIT).

alter table public.ai_logs
  add column if not exists cost_usd numeric not null default 0;

-- Bestehende Zeilen rückwirkend mit den aktuellen gemini-2.5-flash-Preisen
-- befüllen (Input $0.30 / 1M Tokens, Output $2.50 / 1M Tokens), damit der
-- laufende Monat nicht künstlich bei 0 € startet.
update public.ai_logs
set cost_usd = round(
  (coalesce(prompt_tokens, 0)::numeric / 1000000) * 0.30
    + (coalesce(completion_tokens, 0)::numeric / 1000000) * 2.50,
  6
)
where model = 'gemini-2.5-flash' and cost_usd = 0;
