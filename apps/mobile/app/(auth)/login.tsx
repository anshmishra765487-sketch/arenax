import ARENA_CONFIG from "@arenax/config";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { z } from "zod";

import { Button, Input } from "../../src/components/ui";
import { useAuth } from "../../src/features/auth/useAuth";

const phoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

const otpSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

function normalizeIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return `+91${digits}`;
}

export default function LoginScreen() {
  const router = useRouter();
  const { sendPhoneOtp, verifyPhoneOtp, signInWithGoogle, session, signInDemo } = useAuth();

  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [rawPhone, setRawPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // If a session is restored while the login screen is visible, continue.
  useEffect(() => {
    if (session) router.replace("/tournaments");
  }, [session, router]);

  useEffect(() => {
    if (resendIn <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setResendIn((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resendIn]);

  async function requestOtp() {
    setError(null);
    setNotice(null);

    const normalized = normalizeIndianPhone(rawPhone);
    const parsed = phoneSchema.safeParse(normalized);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid phone number");
      return;
    }

    setBusy(true);
    const result = await sendPhoneOtp(normalized);
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setPhone(normalized);
    setStage("otp");
    setResendIn(30);
    setNotice(`OTP sent to ${normalized.replace("+91", "+91 ")}`);
  }

  async function confirmOtp() {
    setError(null);
    const parsed = otpSchema.safeParse(otp.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid code");
      return;
    }

    setBusy(true);
    const result = await verifyPhoneOtp(phone, otp.trim());
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.replace("/tournaments");
  }

  async function googleSignIn() {
    setError(null);
    setBusy(true);
    const result = await signInWithGoogle();
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (session) router.replace("/tournaments");
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-950"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 justify-center px-6 py-10">
          {/* Brand */}
          <View className="mb-8 items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-brand-500">
              <Text className="text-3xl font-black text-white">AX</Text>
            </View>
            <Text className="text-3xl font-black tracking-tight text-white">
              {ARENA_CONFIG.appName}
            </Text>
            <Text className="mt-1 text-sm text-slate-400">{ARENA_CONFIG.tagline}</Text>
          </View>

          <View className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            {stage === "phone" ? (
              <>
                <Text className="mb-1 text-lg font-bold text-white">Sign in</Text>
                <Text className="mb-5 text-sm text-slate-400">
                  Phone OTP is the fastest way in. Free tournaments, no wallet, no entry fee.
                </Text>

                <Input
                  label="Mobile number"
                  placeholder="98765 43210"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  maxLength={14}
                  value={rawPhone}
                  onChangeText={setRawPhone}
                  hint="We'll send a 6-digit OTP. Standard SMS rates may apply."
                  error={error ?? undefined}
                />

                <Button title="Send OTP" onPress={requestOtp} loading={busy} />

                <View className="my-4 flex-row items-center">
                  <View className="h-px flex-1 bg-slate-800" />
                  <Text className="mx-3 text-xs text-slate-500">OR</Text>
                  <View className="h-px flex-1 bg-slate-800" />
                </View>

                <Button
                  title="Continue with Google"
                  variant="outline"
                  onPress={googleSignIn}
                  disabled={busy}
                />

                <View className="my-4 flex-row items-center">
                  <View className="h-px flex-1 bg-slate-800" />
                  <Text className="mx-3 text-xs text-slate-500">OR</Text>
                  <View className="h-px flex-1 bg-slate-800" />
                </View>

                <Button
                  title="Continue in demo mode"
                  variant="outline"
                  onPress={() => void signInDemo()}
                  disabled={busy}
                />
              </>
            ) : (
              <>
                <Text className="mb-1 text-lg font-bold text-white">Verify OTP</Text>
                <Text className="mb-5 text-sm text-slate-400">
                  Enter the 6-digit code sent to {phone.replace("+91", "+91 ")}.
                </Text>

                <Input
                  label="OTP"
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                  autoComplete="sms-otp"
                  value={otp}
                  onChangeText={setOtp}
                  error={error ?? undefined}
                />

                {notice ? <Text className="mb-3 text-xs text-emerald-400">{notice}</Text> : null}

                <Button title="Verify & continue" onPress={confirmOtp} loading={busy} />

                <View className="mt-4 flex-row items-center justify-between">
                  <Pressable
                    onPress={() => {
                      setStage("phone");
                      setOtp("");
                      setError(null);
                    }}
                  >
                    <Text className="text-sm text-slate-400">Change number</Text>
                  </Pressable>

                  <Pressable
                    disabled={resendIn > 0 || busy}
                    onPress={requestOtp}
                  >
                    <Text
                      className={
                        resendIn > 0
                          ? "text-sm text-slate-600"
                          : "text-sm font-semibold text-brand-400"
                      }
                    >
                      {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>

          {/* Compliance footer */}
          <View className="mt-6 rounded-2xl border border-slate-800/70 bg-slate-900/40 p-4">
            <Text className="text-[11px] leading-4 text-slate-500">
              {ARENA_CONFIG.legal.disclaimer}
            </Text>
            <Text className="mt-2 text-[11px] leading-4 text-slate-500">
              By continuing you confirm you are {ARENA_CONFIG.legal.minimumAge}+ or have
              verifiable parental consent, and you accept our Terms, Privacy Policy and
              Fair Play Policy. Tournaments are free to enter. No real-money gaming.
            </Text>
          </View>

          <Pressable
            className="mt-4 items-center"
            onPress={() =>
              Alert.alert(
                "Legal",
                `${ARENA_CONFIG.legal.disclaimer}\n\nTerms, Privacy Policy and Fair Play Policy screens are part of Phase 6.`,
              )
            }
          >
            <Text className="text-xs text-slate-500 underline">Terms · Privacy · Fair Play</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
