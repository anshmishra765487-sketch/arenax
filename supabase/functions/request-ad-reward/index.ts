// ===========================================================================
// ArenaX Edge Function · request-ad-reward
// Creates a "requested" claim before the client shows the ad. The claim is
// only marked "rewarded" by AdMob's server-side verification callback.
// Deploy: supabase functions deploy request-ad-reward
// ===========================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Body = z.object({ tournamentId: z.string().uuid() });

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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

  // 60 requests/hour and 10/day per user (ads are optional and rate-limited).
  const hourly = await admin.rpc("check_rate_limit", {
    p_key: `ad-request:hour:${auth.user.id}`,
    p_max: 60,
    p_window_seconds: 3600,
  });
  const daily = await admin.rpc("check_rate_limit", {
    p_key: `ad-request:day:${auth.user.id}`,
    p_max: 10,
    p_window_seconds: 86400,
  });

  if (hourly.data === false || daily.data === false) {
    return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, status, start_time")
    .eq("id", parsed.data.tournamentId)
    .maybeSingle();

  if (!tournament || tournament.status !== "upcoming") {
    return new Response(JSON.stringify({ ok: false, error: "tournament_not_open" }), { status: 409 });
  }

  const { data: claim, error } = await admin
    .from("ad_reward_claims")
    .insert({
      user_id: auth.user.id,
      tournament_id: tournament.id,
      provider: Deno.env.get("ADMOB_ENV") === "production" ? "admob" : "test",
      status: "requested",
    })
    .select("id")
    .single();

  if (error || !claim) {
    console.error("ad claim insert failed", error?.message);
    return new Response(JSON.stringify({ ok: false, error: "claim_failed" }), { status: 500 });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      claimId: claim.id,
      // Pass this as AdMob's custom_data / SSV custom data.
      customData: claim.id,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
