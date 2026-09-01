// Supabase Edge Function: webhook de eventos Wompi
// Llama a process_wompi_webhook (Postgres) para confirmar pedido y descontar stock.
//
// Secrets (Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   WOMPI_EVENTS_SECRET  (opcional — valida checksum de Wompi)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-event-checksum",
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

function readTransaction(payload: Record<string, unknown>) {
  const data = payload?.data as Record<string, unknown> | undefined;
  const tx =
    (data?.transaction as Record<string, unknown> | undefined) ||
    (payload?.transaction as Record<string, unknown> | undefined) ||
    null;
  return tx;
}

async function validateWompiChecksum(
  payload: Record<string, unknown>,
  eventsSecret: string
): Promise<boolean> {
  const signature = payload?.signature as Record<string, unknown> | undefined;
  const properties = signature?.properties as string[] | undefined;
  const checksum = String(signature?.checksum || "");
  if (!properties?.length || !checksum) return false;

  const data = payload?.data as Record<string, unknown> | undefined;
  let concat = "";

  for (const prop of properties) {
    const parts = prop.split(".");
    let value: unknown = data;
    for (const part of parts) {
      value = (value as Record<string, unknown> | undefined)?.[part];
    }
    concat += String(value ?? "");
  }

  concat += String(payload?.timestamp ?? "");
  concat += eventsSecret;

  const expected = await sha256Hex(concat);
  return expected === checksum;
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

    const payload = (await req.json()) as Record<string, unknown>;
    const eventsSecret = Deno.env.get("WOMPI_EVENTS_SECRET") || "";

    if (eventsSecret) {
      const valid = await validateWompiChecksum(payload, eventsSecret);
      if (!valid) {
        return json(401, { error: "Checksum de Wompi invalido" });
      }
    }

    const tx = readTransaction(payload);
    if (!tx?.reference) {
      return json(400, { error: "Evento sin transaccion/reference" });
    }

    const status = String(tx.status || "").toUpperCase();
    const amountInCents =
      tx.amount_in_cents != null ? Number(tx.amount_in_cents) : null;

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data, error } = await supabase.rpc("process_wompi_webhook", {
      p_reference: String(tx.reference),
      p_transaction_id: tx.id ? String(tx.id) : null,
      p_status: status,
      p_amount_in_cents: Number.isFinite(amountInCents) ? amountInCents : null,
    });

    if (error) {
      console.error("process_wompi_webhook error:", error.message);
      return json(500, { error: error.message });
    }

    return json(200, {
      ok: true,
      event: payload?.event || null,
      reference: tx.reference,
      result: data,
    });
  } catch (err) {
    return json(500, { error: err?.message || "Error webhook" });
  }
});
