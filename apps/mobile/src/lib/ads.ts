import { Platform } from "react-native";

type AdsModule = typeof import("react-native-google-mobile-ads");

let ads: AdsModule | null | undefined;

function getAds(): AdsModule | null {
  if (ads !== undefined) return ads;
  try {
    // Lazy require keeps Expo Go usable: the native module only exists in a
    // development/production build with react-native-google-mobile-ads.
    ads = require("react-native-google-mobile-ads") as AdsModule;
  } catch {
    ads = null;
  }
  return ads;
}

export function rewardedAdAvailable(): boolean {
  return getAds() !== null;
}

/**
 * Shows a rewarded video and resolves true only when AdMob reports the reward.
 * The result is NOT trusted by the server — the SSV callback verifies it.
 */
export function showRewardedAd(): Promise<boolean> {
  const module = getAds();
  if (!module) return Promise.resolve(false);

  const { RewardedAd, RewardedAdEventType, AdEventType, TestIds } = module;
  const productionId = Platform.select({
    android: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_ID,
    ios: process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS_ID,
  });
  const unitId = __DEV__ || !productionId ? TestIds.REWARDED : productionId;

  return new Promise((resolve) => {
    const rewarded = RewardedAd.createForAdRequest(unitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      unsubscribeLoaded();
      unsubscribeEarned();
      unsubscribeClosed();
      clearTimeout(timeout);
      resolve(value);
    };

    const unsubscribeLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      rewarded.show().catch(() => finish(false));
    });
    const unsubscribeEarned = rewarded.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => finish(true),
    );
    const unsubscribeClosed = rewarded.addAdEventListener(
      AdEventType.CLOSED,
      () => finish(false),
    );

    // Never leave the UI hanging if the ad network fails.
    const timeout = setTimeout(() => finish(false), 45_000);

    rewarded.load();
  });
}
