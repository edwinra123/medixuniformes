# Webhook Wompi — Medix Uniformes

Cuando un cliente paga, Wompi avisa a tu backend y el pedido pasa a **confirmado** y se descuenta el stock solo.

## URL del webhook (copiar en Wompi)

```
https://joywqacbtmgfjncmglks.supabase.co/functions/v1/wompi-webhook
```

---

## Paso 1 — SQL en Supabase (si aun no lo hiciste)

En **Supabase → SQL Editor**, ejecuta la seccion final de [`phase1-payments.sql`](phase1-payments.sql) (funciones `process_wompi_webhook` y `get_wompi_events_secret`).

Verifica:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('process_wompi_webhook', 'get_wompi_events_secret');
```

Deben aparecer **2 filas**.

Tambien confirma que `set_wompi_secrets` incluyo el secreto de eventos (`prod_events_...`):

```sql
select public.diagnose_wompi_config();
```

---

## Paso 2 — Desplegar la Edge Function

### Opcion A — Supabase CLI (recomendado)

En PowerShell, desde la carpeta del proyecto:

```powershell
cd "C:\Users\edwin\Documents\empresa kim"

npx supabase login
npx supabase link --project-ref joywqacbtmgfjncmglks
npx supabase functions deploy wompi-webhook --no-verify-jwt
```

`--no-verify-jwt` es necesario: Wompi llama al webhook sin token de Supabase.

### Opcion B — Dashboard Supabase

1. **Supabase Dashboard** → tu proyecto → **Edge Functions**
2. **Deploy a new function** → nombre: `wompi-webhook`
3. Pega el codigo de [`supabase/functions/wompi-webhook/index.ts`](functions/wompi-webhook/index.ts)
4. Desactiva **Verify JWT** para esta funcion

---

## Paso 3 — Secretos en Supabase (opcional)

La funcion ya puede leer `prod_events_...` desde la BD (via `set_wompi_secrets`).

Solo si quieres override manual:

**Edge Functions → Secrets:**

| Nombre | Valor |
|--------|--------|
| `SUPABASE_URL` | `https://joywqacbtmgfjncmglks.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (Settings → API) |
| `WOMPI_EVENTS_SECRET` | `prod_events_...` (opcional si ya esta en BD) |

Supabase suele inyectar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` automaticamente en Edge Functions.

---

## Paso 4 — Configurar en Wompi

1. [comercios.wompi.co](https://comercios.wompi.co) → **Desarrolladores**
2. **URL de Eventos** (Seguimiento de transacciones):

```
https://joywqacbtmgfjncmglks.supabase.co/functions/v1/wompi-webhook
```

3. Guardar

Wompi enviara eventos `transaction.updated` cuando cambie el estado del pago.

---

## Paso 5 — Probar

1. Haz una compra de prueba en [medixuniformes.vercel.app/catalogo.html](https://medixuniformes.vercel.app/catalogo.html)
2. Completa el pago (o dejalo rechazado para probar estados)
3. En **Supabase → Edge Functions → wompi-webhook → Logs**, revisa que lleguen eventos
4. En **admin** o SQL:

```sql
select order_code, payment_status, status, stock_deducted, wompi_transaction_id
from public.orders
order by created_at desc
limit 5;
```

Si el pago fue **APPROVED**:
- `payment_status` = `approved`
- `status` = `confirmed`
- `stock_deducted` = `true`

---

## Flujo completo

```
Cliente paga en Wompi
        ↓
Wompi POST → /functions/v1/wompi-webhook
        ↓
process_wompi_webhook() en Postgres
        ↓
approved → confirmed + descuenta stock (una sola vez)
```

---

## Errores comunes

| Problema | Solucion |
|----------|----------|
| 401 Checksum invalido | Verifica `prod_events_...` en `set_wompi_secrets` |
| 404 function not found | Despliega `wompi-webhook` (Paso 2) |
| Pedido no encontrado | La referencia Wompi debe coincidir con `orders.wompi_reference` |
| Monto no coincide | El total del pedido debe ser igual al cobrado en Wompi |

---

## Simular webhook manualmente (debug)

Solo en pruebas, con un pedido `pending` existente:

```sql
select public.process_wompi_webhook(
  'MEDIX-REFERENCIA-DEL-PEDIDO',
  'test-tx-id',
  'APPROVED',
  150000  -- centavos = total del pedido
);
```

Reemplaza referencia y centavos por los del pedido real.
