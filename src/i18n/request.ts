import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveSupportedLocale } from "./constants";

// Cookie-based locale, no URL routing (no /en/, /el/ path prefixes) — every
// existing route keeps its current path exactly as-is. The dropdown in
// language-selector.tsx writes this cookie directly; changing it and
// calling router.refresh() re-runs this config on the next server render.
export default getRequestConfig(async () => {
  const cookieStore = cookies();
  const locale = resolveSupportedLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
