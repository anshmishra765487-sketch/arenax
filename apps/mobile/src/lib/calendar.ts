import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

/**
 * Adds a match to the phone calendar. Uses the OS calendar UI on iOS/Android,
 * which means no calendar permission prompt is needed for the user-initiated
 * flow. Falls back gracefully when the user has no calendar app.
 */
export async function addMatchToCalendar(input: {
  title: string;
  startTimeIso: string;
  endTimeIso?: string;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const start = new Date(input.startTimeIso);
  const end = input.endTimeIso
    ? new Date(input.endTimeIso)
    : new Date(start.getTime() + 60 * 60_000);

  if (Number.isNaN(start.getTime())) return { ok: false, error: "Invalid match time" };

  try {
    await Calendar.createEventInCalendarAsync({
      title: input.title,
      startDate: start,
      endDate: end,
      notes: input.notes ?? "ArenaX tournament. Room details unlock 10 minutes before start.",
      location: Platform.OS === "ios" ? "Online" : undefined,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not open calendar",
    };
  }
}
