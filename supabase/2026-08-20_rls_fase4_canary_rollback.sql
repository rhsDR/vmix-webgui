-- ============================================================================
-- Fase 4 · RLS · CANARY · ROLLBACK (dropdowns)
-- ============================================================================
-- Fortryder 2026-08-20_rls_fase4_canary.sql fuldstændigt: fjerner de to
-- policies og slår RLS fra igen på dropdowns. Rører KUN regler, ikke data.
-- Kør denne hvis panelet ikke længere kan læse eller skrive dropdowns.
-- ============================================================================

drop policy if exists "dropdowns_anon_select" on public.dropdowns;
drop policy if exists "dropdowns_auth_all"    on public.dropdowns;

alter table public.dropdowns disable row level security;
