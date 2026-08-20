-- ============================================================================
-- Fase 4 · RLS · TRIN 3 · ROLLBACK — settings
-- ============================================================================
-- Fortryder 2026-08-20_rls_fase4_trin3_settings.sql fuldstændigt: fjerner de tre
-- policies og slår RLS fra igen på settings. Rører KUN regler, ikke data.
-- Kør denne hvis panelet ikke kan skrive triggers/lag-orden, eller hvis
-- overlays ikke kan læse settings.
-- ============================================================================

drop policy if exists "settings_anon_select"          on public.settings;
drop policy if exists "settings_auth_all"             on public.settings;
drop policy if exists "settings_anon_reset_triggers"  on public.settings;

alter table public.settings disable row level security;
