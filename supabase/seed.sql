-- Medix Uniformes — seed minimo (solo categorias)
-- Run AFTER schema.sql
-- Los productos los crea el administrador desde el panel

insert into public.categories (name, slug, sort_order) values
  ('Sets clinicos', 'sets-clinicos', 1),
  ('Blusas', 'blusas', 2),
  ('Pantalones', 'pantalones', 3),
  ('Conjuntos premium', 'conjuntos-premium', 4)
on conflict (slug) do nothing;

-- Si ya corriste el seed anterior con productos, ejecuta tambien clear-products.sql
