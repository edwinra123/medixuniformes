-- Medix: arreglar fotos + rol admin
-- Ejecuta TODO este archivo en Supabase → SQL Editor

-- 1) Tu correo como admin en profiles (necesario para RLS)
update public.profiles
set role = 'admin',
    full_name = coalesce(nullif(full_name, ''), 'Administrador Medix')
where id in (
  select id from auth.users where lower(email) = lower('edwinramirez11e17@gmail.com')
);

insert into public.profiles (id, full_name, role)
select u.id, 'Administrador Medix', 'admin'
from auth.users u
where lower(u.email) = lower('edwinramirez11e17@gmail.com')
  and not exists (select 1 from public.profiles p where p.id = u.id);

-- Permitir que el usuario cree/actualice su propio perfil
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- 2) Bucket publico de fotos
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- 3) Politicas de Storage (lectura publica + escritura si hay sesion)
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
