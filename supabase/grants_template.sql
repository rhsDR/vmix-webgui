-- Supabase Data API grants til nye tabeller i public-schema
-- Fra oktober 2026 kræver alle nye tabeller eksplicitte grants for at
-- være tilgængelige via supabase-js / PostgREST (/rest/v1/).
--
-- Kør disse statements efter CREATE TABLE for hver ny tabel.
-- Erstat 'din_tabel' med det faktiske tabelnavn.

-- Læseadgang til ikke-loggede brugere (anon nøgle)
GRANT SELECT
  ON public.din_tabel
  TO anon;

-- Fuld adgang til loggede brugere (authenticated JWT)
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.din_tabel
  TO authenticated;

-- Fuld adgang til server-side service role
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.din_tabel
  TO service_role;

-- Aktiver Row Level Security (påkrævet ved brug af anon/authenticated)
ALTER TABLE public.din_tabel
  ENABLE ROW LEVEL SECURITY;

-- Eksempel-politik: kun egne rækker for loggede brugere
-- CREATE POLICY "brugere kan se egne rækker"
--   ON public.din_tabel
--   FOR SELECT TO authenticated
--   USING (auth.uid() = user_id);

-- Eksempel-politik: alle kan læse (åben tabel uden bruger-tilknytning)
-- CREATE POLICY "alle kan læse"
--   ON public.din_tabel
--   FOR SELECT TO anon, authenticated
--   USING (true);
