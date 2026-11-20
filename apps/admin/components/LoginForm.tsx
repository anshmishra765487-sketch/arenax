"use client";

import React, { useState } from "react";
import { useFormStatus } from "react-dom";

import { forgotPasswordAction, signInAction } from "@/app/actions";

type Props = {
  initialError?: string;
  initialMsg?: string;
  demoMode?: boolean;
  demoEmail?: string;
  demoPassword?: string;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn w-full" disabled={pending} aria-busy={pending}>
      {pending ? (
        <span
          aria-hidden
          className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white align-middle"
        />
      ) : null}
      {pending ? "Please wait…" : label}
    </button>
  );
}

/**
 * Organizer sign-in form (client island).
 * - Sign in (email + password) via `signInAction`
 * - Forgot password via `forgotPasswordAction` (Supabase reset link)
 * - Show/hide password toggle
 * - Pending state via useFormStatus (works with server actions)
 * - Error / success messages from the server (redirect-backed)
 * - One-tap demo credential fill when no Supabase project is configured
 */
export default function LoginForm({
  initialError,
  initialMsg,
  demoMode = false,
  demoEmail = "",
  demoPassword = "",
}: Props) {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const isForgot = mode === "forgot";
  const error = initialError;
  const msg = initialMsg;

  const emailId = isForgot ? "reset_email" : "email";

  return (
    <form action={isForgot ? forgotPasswordAction : signInAction} className="space-y-4">
      {msg ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
        >
          {msg}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300"
        >
          {error}
        </p>
      ) : null}

      <div>
        <label className="label" htmlFor={emailId}>
          Email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          className="input"
          placeholder="you@team.com"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          maxLength={254}
        />
      </div>

      {!isForgot ? (
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">
              Password
            </label>
            <button
              type="button"
              onClick={() => setMode("forgot")}
              className="text-[11px] font-semibold text-brand-300 transition hover:text-brand-200"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              className="input pr-14"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              maxLength={128}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-500 transition hover:text-slate-200"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[11px] leading-4 text-slate-500">
          Enter your organizer email and we&apos;ll send a password reset link.
        </p>
      )}

      <SubmitButton label={isForgot ? "Send reset link" : "Sign in"} />

      {demoMode && !isForgot ? (
        <button
          type="button"
          className="btn-outline w-full"
          onClick={() => {
            setEmail(demoEmail);
            setPassword(demoPassword);
          }}
        >
          Fill demo credentials
        </button>
      ) : null}

      {isForgot ? (
        <button type="button" className="btn-outline w-full" onClick={() => setMode("signin")}>
          Back to sign in
        </button>
      ) : null}

      <p className="text-center text-[11px] leading-5 text-slate-600">
        Players use the mobile app with phone OTP. The web console is for organizers and admins
        only. Need access? Ask an admin to approve your organizer account.
      </p>
    </form>
  );
}
