-- Selvbetjent font-bibliotek: brugere kan uploade egne fonte i GRAFIK SETUP, så alle
-- grafikker (playout + grafik-agent) kan bruge dem uden redeploy.
-- Global tabel (ingen projekt_id) — "man skal kunne bruge de fonte man har lyst til",
-- og alle brugere ser alle projekter, så fontene deles på tværs.
-- Font-FILERNE lægges i den eksisterende 'grafik'-storage-bucket under fonts/-prefix
-- (genbruger grafik_auth_insert/update/delete-politikkerne — ingen ny storage-RLS nødvendig).
-- RLS spejler projekt_afviklingslister (anon select, authenticated all). Idempotent.
-- Kør i Supabase SQL Editor (projekt rxzxdcweqpbnvfkpnnrn).

create table if not exists public.custom_fonts (
  id uuid primary key default gen_random_uuid(),
  family text not null,                      -- font-family-navn man skriver i grafikken
  weight int not null default 400,           -- 100..900
  style text not null default 'normal',      -- normal | italic
  file_url text not null,                    -- offentlig URL (storage)
  file_path text not null,                   -- storage-sti til sletning (fonts/...)
  created_at timestamptz not null default now()
);

create index if not exists custom_fonts_family_idx on public.custom_fonts(family);

-- ── RLS (spejler projekt_afviklingslister) ─────────────────────────────────
alter table public.custom_fonts enable row level security;
drop policy if exists "custom_fonts_anon_select" on public.custom_fonts;
create policy "custom_fonts_anon_select" on public.custom_fonts
  for select to anon using (true);
drop policy if exists "custom_fonts_auth_all" on public.custom_fonts;
create policy "custom_fonts_auth_all" on public.custom_fonts
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
