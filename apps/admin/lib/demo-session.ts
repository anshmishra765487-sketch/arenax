import { cookies } from "next/headers";

import { DEMO_COOKIE, isDemoMode } from "@/lib/demo";

/** True when the console is running on sample data and the reviewer is signed in. */
export async function demoSession(): Promise<boolean> {
  if (!isDemoMode()) return false;
  const store = await cookies();
  return store.get(DEMO_COOKIE)?.value === "1";
}
