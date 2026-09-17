-- Luk RLS-advarslen (rls_disabled_in_public) på to UBRUGTE vmix-webgui-tabeller.
--   enetpulse_cache: enetpulse bruges ikke længere.
--   fixture_cache:   ikke refereret i koden (fixture-search.js bruger lokale JSON-cache-
--                    filer via loadCache(), ikke DB-tabellen).
-- RLS slået til UDEN politik => kun service_role har adgang; anon/authenticated nægtes helt.
-- Ingen app bruger tabellerne, så intet går i stykker. Idempotent.
-- (folkemoede_config / folkemoede_mic_numbers hører til et ANDET projekt og røres ikke.)
-- Kør i Supabase SQL Editor (projekt rxzxdcweqpbnvfkpnnrn).

alter table public.enetpulse_cache enable row level security;
alter table public.fixture_cache   enable row level security;
