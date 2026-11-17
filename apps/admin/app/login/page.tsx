import React from "react";

import ARENA_CONFIG from "@arenax/config";

import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; msg?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      {/* Decorative brand glows */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-indigo-900/40 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-700 text-xl font-black text-white shadow-lg shadow-brand-500/30">
            A
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.3em] text-brand-300">
            {ARENA_CONFIG.appName}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Organizer console</h1>
          <p className="mt-2 text-sm text-slate-400">{ARENA_CONFIG.tagline}.</p>
        </div>

        <LoginForm initialError={params.error} initialMsg={params.msg} />

        <p className="mt-6 text-center text-[11px] leading-5 text-slate-600">
          {ARENA_CONFIG.legal.disclaimer}
        </p>
      </div>
    </main>
  );
}
