-- Medix Uniformes — campos de pago Wompi
-- Ejecutar en SQL Editor de Supabase DESPUES de schema.sql

alter table public.orders
  add column if not exists customer_email text,
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'approved', 'declined', 'error', 'cod')),
  add column if not exists wompi_reference text,
  add column if not exists wompi_transaction_id text,
  add column if not exists subtotal numeric(12, 2) check (subtotal is null or subtotal >= 0),
  add column if not exists shipping_cost numeric(12, 2) not null default 0 check (shipping_cost >= 0),
  add column if not exists stock_deducted boolean not null default false;

create unique index if not exists orders_wompi_reference_uidx
  on public.orders (wompi_reference)
  where wompi_reference is not null;

create index if not exists orders_payment_status_idx
  on public.orders (payment_status);

create index if not exists orders_stock_deducted_idx
  on public.orders (stock_deducted)
  where stock_deducted = false;
