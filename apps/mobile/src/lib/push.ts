import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Registers the Expo push token with Supabase (no-op on web/emulators). */
export async function registerPushToken(userId: string): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "ArenaX",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366F1",
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== "granted") return null;

  const rawProjectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
  const projectId =
    typeof rawProjectId === "string" && rawProjectId.length > 20 && !rawProjectId.startsWith("YOUR_")
      ? rawProjectId
      : undefined;

  try {
    const token = (
      await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    ).data;

    await supabase.from("push_tokens").upsert(
      { user_id: userId, token, platform: Platform.OS },
      { onConflict: "token" },
    );
    return token;
  } catch (error) {
    console.warn("push token registration failed", error);
    return null;
  }
}

/** Local reminders 30 and 10 minutes before a match (works offline). */
export async function scheduleMatchReminders(input: {
  tournamentId: string;
  title: string;
  startTimeIso: string;
}): Promise<{ scheduled: number; error?: string }> {
  const start = new Date(input.startTimeIso).getTime();
  if (Number.isNaN(start)) return { scheduled: 0, error: "Invalid start time" };

  const offsets = [30, 10];
  let scheduled = 0;

  for (const minutes of offsets) {
    const triggerMs = start - minutes * 60_000;
    if (triggerMs <= Date.now() + 5000) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Starts in ${minutes} minutes`,
        body: `${input.title} — open ArenaX for room details.`,
        data: { tournamentId: input.tournamentId },
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(triggerMs),
        channelId: "default",
      },
    });
    scheduled += 1;
  }

  return { scheduled };
}
