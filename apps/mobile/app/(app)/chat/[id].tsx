import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { Badge, Screen, Spinner } from "../../../src/components/ui";
import { useAuth } from "../../../src/features/auth/useAuth";
import { isProfane } from "@arenax/core";
import { supabase } from "../../../src/lib/supabase";
import type { ChatMessage } from "../../../src/lib/types";
import { formatTime } from "../../../src/lib/utils";

export default function TournamentChatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error: loadError } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("tournament_id", id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(200);

    if (loadError) setError(loadError.message);

    const rows = (data ?? []) as ChatMessage[];
    const ids = [...new Set(rows.map((message) => message.user_id))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, username")
        .in("id", ids);
      const names = new Map((profiles ?? []).map((row) => [row.id, row.username as string]));
      rows.forEach((message) => {
        message.username = names.get(message.user_id) ?? "Player";
      });
    }

    setMessages(rows);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`chat:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `tournament_id=eq.${id}` },
        async (payload) => {
          const message = payload.new as ChatMessage;
          if (message.is_deleted) return;

          const { data: profile } = await supabase
            .from("public_profiles")
            .select("username")
            .eq("id", message.user_id)
            .maybeSingle();

          setMessages((current) => [
            ...current,
            { ...message, username: profile?.username ?? "Player" },
          ]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  async function send() {
    if (!id) return;
    const text = body.trim();
    if (text.length < 1) return;
    if (isProfane(text)) {
      setError("Keep it clean — abusive language is filtered and can earn a strike.");
      return;
    }

    setError(null);
    setSending(true);
    const { error: rpcError } = await supabase.rpc("send_chat_message", {
      p_tournament_id: id,
      p_body: text,
      p_is_announcement: false,
    });
    setSending(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setBody("");
  }

  return (
    <Screen className="px-0">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm font-semibold text-brand-300">← Back</Text>
        </Pressable>
        <Text className="text-base font-semibold text-white">Match chat</Text>
        <View className="w-10" />
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {loading ? (
          <Spinner label="Loading chat…" />
        ) : (
          <ScrollView
            ref={scrollRef}
            className="flex-1 px-4"
            contentContainerStyle={{ paddingBottom: 12 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <Text className="mt-8 text-center text-sm text-slate-500">
                No messages yet. Say gg to your lobby.
              </Text>
            ) : (
              messages.map((message) => {
                const mine = message.user_id === user?.id;
                return (
                  <View
                    key={message.id}
                    className={
                      message.is_announcement
                        ? "mb-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3"
                        : mine
                          ? "mb-2 self-end rounded-xl rounded-br-sm bg-brand-500/80 px-3 py-2"
                          : "mb-2 self-start rounded-xl rounded-bl-sm bg-slate-800 px-3 py-2"
                    }
                  >
                    {message.is_announcement ? (
                      <Badge label="Announcement" status="waitlisted" />
                    ) : (
                      <Text
                        className={
                          mine
                            ? "text-[10px] font-semibold text-brand-100"
                            : "text-[10px] font-semibold text-slate-400"
                        }
                      >
                        {mine ? "You" : message.username ?? "Player"}
                      </Text>
                    )}
                    <Text
                      className={mine ? "mt-0.5 text-sm leading-5 text-white" : "mt-0.5 text-sm leading-5 text-slate-200"}
                    >
                      {message.body}
                    </Text>
                    <Text className={mine ? "mt-1 text-[9px] text-brand-200/70" : "mt-1 text-[9px] text-slate-500"}>
                      {formatTime(message.created_at)}
                    </Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {error ? <Text className="px-4 pb-1 text-xs text-red-400">{error}</Text> : null}

        <View className="flex-row items-end border-t border-slate-800 px-4 py-3">
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Message your lobby…"
            placeholderTextColor="#64748B"
            maxLength={500}
            multiline
            className="mr-2 max-h-24 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
          />
          <Pressable
            onPress={send}
            disabled={sending || body.trim().length === 0}
            className={
              sending || body.trim().length === 0
                ? "h-10 items-center justify-center rounded-xl bg-slate-800 px-4 opacity-60"
                : "h-10 items-center justify-center rounded-xl bg-brand-500 px-4"
            }
          >
            <Text className="text-sm font-semibold text-white">{sending ? "…" : "Send"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
