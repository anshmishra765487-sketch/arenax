/**
 * ArenaX — single source of truth for product configuration.
 *
 * Rename the app, add a game, change point rules or legal copy here.
 * Everything else (mobile app, admin panel, seeds) reads from this file.
 *
 * IMPORTANT COMPLIANCE NOTE
 * ArenaX is an independent tournament organizer. Tournaments are FREE ENTRY.
 * There is no wallet, no entry fee, no deposit/withdrawal and no real-money
 * winnings. Prizes are sponsor-funded only. Keep it that way.
 */

export const ARENA_CONFIG = {
  appName: "ArenaX",
  slug: "arenax",
  tagline: "Free-entry esports tournaments",

  /** BCP-47 language codes supported by the i18n layer (Phase 2 UI toggle uses these). */
  languages: [
    { code: "en", label: "English" },
    { code: "hi", label: "हिन्दी" },
  ] as const,
  defaultLanguage: "en" as const,

  /**
   * Games supported inside the app. ArenaX never hosts gameplay — players
   * compete in custom rooms created by organizers inside the publisher's game.
   */
  games: [
    {
      id: "bgmi",
      name: "Battlegrounds Mobile India",
      shortName: "BGMI",
      publisher: "Krafton",
      /** In-game ID format used by client-side validation + registration form. */
      uidPattern: "^[0-9]{8,12}$",
      uidHint: "8–12 digit BGMI character ID",
    },
    {
      id: "freefire",
      name: "Free Fire",
      shortName: "Free Fire",
      publisher: "Garena",
      uidPattern: "^[0-9]{6,12}$",
      uidHint: "6–12 digit Free Fire UID",
    },
    {
      id: "valorant",
      name: "Valorant",
      shortName: "Valorant",
      publisher: "Riot Games",
      uidPattern: "^[A-Za-z0-9]{3,16}#[A-Za-z0-9]{2,5}$",
      uidHint: "Riot ID in Name#Tag format (e.g. Archer#IN1)",
    },
    {
      id: "cod_mobile",
      name: "Call of Duty: Mobile",
      shortName: "CODM",
      publisher: "Activision",
      uidPattern: "^[0-9]{6,12}$",
      uidHint: "6–12 digit CODM UID",
    },
  ] as const,

  modes: [
    { id: "solo", label: "Solo", teamSize: 1 },
    { id: "duo", label: "Duo", teamSize: 2 },
    { id: "squad", label: "Squad", teamSize: 4 },
    { id: "five", label: "5v5", teamSize: 5 },
  ] as const,

  /** Default battle-royale point table (Phase 3 uses it; organizers can override per tournament). */
  battleRoyalePoints: {
    placement: {
      1: 15,
      2: 12,
      3: 10,
      4: 8,
      5: 6,
      6: 5,
      7: 4,
      8: 3,
      9: 2,
      10: 1,
    } as Record<number, number>,
    killPoints: 1,
  },

  /** Registration / room rules. All are re-checked server-side. */
  rules: {
    roomRevealMinutesBeforeStart: 10,
    registrationClosesMinutesBeforeStart: 15,
    maxAvatarMb: 2,
    allowedImageTypes: ["image/jpeg", "image/png", "image/webp"],
    maxScreenshotMb: 5,
    dailyAdClaims: 3,
    minTrustScoreToRegister: 60,
  },

  legal: {
    minimumAge: 18,
    disclaimer:
      "Independent tournament platform. Not affiliated with or endorsed by Krafton, Garena, Riot Games or any game publisher.",
    parentalConsentNote:
      "Players under 18 must have verifiable parental consent before participating. ArenaX tournaments are free to enter and offer no cash prizes.",
    fairPlaySummary:
      "No cheating, teaming, account sharing, or exploiting bugs. Violations lead to strikes and permanent bans.",
  },

  /** Brand tokens shared by mobile + admin. */
  theme: {
    brand: "#6366F1",
    background: "#020617",
    surface: "#0F172A",
    text: "#F8FAFC",
    muted: "#94A3B8",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
  },

  supportEmail: "support@arenax.gg",
  websiteUrl: "https://arenax.gg",
} as const;

export type ArenaConfig = typeof ARENA_CONFIG;
export type ArenaGame = (typeof ARENA_CONFIG.games)[number];
export type ArenaGameId = ArenaGame["id"];
export type ArenaMode = (typeof ARENA_CONFIG.modes)[number]["id"];
export type ArenaLanguage = (typeof ARENA_CONFIG.languages)[number]["code"];

export default ARENA_CONFIG;
