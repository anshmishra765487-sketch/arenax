import { useCallback, useEffect, useState } from "react";

import { fetchGameAccounts, fetchProfile } from "../../lib/api";
import type { GameAccount, Profile } from "../../lib/types";
import { supabase } from "../../lib/supabase";

interface UseProfileState {
  profile: Profile | null;
  gameAccounts: GameAccount[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<Profile, "username" | "display_name" | "language" | "avatar_url">>) => Promise<{ error?: string }>;
  upsertGameAccount: (gameId: string, gameUid: string) => Promise<{ error?: string }>;
}

/**
 * Profile + linked in-game accounts for the signed-in player.
 * Kept as a hook (not global state) so screens stay independent as the app grows.
 */
export function useProfile(userId: string | undefined): UseProfileState {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gameAccounts, setGameAccounts] = useState<GameAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setGameAccounts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextProfile, accounts] = await Promise.all([
        fetchProfile(userId),
        fetchGameAccounts(userId),
      ]);
      setProfile(nextProfile);
      setGameAccounts(accounts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateProfile = useCallback<UseProfileState["updateProfile"]>(
    async (patch) => {
      if (!userId) return { error: "Not signed in" };
      const { error: updateError } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId);

      if (updateError) return { error: updateError.message };
      await load();
      return {};
    },
    [userId, load],
  );

  const upsertGameAccount = useCallback<UseProfileState["upsertGameAccount"]>(
    async (gameId, gameUid) => {
      if (!userId) return { error: "Not signed in" };
      const { error: upsertError } = await supabase.from("game_accounts").upsert(
        {
          player_id: userId,
          game_id: gameId,
          game_uid: gameUid.trim(),
        },
        { onConflict: "player_id,game_id" },
      );

      if (upsertError) return { error: upsertError.message };
      await load();
      return {};
    },
    [userId, load],
  );

  return {
    profile,
    gameAccounts,
    loading,
    error,
    refresh: load,
    updateProfile,
    upsertGameAccount,
  };
}
