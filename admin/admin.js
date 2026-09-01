(() => {
  const cfg = window.MEDIX_SUPABASE || {};
  const hasConfig =
    cfg.url &&
    cfg.anonKey &&
    !String(cfg.url).includes("YOUR_PROJECT_REF") &&
    !String(cfg.anonKey).includes("YOUR_SUPABASE_ANON_KEY");

  let supabase = null;
  let initError = "";

  try {
    if (!hasConfig) {
      initError = "Falta configurar admin/config.js con tu URL y publishable key.";
    } else if (!window.supabase || !window.supabase.createClient) {
      initError = "No cargo la libreria de Supabase. Revisa tu conexion a internet.";
    } else {
      supabase = window.supabase.createClient(cfg.url, cfg.anonKey);
    }
  } catch (err) {
    initError = `Error al conectar Supabase: ${err.message || err}`;
    supabase = null;
  }

  const els = {
    loginView: document.getElementById("login-view"),
    appView: document.getElementById("app-view"),
    loginForm: document.getElementById("login-form"),
    registerForm: document.getElementById("register-form"),
    loginEmail: document.getElementById("login-email"),
    loginPassword: document.getElementById("login-password"),
    registerName: document.getElementById("register-name"),
    registerEmail: document.getElementById("register-email"),
    registerPassword: document.getElementById("register-password"),
    loginError: document.getElementById("login-error"),
    loginOk: document.getElementById("login-ok"),
    authTitle: document.getElementById("auth-title"),
    authSubtitle: document.getElementById("auth-subtitle"),
    logoutBtn: document.getElementById("logout-btn"),
    adminEmail: document.getElementById("admin-email"),
    viewTitle: document.getElementById("view-title"),
    views: {
      dashboard: document.getElementById("view-dashboard"),
      products: document.getElementById("view-products"),
      inventory: document.getElementById("view-inventory"),
      orders: document.getElementById("view-orders")
    },
    statProducts: document.getElementById("stat-products"),
    statLowStock: document.getElementById("stat-low-stock"),
    statOrders: document.getElementById("stat-orders"),
    statUnits: document.getElementById("stat-units"),
    topSales: document.getElementById("top-sales"),
    productsTable: document.getElementById("products-table"),
    productsSummary: document.getElementById("products-summary"),
    refreshProductsBtn: document.getElementById("refresh-products-btn"),
    invProduct: document.getElementById("inv-product"),
    invQty: document.getElementById("inv-qty"),
    invReason: document.getElementById("inv-reason"),
    invNote: document.getElementById("inv-note"),
    invForm: document.getElementById("inventory-form"),
    invMsg: document.getElementById("inv-msg"),
    movementsTable: document.getElementById("movements-table"),
    ordersTable: document.getElementById("orders-table"),
    salesTable: document.getElementById("sales-table"),
    productModal: document.getElementById("product-modal"),
    productForm: document.getElementById("product-form"),
    productModalTitle: document.getElementById("product-modal-title"),
    productFormError: document.getElementById("product-form-error"),
    newProductBtn: document.getElementById("new-product-btn"),
    fields: {
      id: document.getElementById("product-id"),
      name: document.getElementById("product-name"),
      color: document.getElementById("product-color"),
      description: document.getElementById("product-description"),
      category: document.getElementById("product-category"),
      price: document.getElementById("product-price"),
      compare: document.getElementById("product-compare"),
      material: document.getElementById("product-material"),
      sizes: document.getElementById("product-sizes"),
      stockTotal: document.getElementById("product-stock-total"),
      files: document.getElementById("product-files"),
      imagesPreview: document.getElementById("product-images-preview"),
      active: document.getElementById("product-active")
    }
  };

  const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL"];
  let currentUser = null;
  let productsCache = [];
  let categoriesCache = [];
  let pendingFiles = [];
  let existingImages = [];

  function money(value) {
    return `$${Number(value || 0).toLocaleString("es-CO")}`;
  }

  function slugify(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("hidden", !message);
  }

  function showOk(message) {
    if (!els.loginOk) return;
    els.loginOk.textContent = message || "";
    els.loginOk.classList.toggle("hidden", !message);
  }

  function setAuthMode(mode) {
    const isLogin = mode === "login";
    els.loginForm.classList.toggle("hidden", !isLogin);
    els.registerForm.classList.toggle("hidden", isLogin);
    document.querySelectorAll(".auth-tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.getAttribute("data-auth") === mode);
    });
    els.authTitle.textContent = isLogin ? "Iniciar sesion" : "Registrarse";
    els.authSubtitle.textContent = isLogin
      ? "Acceso al panel de administracion"
      : "Crea tu cuenta y luego pide rol admin";
    showError(els.loginError, "");
    showOk("");
  }

  function setView(name) {
    Object.entries(els.views).forEach(([key, node]) => {
      if (node) node.classList.toggle("hidden", key !== name);
    });
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-view") === name);
    });
    const titles = {
      dashboard: "Dashboard",
      products: "Productos",
      inventory: "Inventario",
      orders: "Pedidos"
    };
    els.viewTitle.textContent = titles[name] || "Admin";

    if (name === "dashboard") loadDashboard();
    if (name === "products") loadProducts();
    if (name === "inventory") loadInventory();
    if (name === "orders") loadOrders();
  }

  function showApp(session) {
    currentUser = session?.user || null;
    els.loginView.classList.add("hidden");
    els.appView.classList.remove("hidden");
    els.adminEmail.textContent = currentUser?.email || "";
    setView("dashboard");
  }

  function showLogin(message) {
    currentUser = null;
    els.appView.classList.add("hidden");
    els.loginView.classList.remove("hidden");
    setAuthMode("login");
    showError(els.loginError, message || "");
    showOk("");
  }

  async function ensureAdminProfile(user, profile) {
    if (!supabase || !user?.id) return profile;
    if (!window.medixIsAdminEmail?.(user.email)) return profile;
    if (profile?.role === "admin") return profile;

    const fullName = profile?.full_name || user.user_metadata?.full_name || "Administrador Medix";
    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: fullName,
        role: "admin"
      })
      .select("role, full_name")
      .maybeSingle();

    if (error) {
      console.warn("No se pudo sincronizar rol admin:", error.message);
      return profile;
    }

    return data || { ...profile, full_name: fullName, role: "admin" };
  }

  async function assertDbAdmin() {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("No hay sesion activa.");

    let { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .maybeSingle();

    profile = await ensureAdminProfile(user, profile);

    if (profile?.role !== "admin") {
      throw new Error(
        "Tu perfil en Supabase no tiene role=admin. Ejecuta supabase/fix-photos.sql en el SQL Editor."
      );
    }
    return user;
  }

  function fileToCompressedDataUrl(file, maxWidth = 900, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        try {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(objectUrl);
          let q = quality;
          let dataUrl = canvas.toDataURL("image/jpeg", q);
          // Limitar tamano para que el catalogo no se rompa
          while (dataUrl.length > 450000 && q > 0.35) {
            q -= 0.1;
            dataUrl = canvas.toDataURL("image/jpeg", q);
          }
          resolve(dataUrl);
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`No se pudo leer la imagen ${file.name}`));
      };
      img.src = objectUrl;
    });
  }

  async function uploadProductImages(productId, files) {
    if (!files?.length) return { uploaded: [], warnings: [] };

    const uploaded = [];
    const warnings = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      // Siempre comprimir antes de subir (Storage o BD)
      const compressed = await fileToCompressedDataUrl(file);
      const blob = await (await fetch(compressed)).blob();
      const path = `${productId}/${Date.now()}-${i}.jpg`;
      let imageUrl = null;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, blob, {
          upsert: true,
          contentType: "image/jpeg",
          cacheControl: "3600"
        });

      if (!uploadError) {
        const { data: publicData } = supabase.storage.from("product-images").getPublicUrl(path);
        imageUrl = publicData?.publicUrl || null;
      } else {
        warnings.push(uploadError.message || "Storage no disponible");
        imageUrl = compressed;
      }

      if (!imageUrl) {
        throw new Error(`No se pudo guardar la foto ${file.name}`);
      }

      uploaded.push({
        product_id: productId,
        image_url: imageUrl,
        sort_order: i,
        is_primary: i === 0
      });
    }

    const { error } = await supabase.from("product_images").insert(uploaded);
    if (error) {
      throw new Error(
        `No se pudo guardar la foto en product_images: ${error.message}. Ejecuta supabase/fix-photos.sql`
      );
    }

    return { uploaded, warnings };
  }

  async function requireAdmin() {
    // Always keep login visible first
    els.loginView.classList.remove("hidden");
    els.appView.classList.add("hidden");

    if (!supabase) {
      showLogin(initError || "Configura admin/config.js con tu URL y publishable key.");
      return false;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showLogin(initError || "");
        return false;
      }

      let { data: profile, error } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", session.user.id)
        .maybeSingle();

      profile = await ensureAdminProfile(session.user, profile);

      const byEmail = window.medixIsAdminEmail?.(session.user.email);
      const isAdmin = byEmail || profile?.role === "admin";

      if (error && !byEmail) {
        await supabase.auth.signOut();
        showLogin("No se pudo verificar tu perfil de administrador.");
        return false;
      }

      if (!isAdmin) {
        await supabase.auth.signOut();
        showLogin("Tu correo no tiene acceso de administrador.");
        return false;
      }

      showApp(session);
      return true;
    } catch (err) {
      showLogin(`Error de sesion: ${err.message || err}`);
      return false;
    }
  }

  async function loadDashboard() {
    const [{ data: products }, { data: orders }, { data: sales }] = await Promise.all([
      supabase.from("products").select("id, stock, is_active"),
      supabase.from("orders").select("id, status"),
      supabase.from("product_sales").select("product_id, name, units_sold, revenue").order("units_sold", { ascending: false }).limit(8)
    ]);

    const list = products || [];
    els.statProducts.textContent = String(list.length);
    els.statLowStock.textContent = String(list.filter((p) => p.stock < 10).length);
    els.statOrders.textContent = String((orders || []).length);
    const units = (sales || []).reduce((sum, row) => sum + Number(row.units_sold || 0), 0);
    els.statUnits.textContent = String(units);

    els.topSales.innerHTML = `
      <table>
        <thead><tr><th>Producto</th><th>Unidades</th><th>Ingresos</th></tr></thead>
        <tbody>
          ${(sales || []).map((row) => `
            <tr>
              <td>${row.name}</td>
              <td>${row.units_sold}</td>
              <td>${money(row.revenue)}</td>
            </tr>
          `).join("") || `<tr><td colspan="3">Sin ventas aun</td></tr>`}
        </tbody>
      </table>
    `;
  }

  async function loadCategories() {
    const { data } = await supabase
      .from("categories")
      .select("id, name, slug")
      .order("sort_order");
    categoriesCache = (data || []).filter((c) => {
      const slug = String(c.slug || "").toLowerCase();
      const name = String(c.name || "").toLowerCase();
      return slug !== "todos" && name !== "todos";
    });
    if (els.fields.category) {
      els.fields.category.innerHTML =
        `<option value="">Sin categoria</option>` +
        categoriesCache.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
    }
  }

  function renderSizeAvailability(variants = []) {
    const bySize = Object.fromEntries((variants || []).map((v) => [v.size, v]));
    els.fields.sizes.innerHTML = SIZE_OPTIONS.map((size) => {
      const row = bySize[size];
      const checked = Boolean(row);
      const stock = row ? Number(row.stock || 0) : 0;
      return `
        <label class="size-row">
          <input type="checkbox" data-size-check="${size}" ${checked ? "checked" : ""}>
          <span>${size}</span>
          <input type="number" min="0" data-size-stock="${size}" value="${stock}" ${checked ? "" : "disabled"}>
        </label>
      `;
    }).join("");
    updateStockTotal();
  }

  function getSelectedSizes() {
    return SIZE_OPTIONS
      .filter((size) => els.fields.sizes.querySelector(`[data-size-check="${size}"]`)?.checked)
      .map((size) => ({
        size,
        stock: Math.max(0, Number(els.fields.sizes.querySelector(`[data-size-stock="${size}"]`)?.value || 0))
      }));
  }

  function updateStockTotal() {
    const total = getSelectedSizes().reduce((sum, row) => sum + row.stock, 0);
    if (els.fields.stockTotal) els.fields.stockTotal.textContent = String(total);
    return total;
  }

  function renderGallery() {
    if (!els.fields.imagesPreview) return;
    const existingHtml = existingImages.map((img, idx) => `
      <div class="gallery-item" data-existing="${img.id}">
        <img src="${img.image_url}" alt="Foto ${idx + 1}">
        <button type="button" class="gallery-remove" data-remove-existing="${img.id}">×</button>
      </div>
    `).join("");

    const pendingHtml = pendingFiles.map((file, idx) => `
      <div class="gallery-item" data-pending="${idx}">
        <img src="${URL.createObjectURL(file)}" alt="Nueva ${idx + 1}">
        <button type="button" class="gallery-remove" data-remove-pending="${idx}">×</button>
      </div>
    `).join("");

    els.fields.imagesPreview.innerHTML = existingHtml + pendingHtml || "";
  }

  async function loadProducts() {
    await loadCategories();

    const { data, error } = await supabase
      .from("products")
      .select(`
        id, name, slug, color_name, price, compare_at_price, stock, is_active, material,
        description, category_id, updated_at, created_at,
        product_images ( id, image_url, is_primary, sort_order ),
        product_variants ( id, size, stock )
      `)
      .order("updated_at", { ascending: false });

    if (error) {
      els.productsTable.innerHTML = `<p class="error">${error.message}</p>`;
      return;
    }

    productsCache = data || [];
    const totalStock = productsCache.reduce((sum, p) => sum + Number(p.stock || 0), 0);
    const activeCount = productsCache.filter((p) => p.is_active).length;
    const withPhotos = productsCache.filter((p) => (p.product_images || []).length).length;

    if (els.productsSummary) {
      els.productsSummary.textContent =
        `${productsCache.length} productos · ${activeCount} activos · ${withPhotos} con foto · stock total: ${totalStock}`;
    }

    if (!productsCache.length) {
      els.productsTable.innerHTML = `<p class="muted">No hay productos en la base de datos. Crea el primero con "+ Nuevo producto".</p>`;
      return;
    }

    els.productsTable.innerHTML = `
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Producto</th>
            <th>Color</th>
            <th>Tallas</th>
            <th>Precio</th>
            <th>Stock</th>
            <th>Fotos</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${productsCache.map((p) => {
            const imgs = (p.product_images || []).slice().sort((a, b) => {
              if (a.is_primary && !b.is_primary) return -1;
              if (!a.is_primary && b.is_primary) return 1;
              return (a.sort_order || 0) - (b.sort_order || 0);
            });
            const thumb = imgs[0]?.image_url || "";
            const stock = Number(p.stock || 0);
            const sizes = (p.product_variants || [])
              .filter((v) => Number(v.stock) > 0 || true)
              .map((v) => `${v.size}:${v.stock}`)
              .join(" ");
            return `
            <tr>
              <td>${thumb ? `<img class="table-thumb" src="${thumb}" alt="">` : `<span class="muted">Sin foto</span>`}</td>
              <td><strong>${p.name}</strong></td>
              <td>${p.color_name || "-"}</td>
              <td class="muted">${sizes || "-"}</td>
              <td>${money(p.price)}</td>
              <td><span class="badge ${stock < 10 ? "low" : ""}">${stock}</span></td>
              <td>${imgs.length}</td>
              <td><span class="badge ${p.is_active ? "" : "off"}">${p.is_active ? "Activo" : "Inactivo"}</span></td>
              <td class="actions">
                <button type="button" data-edit="${p.id}">Editar</button>
                <button type="button" data-toggle="${p.id}">${p.is_active ? "Desactivar" : "Activar"}</button>
                <button type="button" class="danger" data-delete="${p.id}">Eliminar</button>
              </td>
            </tr>
          `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  async function fetchProductById(id) {
    const { data, error } = await supabase
      .from("products")
      .select(`
        id, name, slug, color_name, price, compare_at_price, stock, is_active, material,
        description, category_id, updated_at,
        product_images ( id, image_url, is_primary, sort_order ),
        product_variants ( id, size, stock )
      `)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }

  async function openProductModal(productOrId) {
    await loadCategories();
    pendingFiles = [];
    existingImages = [];

    let product = null;
    if (typeof productOrId === "string") {
      try {
        product = await fetchProductById(productOrId);
      } catch (err) {
        alert(err.message || "No se pudo cargar el producto");
        return;
      }
    } else if (productOrId?.id) {
      try {
        product = await fetchProductById(productOrId.id);
      } catch (_) {
        product = productOrId;
      }
    }

    els.productModalTitle.textContent = product
      ? `Detalles de producto: ${product.name}`
      : "Nuevo producto";
    els.fields.id.value = product?.id || "";
    els.fields.name.value = product?.name || "";
    els.fields.color.value = product?.color_name || "";
    els.fields.description.value = product?.description || "";
    els.fields.category.value = product?.category_id || "";
    els.fields.price.value = product?.price ?? 119900;
    els.fields.compare.value = product?.compare_at_price ?? "";
    els.fields.material.value = product?.material || "Tela Antifluido";
    els.fields.active.checked = product ? Boolean(product.is_active) : true;
    if (els.fields.files) els.fields.files.value = "";

    existingImages = (product?.product_images || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    renderSizeAvailability(product?.product_variants || []);
    renderGallery();
    showError(els.productFormError, "");
    els.productModal.classList.remove("hidden");
  }

  function closeProductModal() {
    els.productModal.classList.add("hidden");
    pendingFiles = [];
    existingImages = [];
  }

  async function syncProductVariants(productId, sizes) {
    await supabase.from("product_variants").delete().eq("product_id", productId);
    if (!sizes.length) return;
    const { error } = await supabase.from("product_variants").insert(
      sizes.map((row) => ({
        product_id: productId,
        size: row.size,
        stock: row.stock
      }))
    );
    if (error) throw error;
  }

  async function saveProduct(e) {
    e.preventDefault();
    showError(els.productFormError, "");

    const id = els.fields.id.value;
    const name = els.fields.name.value.trim();
    const sizes = getSelectedSizes();
    const totalStock = sizes.reduce((sum, row) => sum + row.stock, 0);

    if (!sizes.length) {
      showError(els.productFormError, "Marca al menos una talla disponible.");
      return;
    }

    if (!id && !pendingFiles.length && !existingImages.length) {
      showError(els.productFormError, "Anade al menos una foto del producto.");
      return;
    }

    const basePayload = {
      name,
      description: els.fields.description.value.trim() || null,
      category_id: els.fields.category.value || null,
      color_name: els.fields.color.value.trim() || null,
      price: Number(els.fields.price.value),
      compare_at_price: els.fields.compare.value ? Number(els.fields.compare.value) : null,
      material: els.fields.material.value.trim() || "Tela Antifluido",
      is_active: els.fields.active.checked,
      stock: totalStock
    };

    let productId = id;

    try {
      await assertDbAdmin();

      if (id) {
        const { error } = await supabase.from("products").update(basePayload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({
            ...basePayload,
            slug: `${slugify(name)}-${Date.now().toString(36)}`,
            created_by: currentUser?.id || null
          })
          .select("id")
          .single();
        if (error) throw error;
        productId = data.id;
      }

      await syncProductVariants(productId, sizes);

      // Fotos: si hay nuevas, reemplazan; si no, se mantienen las existentes
      if (pendingFiles.length) {
        await supabase.from("product_images").delete().eq("product_id", productId);
        const result = await uploadProductImages(productId, pendingFiles);
        if (result?.warnings?.length) {
          console.warn("Fotos con respaldo:", result.warnings.join(" | "));
        }
      } else if (id) {
        // Si quitaron fotos existentes, sincronizar
        const keepIds = existingImages.map((img) => img.id);
        const { data: currentImgs } = await supabase
          .from("product_images")
          .select("id")
          .eq("product_id", productId);
        const toDelete = (currentImgs || []).filter((img) => !keepIds.includes(img.id)).map((img) => img.id);
        if (toDelete.length) {
          await supabase.from("product_images").delete().in("id", toDelete);
        }
      }

      // Verificar que quedaron fotos en BD
      const { data: savedImgs } = await supabase
        .from("product_images")
        .select("id")
        .eq("product_id", productId);
      if (!savedImgs?.length) {
        throw new Error("El producto se guardo pero sin fotos en product_images. Revisa fix-photos.sql y vuelve a subir.");
      }
    } catch (err) {
      showError(els.productFormError, err.message || String(err));
      await loadProducts();
      return;
    }

    closeProductModal();
    await loadProducts();
  }

  async function deleteProduct(id) {
    if (!confirm("Eliminar este producto y sus fotos de la base de datos?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadProducts();
  }

  async function toggleProduct(id) {
    try {
      const product = await fetchProductById(id);
      const { error } = await supabase
        .from("products")
        .update({ is_active: !product.is_active })
        .eq("id", id);
      if (error) throw error;
      await loadProducts();
    } catch (err) {
      alert(err.message || String(err));
    }
  }

  async function loadInventory() {
    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, stock, is_active")
      .order("name");

    if (error) {
      els.invMsg.textContent = error.message;
      els.invMsg.className = "error";
      return;
    }

    const list = products || [];
    els.invProduct.innerHTML = list
      .map((p) => `<option value="${p.id}">${p.name} · stock BD: ${p.stock}${p.is_active ? "" : " (inactivo)"}</option>`)
      .join("") || `<option value="">Sin productos</option>`;

    const { data: movements } = await supabase
      .from("inventory_movements")
      .select("id, change_qty, reason, note, created_at, products(name, stock)")
      .order("created_at", { ascending: false })
      .limit(30);

    els.movementsTable.innerHTML = `
      <table>
        <thead><tr><th>Fecha</th><th>Producto</th><th>Cambio</th><th>Stock actual</th><th>Motivo</th><th>Nota</th></tr></thead>
        <tbody>
          ${(movements || []).map((m) => `
            <tr>
              <td>${new Date(m.created_at).toLocaleString("es-CO")}</td>
              <td>${m.products?.name || "-"}</td>
              <td>${m.change_qty > 0 ? "+" : ""}${m.change_qty}</td>
              <td><strong>${m.products?.stock ?? "-"}</strong></td>
              <td>${m.reason}</td>
              <td>${m.note || "-"}</td>
            </tr>
          `).join("") || `<tr><td colspan="6">Sin movimientos</td></tr>`}
        </tbody>
      </table>
    `;
  }

  async function submitInventory(e) {
    e.preventDefault();
    els.invMsg.textContent = "";
    const changeQty = Number(els.invQty.value);
    if (!changeQty) {
      els.invMsg.textContent = "Indica un cambio distinto de 0.";
      return;
    }

    const productId = els.invProduct.value;
    if (!productId) {
      els.invMsg.textContent = "Selecciona un producto.";
      return;
    }

    // Leer stock actual de la BD antes de mover
    const { data: current, error: readError } = await supabase
      .from("products")
      .select("id, name, stock")
      .eq("id", productId)
      .single();

    if (readError) {
      els.invMsg.textContent = readError.message;
      els.invMsg.className = "error";
      return;
    }

    const nextStock = Number(current.stock || 0) + changeQty;
    if (nextStock < 0) {
      els.invMsg.textContent = `Stock insuficiente. En BD hay ${current.stock}; no puedes restar ${Math.abs(changeQty)}.`;
      els.invMsg.className = "error";
      return;
    }

    const { error } = await supabase.from("inventory_movements").insert({
      product_id: productId,
      change_qty: changeQty,
      reason: els.invReason.value,
      note: els.invNote.value.trim() || null,
      created_by: currentUser?.id || null
    });

    if (error) {
      els.invMsg.textContent = error.message;
      els.invMsg.className = "error";
      return;
    }

    const { data: updated } = await supabase
      .from("products")
      .select("stock")
      .eq("id", productId)
      .single();

    els.invMsg.textContent = `Movimiento registrado. ${current.name}: ${current.stock} → ${updated?.stock ?? nextStock}`;
    els.invMsg.className = "ok";
    els.invQty.value = "";
    els.invNote.value = "";
    await loadInventory();
  }

  async function loadOrders() {
    const [{ data: orders }, { data: sales }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_code, customer_name, customer_phone, status, total, created_at, order_items(quantity, product_name, unit_price, size)")
        .order("created_at", { ascending: false }),
      supabase
        .from("product_sales")
        .select("name, units_sold, revenue")
        .order("units_sold", { ascending: false })
    ]);

    els.ordersTable.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Codigo</th>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Items</th>
            <th>Total</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          ${(orders || []).map((o) => {
            const items = (o.order_items || [])
              .map((i) => `${i.quantity}x ${i.product_name}`)
              .join(", ");
            return `
              <tr>
                <td>${o.order_code}</td>
                <td>${o.customer_name}<br><span class="muted">${o.customer_phone}</span></td>
                <td><span class="badge">${o.status}</span></td>
                <td>${items || "-"}</td>
                <td>${money(o.total)}</td>
                <td>${new Date(o.created_at).toLocaleString("es-CO")}</td>
              </tr>
            `;
          }).join("") || `<tr><td colspan="6">Sin pedidos</td></tr>`}
        </tbody>
      </table>
    `;

    els.salesTable.innerHTML = `
      <table>
        <thead><tr><th>Producto</th><th>Cantidad comprada</th><th>Ingresos</th></tr></thead>
        <tbody>
          ${(sales || []).map((s) => `
            <tr>
              <td>${s.name}</td>
              <td>${s.units_sold}</td>
              <td>${money(s.revenue)}</td>
            </tr>
          `).join("") || `<tr><td colspan="3">Sin ventas</td></tr>`}
        </tbody>
      </table>
    `;
  }

  // Events
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => setAuthMode(tab.getAttribute("data-auth")));
  });

  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!supabase) {
      showError(els.loginError, initError || "Falta configurar admin/config.js");
      return;
    }
    showError(els.loginError, "");
    showOk("");
    const { error } = await supabase.auth.signInWithPassword({
      email: els.loginEmail.value.trim(),
      password: els.loginPassword.value
    });
    if (error) {
      showError(els.loginError, error.message);
      return;
    }
    await requireAdmin();
  });

  els.registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!supabase) {
      showError(els.loginError, initError || "Falta configurar admin/config.js");
      return;
    }
    showError(els.loginError, "");
    showOk("");

    const email = els.registerEmail.value.trim();
    const password = els.registerPassword.value;
    const fullName = els.registerName.value.trim();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: "customer" }
      }
    });

    if (error) {
      showError(els.loginError, error.message);
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      // Best-effort profile row (trigger should also create it)
      await supabase.from("profiles").upsert({
        id: userId,
        full_name: fullName,
        role: "customer"
      });
    }

    showOk("Cuenta creada. Ahora ve a la pestana Iniciar sesion. Si no puedes entrar al panel, dale rol admin en Supabase.");
    setAuthMode("login");
    els.loginEmail.value = email;
  });

  els.logoutBtn.addEventListener("click", async () => {
    if (supabase) await supabase.auth.signOut();
    showLogin();
  });

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.getAttribute("data-view")));
  });

  els.newProductBtn.addEventListener("click", () => openProductModal(null));
  if (els.refreshProductsBtn) {
    els.refreshProductsBtn.addEventListener("click", () => loadProducts());
  }
  els.productForm.addEventListener("submit", saveProduct);
  els.invForm.addEventListener("submit", submitInventory);

  if (els.fields.sizes) {
    els.fields.sizes.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const size = target.getAttribute("data-size-check");
      if (size) {
        const stockInput = els.fields.sizes.querySelector(`[data-size-stock="${size}"]`);
        if (stockInput) {
          stockInput.disabled = !target.checked;
          if (target.checked && !Number(stockInput.value)) stockInput.value = "1";
        }
      }
      updateStockTotal();
    });
    els.fields.sizes.addEventListener("input", updateStockTotal);
  }

  if (els.fields.files) {
    els.fields.files.addEventListener("change", () => {
      const files = Array.from(els.fields.files.files || []);
      pendingFiles = pendingFiles.concat(files);
      els.fields.files.value = "";
      renderGallery();
    });
  }

  if (els.fields.imagesPreview) {
    els.fields.imagesPreview.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const removeExisting = target.getAttribute("data-remove-existing");
      const removePending = target.getAttribute("data-remove-pending");
      if (removeExisting) {
        existingImages = existingImages.filter((img) => img.id !== removeExisting);
        renderGallery();
      }
      if (removePending !== null && removePending !== undefined && target.hasAttribute("data-remove-pending")) {
        pendingFiles.splice(Number(removePending), 1);
        renderGallery();
      }
    });
  }

  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeProductModal);
  });

  els.productsTable.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const editId = target.getAttribute("data-edit");
    const toggleId = target.getAttribute("data-toggle");
    const deleteId = target.getAttribute("data-delete");
    if (editId) openProductModal(editId);
    if (toggleId) toggleProduct(toggleId);
    if (deleteId) deleteProduct(deleteId);
  });

  // Always show login first, then check session
  showLogin(initError || "");
  requireAdmin();
})();
