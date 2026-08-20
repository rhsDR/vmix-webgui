-- ============================================================================
-- Fase 4 · RLS · TRIN 2 — app-tabellerne
-- ============================================================================
-- Samme bevist mønster som canary'en (dropdowns), nu på de resterende
-- app-tabeller: alle må LÆSE (anon), kun indloggede må SKRIVE (authenticated).
-- service_role (server-API'er) bypasser RLS automatisk.
--
-- Tabeller: kampe, tickers, subs, vmix_calls, credits, projekter,
--           projekt_grafik, projekt_makroer
-- (dropdowns er allerede gjort i canary-trinnet; settings + user_roles kommer
--  i trin 3 og 4, fordi de har særlige regler.)
--
-- Kør i Supabase SQL Editor. Rører KUN regler, ikke data.
-- Forvent "Success. No rows returned".
--
-- Test bagefter i panelet (en bred runde):
--   - Kampe: ret et holdnavn, skift score, sæt on air
--   - Ticker: gem en ticker; Subs: gem en sub; Credits: gem en credit
--   - Grafik: kør en makro / skift en trigger
-- Alt skal virke som før. Fejler noget: kør trin2_rollback.sql.
-- ============================================================================

-- ── kampe ──────────────────────────────────────────────────────────────────
alter table public.kampe enable row level security;
create policy "kampe_anon_select" on public.kampe
  for select to anon using (true);
create policy "kampe_auth_all" on public.kampe
  for all to authenticated using (true) with check (true);

-- ── tickers ────────────────────────────────────────────────────────────────
alter table public.tickers enable row level security;
create policy "tickers_anon_select" on public.tickers
  for select to anon using (true);
create policy "tickers_auth_all" on public.tickers
  for all to authenticated using (true) with check (true);

-- ── subs ───────────────────────────────────────────────────────────────────
alter table public.subs enable row level security;
create policy "subs_anon_select" on public.subs
  for select to anon using (true);
create policy "subs_auth_all" on public.subs
  for all to authenticated using (true) with check (true);

-- ── vmix_calls ─────────────────────────────────────────────────────────────
alter table public.vmix_calls enable row level security;
create policy "vmix_calls_anon_select" on public.vmix_calls
  for select to anon using (true);
create policy "vmix_calls_auth_all" on public.vmix_calls
  for all to authenticated using (true) with check (true);

-- ── credits ────────────────────────────────────────────────────────────────
alter table public.credits enable row level security;
create policy "credits_anon_select" on public.credits
  for select to anon using (true);
create policy "credits_auth_all" on public.credits
  for all to authenticated using (true) with check (true);

-- ── projekter ──────────────────────────────────────────────────────────────
alter table public.projekter enable row level security;
create policy "projekter_anon_select" on public.projekter
  for select to anon using (true);
create policy "projekter_auth_all" on public.projekter
  for all to authenticated using (true) with check (true);

-- ── projekt_grafik ─────────────────────────────────────────────────────────
alter table public.projekt_grafik enable row level security;
create policy "projekt_grafik_anon_select" on public.projekt_grafik
  for select to anon using (true);
create policy "projekt_grafik_auth_all" on public.projekt_grafik
  for all to authenticated using (true) with check (true);

-- ── projekt_makroer ────────────────────────────────────────────────────────
alter table public.projekt_makroer enable row level security;
create policy "projekt_makroer_anon_select" on public.projekt_makroer
  for select to anon using (true);
create policy "projekt_makroer_auth_all" on public.projekt_makroer
  for all to authenticated using (true) with check (true);
