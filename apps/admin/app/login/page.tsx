import React from "react";

import ARENA_CONFIG from "@arenax/config";

import LoginForm from "@/components/LoginForm";
import { DEMO_EMAIL, DEMO_PASSWORD, isDemoMode } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; msg?: string; next?: string; code?: string }>;
}) {
  const params = await searchParams;
  const demoMode = isDemoMode();

  const errorText = params.error
    ? params.code
      ? `${params.error} (code: ${params.code})`
      : params.error
    : undefined;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      {/* Ambient brand glows */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-indigo-900/40 blur-3xl" />

      <div className="relative w-full max-w-md">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-indigo-600 to-indigo-800 text-2xl font-black text-white shadow-xl shadow-brand-500/30">
            A
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.3em] text-brand-300">
            {ARENA_CONFIG.appName}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Organizer console</h1>
          <p className="mt-2 text-sm text-slate-400">{ARENA_CONFIG.tagline}.</p>
        </div>

        {/* Auth card */}
        <div className="card p-6 sm:p-8">
          {demoMode ? (
            <p className="mb-4 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-xs leading-5 text-brand-100">
              <strong className="font-bold">Demo mode.</strong> No Supabase project is connected, so
              the console runs on sample data. Sign in with the demo organizer below — saving
              changes stays disabled.
            </p>
          ) : null}
          <LoginForm
            initialError={errorText}
            initialMsg={params.msg}
            demoMode={demoMode}
            demoEmail={DEMO_EMAIL}
            demoPassword={DEMO_PASSWORD}
          />
        </div>

        {/* Demo hint */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center">
          <p className="text-[11px] text-slate-500">
            Demo organizer — <span className="font-mono text-slate-300">{DEMO_EMAIL}</span> /{" "}
            <span className="font-mono text-slate-300">{DEMO_PASSWORD}</span>
          </p>
        </div>

        {/* Legal footer */}
        <p className="mt-6 text-center text-[11px] leading-5 text-slate-600">
          {ARENA_CONFIG.legal.disclaimer}
        </p>
      </div>
    </main>
  );
}
