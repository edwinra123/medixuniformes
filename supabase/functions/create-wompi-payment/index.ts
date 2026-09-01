// Supabase Edge Function: crea pedido + firma de integridad Wompi
// Secrets requeridos:
//   WOMPI_PUBLIC_KEY          (pub_test_... o pub_prod_...)
//   WOMPI_INTEGRITY_SECRET    (test_integrity_... o prod_integrity_...)
//   WOMPI_REDIRECT_URL        (opcional, ej: https://tudominio.com/pago-resultado.html)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (inyectados por Supabase)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function makeReference(): string {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear().toString().slice(-2),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
  ].join("");
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return `MEDIX-${stamp}-${rand}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const publicKey = Deno.env.get("WOMPI_PUBLIC_KEY");
    const integritySecret = Deno.env.get("WOMPI_INTEGRITY_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const redirectUrl = Deno.env.get("WOMPI_REDIRECT_URL") || "";

    if (!publicKey || !integritySecret) {
      return json(500, {
        error: "Faltan secretos WOMPI_PUBLIC_KEY o WOMPI_INTEGRITY_SECRET en la Edge Function.",
      });
    }
    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: "Supabase no esta configurado en la funcion." });
    }

    const body = await req.json();
    const customer = body?.customer || {};
    const items = Array.isArray(body?.items) ? body.items : [];

    const fullName = String(customer.fullName || "").trim();
    const phone = String(customer.phone || "").trim();
    const email = String(customer.email || "").trim();
    const address = String(customer.address || "").trim();
    const city = String(customer.city || "").trim();
    const region = String(customer.region || "").trim();
    const notes = String(customer.notes || "").trim();

    if (!fullName || !phone || !address || !items.length) {
      return json(400, { error: "Datos de cliente o carrito incompletos." });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const productIds = [...new Set(items.map((i: { id: string }) => i.id).filter(Boolean))];
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, price, is_active")
      .in("id", productIds);

    if (productsError) {
      return json(500, { error: productsError.message });
    }

    const byId = Object.fromEntries((products || []).map((p) => [p.id, p]));
    const lineItems: Array<{
      product_id: string;
      product_name: string;
      quantity: number;
      unit_price: number;
      size: string | null;
    }> = [];

    let totalPesos = 0;
    for (const item of items) {
      const product = byId[item.id];
      if (!product || !product.is_active) {
        return json(400, { error: `Producto no disponible: ${item.id}` });
      }
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const unit = Number(product.price) || 0;
      totalPesos += unit * quantity;
      lineItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: unit,
        size: item.size ? String(item.size) : null,
      });
    }

    if (totalPesos <= 0) {
      return json(400, { error: "El total del pedido debe ser mayor a 0." });
    }

    // Wompi: monto en centavos (ej. $150.000 COP => 15000000)
    const amountInCents = Math.round(totalPesos * 100);
    const reference = makeReference();
    const currency = "COP";
    const integrity = await sha256Hex(
      `${reference}${amountInCents}${currency}${integritySecret}`,
    );

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_code: reference,
        customer_name: fullName,
        customer_phone: phone,
        customer_email: email || null,
        customer_address: [address, city, region].filter(Boolean).join(", "),
        notes: notes || null,
        status: "pending",
        payment_method: "wompi",
        payment_status: "pending",
        wompi_reference: reference,
        total: totalPesos,
      })
      .select("id, order_code")
      .single();

    if (orderError) {
      return json(500, { error: orderError.message });
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      lineItems.map((li) => ({ ...li, order_id: order.id })),
    );

    if (itemsError) {
      await supabase.from("orders").delete().eq("id", order.id);
      return json(500, { error: itemsError.message });
    }

    return json(200, {
      publicKey,
      currency,
      amountInCents,
      reference,
      signature: { integrity },
      redirectUrl: redirectUrl || undefined,
      customerData: {
        email: email || undefined,
        fullName,
        phoneNumber: phone.replace(/\D/g, "").slice(-10),
        phoneNumberPrefix: "+57",
      },
      shippingAddress: {
        addressLine1: address,
        city: city || "Bogota",
        region: region || "Cundinamarca",
        country: "CO",
        phoneNumber: phone.replace(/\D/g, "").slice(-10),
        name: fullName,
      },
      orderId: order.id,
      orderCode: order.order_code,
      total: totalPesos,
    });
  } catch (err) {
    return json(500, { error: err?.message || "Error creando pago Wompi" });
  }
});
