import ARENA_CONFIG from "@arenax/config";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { z } from "zod";

import { Badge, Button, Card, Chip, EmptyState, Input, Screen, SectionTitle, Spinner } from "../../src/components/ui";
import { useAuth } from "../../src/features/auth/useAuth";
import { supabase } from "../../src/lib/supabase";
import type { Scrim } from "../../src/lib/types";
import { formatDateTime, gameLabel } from "../../src/lib/utils";

const scrimSchema = z.object({
  teamName: z.string().trim().min(2, "Team name needs 2+ characters").max(40),
  description: z.string().trim().max(500).optional(),
});

const TIME_PRESETS = [
  { id: "1h", label: "In 1 hour", hours: 1 },
  { id: "3h", label: "In 3 hours", hours: 3 },
  { id: "tonight", label: "Tonight 9 PM", hours: null },
  { id: "tomorrow", label: "Tomorrow 9 PM", hours: null },
] as const;

function resolveStart(preset: (typeof TIME_PRESETS)[number]["id"]): string {
  const now = new Date();
  if (preset === "1h") return new Date(now.getTime() + 60 * 60_000).toISOString();
  if (preset === "3h") return new Date(now.getTime() + 3 * 60 * 60_000).toISOString();

  const target = new Date(now);
  target.setHours(21, 0, 0, 0);
  if (preset === "tomorrow" || target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.toISOString();
}

export default function ScrimsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const [scrims, setScrims] = useState<Scrim[]>([]);
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<string>(ARENA_CONFIG.games[0].id);
  const [preset, setPreset] = useState<(typeof TIME_PRESETS)[number]["id"]>("1h");
  const [teamName, setTeamName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("scrims")
      .select("*")
      .eq("status", "open")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(50);

    if (loadError) setError(loadError.message);
    setScrims((data ?? []) as Scrim[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (profile?.username && teamName.length === 0) setTeamName(`${profile.username} squad`);
  }, [profile?.username]);

  const mine = useMemo(() => scrims.filter((scrim) => scrim.posted_by === user?.id), [scrims, user]);

  async function postScrim() {
    setError(null);
    if (!user) return;

    const parsed = scrimSchema.safeParse({ teamName, description });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid scrim details");
      return;
    }

    setBusy(true);
    const { error: insertError } = await supabase.from("scrims").insert({
      posted_by: user.id,
      game_id: game,
      team_name: parsed.data.teamName,
      description: parsed.data.description || null,
      scheduled_at: resolveStart(preset),
      slots: 1,
      status: "open",
    });
    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setDescription("");
    await load();
    Alert.alert("Scrim posted", "Other captains can now apply from the scrim finder.");
  }

  async function apply(scrim: Scrim) {
    if (!user) return;
    if (scrim.posted_by === user.id) {
      Alert.alert("This is your scrim", "Share the scrim with another captain to get applicants.");
      return;
    }

    const { data, error: rpcError } = await supabase
      .from("scrim_applications")
      .insert({ scrim_id: scrim.id, applicant_id: user.id, message: "Interested — let's play." })
      .select("scrim_id")
      .maybeSingle();

    if (rpcError) {
      Alert.alert(
        "Could not apply",
        rpcError.code === "23505" ? "You already applied to this scrim." : rpcError.message,
      );
      return;
    }

    if (data) Alert.alert("Application sent", "The captain will see your request in their scrim list.");
  }

  async function cancel(scrim: Scrim) {
    await supabase.from("scrims").update({ status: "cancelled" }).eq("id", scrim.id);
    await load();
  }

  return (
    <Screen className="px-0">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm font-semibold text-brand-300">← Back</Text>
        </Pressable>
        <Text className="text-base font-semibold text-white">Scrim finder</Text>
        <View className="w-10" />
      </View>

      {loading ? (
        <Spinner label="Loading scrims…" />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}>
          {error ? <Text className="mb-2 text-sm text-red-400">{error}</Text> : null}

          <SectionTitle>Open scrims</SectionTitle>
          {scrims.length === 0 ? (
            <EmptyState
              title="No open scrims"
              description="Post one below to find a practice opponent for tonight."
            />
          ) : (
            scrims.map((scrim) => (
              <Card key={scrim.id} className="mb-2">
                <View className="flex-row items-center justify-between">
                  <View className="mr-2 rounded-lg bg-slate-800 px-2 py-1">
                    <Text className="text-[10px] font-bold uppercase text-slate-300">
                      {gameLabel(scrim.game_id)}
                    </Text>
                  </View>
                  <Badge status="upcoming" label={scrim.posted_by === user?.id ? "Your scrim" : "Open"} />
                </View>
                <Text className="mt-2 text-base font-bold text-white">{scrim.team_name}</Text>
                <Text className="mt-1 text-xs text-slate-500">
                  {formatDateTime(scrim.scheduled_at)}
                </Text>
                {scrim.description ? (
                  <Text className="mt-2 text-sm leading-5 text-slate-300">{scrim.description}</Text>
                ) : null}
                <View className="mt-3 flex-row">
                  {scrim.posted_by === user?.id ? (
                    <Button title="Cancel scrim" variant="outline" onPress={() => void cancel(scrim)} />
                  ) : (
                    <Button title="Apply to scrim" onPress={() => void apply(scrim)} />
                  )}
                </View>
              </Card>
            ))
          )}

          {mine.length > 0 ? (
            <Text className="mt-4 text-[11px] text-slate-500">
              {mine.length} scrim{mine.length === 1 ? "" : "s"} posted by you.
            </Text>
          ) : null}

          <SectionTitle>Post a scrim</SectionTitle>
          <Card className="mb-4">
            <View className="mb-3 flex-row flex-wrap">
              {ARENA_CONFIG.games.map((item) => (
                <Chip
                  key={item.id}
                  label={item.shortName}
                  active={game === item.id}
                  onPress={() => setGame(item.id)}
                />
              ))}
            </View>

            <Input label="Team name" value={teamName} onChangeText={setTeamName} maxLength={40} />
            <Input
              label="Notes (optional)"
              value={description}
              onChangeText={setDescription}
              maxLength={500}
              multiline
              placeholder="Practice match, 2 games, no pro teams"
            />

            <View className="mb-3 flex-row flex-wrap">
              {TIME_PRESETS.map((item) => (
                <Chip
                  key={item.id}
                  label={item.label}
                  active={preset === item.id}
                  onPress={() => setPreset(item.id)}
                />
              ))}
            </View>

            <Button title="Post scrim" onPress={postScrim} loading={busy} />
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}
