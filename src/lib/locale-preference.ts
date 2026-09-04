"use client";

import { createClient } from "@/lib/supabase/client";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/constants";

// WHERE THE LANGUAGE ACTUALLY LIVES.
//
// It used to live in one place: a NEXT_LOCALE cookie written by
// components/i18n/language-selector.tsx. A cookie is per-browser, so the
// language somebody chose on their laptop was simply not their language on
// their phone, and clearing site data reset them to English. For an account
// setting — which is what "what language do you read" is — that is the
// wrong storage.
//
// So it lives on the ACCOUNT, in raw_user_meta_data.preferred_locale, the
// same place ai_persona_name and chat_memory_enabled already live. No
// migration: auth.users.raw_user_meta_data is a jsonb column that already
// exists, and supabase.auth.updateUser({data}) is the established write
// path in this codebase (see settings/ai-persona-settings.tsx).
//
// The cookie does not go away — next-intl's request config runs on every
// server render and reading it from a cookie costs nothing, whereas an
// auth round trip per render would cost a network call per page. The cookie
// is a CACHE of the account value; middleware.ts refreshes that cache on
// every request, which is what makes a new device pick up the right
// language on its very first page load.
//
// THE ORDER BELOW IS LOAD-BEARING. The account is written FIRST and the
// cookie only if that succeeded. Written the other way round, a failed
// account write would leave a cookie the middleware then reverts on the
// next navigation — the page would change language and change back, which
// reads as a bug rather than as a failure. If the save fails, nothing
// changes and the caller says so.

export type LocalePersistResult =
  /** Nobody is signed in — cookie only, which is all there is to write to. */
  | "cookie-only"
  /** Written to the account and the cookie. */
  | "saved"
  /** The account write failed. NOTHING was changed, including the cookie. */
  | "account-failed";

export function writeLocaleCookie(code: string) {
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
  refreshOfflineShell();
}

/**
 * THE ONE CACHED PAGE THAT DOES NOT REFRESH ITSELF.
 *
 * app/offline/page.tsx is rendered in the reader's language, but the copy a
 * phone actually sees is the one the service worker fetched at install
 * time (public/sw.js, `cache.add("/offline")`). Every other page is
 * network-first and re-caches itself on the next visit; that one is fetched
 * exactly once. So a person who installs the app in English and then
 * switches to Greek would keep meeting an English offline page — the ONLY
 * screen still in the old language, and the one screen where nothing can be
 * done about it, because by then there is no network.
 *
 * Both writes are wrapped: `serviceWorker` is undefined on http:// and in
 * some embedded browsers, and `controller` is null on the very first load
 * before a worker has taken control. Neither is a reason for a language
 * change to fail, so a miss here is silent and the offline page simply
 * stays as it was.
 */
function refreshOfflineShell() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "refresh-offline" });
  } catch {
    // No worker, no controller, or a browser that refuses — see above.
  }
}

export async function persistLocalePreference(code: string): Promise<LocalePersistResult> {
  const supabase = createClient();

  // getSession() reads the stored session rather than calling the auth
  // server, which is the right check for "is there anybody to save this
  // against" — this runs on the landing page too, where the answer is
  // usually no and a network round trip would be paid for nothing.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    writeLocaleCookie(code);
    return "cookie-only";
  }

  const { error } = await supabase.auth.updateUser({ data: { preferred_locale: code } });
  if (error) return "account-failed";

  writeLocaleCookie(code);
  return "saved";
}
