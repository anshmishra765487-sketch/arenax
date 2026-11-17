import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { Button, Card, Screen, SectionTitle, Spinner } from "../../src/components/ui";
import { useAuth } from "../../src/features/auth/useAuth";
import { supabase } from "../../src/lib/supabase";
import type { Achievement } from "../../src/lib/types";
import { formatDateTime } from "../../src/lib/utils";

interface UnlockedRow {
  achievement_id: string;
  unlocked_at: string;
}

export default function AchievementsScreen() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: all }, { data: mine }] = await Promise.all([
      supabase.from("achievements").select("*").order("xp_reward", { ascending: true }),
      supabase.from("user_achievements").select("achievement_id, unlocked_at").eq("user_id", user.id),
    ]);

    const map: Record<string, string> = {};
    ((mine ?? []) as UnlockedRow[]).forEach((row) => {
      map[row.achievement_id] = row.unlocked_at;
    });

    setAchievements((all ?? []) as Achievement[]);
    setUnlocked(map);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function claimDaily() {
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_daily_login");
    setClaiming(false);

    if (error) {
      Alert.alert("Could not claim", error.message);
      return;
    }

    const result = (data ?? {}) as {
      ok?: boolean;
      already_claimed?: boolean;
      streak?: number;
      xp?: number;
      error?: string;
    };

    if (!result.ok) {
      Alert.alert("Could not claim", (result.error ?? "Try again later").replace(/_/g, " "));
      return;
    }

    await refreshProfile();
    Alert.alert(
      result.already_claimed ? "Already claimed today" : "Daily bonus claimed",
      result.already_claimed
        ? `Come back tomorrow. Current streak: ${profile?.streak_days ?? 0} days.`
        : `+10 XP · ${result.streak ?? 1} day streak.`,
    );
  }

  return (
    <Screen className="px-0">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm font-semibold text-brand-300">← Back</Text>
        </Pressable>
        <Text className="text-base font-semibold text-white">Achievements</Text>
        <View className="w-10" />
      </View>

      {loading ? (
        <Spinner label="Loading achievements…" />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}>
          <Card className="border-brand-500/30 bg-brand-500/10">
            <Text className="text-xs uppercase tracking-widest text-brand-200">Your progress</Text>
            <Text className="mt-1 text-3xl font-black text-white">Level {profile?.level ?? 1}</Text>
            <Text className="mt-1 text-xs text-brand-200/70">
              {profile?.xp ?? 0} XP · {Object.keys(unlocked).length} / {achievements.length} unlocked
            </Text>
            <Button
              title="Claim daily bonus"
              onPress={claimDaily}
              loading={claiming}
              className="mt-4"
            />
          </Card>

          <SectionTitle>Achievements</SectionTitle>
          {achievements.map((achievement) => {
            const unlockedAt = unlocked[achievement.id];
            return (
              <View
                key={achievement.id}
                className={
                  unlockedAt
                    ? "mb-2 flex-row items-center rounded-xl border border-amber-500/40 bg-amber-500/10 p-3"
                    : "mb-2 flex-row items-center rounded-xl border border-slate-800 bg-slate-900/60 p-3 opacity-70"
                }
              >
                <Text className="text-2xl">{achievement.icon}</Text>
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-semibold text-white">{achievement.name}</Text>
                  <Text className="text-[11px] leading-4 text-slate-400">
                    {achievement.description}
                  </Text>
                  {unlockedAt ? (
                    <Text className="mt-1 text-[10px] text-amber-300">
                      Unlocked {formatDateTime(unlockedAt)}
                    </Text>
                  ) : null}
                </View>
                <Text className="text-xs font-bold text-brand-300">+{achievement.xp_reward} XP</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}
