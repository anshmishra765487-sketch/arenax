import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const demo = process.env.EXPO_PUBLIC_DEMO_MODE === "true";
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://demo.supabase.co";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "demo-anon-key-for-mobile-preview";

/**
 * Single Supabase client for the mobile app.
 * Uses AsyncStorage so the phone-OTP session survives app restarts.
 * Never use the service-role key in this bundle.
 *
 * In demo mode (EXPO_PUBLIC_DEMO_MODE) placeholder values are used so the app
 * boots on web preview without a real backend; all reads/writes are redirected
 * to the demo data layer by the API layer.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
