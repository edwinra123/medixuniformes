-- Medix — Instalar funcion get_wompi_events_secret (webhook)
-- Ejecuta si ya tenias phase1-payments.sql pero sin esta funcion nueva

create or replace function public.get_wompi_events_secret()
returns text
language sql
stable
security definer
set search_path = public, private
as $$
  select events_secret from private.wompi_settings where id = 1;
$$;

revoke all on function public.get_wompi_events_secret() from public;
grant execute on function public.get_wompi_events_secret() to service_role;

select 'get_wompi_events_secret instalada' as estado;
