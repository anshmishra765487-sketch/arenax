// ===========================================================================
// ArenaX Edge Function · verify-play-purchase
// Verifies a Google Play subscription purchase token server-side before
// granting VIP. No payment data is stored — only Play's purchase token.
//
// Required secrets:
//   GOOGLE_SERVICE_ACCOUNT_JSON  (Play Console service account, full JSON)
//   ANDROID_PACKAGE_NAME         (com.arenax.app)
//   VIP_PRODUCT_IDS              (comma separated product ids)
//
// Deploy: supabase functions deploy verify-play-purchase
// ===========================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Body = z.object({
  purchaseToken: z.string().min(10).max(4096),
  productId: z.string().min(3).max(120),
});

function base64Url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function playAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured");
  const account = JSON.parse(raw) as { client_email: string; private_key: string };

  const now = Math.floor(Date.now() / 1000);
  const signingInput = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )}`;

  const pem = account.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${base64Url(signature)}`,
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description ?? "Google OAuth failed");
  return payload.access_token as string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
  }

  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), { status: 400 });
  }
  if (!parsed.success) {
    return new Response(JSON.stringify({ ok: false, error: "validation_failed" }), { status: 422 });
  }

  const allowed = (Deno.env.get("VIP_PRODUCT_IDS") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (allowed.length > 0 && !allowed.includes(parsed.data.productId)) {
    return new Response(JSON.stringify({ ok: false, error: "unknown_product" }), { status: 422 });
  }

  const packageName = Deno.env.get("ANDROID_PACKAGE_NAME") ?? "com.arenax.app";

  try {
    const accessToken = await playAccessToken();
    const response = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${encodeURIComponent(
        parsed.data.purchaseToken,
      )}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      console.error("Play purchase verification failed", response.status);
      return new Response(JSON.stringify({ ok: false, error: "purchase_not_found" }), { status: 404 });
    }

    const purchase = await response.json();
    const state = purchase.subscriptionState as string;
    const active = state === "SUBSCRIPTION_STATE_ACTIVE" || state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD";
    const expiry: string | undefined = purchase.lineItems?.[0]?.expiryTime;
    const plan = parsed.data.productId.includes("year") ? "vip_yearly" : "vip_monthly";

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const { error } = await admin.from("subscriptions").upsert(
      {
        user_id: auth.user.id,
        plan,
        provider: "google_play",
        purchase_token: parsed.data.purchaseToken,
        order_id: purchase.latestOrderId ?? null,
        status: active ? "active" : "expired",
        auto_renewing: purchase.autoRenewing !== false,
        started_at: purchase.startTime ?? new Date().toISOString(),
        expires_at: expiry ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,purchase_token" },
    );

    if (error) {
      console.error("subscription upsert failed", error.message);
      return new Response(JSON.stringify({ ok: false, error: "save_failed" }), { status: 500 });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        active,
        expiresAt: expiry ?? null,
        plan,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("verify-play-purchase error", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ ok: false, error: "verification_failed" }), { status: 500 });
  }
});
