-- Kategori på custom-grafik, så de kan grupperes under SUB/INFO/TICKER/CREDIT i afviklingen
-- (TV-projekternes GRAFIK-fane). Uparrede grafikker falder under 'custom'.
-- Idempotent. Kør i Supabase SQL Editor (projekt rxzxdcweqpbnvfkpnnrn).

alter table public.projekt_grafik
  add column if not exists kategori text not null default 'custom';
  -- gyldige værdier: sub | info | ticker | credit | custom

notify pgrst, 'reload schema';
