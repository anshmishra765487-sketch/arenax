import ARENA_CONFIG from "@arenax/config";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { Badge, Button, Card, Screen, SectionTitle } from "../../src/components/ui";
import { useAuth } from "../../src/features/auth/useAuth";
import { track, EVENTS } from "../../src/lib/analytics";
import { supabase } from "../../src/lib/supabase";

/**
 * VIP is cosmetic/convenience only: profile badge, ad-free lobby, extra theme.
 * Google Play Billing is the only payment path. The purchase token is verified
 * by the verify-play-purchase edge function before any entitlement is granted.
 */

const PLANS = [
  {
    sku: "arenax_vip_monthly",
    plan: "vip_monthly",
    title: "VIP monthly",
    price: "₹49 / month",
    perks: ["VIP profile badge", "Ad-free tournament lobby", "Early bracket view"],
  },
  {
    sku: "arenax_vip_yearly",
    plan: "vip_yearly",
    title: "VIP yearly",
    price: "₹399 / year",
    perks: ["Everything in monthly", "2 months free", "Founding supporter badge"],
  },
] as const;

type IapModule = typeof import("react-native-iap");

function getIap(): IapModule | null {
  try {
    return require("react-native-iap") as IapModule;
  } catch {
    return null;
  }
}

export default function VipScreen() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();

  const [vip, setVip] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    const { data: vipResult } = await supabase.rpc("is_vip");
    setVip(Boolean(vipResult));

    const { data } = await supabase
      .from("subscriptions")
      .select("expires_at, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setExpiresAt((data as { expires_at: string | null } | null)?.expires_at ?? null);
  }, [user]);

  useEffect(() => {
    void load();
    track(EVENTS.vipScreen);
  }, [load]);

  useEffect(() => {
    const iap = getIap();
    if (!iap) return;
    setAvailable(true);

    let subscription: { remove: () => void } | undefined;
    void (async () => {
      try {
        await iap.initConnection();
        subscription = iap.purchaseUpdatedListener(async (purchase) => {
          if (!purchase.purchaseToken) return;
          try {
            const { data, error } = await supabase.functions.invoke("verify-play-purchase", {
              body: {
                purchaseToken: purchase.purchaseToken,
                productId: purchase.productId,
              },
            });
            if (error || !data?.ok) {
              Alert.alert(
                "Verification pending",
                "Google Play has not confirmed this purchase yet. VIP activates automatically once verified.",
              );
              return;
            }
            await iap.finishTransaction({ purchase, isConsumable: false });
            await refreshProfile();
            await load();
            Alert.alert(
              data.active ? "VIP activated" : "Purchase recorded",
              data.active
                ? "Thanks for supporting free-entry esports."
                : "This subscription is not active on Google Play.",
            );
          } catch {
            Alert.alert("Could not verify", "Please try again later or contact support.");
          }
        });
      } catch {
        setAvailable(false);
      }
    })();

    return () => {
      subscription?.remove();
      void iap.endConnection().catch(() => undefined);
    };
  }, [load, refreshProfile]);

  async function subscribe(sku: string) {
    const iap = getIap();
    if (!iap) {
      Alert.alert(
        "Not available in this build",
        "Google Play Billing needs a development build. Expo Go cannot process purchases.",
      );
      return;
    }

    setBusySku(sku);
    try {
      // react-native-iap v17 uses the unified requestPurchase mutation.
      await iap.requestPurchase({
        request: {
          google: { skus: [sku], obfuscatedAccountId: user?.id ?? null },
          apple: { sku },
        },
        type: "subs",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Purchase cancelled or failed";
      if (!/cancel/i.test(message)) Alert.alert("Purchase failed", message);
    } finally {
      setBusySku(null);
    }
  }

  return (
    <Screen className="px-0">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm font-semibold text-brand-300">← Back</Text>
        </Pressable>
        <Text className="text-base font-semibold text-white">ArenaX VIP</Text>
        <View className="w-10" />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}>
        <Card className={vip ? "border-amber-500/40 bg-amber-500/10" : "border-brand-500/30 bg-brand-500/10"}>
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-widest text-brand-200">Status</Text>
            <Badge label={vip ? "VIP active" : "Free player"} status={vip ? "confirmed" : "default"} />
          </View>
          <Text className="mt-2 text-2xl font-black text-white">
            {vip ? "You're a VIP" : "Support free esports"}
          </Text>
          <Text className="mt-1 text-xs leading-5 text-brand-200/80">
            {vip
              ? `Renews via Google Play${expiresAt ? ` · valid until ${expiresAt.slice(0, 10)}` : ""}. Cancel anytime in Play Store → Subscriptions.`
              : "VIP is cosmetic only. Tournaments stay free, and no prize depends on VIP status."}
          </Text>
        </Card>

        <SectionTitle>Plans</SectionTitle>
        {PLANS.map((item) => (
          <Card key={item.sku} className="mb-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-bold text-white">{item.title}</Text>
              <Text className="text-sm font-bold text-brand-300">{item.price}</Text>
            </View>
            <Text className="mt-2 text-xs leading-5 text-slate-400">
              {item.perks.map((perk) => `• ${perk}`).join("\n")}
            </Text>
            <Button
              title={vip ? "Manage in Play Store" : `Subscribe · ${item.price}`}
              variant={vip ? "outline" : "primary"}
              onPress={() => (vip ? undefined : void subscribe(item.sku))}
              loading={busySku === item.sku}
              disabled={vip}
              className="mt-4"
            />
          </Card>
        ))}

        {!available ? (
          <Text className="mt-2 text-[11px] leading-4 text-amber-400/80">
            Google Play Billing is not present in this build (Expo Go). Purchases work in the
            production build.
          </Text>
        ) : null}

        <SectionTitle>What VIP does not do</SectionTitle>
        <Card>
          <Text className="text-xs leading-5 text-slate-400">
            • No pay-to-win: no extra slots, better seeds or result advantages.{"\n"}
            • No cash prizes, withdrawals or wallet balance.{"\n"}
            • No entry fee — VIP is a voluntary support subscription, the tournaments themselves
            are always free.
          </Text>
        </Card>

        <Text className="mt-6 text-center text-[11px] leading-4 text-slate-600">
          {ARENA_CONFIG.legal.disclaimer}
        </Text>
        <Text className="mt-2 text-center text-[11px] leading-4 text-slate-600">
          Player {profile?.username ?? ""} · billing handled by Google Play
        </Text>
      </ScrollView>
    </Screen>
  );
}
