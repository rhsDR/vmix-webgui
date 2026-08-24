-- Storage RLS for 'grafik'-bucketen.
-- Løser: "new row violates row-level security policy" ved upload af grafik
--   (rammer BÅDE Grafik-agenten OG den manuelle "+ Tilføj ny grafik" — samme upload-kald).
-- Baggrund: fil-uploads går til Supabase Storage (storage.objects), som har egen RLS.
--   Efter at panelet skriver som 'authenticated' (RLS Fase 4) mangler der en skrive-politik
--   for authenticated på denne bucket. Læsning forbliver offentlig (bucketen er public).
-- Kør i Supabase SQL Editor (projekt rxzxdcweqpbnvfkpnnrn). Idempotent.

-- INSERT (upload af ny fil)
drop policy if exists "grafik_auth_insert" on storage.objects;
create policy "grafik_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'grafik');

-- UPDATE (upload med upsert=true når filen findes)
drop policy if exists "grafik_auth_update" on storage.objects;
create policy "grafik_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'grafik')
  with check (bucket_id = 'grafik');

-- DELETE (sletning af grafik fra panelet)
drop policy if exists "grafik_auth_delete" on storage.objects;
create policy "grafik_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'grafik');

-- Læsning: bucketen er public, så SELECT er allerede tilladt. Hvis den IKKE er public,
-- så tilføj også:
-- drop policy if exists "grafik_public_select" on storage.objects;
-- create policy "grafik_public_select" on storage.objects
--   for select to anon, authenticated using (bucket_id = 'grafik');
