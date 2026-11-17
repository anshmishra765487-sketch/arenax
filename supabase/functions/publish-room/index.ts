// ===========================================================================
// ArenaX Edge Function · publish-room
// The organizer publishes (or updates) room credentials. revealed_at is
// derived from the tournament start time by a DB trigger — never client input.
// Deploy: supabase functions deploy publish-room
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
  tournamentId: z.string().uuid(),
  roomId: z.string().trim().min(2).max(64),
  roomPassword: z.string().trim().min(1).max(64),
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json({ ok: false, error: "unauthorized" }, 401);

  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  if (!parsed.success) {
    return json({ ok: false, error: "validation_failed", issues: parsed.error.flatten().fieldErrors }, 422);
  }

  const { tournamentId, roomId, roomPassword } = parsed.data;

  // RLS verifies the caller owns the tournament.
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, organizer_id, start_time, status")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tournamentError || !tournament) return json({ ok: false, error: "tournament_not_found" }, 404);
  if (tournament.organizer_id !== auth.user.id) return json({ ok: false, error: "forbidden" }, 403);
  if (tournament.status === "completed" || tournament.status === "cancelled") {
    return json({ ok: false, error: "tournament_closed" }, 409);
  }

  const { data: room, error: roomError } = await supabase
    .from("room_details")
    .upsert(
      { tournament_id: tournamentId, room_id: roomId, room_password: roomPassword },
      { onConflict: "tournament_id" },
    )
    .select("tournament_id, revealed_at")
    .single();

  if (roomError) {
    console.error("publish-room failed", roomError.message);
    return json({ ok: false, error: "publish_failed" }, 500);
  }

  return json({
    ok: true,
    revealedAt: room.revealed_at,
    message: "Room saved. Players see it automatically 10 minutes before start.",
  });
});
