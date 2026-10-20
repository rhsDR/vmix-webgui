-- Aktivér Supabase realtime (postgres_changes) for subs + vmix_calls.
--
-- Hvorfor: master.html lytter på subs/vmix_calls-ændringer og pusher den ændrede tekst til custom-grafik
-- via postMessage (vmixData) — så grafikkens cache er frisk UDEN en refetch-på-IN. Virker KUN hvis
-- tabellerne er med i realtime-publication'en `supabase_realtime`. Er de ikke det, hører master aldrig om
-- en sub-/vMix Call-redigering, og grafikken viser den GAMLE tekst ved næste trigger.
-- (info-bokse virker allerede, fordi de ligger i `settings`, der er i realtime.)
--
-- Idempotent: tilføjer kun hvis tabellen ikke allerede er medlem. Kør i Supabase SQL Editor.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subs'
  ) then
    alter publication supabase_realtime add table public.subs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vmix_calls'
  ) then
    alter publication supabase_realtime add table public.vmix_calls;
  end if;
end $$;

-- REPLICA IDENTITY FULL: så UPDATE-payloaden + projekt_id-filteret altid har alle nødvendige kolonner.
alter table public.subs       replica identity full;
alter table public.vmix_calls replica identity full;

-- Verificér (skal vise begge tabeller):
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('subs','vmix_calls');
