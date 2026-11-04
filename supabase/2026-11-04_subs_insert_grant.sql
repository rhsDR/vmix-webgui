-- Fix: subs kunne ikke OPRETTES fra klienten (kun opdateres).
--
-- Baggrund: TV-subs er nu dynamiske (pladser kan tilføjes efter behov), så panelet INSERT'er nu
-- subs-rækker fra den indloggede bruger (authenticated). Før INSERT'ede klienten ALDRIG subs — pladser
-- 1-15 var seedet server-side, og klienten lavede kun SELECT + UPDATE. Derfor kan `authenticated` mangle
-- INSERT-privilegiet (og USAGE på id-sequencen, hvis `subs.id` er en serial). Resultat: UPDATE virker
-- (fx redigering af en eksisterende sub), men INSERT fejler ("permission denied for table subs" eller
-- "... for sequence subs_id_seq") → "Fejl ved gem" for nye pladser (fx 13, 14, 15, 30).
--
-- RLS tillader det allerede (policy "subs_auth_all" = for all ... with check (true)); dette er KUN
-- table/sequence-GRANTS, som RLS forudsætter. Additivt og kampdag-neutralt (samme subs-tabel, kun flere
-- privilegier til den indloggede rolle; anon er uændret = kun SELECT).

grant select, insert, update, delete on public.subs to authenticated;

-- id-sequencen (hvis subs.id er en serial — nødvendig for at INSERT kan hente nextval).
-- Dækker begge navngivninger robust uden at skulle kende det præcise sequence-navn.
grant usage, select on all sequences in schema public to authenticated;
