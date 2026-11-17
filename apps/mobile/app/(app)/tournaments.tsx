import ARENA_CONFIG from "@arenax/config";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

import { Badge, Card, Chip, EmptyState, Spinner } from "../../src/components/ui";
import { useAuth } from "../../src/features/auth/useAuth";
import { fetchTournaments } from "../../src/lib/api";
import type { Tournament } from "../../src/lib/types";
import {
  countdownLabel,
  formatDateTime,
  gameLabel,
  getCountdown,
  isRegistrationClosed,
} from "../../src/lib/utils";

export default function TournamentsScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameFilter, setGameFilter] = useState<string>("all");
  const [freeSlotsOnly, setFreeSlotsOnly] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchTournaments();
      setTournaments(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load tournaments");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible = useMemo(() => {
    return tournaments
      .filter((tournament) => (gameFilter === "all" ? true : tournament.game_id === gameFilter))
      .filter((tournament) => (freeSlotsOnly ? tournament.slots_left > 0 : true))
      .sort((a, b) => {
        const rank: Record<string, number> = { live: 0, upcoming: 1, completed: 2, cancelled: 3 };
        const byStatus = (rank[a.status] ?? 4) - (rank[b.status] ?? 4);
        if (byStatus !== 0) return byStatus;
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      });
  }, [tournaments, gameFilter, freeSlotsOnly]);

  const initials = (profile?.username ?? "P").slice(0, 1).toUpperCase();

  const renderTournament = ({ item }: { item: Tournament }) => {
    const closed = isRegistrationClosed(item.start_time);
    const countdown = getCountdown(item.start_time);

    return (
      <Pressable
        className="mb-3"
        onPress={() =>
          router.push({ pathname: "/tournament/[id]", params: { id: item.id } })
        }
      >
        <Card>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className="mr-2 rounded-lg bg-brand-500/15 px-2 py-1">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-brand-300">
                  {gameLabel(item.game_id)}
                </Text>
              </View>
              <Text className="text-xs capitalize text-slate-500">{item.mode}</Text>
            </View>
            <Badge status={item.status} />
          </View>

          <Text className="mt-3 text-base font-bold text-white" numberOfLines={2}>
            {item.title}
          </Text>

          <View className="mt-3 flex-row items-center justify-between">
            <View>
              <Text className="text-xs text-slate-500">{formatDateTime(item.start_time)}</Text>
              <Text className="mt-0.5 text-xs text-slate-500">
                {item.slots_left} / {item.slots_total} slots left
                {item.prize_info ? " · Free entry" : ""}
              </Text>
            </View>

            <View className="items-end">
              {item.status === "upcoming" ? (
                <Text className="text-xs font-semibold text-brand-300">
                  {closed ? "Registration closed" : `Starts in ${countdownLabel(countdown)}`}
                </Text>
              ) : null}
              <Text className="mt-1 text-xs text-slate-600">
                {item.map ? `Map: ${item.map}` : "\u00A0"}
              </Text>
            </View>
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-slate-950">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <View>
          <Text className="text-2xl font-black text-white">{ARENA_CONFIG.appName}</Text>
          <Text className="text-xs text-slate-500">{ARENA_CONFIG.tagline}</Text>
        </View>

        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.push("/leaderboards")}
            className="mr-2 h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900/70"
          >
            <Text className="text-base">🏆</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/notifications")}
            className="mr-2 h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900/70"
          >
            <Text className="text-base">🔔</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/profile")}
            className="h-10 w-10 items-center justify-center rounded-full border border-brand-400/40 bg-brand-500/20"
          >
            <Text className="font-bold text-brand-200">{initials}</Text>
          </Pressable>
        </View>
      </View>

      <View className="pb-1">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
        >
          <Chip label="All games" active={gameFilter === "all"} onPress={() => setGameFilter("all")} />
          {ARENA_CONFIG.games.map((game) => (
            <Chip
              key={game.id}
              label={game.shortName}
              active={gameFilter === game.id}
              onPress={() => setGameFilter(game.id)}
            />
          ))}
          <Chip
            label="Free slots"
            active={freeSlotsOnly}
            onPress={() => setFreeSlotsOnly((value) => !value)}
          />
        </ScrollView>
      </View>

      {loading ? (
        <Spinner label="Loading tournaments…" />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderTournament}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor="#818CF8"
            />
          }
          ListEmptyComponent={
            error ? (
              <EmptyState
                title="Could not load tournaments"
                description={`${error}\n\nIf this is a fresh install, run the Supabase migrations and seed a tournament.`}
              />
            ) : (
              <EmptyState
                title="No tournaments yet"
                description="New free-entry tournaments appear here as soon as organizers publish them. Pull to refresh."
              />
            )
          }
        />
      )}
    </View>
  );
}
