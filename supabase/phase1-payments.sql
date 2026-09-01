-- Medix Uniformes — FASE 1: pagos, envío, webhook y stock
-- Ejecutar en Supabase SQL Editor DESPUÉS de schema.sql, payments.sql y wompi-rpc.sql
-- (Si ya tienes wompi-rpc.sql antiguo, este archivo lo actualiza por completo)

create extension if not exists pgcrypto;

-- Compatibilidad: firma anterior de set_wompi_secrets (3 parametros)
drop function if exists public.set_wompi_secrets(text, text, text);

-- ---------------------------------------------------------------------------
-- 1) Columnas nuevas en orders
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists subtotal numeric(12, 2) check (subtotal is null or subtotal >= 0),
  add column if not exists shipping_cost numeric(12, 2) not null default 0 check (shipping_cost >= 0),
  add column if not exists stock_deducted boolean not null default false;

create index if not exists orders_stock_deducted_idx
  on public.orders (stock_deducted)
  where stock_deducted = false;

-- ---------------------------------------------------------------------------
-- 2) Configuración privada Wompi (incluye envío)
-- ---------------------------------------------------------------------------
create schema if not exists private;

create table if not exists private.wompi_settings (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  integrity_secret text not null,
  events_secret text,
  redirect_url text,
  shipping_cost numeric(12, 2) not null default 0 check (shipping_cost >= 0),
  updated_at timestamptz not null default now()
);

alter table private.wompi_settings
  add column if not exists events_secret text,
  add column if not exists shipping_cost numeric(12, 2) not null default 0 check (shipping_cost >= 0);

revoke all on table private.wompi_settings from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

-- ---------------------------------------------------------------------------
-- 3) Configurar secretos (NUNCA en config.js — solo SQL Editor o admin autenticado)
-- ---------------------------------------------------------------------------
create or replace function public.set_wompi_secrets(
  p_public_key text,
  p_integrity_secret text,
  p_redirect_url text default null,
  p_shipping_cost numeric default 0,
  p_events_secret text default null
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Solo admin puede configurar Wompi';
  end if;

  if coalesce(trim(p_public_key), '') = '' or coalesce(trim(p_integrity_secret), '') = '' then
    raise exception 'public_key e integrity_secret son obligatorios';
  end if;

  if trim(p_integrity_secret) like 'prv_%' then
    raise exception 'Usaste la llave PRIVADA (prv_prod_...). Debes usar prod_integrity_... de Wompi';
  end if;

  if trim(p_integrity_secret) not like '%\_integrity\_%' escape '\' then
    raise exception 'integrity_secret debe ser prod_integrity_... o test_integrity_...';
  end if;

  insert into private.wompi_settings (
    id, public_key, integrity_secret, redirect_url, shipping_cost, events_secret, updated_at
  )
  values (
    1,
    trim(p_public_key),
    trim(p_integrity_secret),
    nullif(trim(p_redirect_url), ''),
    greatest(0, coalesce(p_shipping_cost, 0)),
    nullif(trim(p_events_secret), ''),
    now()
  )
  on conflict (id) do update set
    public_key = excluded.public_key,
    integrity_secret = excluded.integrity_secret,
    redirect_url = excluded.redirect_url,
    shipping_cost = excluded.shipping_cost,
    events_secret = coalesce(excluded.events_secret, private.wompi_settings.events_secret),
    updated_at = now();

  return 'ok';
end;
$$;

revoke all on function public.set_wompi_secrets(text, text, text, numeric, text) from public;
grant execute on function public.set_wompi_secrets(text, text, text, numeric, text) to authenticated;

-- Envío público para el checkout (sin secretos)
create or replace function public.get_checkout_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, private
as $$
  select jsonb_build_object(
    'shippingCost', coalesce(
      (select shipping_cost from private.wompi_settings where id = 1),
      0
    )
  );
$$;

revoke all on function public.get_checkout_settings() from public;
grant execute on function public.get_checkout_settings() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Descontar stock SOLO cuando el pago queda approved (idempotente)
-- ---------------------------------------------------------------------------
create or replace function public.fulfill_paid_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_variant_id uuid;
  v_variant_stock int;
  v_product_stock int;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_order.payment_status <> 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'payment_not_approved');
  end if;

  if v_order.stock_deducted then
    return jsonb_build_object('ok', true, 'already_fulfilled', true);
  end if;

  for v_item in
    select oi.*
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    if v_item.product_id is null then
      continue;
    end if;

    select stock into v_product_stock
    from public.products
    where id = v_item.product_id
    for update;

    if v_product_stock is null then
      raise exception 'Producto no encontrado: %', v_item.product_id;
    end if;

    v_variant_id := null;
    v_variant_stock := null;

    if v_item.size is not null and btrim(v_item.size) <> '' then
      select id, stock
      into v_variant_id, v_variant_stock
      from public.product_variants
      where product_id = v_item.product_id
        and size = v_item.size
      for update;

      if v_variant_id is not null and coalesce(v_variant_stock, 0) < v_item.quantity then
        raise exception 'Stock insuficiente en talla % para %', v_item.size, v_item.product_name;
      end if;
    end if;

    if coalesce(v_product_stock, 0) < v_item.quantity then
      raise exception 'Stock insuficiente para %', v_item.product_name;
    end if;

    insert into public.inventory_movements (
      product_id, variant_id, change_qty, reason, note
    )
    values (
      v_item.product_id,
      v_variant_id,
      -v_item.quantity,
      'venta',
      'Pedido ' || v_order.order_code
    );
  end loop;

  update public.orders
  set stock_deducted = true,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'fulfilled', true);
end;
$$;

revoke all on function public.fulfill_paid_order(uuid) from public;
grant execute on function public.fulfill_paid_order(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5) Webhook / confirmación automática: pending → approved → confirmed
-- ---------------------------------------------------------------------------
create or replace function public.process_wompi_webhook(
  p_reference text,
  p_transaction_id text,
  p_status text,
  p_amount_in_cents bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment_status text;
  v_order_status text;
  v_fulfill jsonb;
  v_expected_cents bigint;
begin
  if coalesce(trim(p_reference), '') = '' then
    raise exception 'Referencia vacia';
  end if;

  v_payment_status := case upper(coalesce(p_status, ''))
    when 'APPROVED' then 'approved'
    when 'DECLINED' then 'declined'
    when 'VOIDED' then 'declined'
    when 'ERROR' then 'error'
    else 'pending'
  end;

  v_order_status := case v_payment_status
    when 'approved' then 'confirmed'
    when 'declined' then 'cancelled'
    when 'error' then 'pending'
    else 'pending'
  end;

  select * into v_order
  from public.orders
  where wompi_reference = p_reference
  for update;

  if not found then
    raise exception 'Pedido no encontrado para referencia %', p_reference;
  end if;

  -- No degradar un pago ya aprobado (idempotencia ante reintentos del webhook)
  if v_order.payment_status = 'approved' then
    if not v_order.stock_deducted then
      v_fulfill := public.fulfill_paid_order(v_order.id);
    end if;

    return jsonb_build_object(
      'ok', true,
      'reference', p_reference,
      'paymentStatus', 'approved',
      'orderStatus', v_order.status,
      'duplicate', true,
      'fulfillment', v_fulfill
    );
  end if;

  if p_amount_in_cents is not null then
    v_expected_cents := round(v_order.total * 100)::bigint;
    if v_expected_cents <> p_amount_in_cents then
      raise exception 'Monto no coincide: esperado % centavos, recibido %', v_expected_cents, p_amount_in_cents;
    end if;
  end if;

  update public.orders
  set payment_status = v_payment_status,
      status = v_order_status,
      wompi_transaction_id = coalesce(nullif(trim(p_transaction_id), ''), wompi_transaction_id),
      payment_method = 'wompi',
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  if v_payment_status = 'approved' then
    v_fulfill := public.fulfill_paid_order(v_order.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'reference', p_reference,
    'paymentStatus', v_payment_status,
    'orderStatus', v_order_status,
    'fulfillment', v_fulfill
  );
end;
$$;

revoke all on function public.process_wompi_webhook(text, text, text, bigint) from public;
grant execute on function public.process_wompi_webhook(text, text, text, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 6) Crear pago Wompi: subtotal + envío = total cobrado
-- ---------------------------------------------------------------------------
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
  v_subtotal numeric(12, 2) := 0;
  v_shipping numeric(12, 2) := 0;
  v_total numeric(12, 2) := 0;
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

  if v_email = '' then
    raise exception 'Correo electronico obligatorio para pagos Wompi';
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'El carrito esta vacio';
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    select * into v_product
    from public.products
    where id = (v_item->>'id')::uuid
      and is_active = true;

    if not found then
      raise exception 'Producto no disponible: %', v_item->>'id';
    end if;

    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  if v_subtotal <= 0 then
    raise exception 'El subtotal debe ser mayor a 0';
  end if;

  v_shipping := coalesce(v_settings.shipping_cost, 0);
  v_total := v_subtotal + v_shipping;

  v_amount_cents := round(v_total * 100)::bigint;
  v_reference := 'MEDIX-' || to_char(timezone('utc', now()), 'YYMMDDHH24MI') || '-' ||
                 substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  v_integrity := encode(
    digest(v_reference || v_amount_cents::text || 'COP' || v_settings.integrity_secret, 'sha256'),
    'hex'
  );

  insert into public.orders (
    order_code,
    customer_name,
    customer_phone,
    customer_email,
    customer_address,
    notes,
    status,
    payment_method,
    payment_status,
    wompi_reference,
    subtotal,
    shipping_cost,
    total,
    stock_deducted
  )
  values (
    v_reference,
    v_full_name,
    v_phone,
    nullif(v_email, ''),
    trim(both ', ' from v_address || ', ' || v_city || ', ' || v_region),
    nullif(v_notes, ''),
    'pending',
    'wompi',
    'pending',
    v_reference,
    v_subtotal,
    v_shipping,
    v_total,
    false
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    select * into v_product from public.products where id = (v_item->>'id')::uuid;
    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));

    insert into public.order_items (
      order_id, product_id, product_name, quantity, unit_price, size
    )
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
    'subtotal', v_subtotal,
    'shippingCost', v_shipping,
    'total', v_total
  );
end;
$$;

revoke all on function public.create_wompi_payment(jsonb) from public;
grant execute on function public.create_wompi_payment(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Backfill pedidos existentes (subtotal = total si no había envío desglosado)
-- ---------------------------------------------------------------------------
update public.orders
set subtotal = total,
    shipping_cost = 0
where subtotal is null;

-- ---------------------------------------------------------------------------
-- 8) Confirmación pública por referencia (página pago-resultado.html)
-- ---------------------------------------------------------------------------
create or replace function public.get_order_confirmation(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
begin
  if coalesce(trim(p_reference), '') = '' then
    return null;
  end if;

  select * into v_order
  from public.orders
  where wompi_reference = trim(p_reference)
     or order_code = trim(p_reference)
  order by created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', oi.product_name,
        'quantity', oi.quantity,
        'size', oi.size,
        'unitPrice', oi.unit_price,
        'lineTotal', oi.quantity * oi.unit_price,
        'imageUrl', (
          select pi.image_url
          from public.product_images pi
          where pi.product_id = oi.product_id
          order by pi.is_primary desc, pi.sort_order asc
          limit 1
        )
      )
      order by oi.created_at
    ),
    '[]'::jsonb
  )
  into v_items
  from public.order_items oi
  where oi.order_id = v_order.id;

  return jsonb_build_object(
    'orderCode', v_order.order_code,
    'createdAt', v_order.created_at,
    'subtotal', coalesce(v_order.subtotal, v_order.total - v_order.shipping_cost),
    'shippingCost', coalesce(v_order.shipping_cost, 0),
    'total', v_order.total,
    'address', v_order.customer_address,
    'paymentStatus', v_order.payment_status,
    'status', v_order.status,
    'items', v_items
  );
end;
$$;

revoke all on function public.get_order_confirmation(text) from public;
grant execute on function public.get_order_confirmation(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9) Diagnostico publico de config Wompi (sin exponer secretos)
-- ---------------------------------------------------------------------------
create or replace function public.diagnose_wompi_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v private.wompi_settings%rowtype;
begin
  select * into v from private.wompi_settings where id = 1;
  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Sin configuracion. Ejecuta set_wompi_secrets(...)'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'publicKeyPrefix', left(v.public_key, 16),
    'publicKeyLooksValid', v.public_key like 'pub_%',
    'integrityFormat', case
      when v.integrity_secret like 'prod_integrity_%' then 'prod_integrity'
      when v.integrity_secret like 'test_integrity_%' then 'test_integrity'
      when v.integrity_secret like 'prv_%' then 'PRIVADA_INCORRECTA'
      else 'FORMATO_DESCONOCIDO'
    end,
    'integrityLength', length(v.integrity_secret),
    'integrityLengthOk', length(v.integrity_secret) >= 45,
    'redirectUrl', v.redirect_url,
    'shippingCost', v.shipping_cost
  );
end;
$$;

revoke all on function public.diagnose_wompi_config() from public;
grant execute on function public.diagnose_wompi_config() to anon, authenticated;
