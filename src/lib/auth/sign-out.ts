"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clearPrivatePwaCaches } from "@/lib/pwa/cache-reset";

/**
 * THE ONE WAY THIS APP ENDS A SESSION IN THE BROWSER (2026-11-05 review, A6).
 *
 * The service worker keeps the HTML of dashboard pages so they open with
 * no network (public/sw.js), and that HTML is the signed-in account's.
 * Only the logout button used to throw it away; changing the password,
 * deleting the account and a session that simply expired all left it on
 * the device for the next person to open offline. So every sign-out goes
 * through here, and the cache goes in a `finally` — a sign-out request
 * that fails on the network still leaves this browser, and its cache must
 * not outlive that.
 *
 * scripts/tests/pwa.test.mjs ranges over EVERY `auth.signOut(` call in
 * src/ and allows it only in this file.
 */
export async function signOutAndForget(
  supabase: SupabaseClient,
  options?: { scope?: "global" | "local" | "others" }
): Promise<void> {
  try {
    await supabase.auth.signOut(options);
  } finally {
    await clearPrivatePwaCaches();
  }
}

/**
 * The same cleanup for a session that ends WITHOUT anyone pressing
 * anything: a refresh token that expired or was revoked (a password
 * change elsewhere, a suspension) makes the browser client report
 * SIGNED_OUT. Mounted once, by components/pwa/pwa-provider.tsx, beside the
 * worker that fills the cache. Returns the unsubscribe.
 */
export function forgetOnSignOut(supabase: SupabaseClient): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") void clearPrivatePwaCaches();
  });
  return () => data.subscription.unsubscribe();
}
