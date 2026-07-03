-- Graphics Agent: projekt-konfiguration (handover punkt 1)
-- Kør i Supabase SQL Editor (projekt rxzxdcweqpbnvfkpnnrn)
-- Idempotent: kan køres flere gange uden skade.

-- Standard-værdier ligger som column defaults (én kilde til sandhed).
-- Seed og trigger indsætter kun projekt-specifikke felter.
create table if not exists public.graphics_agent_config (
  projekt_id        uuid primary key references public.projekter(id) on delete cascade,
  overlay_channels  jsonb not null default '{"1":"permanent bug / ticker","2":"lower thirds / navneskilte","3":"fullscreen grafik","4":"reserveret"}'::jsonb,
  field_conventions text not null default 'Subs: S1_n (navn), S1_t (titel) [1-15]. vMix calls: VMC1_n (navn), VMC1_t (titel), VMC1_l (link) [1-8]. Ticker: T1_ov (overskrift), T1_txt (tekst) [1-20]. Kampe: K1_h1_L/K1_h1_K (hold 1 lang/kort), K1_h1_S (score), K1_kom (kommentator) [1-6].',
  template_notes    text not null default '',
  vmix_input_base   text not null default 'GFX',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Nødvendigt for at endpointet kan læse tabellen (okt. 2026-krav, se grants_template.sql)
grant select, insert, update, delete on public.graphics_agent_config to service_role;

-- Undgår ny Supabase-advarsel (endpointet bruger service role og påvirkes ikke)
alter table public.graphics_agent_config enable row level security;

-- ── SEED: én række per EKSISTERENDE projekt (defaults udfylder resten) ──
insert into public.graphics_agent_config (projekt_id, template_notes, vmix_input_base)
select
  p.id,
  'Projekt: ' || coalesce(p.navn,'') || ' (type: ' || coalesce(p.type,'') || ')',
  replace(coalesce(p.navn,'projekt'), ' ', '_') || '_GFX'
from public.projekter p
on conflict (projekt_id) do nothing;

-- ── AUTO-SEED: nye projekter får automatisk en config-række ──
create or replace function public.seed_graphics_agent_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.graphics_agent_config (projekt_id, template_notes, vmix_input_base)
  values (
    new.id,
    'Projekt: ' || coalesce(new.navn,'') || ' (type: ' || coalesce(new.type,'') || ')',
    replace(coalesce(new.navn,'projekt'), ' ', '_') || '_GFX'
  )
  on conflict (projekt_id) do nothing;
  return new;
exception when others then
  -- Config-seed må aldrig blokere projekt-oprettelse
  return new;
end $$;

drop trigger if exists trg_seed_graphics_agent_config on public.projekter;
create trigger trg_seed_graphics_agent_config
after insert on public.projekter
for each row execute function public.seed_graphics_agent_config();

-- ── updated_at vedligeholdes automatisk ved UPDATE ──
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_graphics_agent_config on public.graphics_agent_config;
create trigger trg_touch_graphics_agent_config
before update on public.graphics_agent_config
for each row execute function public.touch_updated_at();
