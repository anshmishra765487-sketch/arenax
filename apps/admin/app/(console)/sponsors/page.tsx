import React from "react";

import { createSponsorAction, linkSponsorAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SponsorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; msg?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: sponsors }, { data: tournaments }, { data: links }] = await Promise.all([
    supabase
      .from("sponsors")
      .select("id, name, description, website_url, active, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("tournaments")
      .select("id, title, start_time")
      .order("start_time", { ascending: false })
      .limit(50),
    supabase
      .from("sponsor_tournaments")
      .select("sponsor_id, tournament_id, impressions, clicks, registrations, contribution_note"),
  ]);

  const sponsorName = new Map((sponsors ?? []).map((row) => [row.id, row.name]));
  const tournamentName = new Map((tournaments ?? []).map((row) => [row.id, row.title]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Sponsors</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sponsor-funded prizes only. Sponsors never influence results or player data.
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

      <section className="card overflow-x-auto p-0">
        <div className="p-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Sponsor links & performance
          </h2>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Sponsor</th>
              <th>Tournament</th>
              <th>Impressions</th>
              <th>Clicks</th>
              <th>Registrations</th>
            </tr>
          </thead>
          <tbody>
            {(links ?? []).map((link) => (
              <tr key={`${link.sponsor_id}-${link.tournament_id}`}>
                <td>{sponsorName.get(link.sponsor_id) ?? link.sponsor_id.slice(0, 8)}</td>
                <td>{tournamentName.get(link.tournament_id) ?? link.tournament_id.slice(0, 8)}</td>
                <td>{link.impressions}</td>
                <td>{link.clicks}</td>
                <td>{link.registrations}</td>
              </tr>
            ))}
            {(links ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  No sponsor links yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Add sponsor
          </h2>
          <form action={createSponsorAction} className="mt-3 space-y-3">
            <div>
              <label className="label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="description">
                Description
              </label>
              <textarea id="description" name="description" rows={2} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="website_url">
                Website
              </label>
              <input id="website_url" name="website_url" type="url" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="logo_url">
                Logo URL
              </label>
              <input id="logo_url" name="logo_url" type="url" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="contact_email">
                Contact email
              </label>
              <input id="contact_email" name="contact_email" type="email" className="input" />
            </div>
            <button type="submit" className="btn">
              Save sponsor
            </button>
          </form>
        </section>

        <section className="card">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
            Link sponsor to tournament
          </h2>
          <form action={linkSponsorAction} className="mt-3 space-y-3">
            <div>
              <label className="label" htmlFor="sponsor_id">
                Sponsor
              </label>
              <select id="sponsor_id" name="sponsor_id" required className="input">
                <option value="">Select…</option>
                {(sponsors ?? []).map((sponsor) => (
                  <option key={sponsor.id} value={sponsor.id}>
                    {sponsor.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="tournament_id">
                Tournament
              </label>
              <select id="tournament_id" name="tournament_id" required className="input">
                <option value="">Select…</option>
                {(tournaments ?? []).map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="banner_url">
                Banner image URL (optional)
              </label>
              <input id="banner_url" name="banner_url" type="url" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="contribution_note">
                Contribution note
              </label>
              <input
                id="contribution_note"
                name="contribution_note"
                className="input"
                placeholder="₹5,000 prize pool"
              />
            </div>
            <button type="submit" className="btn-outline">
              Link sponsor
            </button>
          </form>
        </section>
      </div>

      <section className="card">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Directory</h2>
        <div className="mt-3 space-y-2">
          {(sponsors ?? []).map((sponsor) => (
            <div key={sponsor.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{sponsor.name}</p>
                <span
                  className={
                    sponsor.active
                      ? "badge border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "badge border-slate-600/40 bg-slate-600/10 text-slate-400"
                  }
                >
                  {sponsor.active ? "active" : "inactive"}
                </span>
              </div>
              {sponsor.description ? (
                <p className="mt-1 text-xs text-slate-400">{sponsor.description}</p>
              ) : null}
              {sponsor.website_url ? (
                <a
                  href={sponsor.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs font-semibold text-brand-300"
                >
                  {sponsor.website_url} →
                </a>
              ) : null}
            </div>
          ))}
          {(sponsors ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">No sponsors yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
