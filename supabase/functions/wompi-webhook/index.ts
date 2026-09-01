// Supabase Edge Function: webhook de eventos Wompi
// Secrets:
//   WOMPI_EVENTS_SECRET (opcional, para validar checksum si lo usas)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: "Supabase no configurado" });
    }

    const payload = await req.json();
    const event = payload?.event || payload?.data?.transaction ? payload : null;
    const tx =
      payload?.data?.transaction ||
      payload?.transaction ||
      null;

    if (!tx?.reference) {
      return json(400, { error: "Evento sin transaccion/reference" });
    }

    const status = String(tx.status || "").toUpperCase();
    let paymentStatus = "pending";
    let orderStatus = "pending";

    if (status === "APPROVED") {
      paymentStatus = "approved";
      orderStatus = "confirmed";
    } else if (status === "DECLINED" || status === "VOIDED") {
      paymentStatus = "declined";
      orderStatus = "cancelled";
    } else if (status === "ERROR") {
      paymentStatus = "error";
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { error } = await supabase
      .from("orders")
      .update({
        payment_status: paymentStatus,
        status: orderStatus,
        wompi_transaction_id: tx.id || null,
        payment_method: "wompi",
      })
      .eq("wompi_reference", tx.reference);

    if (error) {
      return json(500, { error: error.message });
    }

    return json(200, {
      ok: true,
      event: event?.event || null,
      reference: tx.reference,
      paymentStatus,
    });
  } catch (err) {
    return json(500, { error: err?.message || "Error webhook" });
  }
});
