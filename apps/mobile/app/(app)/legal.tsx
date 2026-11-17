import ARENA_CONFIG from "@arenax/config";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Card, Chip, Screen } from "../../src/components/ui";

type Tab = "terms" | "privacy" | "fairplay" | "organizers";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "terms", label: "Terms" },
  { id: "privacy", label: "Privacy" },
  { id: "fairplay", label: "Fair play" },
  { id: "organizers", label: "Organizers" },
];

/**
 * Legal + policy content lives here so the Play Store listing, the in-app
 * screens and the admin console all read the same text. Keep the copy honest:
 * ArenaX is free entry, sponsor-funded and not a real-money gaming app.
 */
export default function LegalScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("terms");

  return (
    <Screen className="px-0">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm font-semibold text-brand-300">← Back</Text>
        </Pressable>
        <Text className="text-base font-semibold text-white">Legal & policies</Text>
        <View className="w-10" />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
      >
        {TABS.map((item) => (
          <Chip key={item.id} label={item.label} active={tab === item.id} onPress={() => setTab(item.id)} />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}>
        {tab === "terms" ? (
          <Card>
            <Text className="text-base font-bold text-white">Terms of use</Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              {ARENA_CONFIG.appName} is an independent tournament organizer for mobile esports in
              India. Tournaments are free to enter. There is no entry fee, no wallet, no deposit,
              no withdrawal and no real-money winnings of any kind.
            </Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              Prizes, where offered, are funded by sponsors and delivered by the organizer. Prize
              descriptions are informational and never constitute a stake or a wager.
            </Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              You must be at least {ARENA_CONFIG.legal.minimumAge} years old, or have verifiable
              parental consent where local law allows participation. One account per person. Account
              sharing, smurfing and selling accounts are prohibited.
            </Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              {ARENA_CONFIG.legal.disclaimer}
            </Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              We may suspend or ban accounts that break these terms, cheat, team with opponents, or
              harass other players. Bans are recorded in an internal audit log and can be appealed
              at {ARENA_CONFIG.supportEmail}.
            </Text>
          </Card>
        ) : null}

        {tab === "privacy" ? (
          <Card>
            <Text className="text-base font-bold text-white">Privacy policy</Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              We collect only what is needed to run free tournaments:
            </Text>
            <Text className="mt-2 text-sm leading-6 text-slate-300">
              • Phone number (for OTP sign-in) or Google account email.{"\n"}
              • Username, display name and avatar.{"\n"}
              • In-game IDs you link, visible only to organizers of tournaments you join.{"\n"}
              • Match screenshots you upload as evidence, visible only to you, the organizer and
              admins.{"\n"}
              • Device push token, used only for match and room notifications.{"\n"}
              • Basic app analytics events (screen views, registration funnels), if enabled.
            </Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              We do not sell personal data. We do not store card, UPI or bank details — ArenaX never
              processes payments from players. VIP subscriptions are handled by Google Play Billing;
              only the purchase token is stored to confirm entitlement.
            </Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              You can delete your account and associated data by emailing {ARENA_CONFIG.supportEmail}.
              Evidence screenshots are retained only as long as needed to resolve disputes, then
              purged.
            </Text>
          </Card>
        ) : null}

        {tab === "fairplay" ? (
          <Card>
            <Text className="text-base font-bold text-white">Fair play policy</Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              {ARENA_CONFIG.legal.fairPlaySummary}
            </Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              Specifically prohibited: aimbots, wall hacks, macros, emulators where the publisher
              forbids them, third-party overlays, teaming in solo modes, deliberate disconnects,
              and submitting screenshots that are edited, reused or stolen from another player.
            </Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              Every result screenshot is hashed. Reusing a screenshot — yours or someone else's —
              inside the same tournament is detected automatically, flags the submission, opens a
              report and reduces your trust score.
            </Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              Three active strikes trigger an automatic ban. You can appeal any strike through
              support. Trust score below {ARENA_CONFIG.rules.minTrustScoreToRegister} blocks new
              registrations until it recovers.
            </Text>
          </Card>
        ) : null}

        {tab === "organizers" ? (
          <Card>
            <Text className="text-base font-bold text-white">Publisher rules checklist</Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              Before publishing a tournament, every organizer confirms:
            </Text>
            <Text className="mt-2 text-sm leading-6 text-slate-300">
              1. The tournament is free to enter; no fee is collected in any form.{"\n"}
              2. Custom rooms are created inside the publisher's official game client.{"\n"}
              3. No modified clients, private servers or unauthorized third-party tools are used.{"\n"}
              4. Room ID and password are shared only through ArenaX, only after reveal time.{"\n"}
              5. Prizes are sponsor-funded and described accurately; no cash-equivalent payouts.{"\n"}
              6. The organizer is not affiliated with, or claiming endorsement by, the publisher.{"\n"}
              7. Under-18 participants have verifiable parental consent.{"\n"}
              8. Results are verified from screenshots; disputes are answered within 48 hours.{"\n"}
              9. Streams, clips and sponsor content follow the publisher's community guidelines.{"\n"}
              10. Player data is used only for running this tournament.
            </Text>
            <Text className="mt-3 text-sm leading-6 text-slate-300">
              Organizers who break these rules lose organizer status. Repeated violations lead to a
              permanent ban and removal from the platform.
            </Text>
            <Text className="mt-3 text-sm leading-6 text-slate-500">
              {ARENA_CONFIG.legal.disclaimer}
            </Text>
          </Card>
        ) : null}

        <Text className="mt-6 text-center text-[11px] leading-4 text-slate-600">
          Questions? {ARENA_CONFIG.supportEmail}
        </Text>
      </ScrollView>
    </Screen>
  );
}
