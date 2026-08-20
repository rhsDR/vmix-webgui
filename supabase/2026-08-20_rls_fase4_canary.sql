-- ============================================================================
-- Fase 4 · RLS · CANARY (dropdowns)
-- ============================================================================
-- Formål: bevis på ÉN lav-risiko tabel at panelets JWT-skrivning virker under
-- RLS, FØR vi ruller ud til resten. Kør i Supabase SQL Editor (SQL → New query
-- → indsæt → Run). Rører KUN regler, ikke data.
--
-- Model (gælder alle app-tabeller):
--   anon          → må kun LÆSE (overlays + panelets reads bruger anon-nøglen)
--   authenticated → må ALT (panelet skriver med indlogget JWT)
--   service_role  → bypasser RLS automatisk (server-API'er) — ingen policy nødvendig
--
-- Test bagefter i panelet (STAMDATA-fanen):
--   1) Dropdowns vises stadig ved kamp-redigering  → anon SELECT virker
--   2) Tilføj/ret en kommentator og gem            → authenticated WRITE virker
-- Virker begge → JWT-vejen er bevist, og vi ruller resten ud.
-- Fejler write → koden er ikke deployet endnu; kør rollback-filen.
-- ============================================================================

alter table public.dropdowns enable row level security;

-- Alle (også overlays/anon) må LÆSE
create policy "dropdowns_anon_select"
  on public.dropdowns
  for select
  to anon
  using (true);

-- Kun indloggede må SKRIVE (og læse). service_role bypasser RLS af sig selv.
create policy "dropdowns_auth_all"
  on public.dropdowns
  for all
  to authenticated
  using (true)
  with check (true);
