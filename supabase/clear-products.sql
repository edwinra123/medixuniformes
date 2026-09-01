-- Medix: vaciar productos del catalogo
-- Ejecuta esto en Supabase → SQL Editor
-- El admin volvera a cargar productos desde el panel

delete from public.order_items;
delete from public.orders;
delete from public.inventory_movements;
delete from public.product_images;
delete from public.product_variants;
delete from public.products;
