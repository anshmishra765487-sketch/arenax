import { useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { Badge, Button, Card, Input, Screen, Spinner } from "../../../src/components/ui";
import { useAuth } from "../../../src/features/auth/useAuth";
import { track, EVENTS } from "../../../src/lib/analytics";
import { supabase } from "../../../src/lib/supabase";
import { guessContentType, uploadLocalFile } from "../../../src/lib/storage";
import type { Match } from "../../../src/lib/types";
import { formatDateTime } from "../../../src/lib/utils";

/**
 * Match room: players submit a result screenshot; the organizer reviews it in
 * the admin console. Evidence is hashed for duplicate detection (DB trigger).
 */
export default function MatchScreen() {
  const router = useRouter();
  const { id, tournamentId } = useLocalSearchParams<{ id: string; tournamentId?: string }>();
  const { user } = useAuth();

  const [match, setMatch] = useState<Match | null>(null);
  const [myRegistrationId, setMyRegistrationId] = useState<string | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [claim, setClaim] = useState<"home" | "away" | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [filingDispute, setFilingDispute] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;

    const { data: matchRow } = await supabase.from("matches").select("*").eq("id", id).maybeSingle();
    const parsed = (matchRow as Match | null) ?? null;
    setMatch(parsed);

    if (parsed && user) {
      const { data: registration } = await supabase
        .from("registrations")
        .select("id, status")
        .eq("tournament_id", parsed.tournament_id)
        .eq("player_id", user.id)
        .maybeSingle();

      const registrationId = (registration as { id: string } | null)?.id ?? null;
      setMyRegistrationId(registrationId);

      if (registrationId) {
        const { data: submission } = await supabase
          .from("result_submissions")
          .select("status")
          .eq("match_id", parsed.id)
          .eq("submitted_by", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setSubmissionStatus((submission as { status: string } | null)?.status ?? null);
      }
    }

    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitResult() {
    if (!match || !user || !myRegistrationId) return;
    if (!claim) {
      Alert.alert("Pick the winner", "Select which side won this match before uploading evidence.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to attach your result screenshot.");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });
    if (picked.canceled || !picked.assets[0]) return;

    const asset = picked.assets[0];
    const sizeMb = (asset.fileSize ?? 0) / (1024 * 1024);
    if (asset.fileSize && sizeMb > 5) {
      Alert.alert("Screenshot too large", "Keep evidence under 5 MB.");
      return;
    }

    setUploading(true);

    // Hash the file contents so reused screenshots are auto-detected.
    let hash: string | null = null;
    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
    } catch {
      hash = null;
    }

    const filename = `${Date.now()}.${(asset.uri.split(".").pop() ?? "jpg").toLowerCase()}`;
    const uploaded = await uploadLocalFile({
      bucket: "evidence",
      folder: user.id,
      filename,
      uri: asset.uri,
      contentType: guessContentType(asset.uri, "image/jpeg"),
    });

    if (uploaded.error || !uploaded.publicUrl) {
      setUploading(false);
      Alert.alert("Upload failed", uploaded.error ?? "Please try again.");
      return;
    }

    const winnerId =
      claim === "home" ? match.home_registration_id : match.away_registration_id;

    const { error } = await supabase.from("result_submissions").insert({
      tournament_id: match.tournament_id,
      match_id: match.id,
      submitted_by: user.id,
      screenshot_url: uploaded.publicUrl,
      screenshot_path: uploaded.path,
      screenshot_hash: hash,
      claimed_winner: winnerId,
      status: "pending",
    });

    setUploading(false);

    if (error) {
      Alert.alert("Could not submit result", error.message);
      return;
    }

    track(EVENTS.resultSubmitted, { matchId: match.id });
    setSubmissionStatus("pending");
    Alert.alert(
      "Result submitted",
      "The organizer will verify your screenshot. You'll get a notification when it is approved.",
    );
    await load();
  }

  async function fileDispute() {
    if (!match || !user) return;
    if (disputeReason.trim().length < 10) {
      Alert.alert("Add details", "Describe the issue in at least 10 characters.");
      return;
    }

    setFilingDispute(true);
    const { error } = await supabase.from("disputes").insert({
      tournament_id: match.tournament_id,
      opened_by: user.id,
      reason: disputeReason.trim(),
      status: "open",
    });
    setFilingDispute(false);

    if (error) {
      Alert.alert("Could not open dispute", error.message);
      return;
    }

    setDisputeReason("");
    Alert.alert("Dispute opened", "The organizer has 48 hours to respond. Keep your evidence handy.");
  }

  if (loading) {
    return (
      <Screen className="px-0">
        <Spinner label="Loading match…" />
      </Screen>
    );
  }

  if (!match) {
    return (
      <Screen className="px-0">
        <Pressable onPress={() => router.back()} className="px-4 pb-2 pt-4">
          <Text className="text-sm font-semibold text-brand-300">← Back</Text>
        </Pressable>
        <Text className="mt-8 text-center text-sm text-slate-400">Match not found.</Text>
      </Screen>
    );
  }

  const inMatch =
    myRegistrationId != null &&
    (match.home_registration_id === myRegistrationId || match.away_registration_id === myRegistrationId);

  return (
    <Screen className="px-0">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm font-semibold text-brand-300">← Back</Text>
        </Pressable>
        <Text className="text-base font-semibold text-white">Match {match.match_number}</Text>
        <Badge status={match.status} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}>
        <Card>
          <Text className="text-xs uppercase tracking-widest text-slate-500">
            {match.bracket.replace(/_/g, " ")}
          </Text>
          <View className="mt-4 flex-row items-center justify-between">
            <View className="flex-1 items-center">
              <Text className="text-xs text-slate-500">Home</Text>
              <Text className="mt-1 text-lg font-black text-white">{match.home_score ?? "—"}</Text>
            </View>
            <Text className="px-3 text-xs text-slate-600">vs</Text>
            <View className="flex-1 items-center">
              <Text className="text-xs text-slate-500">Away</Text>
              <Text className="mt-1 text-lg font-black text-white">{match.away_score ?? "—"}</Text>
            </View>
          </View>
          {match.scheduled_at ? (
            <Text className="mt-4 text-center text-xs text-slate-500">
              Scheduled {formatDateTime(match.scheduled_at)}
            </Text>
          ) : null}
        </Card>

        {inMatch ? (
          <>
            <Card className="mt-3">
              <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Submit result
              </Text>

              {submissionStatus ? (
                <View className="mt-3">
                  <Badge
                    label={submissionStatus === "pending" ? "In review" : submissionStatus}
                    status={submissionStatus === "approved" ? "confirmed" : "waitlisted"}
                  />
                  <Text className="mt-2 text-xs text-slate-500">
                    One screenshot per match. Re-using a screenshot is detected automatically and
                    reduces your trust score.
                  </Text>
                </View>
              ) : (
                <>
                  <Text className="mt-1 text-sm text-slate-400">
                    Upload the end-of-match scoreboard. The organizer reviews it against the other
                    team's submission.
                  </Text>

                  <View className="mt-3 flex-row">
                    <Pressable
                      onPress={() => setClaim("home")}
                      className={
                        claim === "home"
                          ? "mr-2 flex-1 rounded-xl border border-brand-400 bg-brand-500/20 py-3"
                          : "mr-2 flex-1 rounded-xl border border-slate-700 py-3"
                      }
                    >
                      <Text className="text-center text-sm font-semibold text-white">Home won</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setClaim("away")}
                      className={
                        claim === "away"
                          ? "flex-1 rounded-xl border border-brand-400 bg-brand-500/20 py-3"
                          : "flex-1 rounded-xl border border-slate-700 py-3"
                      }
                    >
                      <Text className="text-center text-sm font-semibold text-white">Away won</Text>
                    </Pressable>
                  </View>

                  <Button
                    title="Upload screenshot"
                    onPress={submitResult}
                    loading={uploading}
                    className="mt-3"
                  />
                </>
              )}
            </Card>

            <Card className="mt-3">
              <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Something wrong?
              </Text>
              <Text className="mt-1 text-sm text-slate-400">
                Open a dispute if the opponent cheated, teamed or submitted a fake result.
              </Text>
              <View className="mt-3">
                <Input
                  label="What happened?"
                  value={disputeReason}
                  onChangeText={setDisputeReason}
                  multiline
                  maxLength={2000}
                  placeholder="Describe the issue with evidence timestamps"
                />
                <Button
                  title="Open dispute"
                  variant="outline"
                  onPress={fileDispute}
                  loading={filingDispute}
                />
              </View>
            </Card>
          </>
        ) : (
          <Card className="mt-3">
            <Text className="text-sm text-slate-400">
              You are not a participant in this match. Only registered players can submit results
              or open disputes.
            </Text>
          </Card>
        )}

        {tournamentId ? (
          <Button
            title="Open tournament chat"
            variant="ghost"
            className="mt-4"
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: tournamentId } })}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
