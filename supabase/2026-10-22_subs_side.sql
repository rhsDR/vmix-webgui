-- Venstre/højre pr. sub: tilføj 'side'-kolonne til subs + vmix_calls.
--
-- Hvorfor: super_showet_lt-grafikken kan nu vise en sub i venstre ELLER højre side (spejlvendt).
-- Valget gemmes PR. SUB i SUBS-fanen; grafikken læser S{n}_side fra /api/vmix og spejler sig selv.
-- Default 'venstre' → eksisterende subs er uændrede.
-- (subs/vmix_calls er allerede i realtime-publication, så redigeringer pushes live til grafikken.)
--
-- Køres i Supabase SQL Editor.

alter table public.subs       add column if not exists side text not null default 'venstre';
alter table public.vmix_calls add column if not exists side text not null default 'venstre';

-- Verificér (begge skal give rækker med side-kolonnen):
-- select slot, navn, side from public.subs order by slot limit 3;
