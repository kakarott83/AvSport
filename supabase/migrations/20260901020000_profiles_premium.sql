-- Premium-Status pro User, gesetzt vom RevenueCat-Webhook
-- (supabase/functions/revenuecat-webhook). Der Server nutzt is_premium, um das
-- KI-Tageslimit für Abonnenten zu überspringen (services/gemini/client.ts).

alter table public.profiles
  add column if not exists is_premium      boolean not null default false,
  add column if not exists premium_until   timestamptz,
  add column if not exists premium_product  text;
