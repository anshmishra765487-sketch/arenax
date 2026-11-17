import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";
import { identifyUser, resetAnalytics } from "../../lib/analytics";
import { registerPushToken } from "../../lib/push";
import type { Profile } from "../../lib/types";

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Sends a 6-digit OTP to a phone number in E.164 format (e.g. +9198...). */
  sendPhoneOtp: (phone: string) => Promise<{ error?: string }>;
  /** Verifies the OTP with Supabase Auth. */
  verifyPhoneOtp: (phone: string, token: string) => Promise<{ error?: string }>;
  /** Google OAuth via Supabase (opens an in-app browser). */
  signInWithGoogle: () => Promise<{ error?: string }>;
  /** Reloads the profile row (after onboarding edits). */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("loadProfile failed", error.message);
    return null;
  }
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const applySession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
    userIdRef.current = nextSession?.user?.id ?? null;

    if (nextSession?.user) {
      const nextProfile = await loadProfile(nextSession.user.id);
      if (userIdRef.current === nextSession.user.id) {
        setProfile(nextProfile);
      }
    } else {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        return applySession(data.session);
      })
      .catch((error) => console.warn("getSession failed", error))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Supabase warns against async work inside this callback; defer it.
      setTimeout(() => {
        if (mounted) {
          applySession(nextSession).finally(() => setLoading(false));
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const sendPhoneOtp = useCallback(async (phone: string) => {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    return error ? { error: error.message } : {};
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
    return error ? { error: error.message } : {};
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = Linking.createURL("auth-callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });

    if (error) return { error: error.message };
    if (!data.url) return { error: "Could not start Google sign-in" };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return {}; // user cancelled

    // Supabase returns tokens in the URL fragment for implicit flow.
    const raw = result.url.split("#")[1] ?? result.url.split("?")[1] ?? "";
    const params = new URLSearchParams(raw);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return { error: "Google sign-in failed" };

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return sessionError ? { error: sessionError.message } : {};
  }, []);

  const refreshProfile = useCallback(async () => {
    const currentUser = userIdRef.current;
    if (!currentUser) return;
    setProfile(await loadProfile(currentUser));
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    userIdRef.current = null;
    resetAnalytics();
  }, []);

  // Register the device push token once per signed-in user, and identify the
  // user in analytics (both are best-effort no-ops on web / Expo Go).
  useEffect(() => {
    if (!user?.id) return;
    identifyUser(user.id, { role: profile?.role ?? "player" });
    void registerPushToken(user.id);
  }, [user?.id, profile?.role]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      loading,
      sendPhoneOtp,
      verifyPhoneOtp,
      signInWithGoogle,
      refreshProfile,
      signOut,
    }),
    [
      session,
      user,
      profile,
      loading,
      sendPhoneOtp,
      verifyPhoneOtp,
      signInWithGoogle,
      refreshProfile,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
