import PostHog from "posthog-react-native";

/**
 * Analytics wrapper. PostHog is optional: without EXPO_PUBLIC_POSTHOG_KEY all
 * calls become no-ops, so development builds never phone home.
 */
const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;

export const analytics =
  apiKey && apiKey.length > 0
    ? new PostHog(apiKey, { host: "https://eu.i.posthog.com", enableSessionReplay: false })
    : null;

type AnalyticsClient = NonNullable<typeof analytics>;

/** PostHog narrows properties to JSON values; our callers use plain objects. */
function toEventProperties(properties?: Record<string, unknown>) {
  return properties as Parameters<AnalyticsClient["capture"]>[1];
}

export function track(event: string, properties?: Record<string, unknown>): void {
  try {
    analytics?.capture(event, toEventProperties(properties));
  } catch {
    // analytics must never break gameplay
  }
}

export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
  try {
    analytics?.identify(userId, toEventProperties(properties));
  } catch {
    // ignore
  }
}

export function resetAnalytics(): void {
  try {
    analytics?.reset();
  } catch {
    // ignore
  }
}

/** Funnel events used by the registration + ad flows. */
export const EVENTS = {
  signIn: "auth_signed_in",
  tournamentView: "tournament_viewed",
  registerStarted: "registration_started",
  registerSuccess: "registration_succeeded",
  registerFailed: "registration_failed",
  roomViewed: "room_details_viewed",
  adRequested: "ad_reward_requested",
  adCompleted: "ad_reward_completed",
  resultSubmitted: "result_submitted",
  clipUploaded: "clip_uploaded",
  vipScreen: "vip_screen_viewed",
} as const;
