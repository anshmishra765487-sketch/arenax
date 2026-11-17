import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy arenax/.env.example to arenax/apps/mobile/.env and restart Expo.",
  );
}

/**
 * Single Supabase client for the mobile app.
 * Uses AsyncStorage so the phone-OTP session survives app restarts.
 * Never use the service-role key in this bundle.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Phone OTP uses a deep link fallback on native; not needed for OTP codes.
    detectSessionInUrl: false,
  },
});
