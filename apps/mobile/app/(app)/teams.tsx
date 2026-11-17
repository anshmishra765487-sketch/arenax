import ARENA_CONFIG from "@arenax/config";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Share, Text, View } from "react-native";
import { z } from "zod";

import { Badge, Button, Card, Chip, EmptyState, Input, Screen, SectionTitle, Spinner } from "../../src/components/ui";
import { useAuth } from "../../src/features/auth/useAuth";
import { gameLabel } from "../../src/lib/utils";
import { supabase } from "../../src/lib/supabase";

const teamNameSchema = z
  .string()
  .trim()
  .min(2, "Team name needs at least 2 characters")
  .max(32, "Keep it under 32 characters");

interface TeamRow {
  id: string;
  name: string;
  game_id: string;
  captain_id: string;
  invite_code: string | null;
  member_count?: number;
}

export default function TeamsScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<string>(ARENA_CONFIG.games[0].id);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("team_members")
      .select("role, teams(id, name, game_id, captain_id, invite_code)")
      .eq("player_id", user.id);

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? [])
      .map((row: any) => row.teams)
      .filter(Boolean) as TeamRow[];

    setTeams(rows);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTeam() {
    setError(null);
    if (!user) return;

    const parsed = teamNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid team name");
      return;
    }

    setBusy(true);
    const { error: insertError } = await supabase.from("teams").insert({
      captain_id: user.id,
      game_id: game,
      name: parsed.data,
    });
    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setName("");
    await load();
  }

  async function joinTeam() {
    setError(null);
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setError("Enter the invite code your captain shared.");
      return;
    }

    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc("join_team_by_code", { p_code: code });
    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const result = (data ?? {}) as { ok?: boolean; error?: string };
    if (!result.ok) {
      const messages: Record<string, string> = {
        invalid_code: "That invite code does not match any team.",
        team_full: "This team is already full.",
        not_authenticated: "Please sign in again.",
      };
      setError(messages[result.error ?? ""] ?? "Could not join this team.");
      return;
    }

    setJoinCode("");
    await load();
  }

  async function shareCode(team: TeamRow) {
    if (!team.invite_code) return;
    await Share.share({
      message: `Join my ${gameLabel(team.game_id)} team "${team.name}" on ${ARENA_CONFIG.appName}. Invite code: ${team.invite_code}`,
    });
  }

  async function leaveTeam(team: TeamRow) {
    if (!user) return;
    if (team.captain_id === user.id) {
      Alert.alert(
        "You are the captain",
        "Captains cannot leave their own team. Delete the team from the web dashboard instead.",
      );
      return;
    }

    Alert.alert("Leave team?", `You will leave "${team.name}".`, [
      { text: "Stay", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          await supabase
            .from("team_members")
            .delete()
            .eq("team_id", team.id)
            .eq("player_id", user.id);
          await load();
        },
      },
    ]);
  }

  return (
    <Screen className="px-0">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm font-semibold text-brand-300">← Back</Text>
        </Pressable>
        <Text className="text-base font-semibold text-white">Teams</Text>
        <View className="w-10" />
      </View>

      {loading ? (
        <Spinner label="Loading teams…" />
      ) : (
        <View className="flex-1 px-4">
          {error ? <Text className="mb-2 text-sm text-red-400">{error}</Text> : null}

          {teams.length === 0 ? (
            <EmptyState
              title="No teams yet"
              description="Create a squad or join one with an invite code. Team play registration comes next."
            />
          ) : (
            teams.map((team) => (
              <Card key={team.id} className="mb-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-bold text-white">{team.name}</Text>
                  <Badge
                    label={team.captain_id === user?.id ? "Captain" : "Member"}
                    status={team.captain_id === user?.id ? "confirmed" : "default"}
                  />
                </View>
                <Text className="mt-1 text-xs text-slate-500">
                  {gameLabel(team.game_id)}
                  {team.invite_code ? ` · Invite ${team.invite_code}` : ""}
                </Text>
                <View className="mt-3 flex-row">
                  {team.invite_code ? (
                    <Button
                      title="Share invite code"
                      variant="outline"
                      onPress={() => void shareCode(team)}
                      className="mr-2 flex-1"
                    />
                  ) : null}
                  <Button
                    title="Leave"
                    variant="ghost"
                    onPress={() => void leaveTeam(team)}
                    className="flex-1"
                  />
                </View>
              </Card>
            ))
          )}

          <SectionTitle>Create a team</SectionTitle>
          <Card>
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
            <Input
              label="Team name"
              value={name}
              onChangeText={setName}
              maxLength={40}
              placeholder={profile?.username ? `${profile.username}'s squad` : "Squad name"}
            />
            <Button title="Create team" onPress={createTeam} loading={busy} />
          </Card>

          <SectionTitle>Join with an invite code</SectionTitle>
          <Card className="mb-8">
            <Input
              label="Invite code"
              value={joinCode}
              onChangeText={(value) => setJoinCode(value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              placeholder="AXT1A2B3"
            />
            <Button title="Join team" variant="outline" onPress={joinTeam} loading={busy} />
          </Card>
        </View>
      )}
    </Screen>
  );
}
