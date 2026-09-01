# Medix Admin + Supabase

Panel de administracion para precios, productos, fotos, existencias y pedidos.
El catalogo publico (`catalogo.html`) muestra solo productos activos creados desde el admin.

## 1. Crear proyecto Supabase

1. Entra a [https://supabase.com](https://supabase.com) y crea un proyecto.
2. Ve a **Project Settings > API**.
3. Copia:
   - **Project URL**
   - **anon public** / publishable key

## 2. Crear tablas y storage

En **SQL Editor**, ejecuta en este orden:

1. [`supabase/schema.sql`](supabase/schema.sql)
2. [`supabase/seed.sql`](supabase/seed.sql) (solo categorias)
3. [`supabase/storage.sql`](supabase/storage.sql) (bucket de fotos)
4. Si ya tenias productos de prueba: [`supabase/clear-products.sql`](supabase/clear-products.sql)
5. Pagos Wompi: [`supabase/payments.sql`](supabase/payments.sql) + guia [`README-wompi.md`](README-wompi.md)

## 3. Administrador por correo

En `admin/config.js`:

```js
window.MEDIX_SUPABASE = {
  url: "https://xxxx.supabase.co",
  anonKey: "sb_publishable_...",
  adminEmails: [
    "edwinramirez11e17@gmail.com"
  ]
};
```

Al iniciar sesion con ese correo, el sistema te marca como admin y te manda al panel.

## 4. Abrir

- Tienda: `index.html` / `catalogo.html`
- Cuenta: `cuenta.html`
- Admin: `admin/index.html`

Usa Live Server o `python -m http.server` desde la raiz del proyecto.

## Flujo de productos

1. Ejecuta una vez [`supabase/fix-photos.sql`](supabase/fix-photos.sql) en el SQL Editor (rol admin + bucket de fotos).
2. Entra al panel como admin.
3. **Productos > + Nuevo producto**.
4. Completa datos y **sube al menos una foto**.
5. Guarda: la foto queda en la base y el producto activo aparece en `catalogo.html`.

Si ves "Sin foto", edita el producto y vuelve a subir la imagen.

## Pantallas admin

| Pantalla | Funcion |
|---|---|
| Dashboard | Totales, stock bajo, ventas |
| Productos | Crear/editar/eliminar, fotos, activar |
| Inventario | Entradas/salidas con historial |
| Pedidos | Compras y unidades vendidas |
