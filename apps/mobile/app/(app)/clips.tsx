import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";

import { Button, Card, EmptyState, Input, Screen, SectionTitle, Spinner } from "../../src/components/ui";
import { useAuth } from "../../src/features/auth/useAuth";
import { track, EVENTS } from "../../src/lib/analytics";
import { supabase } from "../../src/lib/supabase";
import { guessContentType, uploadLocalFile } from "../../src/lib/storage";
import type { Clip } from "../../src/lib/types";
import { formatDateTime } from "../../src/lib/utils";

export default function ClipsScreen() {
  const router = useRouter();
  const { tournamentId } = useLocalSearchParams<{ tournamentId?: string }>();
  const { user } = useAuth();

  const [clips, setClips] = useState<Clip[]>([]);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("clips")
      .select("*")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Clip[];
    const ids = [...new Set(rows.map((clip) => clip.user_id))];

    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, username")
        .in("id", ids);
      const names = new Map((profiles ?? []).map((row) => [row.id, row.username as string]));
      rows.forEach((clip) => {
        clip.username = names.get(clip.user_id) ?? "Player";
      });
    }

    if (user) {
      const { data: likes } = await supabase
        .from("clip_likes")
        .select("clip_id")
        .eq("user_id", user.id);
      const map: Record<string, boolean> = {};
      (likes ?? []).forEach((row) => {
        map[row.clip_id as string] = true;
      });
      setLiked(map);
    }

    setClips(rows);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function pickAndUpload() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload a highlight clip.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 0.7,
      videoMaxDuration: 60,
    });

    if (result.canceled || !result.assets[0]) return;
    if (!user) return;

    const asset = result.assets[0];
    const sizeMb = (asset.fileSize ?? 0) / (1024 * 1024);
    if (asset.fileSize && sizeMb > 25) {
      Alert.alert("Clip too large", "Keep highlights under 25 MB (about 60 seconds).");
      return;
    }

    setUploading(true);
    const filename = `${Date.now()}.${(asset.uri.split(".").pop() ?? "mp4").toLowerCase()}`;
    const uploaded = await uploadLocalFile({
      bucket: "clips",
      folder: user.id,
      filename,
      uri: asset.uri,
      contentType: guessContentType(asset.uri, "video/mp4"),
    });

    if (uploaded.error || !uploaded.publicUrl) {
      setUploading(false);
      Alert.alert("Upload failed", uploaded.error ?? "Try a smaller clip.");
      return;
    }

    const { error: insertError } = await supabase.from("clips").insert({
      user_id: user.id,
      tournament_id: tournamentId ?? null,
      video_url: uploaded.publicUrl,
      caption: caption.trim() || null,
      status: "pending",
    });

    setUploading(false);

    if (insertError) {
      Alert.alert("Could not save clip", insertError.message);
      return;
    }

    setCaption("");
    track(EVENTS.clipUploaded, { tournamentId: tournamentId ?? null });
    Alert.alert("Clip submitted", "Highlights are reviewed by moderators before appearing publicly.");
    await load();
  }

  async function toggleLike(clip: Clip) {
    const { data, error } = await supabase.rpc("toggle_clip_like", { p_clip_id: clip.id });
    if (error) return;

    const result = (data ?? {}) as { liked?: boolean };
    setLiked((current) => ({ ...current, [clip.id]: Boolean(result.liked) }));
    setClips((current) =>
      current.map((item) =>
        item.id === clip.id
          ? { ...item, likes_count: Math.max(0, item.likes_count + (result.liked ? 1 : -1)) }
          : item,
      ),
    );
  }

  return (
    <Screen className="px-0">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm font-semibold text-brand-300">← Back</Text>
        </Pressable>
        <Text className="text-base font-semibold text-white">Clips & highlights</Text>
        <View className="w-10" />
      </View>

      {loading ? (
        <Spinner label="Loading clips…" />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}>
          {clips.length === 0 ? (
            <EmptyState
              title="No clips yet"
              description="Upload your best play. Clips are reviewed before they appear here."
            />
          ) : (
            clips.map((clip) => (
              <Card key={clip.id} className="mb-3">
                <View className="h-40 items-center justify-center rounded-xl bg-slate-950">
                  {clip.thumbnail_url ? (
                    <Image source={{ uri: clip.thumbnail_url }} className="h-40 w-full rounded-xl" />
                  ) : (
                    <Text className="text-4xl">🎬</Text>
                  )}
                </View>
                <Text className="mt-2 text-sm font-semibold text-white">
                  {clip.caption ?? "Untitled clip"}
                </Text>
                <Text className="mt-1 text-[11px] text-slate-500">
                  {clip.username ?? "Player"} · {formatDateTime(clip.created_at)}
                </Text>
                <View className="mt-3 flex-row items-center justify-between">
                  <Pressable onPress={() => void toggleLike(clip)} hitSlop={8} className="flex-row items-center">
                    <Text className="text-base">{liked[clip.id] ? "❤️" : "🤍"}</Text>
                    <Text className="ml-2 text-xs text-slate-400">{clip.likes_count} likes</Text>
                  </Pressable>
                  <Text className="text-[11px] text-slate-600">
                    {clip.status === "approved" ? "Published" : "In review"}
                  </Text>
                </View>
              </Card>
            ))
          )}

          <SectionTitle>Upload a highlight</SectionTitle>
          <Card className="mb-4">
            <Text className="text-sm text-slate-400">
              Up to 60 seconds, 25 MB. No cheats, no third-party overlays, no abusive content.
            </Text>
            <Input
              label="Caption (optional)"
              value={caption}
              onChangeText={setCaption}
              maxLength={200}
              placeholder="1v4 clutch in the final circle"
            />
            <Button title="Choose video" variant="outline" onPress={pickAndUpload} loading={uploading} />
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}
