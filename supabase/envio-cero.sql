-- Medix — Poner envio en $0
-- Ejecuta en Supabase SQL Editor

update private.wompi_settings
set shipping_cost = 0,
    updated_at = now()
where id = 1;

-- Si aun no tienes fila de config, usa set_wompi_secrets con 0:
-- select public.set_wompi_secrets(
--   'pub_prod_...',
--   'prod_integrity_...',
--   'https://medixuniformes.vercel.app/pago-resultado.html',
--   0,
--   'prod_events_...'
-- );

select public.get_checkout_settings();
