let products = [];
let categories = [];
const cart = [];
const whatsappBusinessNumber = "573001112233";
let SHIPPING_COST = 0;
const PAGE_SIZE = 12;
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const COLOR_FILTERS = [
  { id: "fucsia", label: "Fucsia", swatch: "#e91e8c", match: (name) => /fucsia|rosa/i.test(name) },
  { id: "menta", label: "Verde menta", swatch: "#9caf88", match: (name) => /menta|verde/i.test(name) },
  { id: "azul", label: "Azul cielo", swatch: "#7eb6d9", match: (name) => /azul/i.test(name) },
  { id: "terracota", label: "Terracota", swatch: "#a85d4b", match: (name) => /terracota|vino/i.test(name) },
  { id: "mostaza", label: "Mostaza", swatch: "#d4a843", match: (name) => /mostaza|amarillo|naranja/i.test(name) }
];
const catalogFilters = {
  category: "all",
  colors: new Set(),
  sizes: new Set(),
  sort: "popular",
  page: 1
};
const placeholderImage =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
      <rect width="600" height="750" fill="#efe8df"/>
      <text x="50%" y="50%" text-anchor="middle" fill="#a68979" font-family="Montserrat,sans-serif" font-size="28">Medix</text>
    </svg>`
  );

const productListEl = document.getElementById("product-list");
const cartItemsEl = document.getElementById("cart-items");
const cartEmptyEl = document.getElementById("cart-empty");
const cartSubtotalEl = document.getElementById("cart-subtotal");
const cartShippingEl = document.getElementById("cart-shipping");
const cartTotalEl = document.getElementById("cart-total");
const cartBadgeEl = document.getElementById("cart-badge");
const catalogCountEl = document.getElementById("catalog-count");
const catalogSortEl = document.getElementById("catalog-sort");
const catalogPaginationEl = document.getElementById("catalog-pagination");
const filterCategoriesEl = document.getElementById("filter-categories");
const filterColorsEl = document.getElementById("filter-colors");
const filterSizesEl = document.getElementById("filter-sizes");
const checkoutForm = document.getElementById("checkout-form");
const paymentMethodEl = document.getElementById("paymentMethod");
const orderResultEl = document.getElementById("order-result");
const checkoutPanelEl = document.getElementById("checkout-panel");
const checkoutSubmitEl = document.getElementById("checkout-submit");
const cartOverlayEl = document.getElementById("cart-overlay");
const cartToggleEl = document.getElementById("cart-toggle");
const cartCloseEl = document.getElementById("cart-close");
const productModalEl = document.getElementById("product-modal");
const productModalBackdropEl = document.getElementById("product-modal-backdrop");
const productModalCloseEl = document.getElementById("product-modal-close");
const productMainImageEl = document.getElementById("product-main-image");
const productThumbsEl = document.getElementById("product-thumbs");
const productDetailNameEl = document.getElementById("product-detail-name");
const productDetailPriceEl = document.getElementById("product-detail-price");
const productDetailOldPriceEl = document.getElementById("product-detail-old-price");
const productDetailSizesEl = document.getElementById("product-detail-sizes");
const productDetailDescriptionEl = document.getElementById("product-detail-description");
const productQtyEl = document.getElementById("product-qty");
const productDetailAddBtnEl = document.getElementById("product-detail-add");

let selectedProductId = null;
let selectedSize = null;
let supabase = null;

function currency(value) {
  return `$${Number(value || 0).toLocaleString("es-CO")}`;
}

function getColorSwatch(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("fucsia") || n.includes("rosa")) return "#d45d8c";
  if (n.includes("menta")) return "#7ec8b0";
  if (n.includes("vino") || n.includes("terracota")) return "#8b3a3a";
  if (n.includes("azul")) return "#5b7c99";
  if (n.includes("verde")) return "#5f8f6b";
  if (n.includes("negro")) return "#2a2a2a";
  if (n.includes("blanco")) return "#f2f2f2";
  if (n.includes("lila") || n.includes("morado") || n.includes("violeta")) return "#7a6aa8";
  if (n.includes("naranja") || n.includes("amarillo") || n.includes("mostaza")) return "#d4a843";
  return "#cbb7a8";
}

function getProductImage(product) {
  if (product?.images?.length) return product.images[0];
  if (product?.image) return product.image;
  return placeholderImage;
}

function getProductGallery(product) {
  if (Array.isArray(product?.images) && product.images.length) {
    return [...product.images];
  }
  return [getProductImage(product)];
}

function getSupabaseConfig() {
  return window.MEDIX_SUPABASE || {};
}

function supabaseHeaders() {
  const cfg = getSupabaseConfig();
  return {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.anonKey}`,
    Accept: "application/json"
  };
}

async function restGet(path) {
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.anonKey) {
    throw new Error("Falta config.js con url y anonKey");
  }
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    headers: supabaseHeaders()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 180)}`);
  }
  return res.json();
}

async function rpcCall(fnName, body = {}) {
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.anonKey) {
    throw new Error("Falta config.js con url y anonKey");
  }
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase RPC ${res.status}: ${text.slice(0, 180)}`);
  }
  return res.json();
}

async function loadCheckoutSettings() {
  try {
    const data = await rpcCall("get_checkout_settings");
    const cost = Number(data?.shippingCost);
    if (Number.isFinite(cost) && cost >= 0) {
      SHIPPING_COST = cost;
      renderCart();
    }
  } catch (err) {
    console.warn("No se pudo cargar configuracion de checkout:", err);
  }
}

function createClient() {
  const cfg = getSupabaseConfig();
  if (!window.supabase?.createClient) return null;
  if (!cfg.url || !cfg.anonKey || String(cfg.url).includes("YOUR_PROJECT_REF")) return null;
  return window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function mapProductRow(row) {
  const images = (row.product_images || [])
    .slice()
    .sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    })
    .map((img) => img.image_url)
    .filter(Boolean);

  return {
    id: row.id,
    name: row.name,
    price: Number(row.price) || 0,
    compareAtPrice: row.compare_at_price != null ? Number(row.compare_at_price) : null,
    color_name: row.color_name || "",
    material: row.material || "Tela Antifluido",
    description: row.description || "",
    category_id: row.category_id || null,
    category_slug: row.category_slug || null,
    updated_at: row.updated_at || null,
    image: images[0] || null,
    images,
    variants: (row.product_variants || [])
      .slice()
      .sort((a, b) => SIZES.indexOf(a.size) - SIZES.indexOf(b.size))
  };
}

async function loadProductsFromSupabase() {
  if (!productListEl) return;

  productListEl.innerHTML = `<p class="catalog-empty">Cargando productos...</p>`;
  if (catalogCountEl) catalogCountEl.textContent = "Cargando...";

  try {
    const [categoryList, list] = await Promise.all([
      restGet("categories?select=id,name,slug,sort_order&order=sort_order.asc"),
      restGet(
        "products?select=id,name,price,compare_at_price,color_name,material,description,category_id,updated_at&is_active=eq.true&order=updated_at.desc"
      )
    ]);

    categories = Array.isArray(categoryList) ? categoryList : [];
    const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));

    if (!Array.isArray(list) || !list.length) {
      products = [];
      renderFilterSidebar();
      applyCatalogView();
      return;
    }

    const withMeta = (row, extras = {}) =>
      mapProductRow({
        ...row,
        category_slug: categoryById[row.category_id]?.slug || null,
        product_images: extras.images || [],
        product_variants: extras.variants || []
      });

    products = list.map((row) => withMeta(row));
    renderFilterSidebar();
    applyCatalogView();

    const ids = list.map((p) => p.id);
    const inFilter = `(${ids.join(",")})`;

    const [imagesResult, variantsResult] = await Promise.allSettled([
      restGet(`product_images?select=product_id,image_url,is_primary,sort_order&product_id=in.${inFilter}`),
      restGet(`product_variants?select=product_id,size,stock&product_id=in.${inFilter}`)
    ]);

    const images = imagesResult.status === "fulfilled" ? imagesResult.value : [];
    const variants = variantsResult.status === "fulfilled" ? variantsResult.value : [];

    if (imagesResult.status === "rejected") {
      console.warn("No se pudieron cargar fotos:", imagesResult.reason);
    }

    const imagesByProduct = {};
    (images || []).forEach((img) => {
      if (!imagesByProduct[img.product_id]) imagesByProduct[img.product_id] = [];
      imagesByProduct[img.product_id].push(img);
    });

    const variantsByProduct = {};
    (variants || []).forEach((v) => {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push(v);
    });

    products = list.map((row) =>
      withMeta(row, {
        images: imagesByProduct[row.id] || [],
        variants: variantsByProduct[row.id] || []
      })
    );
    renderFilterSidebar();
    applyCatalogView();
    supabase = createClient();
  } catch (err) {
    console.error(err);
    products = [];
    categories = [];
    productListEl.innerHTML = `<p class="catalog-empty">Error al cargar catalogo: ${err.message || err}<br>Abre con Live Server desde la carpeta del proyecto y recarga con Ctrl+F5.</p>`;
    if (catalogCountEl) catalogCountEl.textContent = "Error de carga";
    renderFilterSidebar();
  }
}

function productColorText(product) {
  return String(product?.color_name || product?.name || "").toLowerCase();
}

function productSizes(product) {
  const inStock = (product?.variants || []).filter((v) => Number(v.stock) > 0).map((v) => v.size);
  return inStock.length ? inStock : SIZES;
}

function countProductsForCategory(slug) {
  if (slug === "all") return products.length;
  return products.filter((p) => p.category_slug === slug).length;
}

function countProductsForColor(colorId) {
  const def = COLOR_FILTERS.find((c) => c.id === colorId);
  if (!def) return 0;
  return products.filter((p) => def.match(productColorText(p))).length;
}

function countProductsForSize(size) {
  return products.filter((p) => productSizes(p).includes(size)).length;
}

function getFilteredProducts() {
  let list = [...products];

  if (catalogFilters.category !== "all") {
    list = list.filter((p) => p.category_slug === catalogFilters.category);
  }

  if (catalogFilters.colors.size) {
    list = list.filter((p) => {
      const text = productColorText(p);
      return [...catalogFilters.colors].some((colorId) => {
        const def = COLOR_FILTERS.find((c) => c.id === colorId);
        return def?.match(text);
      });
    });
  }

  if (catalogFilters.sizes.size) {
    list = list.filter((p) =>
      [...catalogFilters.sizes].some((size) => productSizes(p).includes(size))
    );
  }

  switch (catalogFilters.sort) {
    case "price-asc":
      list.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      list.sort((a, b) => b.price - a.price);
      break;
    case "name-asc":
      list.sort((a, b) => a.name.localeCompare(b.name, "es"));
      break;
    default:
      list.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
      break;
  }

  return list;
}

function renderFilterSidebar() {
  if (filterCategoriesEl) {
    const items = [
      `<li><button class="filter-link${catalogFilters.category === "all" ? " is-active" : ""}" type="button" data-category="all">Todos <span>${products.length}</span></button></li>`
    ];
    categories.forEach((cat) => {
      const count = countProductsForCategory(cat.slug);
      items.push(
        `<li><button class="filter-link${catalogFilters.category === cat.slug ? " is-active" : ""}" type="button" data-category="${cat.slug}">${cat.name} <span>${count}</span></button></li>`
      );
    });
    filterCategoriesEl.innerHTML = items.join("");
  }

  if (filterColorsEl) {
    filterColorsEl.innerHTML = COLOR_FILTERS.map((color) => {
      const active = catalogFilters.colors.has(color.id) ? " is-active" : "";
      const count = countProductsForColor(color.id);
      return `
        <li>
          <button type="button" class="filter-color-btn${active}" data-color="${color.id}">
            <span class="swatch" style="background:${color.swatch};"></span>
            ${color.label} <em>${count}</em>
          </button>
        </li>
      `;
    }).join("");
  }

  if (filterSizesEl) {
    filterSizesEl.innerHTML = SIZES.map((size) => {
      const active = catalogFilters.sizes.has(size) ? " is-active" : "";
      const count = countProductsForSize(size);
      return `<button type="button" class="${active.trim()}" data-size="${size}" title="${count} productos">${size}</button>`;
    }).join("");
  }
}

function updateCatalogCount(total, page, pageCount) {
  if (!catalogCountEl) return;
  if (!total) {
    catalogCountEl.textContent = "0 productos";
    return;
  }
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  catalogCountEl.textContent = `Mostrando ${start}–${end} de ${total} productos`;
}

function renderPagination(totalPages) {
  if (!catalogPaginationEl) return;
  if (totalPages <= 1) {
    catalogPaginationEl.hidden = true;
    catalogPaginationEl.innerHTML = "";
    return;
  }

  catalogPaginationEl.hidden = false;
  const buttons = [];
  buttons.push(
    `<button type="button" class="page-btn page-nav" data-page="prev" aria-label="Anterior"${catalogFilters.page <= 1 ? " disabled" : ""}>‹</button>`
  );

  for (let i = 1; i <= totalPages; i += 1) {
    buttons.push(
      `<button type="button" class="page-btn${catalogFilters.page === i ? " is-active" : ""}" data-page="${i}">${i}</button>`
    );
  }

  buttons.push(
    `<button type="button" class="page-btn page-nav" data-page="next" aria-label="Siguiente"${catalogFilters.page >= totalPages ? " disabled" : ""}>›</button>`
  );

  catalogPaginationEl.innerHTML = buttons.join("");
}

function applyCatalogView() {
  const filtered = getFilteredProducts();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (catalogFilters.page > totalPages) catalogFilters.page = totalPages;
  if (catalogFilters.page < 1) catalogFilters.page = 1;

  const start = (catalogFilters.page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  renderProducts(pageItems, filtered.length);
  renderPagination(totalPages);
  updateCatalogCount(filtered.length, catalogFilters.page, totalPages);
}

function renderProducts(items, totalFiltered = items.length) {
  if (!productListEl) return;
  productListEl.innerHTML = "";

  if (!items.length) {
    productListEl.innerHTML = `
      <p class="catalog-empty">
        ${totalFiltered === 0 && products.length
          ? "No hay productos con estos filtros. Prueba otra categoria, color o talla."
          : "Aun no hay productos publicados. El administrador los agregara desde el panel."}
      </p>
    `;
    if (catalogPaginationEl) catalogPaginationEl.hidden = true;
    return;
  }

  items.forEach((product) => {
    const card = document.createElement("article");
    card.className = "product-card catalog-card";
    card.setAttribute("data-product-id", product.id);
    const image = getProductImage(product);
    const swatch = getColorSwatch(product.color_name || product.name);

    const media = document.createElement("div");
    media.className = "catalog-card-media";

    const img = document.createElement("img");
    img.className = "product-image";
    img.alt = product.name;
    img.loading = "lazy";
    img.src = image;

    const wish = document.createElement("button");
    wish.className = "wish-btn";
    wish.type = "button";
    wish.setAttribute("aria-label", "Favorito");
    wish.textContent = "♡";

    media.appendChild(img);
    media.appendChild(wish);

    const body = document.createElement("div");
    body.className = "catalog-card-body";
    body.innerHTML = `
      <h3 class="product-name"></h3>
      <p class="product-material"></p>
      <p class="price"></p>
      <div class="catalog-card-footer">
        <span class="card-swatch" style="background:${swatch};"></span>
      </div>
    `;
    body.querySelector(".product-name").textContent = product.name;
    body.querySelector(".product-material").textContent = product.material || "Tela Antifluido";
    body.querySelector(".price").textContent = currency(product.price);

    card.appendChild(media);
    card.appendChild(body);
    productListEl.appendChild(card);
  });
}

function openProductModal(productId) {
  const product = products.find((p) => p.id === productId);
  if (!product || !productModalEl) return;
  selectedProductId = product.id;
  selectedSize = null;

  const gallery = getProductGallery(product);
  const mainImage = gallery[0] || placeholderImage;

  productDetailNameEl.textContent = product.name;
  productDetailPriceEl.textContent = currency(product.price);
  if (productDetailOldPriceEl) {
    const compare = Number(product.compareAtPrice);
    if (compare > 0 && compare > Number(product.price)) {
      productDetailOldPriceEl.textContent = currency(compare);
      productDetailOldPriceEl.classList.remove("hidden");
    } else {
      productDetailOldPriceEl.textContent = "";
      productDetailOldPriceEl.classList.add("hidden");
    }
  }
  if (productDetailDescriptionEl) {
    productDetailDescriptionEl.textContent =
      product.description ||
      "Uniforme medico premium con tela flexible, comodo para turnos largos.";
  }
  productMainImageEl.src = mainImage;
  productMainImageEl.alt = product.name;
  productQtyEl.value = "1";

  if (productDetailSizesEl) {
    const variants = (product.variants || []).filter((v) => Number(v.stock) > 0);
    const list = variants.length
      ? variants
      : ["XS", "S", "M", "L", "XL", "XXL"].map((size) => ({ size, stock: 0 }));
    productDetailSizesEl.innerHTML = list
      .map(
        (v) => `
        <button type="button" data-size="${v.size}" ${Number(v.stock) <= 0 ? "disabled" : ""}>
          ${v.size}
        </button>
      `
      )
      .join("");
  }

  productThumbsEl.innerHTML = "";
  gallery.slice(0, 4).forEach((imgSrc, idx) => {
    const thumb = document.createElement("img");
    thumb.src = imgSrc;
    thumb.alt = `${product.name} vista ${idx + 1}`;
    if (idx === 0) thumb.classList.add("active");
    thumb.addEventListener("click", () => {
      productMainImageEl.src = imgSrc;
      [...productThumbsEl.querySelectorAll("img")].forEach((i) => i.classList.remove("active"));
      thumb.classList.add("active");
    });
    productThumbsEl.appendChild(thumb);
  });

  productModalEl.classList.remove("hidden");
}

function closeProductModal() {
  if (!productModalEl) return;
  productModalEl.classList.add("hidden");
  selectedProductId = null;
  selectedSize = null;
}

function addToCart(productId, size = null) {
  const product = products.find((p) => p.id === productId);
  if (!product) return;

  const chosenSize = size || selectedSize || null;
  const existing = cart.find(
    (item) => item.id === productId && (item.size || null) === chosenSize
  );
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1, size: chosenSize });
  }

  renderCart();
}

function removeFromCart(productId, size = null) {
  const index = cart.findIndex(
    (item) => item.id === productId && (item.size || null) === (size || null)
  );
  if (index === -1) return;
  cart.splice(index, 1);
  renderCart();
}

function getSubtotal() {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function getShipping() {
  return cart.length ? SHIPPING_COST : 0;
}

function getTotal() {
  return getSubtotal() + getShipping();
}

function renderCart() {
  if (!cartItemsEl || !cartEmptyEl) return;

  cartItemsEl.innerHTML = "";
  cartEmptyEl.classList.toggle("hidden", Boolean(cart.length));

  cart.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-item";
    const sizeLabel = item.size ? `Talla ${item.size}` : "";
    const metaParts = [item.material || "Tela Antifluido", sizeLabel, `Cant. ${item.quantity}`].filter(Boolean);
    const thumb = getProductImage(item);

    row.innerHTML = `
      <img class="cart-item-thumb" src="${thumb}" alt="">
      <div class="cart-item-info">
        <span class="cart-item-name"></span>
        <span class="cart-item-meta"></span>
      </div>
      <div class="cart-item-right">
        <span class="cart-item-price"></span>
        <button class="cart-item-remove" data-remove="${item.id}" data-size="${item.size || ""}" type="button">Quitar</button>
      </div>
    `;
    row.querySelector(".cart-item-name").textContent = item.name;
    row.querySelector(".cart-item-meta").textContent = metaParts.join(" · ");
    row.querySelector(".cart-item-price").textContent = currency(item.price * item.quantity);
    cartItemsEl.appendChild(row);
  });

  const subtotal = getSubtotal();
  const shipping = getShipping();
  const total = getTotal();

  if (cartSubtotalEl) cartSubtotalEl.textContent = currency(subtotal);
  if (cartShippingEl) cartShippingEl.textContent = currency(shipping);
  if (cartTotalEl) cartTotalEl.textContent = currency(total);

  if (cartBadgeEl) {
    const qty = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartBadgeEl.textContent = String(qty);
  }
}

function generateOrderId() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `MEDIX-${y}${m}${d}-${random}`;
}

function buildWhatsAppMessage(order) {
  const itemsText = order.items
    .map((i) => `- ${i.name} x${i.quantity} (${currency(i.price * i.quantity)})`)
    .join("%0A");

  return (
    `Hola Medix Uniformes,%0A` +
    `quiero confirmar mi pedido contraentrega.%0A` +
    `Pedido: ${order.orderId}%0A` +
    `Cliente: ${encodeURIComponent(order.fullName)}%0A` +
    `Telefono: ${encodeURIComponent(order.phone)}%0A` +
    `Direccion: ${encodeURIComponent(order.address)}%0A` +
    `Productos:%0A${itemsText}%0A` +
    `Total: ${encodeURIComponent(currency(order.total))}`
  );
}

function getFunctionsBaseUrl() {
  const cfg = getSupabaseConfig();
  if (cfg.functionsUrl) return String(cfg.functionsUrl).replace(/\/$/, "");
  const url = String(cfg.url || "").replace(/\/$/, "");
  if (!url) return "";
  return `${url}/functions/v1`;
}

async function createWompiCheckout(customer) {
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.anonKey) {
    throw new Error("Falta configurar Supabase (url / anonKey) en config.js");
  }

  if (window.location.protocol === "file:") {
    throw new Error(
      "Abre la tienda con Live Server o python -m http.server. No funciona abriendo el archivo HTML directamente."
    );
  }

  const items = cart.map((item) => ({
    id: item.id,
    quantity: item.quantity || 1,
    size: item.size || null
  }));

  const payload = { customer, items };

  try {
    const data = await rpcCall("create_wompi_payment", { payload });
    if (data?.reference && data?.signature?.integrity) return data;
    throw new Error("Respuesta invalida al crear el pago.");
  } catch (err) {
    const msg = err.message || String(err);
    const rpcError = msg.replace(/^Supabase RPC \d+: /, "");

    if (/404|Could not find the function/i.test(msg)) {
      throw new Error(
        "Falta ejecutar supabase/phase1-payments.sql en Supabase SQL Editor. Proyecto: joywqacbtmgfjncmglks.supabase.co"
      );
    }

    if (/Wompi no esta configurado/i.test(rpcError)) {
      throw new Error(
        "Wompi no esta configurado. Ejecuta set_wompi_secrets(...) en Supabase SQL Editor."
      );
    }

    if (/integridad|integrity|firma|signature/i.test(rpcError)) {
      throw new Error(
        "Error de firma Wompi. Verifica que usaste prod_integrity_... (no prv_prod_...) en set_wompi_secrets."
      );
    }

    throw new Error(
      rpcError ||
        "No se pudo crear el pago. Revisa phase1-payments.sql y set_wompi_secrets en Supabase."
    );
  }
}

function openWompiWidget(checkoutData) {
  return new Promise((resolve, reject) => {
    if (typeof WidgetCheckout !== "function") {
      reject(new Error("No se cargo el widget de Wompi. Recarga la pagina."));
      return;
    }

    const integritySig =
      checkoutData?.signature?.integrity ||
      (typeof checkoutData?.signature === "string" ? checkoutData.signature : "");

    if (!integritySig) {
      reject(new Error("No se recibio la firma de integridad desde Supabase."));
      return;
    }

    const config = {
      currency: checkoutData.currency || "COP",
      amountInCents: Math.round(Number(checkoutData.amountInCents)),
      reference: checkoutData.reference,
      publicKey: checkoutData.publicKey,
      signature: { integrity: integritySig }
    };

    if (checkoutData.redirectUrl) config.redirectUrl = checkoutData.redirectUrl;
    if (checkoutData.customerData) config.customerData = checkoutData.customerData;
    if (checkoutData.shippingAddress) config.shippingAddress = checkoutData.shippingAddress;

    const checkout = new WidgetCheckout(config);
    checkout.open((result) => {
      resolve(result?.transaction || null);
    });
  });
}

function buildPaymentResultUrl(checkoutData, transaction) {
  const params = new URLSearchParams();
  if (transaction?.id) {
    params.set("id", String(transaction.id));
  } else if (checkoutData?.reference) {
    params.set("ref", checkoutData.reference);
  }
  return params.toString() ? `pago-resultado.html?${params.toString()}` : null;
}

function redirectToPaymentResult(checkoutData, transaction) {
  const url = buildPaymentResultUrl(checkoutData, transaction);
  if (!url) return false;
  window.location.href = url;
  return true;
}

async function saveCashOnDeliveryOrder(customer, orderId) {
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.anonKey) return;

  try {
    const orderRes = await fetch(`${cfg.url}/rest/v1/orders`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        order_code: orderId,
        customer_name: customer.fullName,
        customer_phone: customer.phone,
        customer_email: customer.email || null,
        customer_address: [customer.address, customer.city, customer.region]
          .filter(Boolean)
          .join(", "),
        notes: customer.notes || null,
        status: "pending",
        payment_method: "cash_on_delivery",
        payment_status: "cod",
        subtotal: getSubtotal(),
        shipping_cost: getShipping(),
        total: getTotal()
      })
    });

    if (!orderRes.ok) return;
    const [order] = await orderRes.json();
    if (!order?.id) return;

    await fetch(`${cfg.url}/rest/v1/order_items`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify(
        cart.map((item) => ({
          order_id: order.id,
          product_id: item.id,
          product_name: item.name,
          quantity: item.quantity || 1,
          unit_price: item.price,
          size: item.size || null
        }))
      )
    });
  } catch (err) {
    console.warn("No se pudo guardar pedido COD en Supabase:", err);
  }
}

function openCartPanel() {
  if (!checkoutPanelEl || !cartOverlayEl) return;
  checkoutPanelEl.classList.add("is-open");
  checkoutPanelEl.setAttribute("aria-hidden", "false");
  cartOverlayEl.classList.add("is-visible");
  document.body.style.overflow = "hidden";
}

function closeCartPanel() {
  if (!checkoutPanelEl || !cartOverlayEl) return;
  checkoutPanelEl.classList.remove("is-open");
  checkoutPanelEl.setAttribute("aria-hidden", "true");
  cartOverlayEl.classList.remove("is-visible");
  document.body.style.overflow = "";
}

function bindCatalogFilters() {
  if (filterCategoriesEl) {
    filterCategoriesEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-category]");
      if (!btn) return;
      catalogFilters.category = btn.getAttribute("data-category") || "all";
      catalogFilters.page = 1;
      renderFilterSidebar();
      applyCatalogView();
    });
  }

  if (filterColorsEl) {
    filterColorsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-color]");
      if (!btn) return;
      const colorId = btn.getAttribute("data-color");
      if (!colorId) return;
      if (catalogFilters.colors.has(colorId)) catalogFilters.colors.delete(colorId);
      else catalogFilters.colors.add(colorId);
      catalogFilters.page = 1;
      renderFilterSidebar();
      applyCatalogView();
    });
  }

  if (filterSizesEl) {
    filterSizesEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-size]");
      if (!btn) return;
      const size = btn.getAttribute("data-size");
      if (!size) return;
      if (catalogFilters.sizes.has(size)) catalogFilters.sizes.delete(size);
      else catalogFilters.sizes.add(size);
      catalogFilters.page = 1;
      renderFilterSidebar();
      applyCatalogView();
    });
  }

  if (catalogSortEl) {
    catalogSortEl.addEventListener("change", () => {
      catalogFilters.sort = catalogSortEl.value || "popular";
      catalogFilters.page = 1;
      applyCatalogView();
    });
  }

  if (catalogPaginationEl) {
    catalogPaginationEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-page]");
      if (!btn || btn.disabled) return;
      const value = btn.getAttribute("data-page");
      const filtered = getFilteredProducts();
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

      if (value === "prev") catalogFilters.page = Math.max(1, catalogFilters.page - 1);
      else if (value === "next") catalogFilters.page = Math.min(totalPages, catalogFilters.page + 1);
      else catalogFilters.page = Number(value) || 1;

      applyCatalogView();
      document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

if (paymentMethodEl && checkoutSubmitEl) {
  const syncCheckoutLabel = () => {
    if (paymentMethodEl.value === "wompi") {
      checkoutSubmitEl.textContent = "PAGAR CON WOMPI";
      checkoutSubmitEl.classList.add("btn-wompi");
    } else {
      checkoutSubmitEl.textContent = "CONFIRMAR POR WHATSAPP";
      checkoutSubmitEl.classList.remove("btn-wompi");
    }
  };
  paymentMethodEl.addEventListener("change", syncCheckoutLabel);
  syncCheckoutLabel();
}

if (productListEl) {
  productListEl.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName === "A") return;
    if (target.closest(".wish-btn")) return;

    const id = target.getAttribute("data-id") || target.closest("[data-id]")?.getAttribute("data-id");
    if (id) {
      openProductModal(id);
      return;
    }

    const card = target.closest(".product-card");
    if (card) {
      const productId = card.getAttribute("data-product-id");
      if (productId) openProductModal(productId);
    }
  });
}

if (cartItemsEl) {
  cartItemsEl.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.getAttribute("data-remove");
    if (id) {
      const size = target.getAttribute("data-size") || null;
      removeFromCart(id, size);
    }
  });
}

if (cartToggleEl) {
  cartToggleEl.addEventListener("click", () => {
    if (checkoutPanelEl?.classList.contains("is-open")) closeCartPanel();
    else openCartPanel();
  });
}

if (cartCloseEl) cartCloseEl.addEventListener("click", closeCartPanel);
if (cartOverlayEl) cartOverlayEl.addEventListener("click", closeCartPanel);
if (productModalCloseEl) productModalCloseEl.addEventListener("click", closeProductModal);
if (productModalBackdropEl) productModalBackdropEl.addEventListener("click", closeProductModal);

if (productDetailSizesEl) {
  productDetailSizesEl.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const size = target.getAttribute("data-size");
    if (!size || target.disabled) return;
    selectedSize = size;
    productDetailSizesEl.querySelectorAll("button").forEach((btn) => btn.classList.remove("is-active"));
    target.classList.add("is-active");
  });
}

if (productDetailAddBtnEl) {
  productDetailAddBtnEl.addEventListener("click", () => {
    if (!selectedProductId) return;
    const product = products.find((p) => p.id === selectedProductId);
    const hasSizes = (product?.variants || []).some((v) => Number(v.stock) > 0);
    if (hasSizes && !selectedSize) {
      alert("Selecciona una talla.");
      return;
    }
    const qty = Math.max(1, Number(productQtyEl.value) || 1);
    for (let i = 0; i < qty; i += 1) addToCart(selectedProductId);
    closeProductModal();
    openCartPanel();
  });
}

if (checkoutForm && paymentMethodEl && orderResultEl) {
  checkoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!cart.length) {
      alert("Agrega al menos un producto antes de crear el pedido.");
      return;
    }

    const form = new FormData(checkoutForm);
    const paymentMethod = String(form.get("paymentMethod") || "wompi");
    const customer = {
      fullName: String(form.get("fullName") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      email: String(form.get("email") || "").trim(),
      address: String(form.get("address") || "").trim(),
      city: String(form.get("city") || "").trim(),
      region: String(form.get("region") || "").trim(),
      notes: String(form.get("notes") || "").trim()
    };

    if (!customer.fullName || !customer.phone || !customer.address) {
      alert("Completa nombre, telefono y direccion.");
      return;
    }

    if (paymentMethod === "wompi" && !customer.email) {
      alert("Para pagar con Wompi necesitas un correo electronico.");
      return;
    }

    if (checkoutSubmitEl) {
      checkoutSubmitEl.disabled = true;
      checkoutSubmitEl.textContent = "Procesando...";
    }

    try {
      if (paymentMethod === "cash_on_delivery") {
        const orderId = generateOrderId();
        const order = {
          orderId,
          ...customer,
          paymentMethod,
          total: getTotal(),
          items: cart.map((item) => ({ ...item }))
        };

        await saveCashOnDeliveryOrder(customer, orderId);

        const message = buildWhatsAppMessage(order);
        const waLink = `https://wa.me/${whatsappBusinessNumber}?text=${message}`;
        orderResultEl.classList.remove("hidden");
        orderResultEl.innerHTML = `
          <h3>Pedido creado</h3>
          <p><strong>ID:</strong> ${orderId}</p>
          <p><strong>Pago:</strong> Contraentrega</p>
          <p>Confirma tu pedido por WhatsApp para coordinar el envio.</p>
          <p><a href="${waLink}" target="_blank" rel="noopener noreferrer">Confirmar por WhatsApp</a></p>
        `;

        cart.length = 0;
        renderCart();
        checkoutForm.reset();
        if (paymentMethodEl) paymentMethodEl.value = "wompi";
      } else {
        const checkoutData = await createWompiCheckout(customer);
        const transaction = await openWompiWidget(checkoutData);

        if (transaction?.status === "APPROVED") {
          cart.length = 0;
          renderCart();
        }

        if (redirectToPaymentResult(checkoutData, transaction)) {
          return;
        }

        orderResultEl.classList.remove("hidden");
        orderResultEl.innerHTML = `
          <h3>Pago no completado</h3>
          <p>No pudimos obtener el resultado del pago. Intenta de nuevo desde el catalogo.</p>
        `;
      }
    } catch (err) {
      console.error(err);
      orderResultEl.classList.remove("hidden");
      orderResultEl.innerHTML = `
        <h3>No se pudo iniciar el pago</h3>
        <p>${err.message || err}</p>
        <p class="payment-help">Checklist: Live Server activo · phase1-payments.sql ejecutado · set_wompi_secrets con prod_integrity_...</p>
      `;
    } finally {
      if (checkoutSubmitEl) {
        checkoutSubmitEl.disabled = false;
        if (paymentMethodEl?.value === "wompi") {
          checkoutSubmitEl.textContent = "PAGAR CON WOMPI";
        } else {
          checkoutSubmitEl.textContent = "CONFIRMAR POR WHATSAPP";
        }
      }
    }
  });
}

renderCart();
bindCatalogFilters();
loadCheckoutSettings();
loadProductsFromSupabase();
