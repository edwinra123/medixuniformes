# Pagos Wompi (Medix Uniformes)

Integracion con **Widget Checkout**. La firma de integridad se genera en **Postgres** (RPC), sin necesidad de desplegar Edge Functions.

## Setup rapido (recomendado)

### 1. SQL en Supabase (en este orden)

1. [`supabase/payments.sql`](supabase/payments.sql)
2. [`supabase/wompi-rpc.sql`](supabase/wompi-rpc.sql)

### 2. Guardar llaves (SQL Editor)

Reemplaza `prod_integrity_TU_SECRETO` por tu secreto real de Wompi
(*Desarrolladores > Secretos para integracion tecnica*):

```sql
select public.set_wompi_secrets(
  'pub_prod_NNPz2x07CDR2vcwNFbUQfW4KKDFc3M6K',
  'prod_integrity_TU_SECRETO',
  null  -- o 'https://tudominio.com/pago-resultado.html'
);
```

El secreto **nunca** va en `config.js`.

### 3. Probar en la tienda

1. Recarga `catalogo.html` con Ctrl+F5.
2. Carrito → completa datos (correo obligatorio) → **Pagar con Wompi**.

## Que hace el flujo

1. El navegador llama `POST /rest/v1/rpc/create_wompi_payment`.
2. Postgres valida productos, crea el pedido `pending` y firma:
   `SHA256(reference + amountInCents + COP + integritySecret)`.
3. El frontend abre `WidgetCheckout` con esa firma.

## Webhook (opcional pero recomendado)

Para marcar pedidos como pagados automaticamente, despliega
[`supabase/functions/wompi-webhook`](supabase/functions/wompi-webhook) y configura la URL de eventos en Wompi.

## Montos

`$150.000` COP → `amount_in_cents = 15000000`.

## Produccion vs pruebas

- Produccion: `pub_prod_` + `prod_integrity_`
- Sandbox: `pub_test_` + `test_integrity_`
