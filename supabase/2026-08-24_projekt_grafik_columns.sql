-- projekt_grafik: tilføj de konfig-kolonner koden forventer, men som manglede i tabellen.
-- Symptom: "Could not find the 'X' column of 'projekt_grafik' in the schema cache" ved gem
--   af grafik (BÅDE Grafik-agenten OG den manuelle "+ Tilføj ny grafik").
-- Årsag: tabellen blev oprettet med et ældre/minimalt skema; koden fik senere tilføjet
--   overlay-/auto-hide-/template-felter uden at kolonnerne blev tilføjet i DB. Læsning virkede
--   pga. graceful defaults i koden (|| 'hoved' osv.), men INSERT fejler på ukendte kolonner.
-- 'add column if not exists' er harmløs for evt. allerede-eksisterende kolonner. Nullable —
--   eksisterende rækker får NULL og falder tilbage til defaults i koden.
-- Kør i Supabase SQL Editor (projekt rxzxdcweqpbnvfkpnnrn). Idempotent.

alter table public.projekt_grafik
  add column if not exists color             text,
  add column if not exists overlay_mode      text,
  add column if not exists overlay_input     integer,
  add column if not exists overlay_target    text,
  add column if not exists auto_hide_seconds integer,
  add column if not exists template_type     text;

-- Frisk PostgREST's schema-cache så de nye kolonner bliver synlige med det samme
notify pgrst, 'reload schema';
