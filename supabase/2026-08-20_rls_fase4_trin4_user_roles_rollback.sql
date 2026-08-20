-- ============================================================================
-- Fase 4 · RLS · TRIN 4 · ROLLBACK — user_roles
-- ============================================================================
-- Fortryder 2026-08-20_rls_fase4_trin4_user_roles.sql fuldstændigt: fjerner de
-- to policies, slår RLS fra igen på user_roles, og fjerner is_admin()-funktionen.
-- Rører KUN regler + funktion, ikke data.
-- Kør denne hvis admin-siden ikke længere kan læse roller eller skifte roller.
-- ============================================================================

drop policy if exists "user_roles_select_own"  on public.user_roles;
drop policy if exists "user_roles_admin_write" on public.user_roles;

alter table public.user_roles disable row level security;

drop function if exists public.is_admin();
