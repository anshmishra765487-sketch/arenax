import ARENA_CONFIG from "@arenax/config";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";

import { Badge, Button, Card, Spinner } from "../../../src/components/ui";
import { useAuth } from "../../../src/features/auth/useAuth";
import { showRewardedAd } from "../../../src/lib/ads";
import { EVENTS, track } from "../../../src/lib/analytics";
import {
  cancelRegistration,
  fetchMyRegistration,
  fetchTournamentById,
  humanizeRpcError,
  joinTournament,
} from "../../../src/lib/api";
import { addMatchToCalendar } from "../../../src/lib/calendar";
import { scheduleMatchReminders } from "../../../src/lib/push";
import { supabase } from "../../../src/lib/supabase";
import type {
  Registration,
  RoomDetails,
  Sponsor,
  Stream,
  Tournament,
} from "../../../src/lib/types";
import {
  countdownLabel,
  formatDateTime,
  formatTime,
  gameLabel,
  getCountdown,
  isRegistrationClosed,
  roomRevealAt,
} from "../../../src/lib/utils";

function useNowTicker(enabled: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-3 flex-row items-start justify-between">
      <Text className="text-sm text-slate-500">{label}</Text>
      <Text className="ml-4 flex-1 text-right text-sm font-medium text-slate-200">{value}</Text>
    </View>
  );
}

function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 mr-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2"
    >
      <Text className="text-xs font-semibold text-slate-200">{label}</Text>
    </Pressable>
  );
}

interface SponsorLink {
  banner_url: string | null;
  sponsor: Pick<Sponsor, "id" | "name" | "logo_url" | "website_url" | "description"> | null;
}

export default function TournamentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [sponsors, setSponsors] = useState<SponsorLink[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
  const [remindersSet, setRemindersSet] = useState(false);

  const now = useNowTicker(Boolean(tournament));

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const nextTournament = await fetchTournamentById(id);
      setTournament(nextTournament);

      if (nextTournament) {
        const [{ data: sponsorRows }, { data: streamRows }] = await Promise.all([
          supabase
            .from("sponsor_tournaments")
            .select("banner_url, sponsor:sponsors(id, name, logo_url, website_url, description)")
            .eq("tournament_id", nextTournament.id),
          supabase
            .from("streams")
            .select("*")
            .eq("tournament_id", nextTournament.id)
            .order("created_at", { ascending: false }),
        ]);

        setSponsors((sponsorRows ?? []) as unknown as SponsorLink[]);
        setStreams((streamRows ?? []) as Stream[]);
      }

      if (nextTournament && user) {
        const nextRegistration = await fetchMyRegistration(nextTournament.id, user.id);
        setRegistration(nextRegistration);

        // RLS only returns the row if the caller is a confirmed, registered
        // player AND the server-side reveal time has passed.
        const { data: roomData } = await supabase
          .from("room_details")
          .select("*")
          .eq("tournament_id", nextTournament.id)
          .maybeSingle();
        setRoom((roomData as RoomDetails | null) ?? null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load tournament");
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const registrationOpen = tournament ? !isRegistrationClosed(tournament.start_time, now) : false;
  const isRegistered = registration?.status === "confirmed";
  const isWaitlisted = registration?.status === "waitlisted";
  const revealAtIso = tournament ? roomRevealAt(tournament.start_time) : null;
  const roomRevealed = revealAtIso ? now >= new Date(revealAtIso).getTime() : false;
  const countdown = tournament ? getCountdown(tournament.start_time, now) : null;
  const liveStream = streams.find((stream) => stream.is_live) ?? streams[0] ?? null;

  async function handleRegister() {
    if (!tournament) return;
    setJoining(true);
    const result = await joinTournament(tournament.id, null);
    setJoining(false);

    if (result.ok) {
      track(EVENTS.registerSuccess, { tournamentId: tournament.id, status: result.status });
      Alert.alert(
        result.status === "waitlisted" ? "Added to waitlist" : "Registered",
        result.status === "waitlisted"
          ? "All slots are full right now. You will be promoted automatically if someone cancels."
          : "Your free slot is confirmed. Room ID and password unlock automatically 10 minutes before start.",
      );
      await load();
      return;
    }

    track(EVENTS.registerFailed, { tournamentId: tournament.id, error: result.error });
    Alert.alert("Could not register", humanizeRpcError(result.error));
  }

  function confirmCancel() {
    Alert.alert(
      "Cancel registration?",
      "Your slot will be released to other players (and the first waitlisted player is promoted automatically).",
      [
        { text: "Keep slot", style: "cancel" },
        {
          text: "Cancel registration",
          style: "destructive",
          onPress: async () => {
            if (!tournament) return;
            setCancelling(true);
            const result = await cancelRegistration(tournament.id);
            setCancelling(false);
            if (result.ok) {
              await load();
            } else {
              Alert.alert("Could not cancel", humanizeRpcError(result.error));
            }
          },
        },
      ],
    );
  }

  /**
   * Optional ad-supported booking. The claim is created server-side and only
   * becomes redeemable after AdMob's signed SSV callback reaches the backend.
   */
  async function handleWatchAd() {
    if (!tournament) return;
    setAdBusy(true);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("request-ad-reward", {
        body: { tournamentId: tournament.id },
      });

      if (invokeError || !data?.ok) {
        Alert.alert("Ad unavailable", "Please try again in a moment.");
        return;
      }

      track(EVENTS.adRequested, { tournamentId: tournament.id });
      const watched = await showRewardedAd();
      if (!watched) {
        Alert.alert("No reward", "The ad did not complete, so no slot was booked.");
        return;
      }

      // AdMob SSV is asynchronous; poll the claim briefly before redeeming.
      let rewarded = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const { data: claim } = await supabase
          .from("ad_reward_claims")
          .select("status")
          .eq("id", data.claimId)
          .maybeSingle();
        if ((claim as { status: string } | null)?.status === "rewarded") {
          rewarded = true;
          break;
        }
      }

      if (!rewarded) {
        Alert.alert(
          "Verification pending",
          "Google's ad server has not confirmed the view yet. Try again in a minute — you won't be charged anything (ArenaX is free).",
        );
        return;
      }

      const { data: redeemData, error: redeemError } = await supabase.rpc("redeem_ad_reward", {
        p_claim_id: data.claimId,
      });

      const result = (redeemData ?? {}) as { ok?: boolean; error?: string };
      if (redeemError || !result.ok) {
        Alert.alert("Could not book slot", humanizeRpcError(result.error ?? redeemError?.message));
        return;
      }

      track(EVENTS.adCompleted, { tournamentId: tournament.id });
      Alert.alert("Slot booked", "Your free slot is confirmed. Good luck!");
      await load();
    } finally {
      setAdBusy(false);
    }
  }

  async function addReminders() {
    if (!tournament) return;
    const calendar = await addMatchToCalendar({
      title: `${tournament.title} · ${ARENA_CONFIG.appName}`,
      startTimeIso: tournament.start_time,
      endTimeIso: tournament.end_time,
      notes: `${gameLabel(tournament.game_id)} ${tournament.mode}. Room details unlock 10 minutes before start in the app.`,
    });
    const reminders = await scheduleMatchReminders({
      tournamentId: tournament.id,
      title: tournament.title,
      startTimeIso: tournament.start_time,
    });

    setRemindersSet(true);
    Alert.alert(
      calendar.ok ? "Reminders set" : "Reminder status",
      calendar.ok
        ? `Added to your calendar with ${reminders.scheduled} local reminder(s).`
        : `${reminders.scheduled} in-app reminder(s) scheduled. ${calendar.error ?? ""}`,
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-slate-950">
        <Spinner label="Loading tournament…" />
      </View>
    );
  }

  if (!tournament) {
    return (
      <View className="flex-1 bg-slate-950 px-6">
        <Text className="mt-16 text-center text-base font-semibold text-slate-200">
          {error ?? "Tournament not found"}
        </Text>
        <Pressable onPress={() => router.back()} className="mt-6 items-center">
          <Text className="text-sm font-semibold text-brand-300">Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-950" contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm font-semibold text-brand-300">← Back</Text>
        </Pressable>
        <Badge status={tournament.status} />
      </View>

      <View className="px-4">
        <View className="mt-2 flex-row items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-brand-300">
            {gameLabel(tournament.game_id)}
          </Text>
          <Text className="mx-2 text-slate-700">•</Text>
          <Text className="text-xs uppercase tracking-wide text-slate-500">{tournament.mode}</Text>
          <Text className="mx-2 text-slate-700">•</Text>
          <Text className="text-xs font-semibold text-emerald-400">Free entry</Text>
        </View>

        <Text className="mt-2 text-2xl font-black leading-8 text-white">{tournament.title}</Text>

        {/* Countdown */}
        {tournament.status === "upcoming" && countdown ? (
          <Card className="mt-4 border-brand-500/30 bg-brand-500/10">
            <Text className="text-xs uppercase tracking-widest text-brand-200">
              {countdown.done ? "Starting now" : "Starts in"}
            </Text>
            <Text className="mt-1 text-3xl font-black text-white">
              {countdown.done ? "Live" : countdownLabel(countdown)}
            </Text>
            <Text className="mt-1 text-xs text-brand-200/70">
              Room ID + password unlock at {formatTime(revealAtIso!)} (server-enforced)
            </Text>
          </Card>
        ) : null}

        {/* Quick actions */}
        <View className="mt-3 flex-row flex-wrap">
          <QuickAction
            label="💬 Lobby chat"
            onPress={() => router.push({ pathname: "/chat/[id]", params: { id: tournament.id } })}
          />
          <QuickAction
            label="🎬 Clips"
            onPress={() =>
              router.push({ pathname: "/clips", params: { tournamentId: tournament.id } })
            }
          />
          <QuickAction
            label="🏆 Leaderboard"
            onPress={() => router.push("/leaderboards")}
          />
          <QuickAction label="🛡️ Teams" onPress={() => router.push("/teams")} />
          <QuickAction label="⚔️ Scrims" onPress={() => router.push("/scrims")} />
          {isRegistered ? (
            <QuickAction
              label={remindersSet ? "🔔 Reminders set" : "🔔 Set reminder"}
              onPress={() => void addReminders()}
            />
          ) : null}
        </View>

        {/* Live stream */}
        {liveStream ? (
          <Card className="mt-2 border-red-500/30 bg-red-500/10">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-bold uppercase tracking-widest text-red-300">
                {liveStream.is_live ? "Live now" : "Stream"}
              </Text>
              <Text className="text-[10px] uppercase text-red-200/70">{liveStream.platform}</Text>
            </View>
            <Text className="mt-1 text-sm font-semibold text-white">{liveStream.title}</Text>
            <Button
              title="Watch stream"
              variant="outline"
              className="mt-3"
              onPress={() => void Linking.openURL(liveStream.url)}
            />
          </Card>
        ) : null}

        {/* Info */}
        <Card className="mt-3">
          <InfoRow label="Starts" value={formatDateTime(tournament.start_time)} />
          <InfoRow label="Ends" value={formatDateTime(tournament.end_time)} />
          <InfoRow label="Mode" value={tournament.mode} />
          {tournament.map ? <InfoRow label="Map" value={tournament.map} /> : null}
          <InfoRow
            label="Slots"
            value={`${tournament.slots_left} left of ${tournament.slots_total}`}
          />
        </Card>

        {tournament.prize_info ? (
          <Card className="mt-3 border-amber-500/20 bg-amber-500/5">
            <Text className="text-xs font-bold uppercase tracking-widest text-amber-300">
              Prizes
            </Text>
            <Text className="mt-1 text-sm leading-5 text-slate-200">{tournament.prize_info}</Text>
            <Text className="mt-2 text-[11px] text-slate-500">
              Prizes are sponsor-funded. ArenaX never collects entry fees or player money.
            </Text>
          </Card>
        ) : null}

        {/* Registration */}
        <Card className="mt-3">
          <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Registration
          </Text>

          {isRegistered ? (
            <View className="mt-3">
              <View className="flex-row items-center">
                <Badge label="Confirmed" status="confirmed" />
                <Text className="ml-2 text-sm text-slate-300">You are in</Text>
              </View>
              <Text className="mt-2 text-xs text-slate-500">
                In-game ID on file: {registration?.in_game_id}
              </Text>
              {registrationOpen ? (
                <Button
                  title="Cancel registration"
                  variant="outline"
                  onPress={confirmCancel}
                  loading={cancelling}
                  className="mt-4"
                />
              ) : (
                <Text className="mt-4 text-xs text-slate-500">
                  Cancellation is closed. Contact the organizer for emergencies.
                </Text>
              )}
            </View>
          ) : isWaitlisted ? (
            <View className="mt-3">
              <Badge label="Waitlisted" status="waitlisted" />
              <Text className="mt-2 text-sm text-slate-300">
                All slots are taken. You are in the queue and will be promoted automatically if a
                player cancels. You'll get a notification.
              </Text>
              <Button
                title="Leave waitlist"
                variant="outline"
                onPress={confirmCancel}
                loading={cancelling}
                className="mt-4"
              />
            </View>
          ) : tournament.slots_left < 1 ? (
            <View className="mt-3">
              <Text className="text-sm text-slate-400">
                All slots are taken. Join the waitlist — the first in line gets the next free slot.
              </Text>
              <Button title="Join waitlist" onPress={handleRegister} loading={joining} className="mt-4" />
            </View>
          ) : !registrationOpen ? (
            <Text className="mt-2 text-sm text-slate-400">
              Registration closed {ARENA_CONFIG.rules.registrationClosesMinutesBeforeStart} minutes
              before start.
            </Text>
          ) : (
            <>
              <Text className="mt-1 text-sm text-slate-400">
                Solo registration is instant. We verify your linked in-game ID on the server.
                Free slot — no payment, ever.
              </Text>
              <Button
                title="Claim free slot"
                onPress={handleRegister}
                loading={joining}
                className="mt-4"
              />
              <Button
                title="Watch a short ad instead (optional)"
                variant="ghost"
                onPress={handleWatchAd}
                loading={adBusy}
                className="mt-1"
              />
            </>
          )}
        </Card>

        {/* Room details */}
        <Card className="mt-3">
          <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Room ID & password
          </Text>

          {!isRegistered ? (
            <Text className="mt-2 text-sm text-slate-400">
              Only registered players can see room details, and only after the reveal timer.
            </Text>
          ) : !roomRevealed ? (
            <Text className="mt-2 text-sm text-slate-400">
              Locked. Unlocks at {formatDateTime(revealAtIso!)}. This is enforced by the
              database using server time — changing your phone clock won't help.
            </Text>
          ) : room?.room_id ? (
            <View className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <Text className="text-xs uppercase tracking-widest text-emerald-300">Room ID</Text>
              <Text selectable className="mt-1 text-lg font-bold text-white">
                {room.room_id}
              </Text>
              <Text className="mt-3 text-xs uppercase tracking-widest text-emerald-300">
                Password
              </Text>
              <Text selectable className="mt-1 text-lg font-bold text-white">
                {room.room_password ?? "—"}
              </Text>
              <Text className="mt-3 text-[11px] leading-4 text-emerald-200/70">
                Do not share these details. Sharing may lead to a strike and ban.
              </Text>
            </View>
          ) : (
            <Text className="mt-2 text-sm text-slate-400">
              Unlocked, but the organizer has not published the room yet. You'll get a
              notification the moment it appears.
            </Text>
          )}
        </Card>

        {/* Sponsor */}
        {sponsors.length > 0 ? (
          <Card className="mt-3 border-slate-700 bg-slate-900">
            <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Sponsor
            </Text>
            {sponsors.map((item) => (
              <View key={item.sponsor?.id ?? item.banner_url ?? "sponsor"} className="mt-2">
                <Text className="text-sm font-semibold text-white">
                  {item.sponsor?.name ?? "Tournament sponsor"}
                </Text>
                {item.sponsor?.description ? (
                  <Text className="mt-1 text-xs leading-5 text-slate-400">
                    {item.sponsor.description}
                  </Text>
                ) : null}
                {item.sponsor?.website_url ? (
                  <Pressable onPress={() => void Linking.openURL(item.sponsor!.website_url!)} className="mt-2">
                    <Text className="text-xs font-semibold text-brand-300">Visit sponsor →</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            <Text className="mt-3 text-[10px] leading-4 text-slate-600">
              Sponsored prize pool. Sponsors do not control match results or player data.
            </Text>
          </Card>
        ) : null}

        {/* Rules */}
        {tournament.rules ? (
          <Card className="mt-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">Rules</Text>
            <Text className="mt-2 text-sm leading-6 text-slate-300">{tournament.rules}</Text>
          </Card>
        ) : null}

        <Pressable onPress={() => router.push("/legal")} className="mt-4 items-center">
          <Text className="text-xs font-semibold text-brand-300">Fair play, privacy & publisher rules</Text>
        </Pressable>

        <Text className="mt-4 text-center text-[11px] leading-4 text-slate-600">
          {ARENA_CONFIG.legal.disclaimer}
        </Text>
      </View>
    </ScrollView>
  );
}
