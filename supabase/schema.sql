-- Medix Uniformes — Supabase schema
-- Run in Supabase SQL Editor (Project > SQL > New query)

create extension if not exists "pgcrypto";

-- Profiles (linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'customer' check (role in ('admin', 'customer')),
  created_at timestamptz not null default now()
);

-- Categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price is null or compare_at_price >= 0),
  stock int not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  color_name text,
  material text default 'Tela Antifluido',
  image_folder text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_active_idx on public.products (is_active);
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_color_idx on public.products (color_name);

-- Product images
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_idx on public.product_images (product_id);

-- Variants (size + stock)
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  size text not null check (size in ('XS', 'S', 'M', 'L', 'XL', 'XXL')),
  stock int not null default 0 check (stock >= 0),
  unique (product_id, size)
);

create index if not exists product_variants_product_idx on public.product_variants (product_id);

-- Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  customer_name text not null,
  customer_phone text not null,
  customer_address text not null,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  payment_method text default 'cash_on_delivery',
  total numeric(12, 2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_created_idx on public.orders (created_at desc);

-- Order items
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity int not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  size text,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

-- Inventory movements
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  change_qty int not null,
  reason text not null default 'ajuste',
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_product_idx on public.inventory_movements (product_id);
create index if not exists inventory_movements_created_idx on public.inventory_movements (created_at desc);

-- Helpers
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Apply inventory movement to product.stock
create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_stock int;
begin
  select stock into current_stock from public.products where id = new.product_id for update;
  if current_stock is null then
    raise exception 'Producto no encontrado';
  end if;
  if current_stock + new.change_qty < 0 then
    raise exception 'Stock insuficiente';
  end if;

  update public.products
  set stock = stock + new.change_qty,
      updated_at = now()
  where id = new.product_id;

  if new.variant_id is not null then
    update public.product_variants
    set stock = stock + new.change_qty
    where id = new.variant_id and stock + new.change_qty >= 0;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_movement_apply on public.inventory_movements;
create trigger inventory_movement_apply
after insert on public.inventory_movements
for each row execute function public.apply_inventory_movement();

-- RLS
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_movements enable row level security;

-- Profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

-- Categories: public read, admin write
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read" on public.categories
  for select using (true);

drop policy if exists "categories_admin_all" on public.categories;
create policy "categories_admin_all" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- Products: public read active, admin all
drop policy if exists "products_public_read_active" on public.products;
create policy "products_public_read_active" on public.products
  for select using (is_active = true or public.is_admin());

drop policy if exists "products_admin_all" on public.products;
create policy "products_admin_all" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- Images / variants
drop policy if exists "product_images_public_read" on public.product_images;
create policy "product_images_public_read" on public.product_images
  for select using (true);

drop policy if exists "product_images_admin_all" on public.product_images;
create policy "product_images_admin_all" on public.product_images
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "product_variants_public_read" on public.product_variants;
create policy "product_variants_public_read" on public.product_variants
  for select using (true);

drop policy if exists "product_variants_admin_all" on public.product_variants;
create policy "product_variants_admin_all" on public.product_variants
  for all using (public.is_admin()) with check (public.is_admin());

-- Orders: admin full; public insert (for future checkout)
drop policy if exists "orders_admin_select" on public.orders;
create policy "orders_admin_select" on public.orders
  for select using (public.is_admin());

drop policy if exists "orders_public_insert" on public.orders;
create policy "orders_public_insert" on public.orders
  for insert with check (true);

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update" on public.orders
  for update using (public.is_admin());

drop policy if exists "order_items_admin_select" on public.order_items;
create policy "order_items_admin_select" on public.order_items
  for select using (public.is_admin());

drop policy if exists "order_items_public_insert" on public.order_items;
create policy "order_items_public_insert" on public.order_items
  for insert with check (true);

-- Inventory: admin only
drop policy if exists "inventory_admin_all" on public.inventory_movements;
create policy "inventory_admin_all" on public.inventory_movements
  for all using (public.is_admin()) with check (public.is_admin());

-- Sales view for admin dashboard
create or replace view public.product_sales as
select
  p.id as product_id,
  p.name,
  coalesce(sum(oi.quantity), 0)::int as units_sold,
  coalesce(sum(oi.quantity * oi.unit_price), 0)::numeric as revenue
from public.products p
left join public.order_items oi on oi.product_id = p.id
group by p.id, p.name;

grant select on public.product_sales to authenticated;
