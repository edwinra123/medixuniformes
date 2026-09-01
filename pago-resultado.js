(() => {
  const WHATSAPP = "573001112233";
  const PLACEHOLDER =
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
        <rect width="120" height="120" fill="#efe8df"/>
        <text x="50%" y="54%" text-anchor="middle" fill="#a68979" font-family="Montserrat,sans-serif" font-size="16">Medix</text>
      </svg>`
    );

  const params = new URLSearchParams(window.location.search);
  const txId = params.get("id");
  const orderRef = params.get("ref");

  const els = {
    loading: document.getElementById("confirm-loading"),
    content: document.getElementById("confirm-content"),
    error: document.getElementById("confirm-error"),
    heroTitle: document.getElementById("hero-title"),
    heroLead: document.getElementById("hero-lead"),
    orderCode: document.getElementById("order-code"),
    orderDate: document.getElementById("order-date"),
    stepDate: document.getElementById("step-date"),
    itemsList: document.getElementById("order-items"),
    subtotal: document.getElementById("summary-subtotal"),
    shipping: document.getElementById("summary-shipping"),
    total: document.getElementById("summary-total"),
    payBadge: document.getElementById("pay-badge"),
    payMethod: document.getElementById("pay-method"),
    deliveryRange: document.getElementById("delivery-range"),
    deliveryAddress: document.getElementById("delivery-address"),
    waLink: document.getElementById("wa-link"),
    timeline: document.getElementById("order-timeline")
  };

  function currency(value) {
    return "$" + Number(value || 0).toLocaleString("es-CO");
  }

  function getCfg() {
    return window.MEDIX_SUPABASE || {};
  }

  function headers() {
    const cfg = getCfg();
    return {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    };
  }

  async function rpc(name, body = {}) {
    const cfg = getCfg();
    const res = await fetch(`${cfg.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function fetchWompiTx(id) {
    const cfg = getCfg();
    const isTest = String(cfg.wompiPublicKey || "").includes("pub_test_");
    const base = isTest
      ? "https://sandbox.wompi.co/v1/transactions/"
      : "https://production.wompi.co/v1/transactions/";
    const res = await fetch(base + encodeURIComponent(id));
    const json = await res.json();
    return json?.data || null;
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const date = d.toLocaleDateString("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    const time = d.toLocaleTimeString("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
    return `${date} · ${time}`;
  }

  function formatShortDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-CO", {
      day: "numeric",
      month: "short"
    });
  }

  function formatDeliveryRange(iso) {
    if (!iso) return "3 - 7 dias habiles";
    const start = new Date(iso);
    const end = new Date(iso);
    start.setDate(start.getDate() + 4);
    end.setDate(end.getDate() + 8);
    const fmt = (d) =>
      d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    return `${fmt(start)} - ${fmt(end)}`;
  }

  function paymentLabel(status) {
    const s = String(status || "").toUpperCase();
    if (s === "APPROVED" || s === "approved") {
      return { text: "Aprobado", className: "is-approved" };
    }
    if (s === "PENDING" || s === "PENDING_PAYMENT" || s === "pending") {
      return { text: "Pendiente", className: "is-pending" };
    }
    if (s === "UNPAID" || s === "ERROR" || s === "INCOMPLETE") {
      return { text: "No completado", className: "is-declined" };
    }
    return { text: "Rechazado", className: "is-declined" };
  }

  function heroForStatus(status) {
    const s = String(status || "").toUpperCase();
    if (s === "APPROVED" || s === "approved") {
      return {
        title: "¡Gracias por tu compra!",
        lead: "Tu pedido ha sido recibido correctamente. Te enviaremos un correo con los detalles de tu compra.",
        doneStep: true
      };
    }
    if (s === "PENDING" || s === "PENDING_PAYMENT" || s === "pending") {
      return {
        title: "Pago en proceso",
        lead: "Tu pago aun no esta confirmado. Si ya completaste el pago, espera unos minutos y recarga esta pagina.",
        doneStep: false
      };
    }
    return {
      title: "Pago no completado",
      lead: "La transaccion no pudo completarse. Puedes volver al catalogo e intentar de nuevo con un nuevo pedido.",
      doneStep: false
    };
  }

  function renderItems(items) {
    if (!items?.length) {
      els.itemsList.innerHTML = `<p class="confirm-empty">Detalle del pedido no disponible.</p>`;
      return;
    }
    els.itemsList.innerHTML = items
      .map((item) => {
        const size = item.size ? `Talla: ${item.size}` : "";
        const qty = `Cantidad: ${item.quantity || 1}`;
        const meta = [size, qty].filter(Boolean).join(" | ");
        const img = item.imageUrl || PLACEHOLDER;
        return `
          <article class="confirm-item">
            <img src="${img}" alt="">
            <div class="confirm-item-info">
              <strong>${item.name || "Producto"}</strong>
              <span>${meta}</span>
            </div>
            <em>${currency(item.lineTotal ?? item.unitPrice)}</em>
          </article>
        `;
      })
      .join("");
  }

  function showError(title, message) {
    els.loading.classList.add("hidden");
    els.content.classList.add("hidden");
    els.error.classList.remove("hidden");
    document.getElementById("error-title").textContent = title;
    document.getElementById("error-message").textContent = message;
  }

  function showContent() {
    els.loading.classList.add("hidden");
    els.error.classList.add("hidden");
    els.content.classList.remove("hidden");
  }

  function renderConfirmation({
    status,
    order,
    tx,
    fallbackReference
  }) {
    const badge = paymentLabel(status);
    els.payBadge.textContent = badge.text;
    els.payBadge.className = "confirm-pay-badge " + badge.className;

    const subtotal = order?.subtotal ?? (tx?.amount_in_cents ? tx.amount_in_cents / 100 : 0);
    const shipping = order?.shippingCost ?? 0;
    const total = order?.total ?? (tx?.amount_in_cents ? tx.amount_in_cents / 100 : 0);

    els.subtotal.textContent = currency(Math.max(0, subtotal));
    els.shipping.textContent = currency(shipping);
    els.total.textContent = currency(total);

    const createdAt = order?.createdAt || tx?.created_at || new Date().toISOString();
    const code = order?.orderCode || tx?.reference || fallbackReference || "—";

    els.orderCode.textContent = "#" + String(code).replace(/^#/, "");
    els.orderDate.textContent = formatDateTime(createdAt);
    els.stepDate.textContent = formatShortDate(createdAt);
    els.deliveryRange.textContent = formatDeliveryRange(createdAt);
    els.deliveryAddress.textContent = order?.address || "Direccion registrada en el pedido";

    const method = tx?.payment_method_type
      ? `Pago en linea (${String(tx.payment_method_type).replace(/_/g, " ")})`
      : "Pago en linea (Wompi)";
    els.payMethod.textContent = method;

    renderItems(order?.items || []);

    const hero = heroForStatus(status);
    els.heroTitle.textContent = hero.title;
    els.heroLead.textContent = hero.lead;
    els.timeline.querySelector('[data-step="1"]')?.classList.toggle("is-done", hero.doneStep);

    showContent();
  }

  async function loadByReference(ref) {
    const order = await rpc("get_order_confirmation", { p_reference: ref });
    if (!order) {
      showError(
        "Pedido no encontrado",
        "No encontramos un pedido con esa referencia. Verifica el enlace o contactanos por WhatsApp."
      );
      return;
    }

    const payStatus = String(order.paymentStatus || "pending").toLowerCase();
    const status =
      payStatus === "approved"
        ? "APPROVED"
        : payStatus === "pending"
          ? "PENDING"
          : payStatus === "declined" || payStatus === "error"
            ? "DECLINED"
            : "INCOMPLETE";

    renderConfirmation({
      status,
      order,
      tx: null,
      fallbackReference: ref
    });
  }

  async function loadByTransactionId(id) {
    const tx = await fetchWompiTx(id);
    if (!tx) {
      showError("Transaccion no encontrada", "No pudimos verificar tu pago con Wompi.");
      return;
    }

    let order = null;
    if (tx.reference) {
      try {
        order = await rpc("get_order_confirmation", { p_reference: tx.reference });
      } catch (err) {
        console.warn("No se pudo cargar pedido:", err);
      }
    }

    renderConfirmation({
      status: tx.status,
      order,
      tx,
      fallbackReference: tx.reference
    });
  }

  async function init() {
    if (els.waLink) {
      els.waLink.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hola Medix, tengo una consulta sobre mi pedido.")}`;
    }

    if (txId) {
      try {
        await loadByTransactionId(txId);
      } catch (err) {
        console.error(err);
        showError(
          "No se pudo verificar",
          "Guarda el ID de la transaccion y contactanos si ya pagaste."
        );
      }
      return;
    }

    if (orderRef) {
      try {
        await loadByReference(orderRef);
      } catch (err) {
        console.error(err);
        showError(
          "No se pudo cargar el pedido",
          "No pudimos obtener los datos de tu compra. Intenta de nuevo o escribenos por WhatsApp."
        );
      }
      return;
    }

    showError(
      "Sin transaccion",
      "No encontramos el ID de pago ni la referencia del pedido. Si ya pagaste, revisa tu correo o escribenos por WhatsApp."
    );
  }

  init();
})();
