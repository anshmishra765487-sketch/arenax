import React from "react";

import {
  approveOrganizerAction,
  banUserAction,
  issueStrikeAction,
  unbanUserAction,
} from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { DEMO_USERS } from "@/lib/demo";
import { demoSession } from "@/lib/demo-session";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; msg?: string }>;
}) {
  const params = await searchParams;
  const search = (params.q ?? "").trim();
  const demo = await demoSession();

  interface UserRow {
    id: string;
    username: string;
    display_name: string | null;
    role: string;
    xp: number;
    level: number;
    trust_score: number;
    is_banned: boolean;
    created_at: string;
  }

  let users: UserRow[] | null = null;
  let error: { message: string } | null = null;

  if (demo) {
    users = DEMO_USERS.filter((user) =>
      search ? user.username.toLowerCase().includes(search.toLowerCase()) : true,
    );
  } else {
    const supabase = await createClient();

    let query = supabase
      .from("profiles")
      .select("id, username, display_name, role, xp, level, trust_score, is_banned, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (search) query = query.ilike("username", `%${search}%`);

    const result = await query;
    users = result.data;
    error = result.error;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          Bans and strikes are written to the audit log and notify the player.
        </p>
      </div>

      {params.error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {params.error}
        </p>
      ) : null}
      {params.msg ? (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
          {params.msg}
        </p>
      ) : null}

      <form className="flex gap-2" action="/users">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search username…"
          className="input max-w-xs"
        />
        <button type="submit" className="btn-outline">
          Search
        </button>
      </form>

      {error ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          {error.message} — this page requires an admin account.
        </p>
      ) : null}

      <div className="space-y-3">
        {(users ?? []).map((user) => (
          <div key={user.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-white">
                  @{user.username}
                  {user.is_banned ? (
                    <span className="ml-2 badge border-red-500/40 bg-red-500/10 text-red-300">
                      banned
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {user.display_name ?? "No display name"} · {user.role} · level {user.level} ·{" "}
                  {user.xp} XP · joined {formatDate(user.created_at)}
                </p>
                <p className="mt-1 text-[10px] font-mono text-slate-600">{user.id}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Trust</p>
                <p
                  className={
                    user.trust_score >= 60
                      ? "text-xl font-black text-emerald-400"
                      : "text-xl font-black text-red-400"
                  }
                >
                  {user.trust_score}
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 border-t border-slate-800 pt-3 md:grid-cols-3">
              {user.is_banned ? (
                <form action={unbanUserAction}>
                  <input type="hidden" name="user_id" value={user.id} />
                  <button type="submit" className="btn-outline w-full py-1.5 text-xs">
                    Restore account
                  </button>
                </form>
              ) : (
                <form action={banUserAction} className="space-y-2">
                  <input type="hidden" name="user_id" value={user.id} />
                  <input name="reason" placeholder="Ban reason" className="input py-1.5 text-xs" />
                  <div className="flex gap-2">
                    <input
                      name="days"
                      type="number"
                      min={1}
                      placeholder="Days"
                      className="input w-20 py-1.5 text-xs"
                    />
                    <label className="flex items-center gap-1 text-[11px] text-slate-400">
                      <input type="checkbox" name="permanent" /> permanent
                    </label>
                    <button type="submit" className="btn-danger px-3 py-1.5 text-xs">
                      Ban
                    </button>
                  </div>
                </form>
              )}

              <form action={issueStrikeAction} className="space-y-2">
                <input type="hidden" name="user_id" value={user.id} />
                <input name="reason" placeholder="Strike reason" className="input py-1.5 text-xs" />
                <div className="flex gap-2">
                  <select name="severity" defaultValue="1" className="input w-24 py-1.5 text-xs">
                    <option value="1">Sev 1</option>
                    <option value="2">Sev 2</option>
                    <option value="3">Sev 3</option>
                  </select>
                  <button type="submit" className="btn-outline px-3 py-1.5 text-xs">
                    Strike
                  </button>
                </div>
              </form>

              <form action={approveOrganizerAction}>
                <input type="hidden" name="user_id" value={user.id} />
                <button type="submit" className="btn-outline w-full py-1.5 text-xs">
                  Approve as organizer
                </button>
                <p className="mt-1 text-[10px] leading-4 text-slate-600">
                  3 active strikes trigger an automatic permanent ban.
                </p>
              </form>
            </div>
          </div>
        ))}

        {(users ?? []).length === 0 ? (
          <p className="card text-xs text-slate-500">No users found.</p>
        ) : null}
      </div>
    </div>
  );
}
