-- Quitar "Todos" como categoria de producto (eso es solo un filtro del catalogo)
delete from public.categories
where lower(slug) = 'todos' or lower(name) = 'todos';
