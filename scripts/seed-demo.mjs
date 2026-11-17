/**
 * ArenaX demo seed (Phase 1)
 *
 * Creates a demo organizer + three free-entry tournaments so the mobile app
 * has real content to render. Uses the SERVICE ROLE key — run locally only.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL="http://127.0.0.1:54321"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<local service role key>"
 *   npm run supabase:demo
 *
 * Safe to re-run: the demo organizer is reused and demo tournaments are replaced.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the seed.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORGANIZER_EMAIL = "organizer@arenax.demo";
const ORGANIZER_PASSWORD = "ArenaX!demo123";

async function ensureOrganizer() {
  const created = await supabase.auth.admin.createUser({
    email: ORGANIZER_EMAIL,
    password: ORGANIZER_PASSWORD,
    email_confirm: true,
    user_metadata: { username: "arenax_ops", display_name: "ArenaX Ops" },
  });

  if (created.data?.user) return created.data.user;

  // Already exists → look it up.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  const existing = data.users.find((user) => user.email === ORGANIZER_EMAIL);
  if (!existing) throw new Error("Could not create or find the demo organizer");
  return existing;
}

async function main() {
  const organizer = await ensureOrganizer();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role: "organizer", language: "en" })
    .eq("id", organizer.id);
  if (profileError) throw profileError;

  const now = Date.now();
  const hours = (value) => value * 60 * 60 * 1000;

  const demoTournaments = [
    {
      organizer_id: organizer.id,
      game_id: "bgmi",
      title: "ArenaX BGMI Squad Open — Week 1",
      mode: "squad",
      status: "upcoming",
      start_time: new Date(now + hours(24)).toISOString(),
      end_time: new Date(now + hours(27)).toISOString(),
      slots_total: 25,
      slots_left: 25,
      map: "Erangel",
      prize_info: "₹5,000 sponsored prize pool · Free entry",
      rules:
        "No teaming, no emulators, no exploits. Custom room details unlock 10 minutes before start. Keep your in-game ID updated.",
    },
    {
      organizer_id: organizer.id,
      game_id: "freefire",
      title: "Free Fire Solo Showdown",
      mode: "solo",
      status: "upcoming",
      start_time: new Date(now + hours(48)).toISOString(),
      end_time: new Date(now + hours(50)).toISOString(),
      slots_total: 48,
      slots_left: 48,
      map: "Bermuda",
      prize_info: "₹2,000 sponsored prize pool · Free entry",
      rules: "Solo only. No hacking, no teaming, screenshots required for disputes.",
    },
    {
      organizer_id: organizer.id,
      game_id: "valorant",
      title: "Valorant 5v5 Community Cup",
      mode: "five",
      status: "upcoming",
      start_time: new Date(now + hours(72)).toISOString(),
      end_time: new Date(now + hours(76)).toISOString(),
      slots_total: 16,
      slots_left: 16,
      map: "Ascent",
      prize_info: "₹8,000 sponsored prize pool · Free entry",
      rules: "Riot ID required. Standard competitive ruleset. Organizer decision is final.",
    },
  ];

  // Replace previous demo rows for a predictable state.
  const { error: deleteError } = await supabase
    .from("tournaments")
    .delete()
    .eq("organizer_id", organizer.id);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from("tournaments").insert(demoTournaments);
  if (insertError) throw insertError;

  console.log("Demo seed complete");
  console.log(`  Organizer: ${ORGANIZER_EMAIL} / ${ORGANIZER_PASSWORD}`);
  console.log(`  Tournaments: ${demoTournaments.length}`);
  console.log("\nPlayer login: use any phone number in Supabase Auth test OTP mode.");
}

main().catch((error) => {
  console.error("Seed failed:", error.message ?? error);
  process.exit(1);
});
