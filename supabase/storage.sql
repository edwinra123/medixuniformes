-- Storage para fotos de productos (Supabase)
-- Preferible ejecutar fix-photos.sql completo

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read"
on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists "product_images_admin_insert" on storage.objects;
drop policy if exists "product_images_auth_insert" on storage.objects;
create policy "product_images_auth_insert"
on storage.objects for insert
with check (bucket_id = 'product-images' and auth.uid() is not null);

drop policy if exists "product_images_admin_update" on storage.objects;
drop policy if exists "product_images_auth_update" on storage.objects;
create policy "product_images_auth_update"
on storage.objects for update
using (bucket_id = 'product-images' and auth.uid() is not null)
with check (bucket_id = 'product-images' and auth.uid() is not null);

drop policy if exists "product_images_admin_delete" on storage.objects;
drop policy if exists "product_images_auth_delete" on storage.objects;
create policy "product_images_auth_delete"
on storage.objects for delete
using (bucket_id = 'product-images' and auth.uid() is not null);
