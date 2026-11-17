import ARENA_CONFIG from "@arenax/config";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { z } from "zod";

import { Badge, Button, Card, Chip, Input, SectionTitle, Spinner } from "../../src/components/ui";
import { useAuth } from "../../src/features/auth/useAuth";
import { useProfile } from "../../src/features/profiles/useProfile";
import { supabase } from "../../src/lib/supabase";
import { gameLabel, isValidInGameId } from "../../src/lib/utils";

const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_]{3,20}$/, "3–20 characters: letters, numbers, underscore");

const displayNameSchema = z.string().trim().max(40, "Keep it under 40 characters");

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, refreshProfile } = useAuth();
  const { profile, gameAccounts, loading, updateProfile, upsertGameAccount } = useProfile(
    user?.id,
  );

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [selectedGame, setSelectedGame] = useState<string>(ARENA_CONFIG.games[0].id);
  const [uid, setUid] = useState("");
  const [uidError, setUidError] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  const [referralInput, setReferralInput] = useState("");
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username);
    setDisplayName(profile.display_name ?? "");
  }, [profile?.id, profile?.username, profile?.display_name]);

  const selectedGameMeta = useMemo(
    () => ARENA_CONFIG.games.find((game) => game.id === selectedGame),
    [selectedGame],
  );

  useEffect(() => {
    const existing = gameAccounts.find((account) => account.game_id === selectedGame);
    setUid(existing?.game_uid ?? "");
    setUidError(null);
  }, [selectedGame, gameAccounts]);

  if (loading && !profile) {
    return (
      <View className="flex-1 bg-slate-950">
        <Spinner label="Loading profile…" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-950 px-6">
        <Text className="text-center text-base font-semibold text-slate-200">
          Profile not found. Please sign in again.
        </Text>
      </View>
    );
  }

  async function saveIdentity() {
    setFormError(null);
    setMessage(null);

    const parsedUsername = usernameSchema.safeParse(username);
    if (!parsedUsername.success) {
      setFormError(parsedUsername.error.issues[0]?.message ?? "Invalid username");
      return;
    }

    const parsedDisplay = displayNameSchema.safeParse(displayName);
    if (!parsedDisplay.success) {
      setFormError(parsedDisplay.error.issues[0]?.message ?? "Invalid display name");
      return;
    }

    setSaving(true);
    const result = await updateProfile({
      username: parsedUsername.data,
      display_name: parsedDisplay.data || null,
    });
    setSaving(false);

    if (result.error) {
      setFormError(
        result.error.includes("duplicate") ? "That username is already taken." : result.error,
      );
      return;
    }
    setMessage("Profile updated.");
  }

  async function changeLanguage(language: "en" | "hi") {
    if (profile?.language === language) return;
    const result = await updateProfile({ language });
    if (result.error) {
      Alert.alert("Could not change language", result.error);
    }
  }

  async function saveGameAccount() {
    setUidError(null);
    setMessage(null);

    if (!isValidInGameId(selectedGame, uid)) {
      setUidError(`Enter a valid ${selectedGameMeta?.shortName} ID. ${selectedGameMeta?.uidHint ?? ""}`);
      return;
    }

    setSavingAccount(true);
    const result = await upsertGameAccount(selectedGame, uid);
    setSavingAccount(false);

    if (result.error) {
      setUidError(result.error);
      return;
    }
    setMessage(`${selectedGameMeta?.shortName} ID saved.`);
  }

  async function redeemReferralCode() {
    setReferralMessage(null);
    const code = referralInput.trim().toUpperCase();
    if (code.length < 4) {
      setReferralMessage("Enter a valid referral code.");
      return;
    }

    setReferralBusy(true);
    const { data, error } = await supabase.rpc("redeem_referral", { p_code: code });
    setReferralBusy(false);

    if (error) {
      setReferralMessage(error.message);
      return;
    }

    const result = (data ?? {}) as { ok?: boolean; error?: string };
    if (!result.ok) {
      const messages: Record<string, string> = {
        already_referred: "You have already redeemed a referral code.",
        invalid_code: "That code does not exist (or it is your own).",
      };
      setReferralMessage(messages[result.error ?? ""] ?? "Could not redeem this code.");
      return;
    }

    setReferralInput("");
    setReferralMessage("Referral applied — +75 XP for you and your friend.");
    await refreshProfile();
  }

  const maskedPhone = profile.phone
    ? profile.phone.replace(/^(\+91)(\d{2})\d{4}(\d{4})$/, "$1 $2****$3")
    : "Not linked";

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-950"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text className="text-sm font-semibold text-brand-300">← Back</Text>
          </Pressable>
          <Text className="text-sm font-semibold text-slate-300">Profile</Text>
          <View className="w-10" />
        </View>

        <View className="px-4">
          {/* Identity card */}
          <Card className="mt-2 flex-row items-center">
            <View className="h-14 w-14 items-center justify-center rounded-full border border-brand-400/40 bg-brand-500/20">
              <Text className="text-xl font-black text-brand-200">
                {profile.username.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-base font-bold text-white">{profile.username}</Text>
              <Text className="text-xs text-slate-500">
                {profile.display_name ?? "No display name"} · {maskedPhone}
              </Text>
              <View className="mt-2 flex-row">
                <Badge label={profile.role.replace(/_/g, " ")} status="confirmed" />
              </View>
            </View>
          </Card>

          <Card className="mt-3">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-xs uppercase tracking-widest text-slate-500">Level</Text>
                <Text className="text-2xl font-black text-white">{profile.level ?? 1}</Text>
                <Text className="text-[11px] text-slate-500">{profile.xp ?? 0} XP</Text>
              </View>
              <View className="items-end">
                <Text className="text-xs uppercase tracking-widest text-slate-500">Trust score</Text>
                <Text
                  className={
                    (profile.trust_score ?? 80) >= 60
                      ? "text-2xl font-black text-emerald-400"
                      : "text-2xl font-black text-red-400"
                  }
                >
                  {profile.trust_score ?? 80}
                </Text>
                <Text className="text-[11px] text-slate-500">
                  {(profile.trust_score ?? 80) >= 60 ? "Good standing" : "Registrations blocked"}
                </Text>
              </View>
            </View>
            {profile.is_banned ? (
              <Text className="mt-3 text-xs font-semibold text-red-400">
                This account is restricted. Contact {ARENA_CONFIG.supportEmail} to appeal.
              </Text>
            ) : null}
          </Card>

          {message ? (
            <Text className="mt-3 text-sm text-emerald-400">{message}</Text>
          ) : null}

          {/* Identity edit */}
          <SectionTitle>Account</SectionTitle>
          <Card>
            <Input
              label="Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              error={formError ?? undefined}
            />
            <Input
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={40}
              placeholder="How your name appears to teammates"
            />
            <Button title="Save profile" onPress={saveIdentity} loading={saving} />
          </Card>

          {/* Language */}
          <SectionTitle>Language</SectionTitle>
          <View className="flex-row">
            {ARENA_CONFIG.languages.map((language) => (
              <Chip
                key={language.code}
                label={language.label}
                active={profile.language === language.code}
                onPress={() => void changeLanguage(language.code)}
              />
            ))}
          </View>

          {/* Game accounts */}
          <SectionTitle>In-game IDs</SectionTitle>
          <Card>
            <Text className="text-sm text-slate-400">
              These IDs are used to build custom rooms. They are only shared with the organizer of
              tournaments you join — never publicly.
            </Text>

            <View className="mt-3">
              {ARENA_CONFIG.games.map((game) => {
                const account = gameAccounts.find((item) => item.game_id === game.id);
                return (
                  <Pressable
                    key={game.id}
                    onPress={() => setSelectedGame(game.id)}
                    className={
                      selectedGame === game.id
                        ? "mb-2 flex-row items-center justify-between rounded-xl border border-brand-400/50 bg-brand-500/10 px-3 py-2.5"
                        : "mb-2 flex-row items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5"
                    }
                  >
                    <View>
                      <Text className="text-sm font-semibold text-slate-200">
                        {game.shortName}
                      </Text>
                      <Text className="text-[11px] text-slate-500">{game.publisher}</Text>
                    </View>
                    <Text
                      className={
                        account ? "text-xs font-medium text-emerald-300" : "text-xs text-slate-600"
                      }
                    >
                      {account ? account.game_uid : "Not linked"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Input
              label={`${selectedGameMeta?.shortName ?? "Game"} ID`}
              value={uid}
              onChangeText={setUid}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={selectedGameMeta?.uidHint}
              hint={selectedGameMeta?.uidHint}
              error={uidError ?? undefined}
            />
            <Button
              title="Save in-game ID"
              variant="outline"
              onPress={saveGameAccount}
              loading={savingAccount}
            />
          </Card>

          {/* Linked accounts summary */}
          <SectionTitle>Linked accounts</SectionTitle>
          <Card>
            <Text className="text-xs leading-5 text-slate-500">
              {gameAccounts.length === 0
                ? "No in-game IDs linked yet. Add one above to register for tournaments."
                : gameAccounts
                    .map((account) => `${gameLabel(account.game_id)} · ${account.game_uid}`)
                    .join("\n")}
            </Text>
          </Card>

          {/* Referrals */}
          <SectionTitle>Refer a friend</SectionTitle>
          <Card>
            <Text className="text-xs leading-5 text-slate-500">
              Your code: {profile.referral_code ?? "—"} (cosmetic XP only — no cash value).
            </Text>
            <View className="mt-3">
              <Input
                label="Have a friend's code?"
                value={referralInput}
                onChangeText={(value) => setReferralInput(value.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                placeholder="AX1A2B3C4"
              />
              <Button
                title="Redeem code"
                variant="outline"
                onPress={redeemReferralCode}
                loading={referralBusy}
              />
            </View>
            {profile.referral_code ? (
              <Button
                title="Share my code"
                variant="ghost"
                className="mt-1"
                onPress={() =>
                  void Share.share({
                    message: `Join me on ${ARENA_CONFIG.appName} — free-entry esports tournaments. Use my code ${profile.referral_code}.`,
                  })
                }
              />
            ) : null}
            {referralMessage ? (
              <Text className="mt-2 text-xs text-brand-300">{referralMessage}</Text>
            ) : null}
          </Card>

          {/* More */}
          <SectionTitle>More</SectionTitle>
          <Card>
            {[
              { label: "My teams", href: "/teams" },
              { label: "Achievements & daily bonus", href: "/achievements" },
              { label: "Leaderboards", href: "/leaderboards" },
              { label: "Scrim finder", href: "/scrims" },
              { label: "Clips & highlights", href: "/clips" },
              { label: "ArenaX VIP", href: "/vip" },
              { label: "Legal & fair play", href: "/legal" },
            ].map((item) => (
              <Pressable
                key={item.href}
                onPress={() => router.push(item.href as never)}
                className="flex-row items-center justify-between border-b border-slate-800 py-3"
              >
                <Text className="text-sm text-slate-200">{item.label}</Text>
                <Text className="text-slate-600">›</Text>
              </Pressable>
            ))}
          </Card>

          {/* Session */}
          <SectionTitle>Session</SectionTitle>
          <Button
            title="Sign out"
            variant="outline"
            onPress={() =>
              Alert.alert("Sign out?", "You can sign back in with phone OTP anytime.", [
                { text: "Stay", style: "cancel" },
                {
                  text: "Sign out",
                  style: "destructive",
                  onPress: async () => {
                    await signOut();
                    router.replace("/login");
                  },
                },
              ])
            }
          />

          <Text className="mt-8 text-center text-[11px] leading-4 text-slate-600">
            {ARENA_CONFIG.legal.disclaimer}
          </Text>
          <Text className="mt-2 text-center text-[11px] leading-4 text-slate-600">
            {ARENA_CONFIG.legal.parentalConsentNote}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
