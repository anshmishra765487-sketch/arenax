import React from "react";

import ARENA_CONFIG from "@arenax/config";

import { signInAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-300">
            {ARENA_CONFIG.appName}
          </p>
          <h1 className="mt-2 text-2xl font-black text-white">Organizer console</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with the email + password on your organizer or admin account.
          </p>
        </div>

        <form action={signInAction} className="card space-y-4">
          {params.error ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {params.error}
            </p>
          ) : null}

          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required className="input" autoComplete="email" />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="input"
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn w-full">
            Sign in
          </button>

          <p className="text-center text-[11px] leading-5 text-slate-600">
            Players use the mobile app with phone OTP. The web console is for organizers and admins
            only. Need access? Ask an admin to approve your organizer account.
          </p>
        </form>

        <p className="mt-6 text-center text-[11px] text-slate-600">
          {ARENA_CONFIG.legal.disclaimer}
        </p>
      </div>
    </main>
  );
}
