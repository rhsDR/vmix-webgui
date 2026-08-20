-- ============================================================================
-- Fase 4 · RLS · TRIN 3 — settings (med smal undtagelse)
-- ============================================================================
-- settings-tabellen holder triggers, lag-orden, komm_master m.m.
--
-- Regler:
--   anon          → LÆSE alt (overlays + panel læser settings)
--   authenticated → ALT (panelet skriver alle keys med login)
--   service_role  → bypasser RLS (trigger-API'et skriver alle keys server-side)
--
-- Smal undtagelse: overlay-3 og credits-siderne nulstiller SELV deres egen
-- momentane trigger til 'out' efter visning (anon PATCH). Derfor må anon
-- opdatere PRÆCIS to nøgler — 'lineup_trigger' og 'credits_trigger' — og intet
-- andet. (Komm-boksene skrev også før, men det fjernede vi i komm-boks-fixet.)
--
-- Kør i Supabase SQL Editor. Rører KUN regler, ikke data.
-- Forvent "Success. No rows returned".
-- ============================================================================

alter table public.settings enable row level security;

-- Alle må LÆSE
create policy "settings_anon_select" on public.settings
  for select to anon using (true);

-- Indloggede må ALT
create policy "settings_auth_all" on public.settings
  for all to authenticated using (true) with check (true);

-- Undtagelse: anon må KUN opdatere de to selv-nulstillende overlay-triggers.
-- for update = kun ændre eksisterende rækker (ingen insert/delete). Både USING
-- (hvilke rækker) og WITH CHECK (resultatet) låser til de to nøgler, så anon
-- hverken kan røre andre keys eller omdøbe nøglen.
create policy "settings_anon_reset_triggers" on public.settings
  for update to anon
  using      (key in ('lineup_trigger', 'credits_trigger'))
  with check (key in ('lineup_trigger', 'credits_trigger'));
