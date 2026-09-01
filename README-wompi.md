# Pagos Wompi — Fase 1 (Medix Uniformes)

Integración con **Widget Checkout**. La firma de integridad y el envío se gestionan en **Postgres** (RPC), sin secretos en el frontend.

## Orden de instalación SQL

En **Supabase → SQL Editor**, ejecuta en este orden:

1. [`schema.sql`](schema.sql)
2. [`seed.sql`](seed.sql)
3. [`storage.sql`](storage.sql) o [`fix-photos.sql`](fix-photos.sql)
4. [`payments.sql`](payments.sql)
5. [`phase1-payments.sql`](phase1-payments.sql) ← **Fase 1: envío, webhook, stock**

## Configurar secretos (solo SQL Editor)

**Nunca** pongas el secreto de integridad en `config.js`. Solo la llave pública va ahí.

```sql
select public.set_wompi_secrets(
  'pub_prod_TU_LLAVE_PUBLICA',
  'prod_integrity_TU_SECRETO_DE_INTEGRIDAD',
  'https://tudominio.com/pago-resultado.html',
  9900,                          -- costo de envío en COP
  'events_TU_SECRETO_EVENTOS'    -- opcional, para validar webhook
);
```

- **Integridad:** Wompi → Desarrolladores → Secretos para integración técnica
- **Eventos:** Wompi → Desarrolladores → Secretos para eventos (opcional pero recomendado)

## Qué hace la Fase 1

| Función | Quién la llama | Qué hace |
|---|---|---|
| `get_checkout_settings()` | Frontend (anon) | Devuelve `shippingCost` para el carrito |
| `create_wompi_payment()` | Frontend (anon) | Crea pedido `pending`, calcula **subtotal + envío**, firma Wompi |
| `process_wompi_webhook()` | Edge Function (service_role) | `pending → approved → confirmed` + descuenta stock |
| `fulfill_paid_order()` | Solo interna | Descuenta inventario **una sola vez** (`stock_deducted`) |
| `set_wompi_secrets()` | Admin autenticado o SQL Editor | Guarda secretos en `private.wompi_settings` |

### Total cobrado = checkout

```
total = subtotal_productos + shipping_cost
amount_in_cents = total × 100
```

Ejemplo: productos $150.000 + envío $9.900 → Wompi cobra **$159.900** (`15990000` centavos).

## Webhook (obligatorio para producción)

1. Despliega la Edge Function:

```bash
supabase functions deploy wompi-webhook --no-verify-jwt
```

2. Agrega el secret en Supabase → Edge Functions → Secrets:

```
WOMPI_EVENTS_SECRET=events_TU_SECRETO
```

3. En Wompi → Eventos, configura la URL:

```
https://TU_PROJECT_REF.supabase.co/functions/v1/wompi-webhook
```

### Flujo automático

```
Cliente paga en Wompi
       ↓
Webhook → process_wompi_webhook()
       ↓
payment_status: approved
status: confirmed
stock_deducted: true (idempotente)
```

Si Wompi reenvía el mismo evento, **no se descuenta stock dos veces** gracias a `stock_deducted` y `FOR UPDATE`.

## Seguridad

| Recurso | anon | authenticated | service_role |
|---|---|---|---|
| `private.wompi_settings` | ❌ | ❌ | ✅ |
| `create_wompi_payment` | ✅ | ✅ | ✅ |
| `get_checkout_settings` | ✅ | ✅ | ✅ |
| `process_wompi_webhook` | ❌ | ❌ | ✅ |
| `fulfill_paid_order` | ❌ | ❌ | ✅ |
| `set_wompi_secrets` | ❌ | ✅ (solo admin) | ✅ |

## Probar en la tienda

1. Ejecuta `phase1-payments.sql` y `set_wompi_secrets(...)`.
2. Recarga `catalogo.html` con Ctrl+F5.
3. Carrito → completa datos → **Pagar con Wompi**.
4. Verifica en admin que el pedido pase a **confirmado** tras el webhook.

## Montos Wompi

`$159.900` COP → `amount_in_cents = 15990000`

## Producción vs pruebas

- Producción: `pub_prod_` + `prod_integrity_`
- Sandbox: `pub_test_` + `test_integrity_`
