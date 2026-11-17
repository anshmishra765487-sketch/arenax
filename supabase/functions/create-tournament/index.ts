// ===========================================================================
// ArenaX Edge Function · create-tournament
//
// Deploy:  supabase functions deploy create-tournament
// Invoke:  POST /functions/v1/create-tournament  (Authorization: Bearer <jwt>)
//
// Why server-side? Tournament creation includes publisher-rules acceptance and
// slot math. Doing it here keeps validation out of the client and is the place
// where Phase 2 adds rate limiting + the publisher checklist audit row.
// ===========================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CreateTournamentBody = z.object({
  gameId: z.enum(["bgmi", "freefire", "valorant", "cod_mobile"]),
  title: z.string().trim().min(3).max(90),
  mode: z.enum(["solo", "duo", "squad", "five"]),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  slotsTotal: z.number().int().min(1).max(256).default(8),
  rules: z.string().max(8000).optional(),
  map: z.string().max(60).optional(),
  prizeInfo: z.string().max(500).optional(),
  /** Organizer must confirm the publisher's custom-room rules + no RMT. */
  publisherRulesAccepted: z.literal(true),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ ok: false, error: "server_misconfigured" }, 500);

  // User-scoped client: RLS + auth.uid() apply to every query.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ ok: false, error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = CreateTournamentBody.safeParse(body);
  if (!parsed.success) {
    return json(
      { ok: false, error: "validation_failed", issues: parsed.error.flatten().fieldErrors },
      422,
    );
  }
  const input = parsed.data;

  const start = new Date(input.startTime);
  const end = new Date(input.endTime);
  if (end <= start) return json({ ok: false, error: "end_before_start" }, 422);
  if (start.getTime() <= Date.now()) return json({ ok: false, error: "start_in_past" }, 422);

  // Only approved organizers/admins may host.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) return json({ ok: false, error: "profile_missing" }, 403);
  if (!["organizer", "admin"].includes(profile.role)) {
    return json({ ok: false, error: "organizer_not_approved" }, 403);
  }

  const { data: tournament, error: insertError } = await supabase
    .from("tournaments")
    .insert({
      organizer_id: authData.user.id,
      game_id: input.gameId,
      title: input.title,
      mode: input.mode,
      start_time: input.startTime,
      end_time: input.endTime,
      slots_total: input.slotsTotal,
      slots_left: input.slotsTotal,
      rules: input.rules ?? null,
      map: input.map ?? null,
      prize_info: input.prizeInfo ?? null,
    })
    .select()
    .single();

  if (insertError) {
    console.error("create-tournament insert failed", insertError.message);
    return json({ ok: false, error: "insert_failed" }, 500);
  }

  return json({ ok: true, tournament }, 201);
});
