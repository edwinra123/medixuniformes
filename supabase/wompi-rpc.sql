-- Medix Uniformes — pagos Wompi sin Edge Function
-- Ejecutar en SQL Editor DESPUES de schema.sql y payments.sql
--
-- 1) Corre este archivo completo
-- 2) Luego actualiza el secreto (reemplaza TU_SECRETO):
--    select public.set_wompi_secrets(
--      'pub_prod_NNPz2x07CDR2vcwNFbUQfW4KKDFc3M6K',
--      'prod_integrity_TU_SECRETO',
--      'https://TU-DOMINIO/pago-resultado.html'
--    );

create extension if not exists pgcrypto;

create schema if not exists private;

create table if not exists private.wompi_settings (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  integrity_secret text not null,
  redirect_url text,
  updated_at timestamptz not null default now()
);

revoke all on table private.wompi_settings from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

create or replace function public.set_wompi_secrets(
  p_public_key text,
  p_integrity_secret text,
  p_redirect_url text default null
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
begin
  -- Desde SQL Editor (sin JWT) siempre permitido; desde la app solo admin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Solo admin puede configurar Wompi';
  end if;

  insert into private.wompi_settings (id, public_key, integrity_secret, redirect_url, updated_at)
  values (1, p_public_key, p_integrity_secret, nullif(p_redirect_url, ''), now())
  on conflict (id) do update set
    public_key = excluded.public_key,
    integrity_secret = excluded.integrity_secret,
    redirect_url = excluded.redirect_url,
    updated_at = now();

  return 'ok';
end;
$$;

revoke all on function public.set_wompi_secrets(text, text, text) from public;
grant execute on function public.set_wompi_secrets(text, text, text) to authenticated;

create or replace function public.create_wompi_payment(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_settings private.wompi_settings%rowtype;
  v_customer jsonb := coalesce(payload->'customer', '{}'::jsonb);
  v_items jsonb := coalesce(payload->'items', '[]'::jsonb);
  v_item jsonb;
  v_product public.products%rowtype;
  v_full_name text := trim(coalesce(v_customer->>'fullName', ''));
  v_phone text := trim(coalesce(v_customer->>'phone', ''));
  v_email text := trim(coalesce(v_customer->>'email', ''));
  v_address text := trim(coalesce(v_customer->>'address', ''));
  v_city text := trim(coalesce(v_customer->>'city', 'Bogota'));
  v_region text := trim(coalesce(v_customer->>'region', 'Cundinamarca'));
  v_notes text := trim(coalesce(v_customer->>'notes', ''));
  v_total numeric(12,2) := 0;
  v_qty int;
  v_amount_cents bigint;
  v_reference text;
  v_integrity text;
  v_order_id uuid;
  v_phone_digits text;
begin
  select * into v_settings from private.wompi_settings where id = 1;
  if not found then
    raise exception 'Wompi no esta configurado. Ejecuta set_wompi_secrets(...)';
  end if;

  if v_full_name = '' or v_phone = '' or v_address = '' then
    raise exception 'Datos de cliente incompletos';
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'El carrito esta vacio';
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    select * into v_product
    from public.products
    where id = (v_item->>'id')::uuid and is_active = true;

    if not found then
      raise exception 'Producto no disponible: %', v_item->>'id';
    end if;

    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));
    v_total := v_total + (v_product.price * v_qty);
  end loop;

  if v_total <= 0 then
    raise exception 'El total debe ser mayor a 0';
  end if;

  v_amount_cents := round(v_total * 100)::bigint;
  v_reference := 'MEDIX-' || to_char(timezone('utc', now()), 'YYMMDDHH24MI') || '-' ||
                 substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  v_integrity := encode(
    digest(v_reference || v_amount_cents::text || 'COP' || v_settings.integrity_secret, 'sha256'),
    'hex'
  );

  insert into public.orders (
    order_code, customer_name, customer_phone, customer_email, customer_address,
    notes, status, payment_method, payment_status, wompi_reference, total
  ) values (
    v_reference, v_full_name, v_phone, nullif(v_email, ''),
    trim(both ', ' from v_address || ', ' || v_city || ', ' || v_region),
    nullif(v_notes, ''), 'pending', 'wompi', 'pending', v_reference, v_total
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    select * into v_product from public.products where id = (v_item->>'id')::uuid;
    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, size)
    values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_qty,
      v_product.price,
      nullif(v_item->>'size', '')
    );
  end loop;

  v_phone_digits := right(regexp_replace(v_phone, '\D', '', 'g'), 10);

  return jsonb_build_object(
    'publicKey', v_settings.public_key,
    'currency', 'COP',
    'amountInCents', v_amount_cents,
    'reference', v_reference,
    'signature', jsonb_build_object('integrity', v_integrity),
    'redirectUrl', v_settings.redirect_url,
    'customerData', jsonb_strip_nulls(jsonb_build_object(
      'email', nullif(v_email, ''),
      'fullName', v_full_name,
      'phoneNumber', v_phone_digits,
      'phoneNumberPrefix', '+57'
    )),
    'shippingAddress', jsonb_build_object(
      'addressLine1', v_address,
      'city', coalesce(nullif(v_city, ''), 'Bogota'),
      'region', coalesce(nullif(v_region, ''), 'Cundinamarca'),
      'country', 'CO',
      'phoneNumber', v_phone_digits,
      'name', v_full_name
    ),
    'orderId', v_order_id,
    'orderCode', v_reference,
    'total', v_total
  );
end;
$$;

revoke all on function public.create_wompi_payment(jsonb) from public;
grant execute on function public.create_wompi_payment(jsonb) to anon, authenticated;

-- Webhook simple vía REST: actualiza pedido por referencia Wompi
-- (puedes seguir usando la Edge Function wompi-webhook si la despliegas)
