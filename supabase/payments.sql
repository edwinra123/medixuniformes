-- Medix Uniformes — campos de pago Wompi
-- Ejecutar en SQL Editor de Supabase DESPUES de schema.sql

alter table public.orders
  add column if not exists customer_email text,
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'approved', 'declined', 'error', 'cod')),
  add column if not exists wompi_reference text,
  add column if not exists wompi_transaction_id text;

create unique index if not exists orders_wompi_reference_uidx
  on public.orders (wompi_reference)
  where wompi_reference is not null;

create index if not exists orders_payment_status_idx
  on public.orders (payment_status);

-- Permitir que el servicio (edge functions con service role) actualice pedidos
-- Las policies de admin ya cubren select/update para admins.
-- Public insert ya existe; el webhook usara service role.
