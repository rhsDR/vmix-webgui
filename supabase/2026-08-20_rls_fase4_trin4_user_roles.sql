-- ============================================================================
-- Fase 4 · RLS · TRIN 4 — user_roles (den følsomme: hvem er admin)
-- ============================================================================
-- user_roles styrer admin-adgang, så den er den strengeste:
--   anon          → INGEN adgang (kan hverken læse eller skrive hvem der er admin)
--   authenticated → læse EGEN rolle (bruges af login-tjekket isAdmin)
--   admins        → ændre alle roller (admin-siden)
--   service_role  → bypasser RLS (api/list-users, api/invite m.fl.)
--
-- Hvorfor en funktion? En policy der spørger "er den her bruger admin?" ville
-- skulle læse user_roles — inde fra user_roles' egen policy = uendelig løkke.
-- Løsningen er en SECURITY DEFINER-funktion, der kører med ejerens rettigheder
-- og dermed går uden om RLS, når den slår admin-status op.
--
-- VIGTIGT: du (den nuværende admin) har allerede en 'admin'-række, så du låser
-- ikke dig selv ude. Og skulle noget gå galt, virker rollback-filen altid
-- (den kører som server-rolle i SQL-editoren). Test admin-siden bagefter.
--
-- Kør i Supabase SQL Editor. Rører KUN regler + tilføjer én funktion, ikke data.
-- ============================================================================

-- Hjælpefunktion: er den aktuelle bruger admin? (bypasser RLS → ingen løkke)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- Tillad at policies (kørt som den indloggede bruger) må kalde funktionen.
grant execute on function public.is_admin() to authenticated;

alter table public.user_roles enable row level security;

-- Indloggede må læse deres EGEN rolle (login-tjekket isAdmin bruger dette).
-- Admins kan læse alle rækker via admin-write-policyen nedenfor (OR'es sammen).
create policy "user_roles_select_own" on public.user_roles
  for select to authenticated
  using (auth.uid() = user_id);

-- Kun admins må ændre roller (admin-siden). is_admin() går uden om RLS internt.
create policy "user_roles_admin_write" on public.user_roles
  for all to authenticated
  using      (public.is_admin())
  with check (public.is_admin());
