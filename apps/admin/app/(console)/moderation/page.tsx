import React from "react";

import { resolveDisputeAction, resolveReportAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, statusClass } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; msg?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: reports }, { data: disputes }] = await Promise.all([
    supabase
      .from("reports")
      .select("id, reporter_id, reported_id, category, description, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("disputes")
      .select("id, tournament_id, opened_by, reason, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Disputes & reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Resolve within 48 hours. Every resolution notifies the player in-app.
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

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-slate-400">
          Disputes
        </h2>
        <div className="space-y-2">
          {(disputes ?? []).map((dispute) => (
            <div key={dispute.id} className="card">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  {formatDateTime(dispute.created_at)} · tournament {dispute.tournament_id.slice(0, 8)}
                </span>
                <span className={`badge ${statusClass(dispute.status)}`}>{dispute.status}</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{dispute.reason}</p>
              <p className="mt-1 text-[10px] font-mono text-slate-600">
                opened by {dispute.opened_by}
              </p>

              {dispute.status !== "resolved" && dispute.status !== "rejected" ? (
                <form action={resolveDisputeAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="dispute_id" value={dispute.id} />
                  <input
                    name="resolution"
                    required
                    minLength={5}
                    placeholder="Resolution note (sent to player)"
                    className="input max-w-md py-1.5 text-xs"
                  />
                  <select name="status" defaultValue="resolved" className="input w-32 py-1.5 text-xs">
                    <option value="resolved">Resolved</option>
                    <option value="under_review">Under review</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <button type="submit" className="btn px-3 py-1.5 text-xs">
                    Save
                  </button>
                </form>
              ) : null}
            </div>
          ))}
          {(disputes ?? []).length === 0 ? (
            <p className="card text-xs text-slate-500">No disputes. Nice.</p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-slate-400">Reports</h2>
        <div className="space-y-2">
          {(reports ?? []).map((report) => (
            <div key={report.id} className="card">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  {formatDateTime(report.created_at)} · {report.category.replace(/_/g, " ")}
                </span>
                <span className={`badge ${statusClass(report.status)}`}>{report.status}</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{report.description}</p>
              <p className="mt-1 text-[10px] font-mono text-slate-600">
                reporter {report.reporter_id.slice(0, 8)}
                {report.reported_id ? ` · reported ${report.reported_id.slice(0, 8)}` : ""}
              </p>

              {report.status !== "resolved" && report.status !== "dismissed" ? (
                <form action={resolveReportAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="report_id" value={report.id} />
                  <select name="status" defaultValue="resolved" className="input w-36 py-1.5 text-xs">
                    <option value="resolved">Resolved</option>
                    <option value="under_review">Under review</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                  <button type="submit" className="btn-outline px-3 py-1.5 text-xs">
                    Update
                  </button>
                </form>
              ) : null}
            </div>
          ))}
          {(reports ?? []).length === 0 ? (
            <p className="card text-xs text-slate-500">No reports.</p>
          ) : null}
        </div>
      </section>

      <p className="text-[11px] leading-5 text-slate-600">
        Anti-cheat flow: duplicate screenshot hashes auto-flag submissions and open a report. Use
        strikes for cheating, teaming, harassment and fake results. Bans are logged.
      </p>
    </div>
  );
}
