-- Flere navngivne afviklingslister: makroer kan grupperes i lister (fx ét sæt pr. show).
-- Ny tabel projekt_afviklingslister + liste_id på projekt_makroer.
-- Eksisterende makroer migreres til en auto-oprettet "Afvikling 1" pr. projekt.
-- RLS spejler projekt_makroer (anon select, authenticated all). Idempotent.
-- Kør i Supabase SQL Editor (projekt rxzxdcweqpbnvfkpnnrn).

create table if not exists public.projekt_afviklingslister (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references public.projekter(id) on delete cascade,
  navn text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.projekt_makroer
  add column if not exists liste_id uuid references public.projekt_afviklingslister(id) on delete set null;

create index if not exists projekt_afviklingslister_projekt_idx on public.projekt_afviklingslister(projekt_id);
create index if not exists projekt_makroer_liste_idx on public.projekt_makroer(liste_id);

-- ── RLS (spejler projekt_makroer) ──────────────────────────────────────────
alter table public.projekt_afviklingslister enable row level security;
drop policy if exists "projekt_afviklingslister_anon_select" on public.projekt_afviklingslister;
create policy "projekt_afviklingslister_anon_select" on public.projekt_afviklingslister
  for select to anon using (true);
drop policy if exists "projekt_afviklingslister_auth_all" on public.projekt_afviklingslister;
create policy "projekt_afviklingslister_auth_all" on public.projekt_afviklingslister
  for all to authenticated using (true) with check (true);

-- ── Data-migrering ─────────────────────────────────────────────────────────
-- Opret "Afvikling 1" pr. projekt der har makroer uden liste, og tildel dem.
-- Idempotent: efter første kørsel er ingen makroer liste_id-løse, så intet sker.
do $$
declare
  p record;
  new_liste uuid;
begin
  for p in
    select distinct projekt_id from public.projekt_makroer where liste_id is null
  loop
    insert into public.projekt_afviklingslister (projekt_id, navn, sort_order)
      values (p.projekt_id, 'Afvikling 1', 0)
      returning id into new_liste;
    update public.projekt_makroer
      set liste_id = new_liste
      where projekt_id = p.projekt_id and liste_id is null;
  end loop;
end $$;

notify pgrst, 'reload schema';
