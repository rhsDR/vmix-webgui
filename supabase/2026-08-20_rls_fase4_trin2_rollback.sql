-- ============================================================================
-- Fase 4 · RLS · TRIN 2 · ROLLBACK — app-tabellerne
-- ============================================================================
-- Fortryder 2026-08-20_rls_fase4_trin2.sql fuldstændigt: fjerner policies og
-- slår RLS fra igen på de 8 tabeller. Rører KUN regler, ikke data.
-- Kør denne hvis panelet ikke længere kan læse eller skrive en af tabellerne.
-- (Rører IKKE dropdowns — den blev sat i canary-trinnet og har sin egen rollback.)
-- ============================================================================

drop policy if exists "kampe_anon_select" on public.kampe;
drop policy if exists "kampe_auth_all"    on public.kampe;
alter table public.kampe disable row level security;

drop policy if exists "tickers_anon_select" on public.tickers;
drop policy if exists "tickers_auth_all"    on public.tickers;
alter table public.tickers disable row level security;

drop policy if exists "subs_anon_select" on public.subs;
drop policy if exists "subs_auth_all"    on public.subs;
alter table public.subs disable row level security;

drop policy if exists "vmix_calls_anon_select" on public.vmix_calls;
drop policy if exists "vmix_calls_auth_all"    on public.vmix_calls;
alter table public.vmix_calls disable row level security;

drop policy if exists "credits_anon_select" on public.credits;
drop policy if exists "credits_auth_all"    on public.credits;
alter table public.credits disable row level security;

drop policy if exists "projekter_anon_select" on public.projekter;
drop policy if exists "projekter_auth_all"    on public.projekter;
alter table public.projekter disable row level security;

drop policy if exists "projekt_grafik_anon_select" on public.projekt_grafik;
drop policy if exists "projekt_grafik_auth_all"    on public.projekt_grafik;
alter table public.projekt_grafik disable row level security;

drop policy if exists "projekt_makroer_anon_select" on public.projekt_makroer;
drop policy if exists "projekt_makroer_auth_all"    on public.projekt_makroer;
alter table public.projekt_makroer disable row level security;
