-- Fix: subs.id manglede en auto-increment-default.
--
-- Fejl ved klient-INSERT af ny sub-plads:
--   23502 — null value in column "id" of relation "subs" violates not-null constraint
--
-- Baggrund: subs.id er NOT NULL men havde ingen DEFAULT. Historisk blev id altid sat eksplicit af
-- seed-scriptet, og klienten oprettede ALDRIG subs (kun SELECT + UPDATE). Nu hvor dynamiske TV-subs
-- INSERT'er nye pladser (uden at sende id), kan DB'en ikke selv generere et id → NOT NULL-fejl.
--
-- Løsning: knyt en sequence som default (som en almindelig serial). Ingen kodeændring nødvendig —
-- klienten fortsætter med at INSERT'e uden id, og DB'en genererer det nu selv.
-- Additivt og kampdag-neutralt (samme tabel, kun en kolonne-default + sequence-grant).

-- 1) Sequence til id (ejet af kolonnen, så den ryddes med tabellen).
create sequence if not exists public.subs_id_seq owned by public.subs.id;

-- 2) Start sequencen LIGE OVER det højeste eksisterende id (is_called=false → næste nextval = denne værdi),
--    så nye rækker ikke kolliderer med de seedede.
select setval('public.subs_id_seq', (select coalesce(max(id), 0) from public.subs) + 1, false);

-- 3) Sæt kolonne-default.
alter table public.subs alter column id set default nextval('public.subs_id_seq');

-- 4) authenticated skal kunne hente nextval ved INSERT (sequencen fandtes ikke da det tidligere
--    "grant ... on all sequences" blev kørt, så den skal grantes eksplicit nu).
grant usage, select on sequence public.subs_id_seq to authenticated;

-- 5) Bed PostgREST genindlæse skemaet, så den nye default slår igennem med det samme.
notify pgrst, 'reload schema';
