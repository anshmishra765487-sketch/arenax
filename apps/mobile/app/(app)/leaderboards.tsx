import ARENA_CONFIG from "@arenax/config";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";

import { Chip, EmptyState, Screen, Spinner } from "../../src/components/ui";
import { supabase } from "../../src/lib/supabase";
import type { LeaderboardEntry } from "../../src/lib/types";
import { gameLabel } from "../../src/lib/utils";

type Scope = "weekly" | "monthly" | "all_time";

interface Row extends LeaderboardEntry {
  username?: string;
}

export default function LeaderboardsScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("weekly");
  const [game, setGame] = useState<string>(ARENA_CONFIG.games[0].id);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("leaderboards")
      .select("*")
      .eq("scope", scope)
      .eq("game_id", game)
      .order("points", { ascending: false })
      .limit(200);

    const entries = (data ?? []) as LeaderboardEntry[];

    // Aggregate across period rows for all-time / weekly / monthly scopes.
    const aggregated = new Map<string, LeaderboardEntry>();
    for (const entry of entries) {
      if (!entry.player_id) continue;
      const existing = aggregated.get(entry.player_id);
      if (existing) {
        existing.points += entry.points;
        existing.kills += entry.kills;
        existing.matches_played += entry.matches_played;
        existing.wins += entry.wins;
      } else {
        aggregated.set(entry.player_id, { ...entry });
      }
    }

    const list = [...aggregated.values()]
      .sort((a, b) => b.points - a.points)
      .slice(0, 50);

    const ids = list.map((entry) => entry.player_id).filter(Boolean) as string[];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, username")
        .in("id", ids);
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]));
      list.forEach((entry) => {
        entry.username = names.get(entry.player_id ?? "") ?? "Player";
      });
    }

    setRows(list as Row[]);
    setLoading(false);
  }, [scope, game]);

  useEffect(() => {
    void load();
  }, [load]);

  const subtitle = useMemo(
    () => `${gameLabel(game)} · ${scope.replace("_", " ")}`,
    [game, scope],
  );

  return (
    <Screen className="px-0">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm font-semibold text-brand-300">← Back</Text>
        </Pressable>
        <Text className="text-base font-semibold text-white">Leaderboards</Text>
        <View className="w-10" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {(["weekly", "monthly", "all_time"] as Scope[]).map((value) => (
          <Chip
            key={value}
            label={value === "all_time" ? "All time" : value === "weekly" ? "This week" : "This month"}
            active={scope === value}
            onPress={() => setScope(value)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
      >
        {ARENA_CONFIG.games.map((item) => (
          <Chip
            key={item.id}
            label={item.shortName}
            active={game === item.id}
            onPress={() => setGame(item.id)}
          />
        ))}
      </ScrollView>

      <Text className="px-4 pb-2 text-xs uppercase tracking-widest text-slate-500">{subtitle}</Text>

      {loading ? (
        <Spinner />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.player_id ?? item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          ListEmptyComponent={
            <EmptyState
              title="No results yet"
              description="Leaderboards update automatically after organizers verify results."
            />
          }
          renderItem={({ item, index }) => (
            <View className="mb-2 flex-row items-center rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <Text
                className={
                  index < 3
                    ? "w-8 text-center text-base font-black text-amber-300"
                    : "w-8 text-center text-sm font-bold text-slate-500"
                }
              >
                {index + 1}
              </Text>
              <View className="ml-2 flex-1">
                <Text className="text-sm font-semibold text-white">
                  {item.username ?? "Player"}
                </Text>
                <Text className="text-[11px] text-slate-500">
                  {item.matches_played} matches · {item.kills} kills · {item.wins} wins
                </Text>
              </View>
              <Text className="text-lg font-black text-brand-300">{item.points}</Text>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
