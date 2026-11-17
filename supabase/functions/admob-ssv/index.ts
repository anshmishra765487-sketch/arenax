// ===========================================================================
// ArenaX Edge Function · admob-ssv
// AdMob server-side verification callback. AdMob must be configured to call:
//   https://<project>.supabase.co/functions/v1/admob-ssv
// with SSV enabled and custom_data = claim id.
//
// Google signs the query string (everything before &signature=) with an ECDSA
// P-256 key published at https://www.gstatic.com/admob/reward/verifier-keys.json
// Deploy WITHOUT JWT verification:  supabase functions deploy admob-ssv --no-verify-jwt
// ===========================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer;
}

async function verifySignature(message: string, signature: string, keyId: string): Promise<boolean> {
  const response = await fetch("https://www.gstatic.com/admob/reward/verifier-keys.json");
  const payload = (await response.json()) as {
    keys: Array<{ keyId: number; pem: string }>;
  };
  const key = payload.keys.find((item) => String(item.keyId) === String(keyId));
  if (!key) return false;

  const cryptoKey = await crypto.subtle.importKey(
    "spki",
    pemToDer(key.pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    base64UrlToBytes(signature),
    new TextEncoder().encode(message),
  );
}

serve(async (req) => {
  if (req.method !== "GET") return new Response("method_not_allowed", { status: 405 });

  const url = new URL(req.url);
  const raw = url.search.replace(/^\?/, "");
  const signatureIndex = raw.indexOf("&signature=");
  if (signatureIndex < 0) return new Response("missing_signature", { status: 400 });

  const signedMessage = raw.slice(0, signatureIndex);
  const params = new URLSearchParams(raw);
  const signature = params.get("signature") ?? "";
  const keyId = params.get("key_id") ?? "";

  const valid = await verifySignature(signedMessage, signature, keyId);
  if (!valid) {
    console.warn("AdMob SSV signature rejected");
    return new Response("invalid_signature", { status: 403 });
  }

  const customData = params.get("custom_data");
  const transactionId = params.get("transaction_id");

  if (!customData) return new Response("missing_custom_data", { status: 400 });

  const { data: claim } = await admin
    .from("ad_reward_claims")
    .select("id, status")
    .eq("id", customData)
    .maybeSingle();

  if (!claim) return new Response("claim_not_found", { status: 404 });

  if (claim.status === "rewarded" || claim.status === "redeemed") {
    return new Response("ok (idempotent)");
  }

  const { error } = await admin
    .from("ad_reward_claims")
    .update({
      status: "rewarded",
      transaction_id: transactionId,
      reward_amount: Number(params.get("reward_amount") ?? 0) || null,
      rewarded_at: new Date().toISOString(),
    })
    .eq("id", claim.id)
    .eq("status", "requested");

  if (error) {
    console.error("SSV update failed", error.message);
    return new Response("server_error", { status: 500 });
  }

  return new Response("ok");
});
