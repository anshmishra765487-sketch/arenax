import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { EmptyState, Screen, Spinner } from "../../src/components/ui";
import { useAuth } from "../../src/features/auth/useAuth";
import { fetchNotifications } from "../../src/lib/api";
import { supabase } from "../../src/lib/supabase";
import type { AppNotification } from "../../src/lib/types";
import { formatDateTime } from "../../src/lib/utils";

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setItems(await fetchNotifications(user.id));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setItems((current) => [payload.new as AppNotification, ...current].slice(0, 50));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  async function open(notification: AppNotification) {
    if (!notification.read) {
      setItems((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
      );
      await supabase.from("notifications").update({ read: true }).eq("id", notification.id);
    }
    const tournamentId = notification.payload?.tournament_id;
    if (typeof tournamentId === "string") {
      router.push({ pathname: "/tournament/[id]", params: { id: tournamentId } });
    }
  }

  return (
    <Screen className="px-0">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm font-semibold text-brand-300">← Back</Text>
        </Pressable>
        <Text className="text-base font-semibold text-white">Notifications</Text>
        <View className="w-10" />
      </View>

      {loading ? (
        <Spinner label="Loading notifications…" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          ListEmptyComponent={
            <EmptyState
              title="You're all caught up"
              description="Registration confirmations, room reveals and result updates land here."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void open(item)}
              className={
                item.read
                  ? "mb-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4"
                  : "mb-2 rounded-xl border border-brand-500/40 bg-brand-500/10 p-4"
              }
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-white">{item.title}</Text>
                {!item.read ? <View className="h-2 w-2 rounded-full bg-brand-400" /> : null}
              </View>
              <Text className="mt-1 text-sm leading-5 text-slate-300">{item.body}</Text>
              <Text className="mt-2 text-[11px] text-slate-500">
                {formatDateTime(item.created_at)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
