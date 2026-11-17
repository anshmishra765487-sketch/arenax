// ===========================================================================
// ArenaX Edge Function · reveal-rooms (cron)
// Runs every minute (Supabase Cron / GitHub Action). Responsibilities:
//   1. Push room details exactly when revealed_at is reached.
//   2. Send "match starting" notifications 30 and 10 minutes before start.
// Deploy: supabase functions deploy reveal-rooms
// Secrets: CRON_SECRET, EXPO_ACCESS_TOKEN (optional)
// ===========================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cronSecret = Deno.env.get("CRON_SECRET") ?? "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function sendExpoPush(userIds: string[], title: string, body: string, data: Record<string, unknown>) {
  if (userIds.length === 0) return;

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("token")
    .in("user_id", userIds);

  const messages = (tokens ?? []).map((row) => ({
    to: row.token,
    title,
    body,
    data,
    sound: "default",
  }));

  // Expo accepts batches of 100.
  for (let index = 0; index < messages.length; index += 100) {
    const chunk = messages.slice(index, index + 100);
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(Deno.env.get("EXPO_ACCESS_TOKEN")
          ? { Authorization: `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN")}` }
          : {}),
      },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) console.error("Expo push failed", response.status, await response.text());
  }
}

async function confirmedPlayerIds(tournamentId: string): Promise<string[]> {
  const { data } = await admin
    .from("registrations")
    .select("player_id")
    .eq("tournament_id", tournamentId)
    .eq("status", "confirmed");
  return (data ?? []).map((row) => row.player_id);
}

serve(async (req) => {
  // Cron must present the shared secret (or the service-role key when invoked
  // manually with the Authorization header).
  const provided = req.headers.get("x-cron-secret") ?? "";
  const bearer = req.headers.get("authorization") ?? "";
  const authorized = cronSecret
    ? provided === cronSecret || bearer === `Bearer ${serviceRoleKey}`
    : bearer === `Bearer ${serviceRoleKey}`;

  if (!authorized) return new Response("unauthorized", { status: 401 });

  const nowIso = new Date().toISOString();
  const results = { roomsRevealed: 0, starting30: 0, starting10: 0 };

  // --- 1. Rooms that are due for reveal -------------------------------------
  const { data: dueRooms } = await admin
    .from("room_details")
    .select("id, tournament_id, revealed_at, tournaments(title, start_time)")
    .lte("revealed_at", nowIso)
    .is("reveal_notified_at", null);

  for (const room of dueRooms ?? []) {
    const tournament = Array.isArray(room.tournaments) ? room.tournaments[0] : room.tournaments;
    const players = await confirmedPlayerIds(room.tournament_id);

    await admin.rpc("notify_tournament_players", {
      p_tournament_id: room.tournament_id,
      p_type: "room_revealed",
      p_title: "Room details unlocked",
      p_body: `Room ID and password for "${tournament?.title ?? "your tournament"}" are now available.`,
    });

    await sendExpoPush(
      players,
      "Room details unlocked 🔓",
      "Open ArenaX to see the room ID and password.",
      { tournamentId: room.tournament_id, screen: "tournament" },
    );

    await admin
      .from("room_details")
      .update({ reveal_notified_at: nowIso })
      .eq("id", room.id)
      .is("reveal_notified_at", null);

    results.roomsRevealed += 1;
  }

  // --- 2. Match starting soon ----------------------------------------------
  const { data: startingSoon } = await admin
    .from("tournaments")
    .select("id, title, start_time")
    .eq("status", "upcoming")
    .gte("start_time", nowIso)
    .lte("start_time", new Date(Date.now() + 31 * 60_000).toISOString());

  for (const tournament of startingSoon ?? []) {
    const minutesLeft = Math.round((new Date(tournament.start_time).getTime() - Date.now()) / 60_000);
    if (minutesLeft > 30 || minutesLeft < 9) continue;

    const bucket = minutesLeft <= 10 ? "10" : "30";
    const alreadySent = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("type", "match_starting")
      .eq("payload->>tournament_id", tournament.id)
      .eq("payload->>bucket", bucket);

    if ((alreadySent.count ?? 0) > 0) continue;

    const players = await confirmedPlayerIds(tournament.id);
    await admin.rpc("notify_tournament_players", {
      p_tournament_id: tournament.id,
      p_type: "match_starting",
      p_title: `Starts in ${bucket} minutes`,
      p_body: `${tournament.title} begins soon. Check the room details now.`,
    });
    // Payload bucket is added by this follow-up update for idempotency.
    await admin
      .from("notifications")
      .update({ payload: { tournament_id: tournament.id, bucket } })
      .eq("type", "match_starting")
      .eq("payload->>tournament_id", tournament.id);

    await sendExpoPush(
      players,
      `Starts in ${bucket} minutes`,
      `${tournament.title} — get your squad ready.`,
      { tournamentId: tournament.id, screen: "tournament" },
    );

    if (bucket === "30") results.starting30 += 1;
    else results.starting10 += 1;
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { "Content-Type": "application/json" },
  });
});
