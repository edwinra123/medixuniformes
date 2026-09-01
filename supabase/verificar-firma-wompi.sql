-- Medix — Verificar configuracion Wompi (firma de integridad)
-- Ejecuta en Supabase SQL Editor DESPUES de set_wompi_secrets

select public.diagnose_wompi_config();

-- Resultado esperado:
-- integrityFormat: "prod_integrity"
-- integrityLengthOk: true  (longitud ~50+ caracteres)
-- integrityFormat NO debe ser "PRIVADA_INCORRECTA"

-- Si algo falla, vuelve a ejecutar set_wompi_secrets con:
--   param 1 = Llave PUBLICA (pub_prod_...)
--   param 2 = Secreto INTEGRIDAD completo (prod_integrity_...)  ← NO prv_prod_
--   param 3 = https://medixuniformes.vercel.app/pago-resultado.html
--   param 4 = 0
--   param 5 = prod_events_...
