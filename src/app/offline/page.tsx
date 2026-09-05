import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return { title: t("offline.title"), description: t("offline.lastResortBody") };
}

// The last-resort page the service worker serves when a navigation fails
// and nothing for that URL is cached (see public/sw.js).
//
// IT IS TRANSLATED NOW, AND THE REASON IT WAS NOT IS WORTH KEEPING.
//
// This file used to carry a comment saying "plain English … the locale it
// would need lives behind a request this page exists precisely because it
// failed", and scripts/tests/offline-state.test.mjs asserted that the
// English sentence and that excuse both stayed. The excuse was wrong, and
// the gate had pinned it in place: this page is never RENDERED offline. It
// is fetched once, over the network, by the service worker's install
// handler — `cache.add("/offline")`, a same-origin request that carries
// the NEXT_LOCALE cookie like any other — and what the browser shows
// offline is that already-rendered HTML. The locale was available at the
// only moment this page is ever built.
//
// So the three sentences come from messages/*.json like everything else,
// and two of the three were already there in ten languages
// (common.offline.title, common.offline.retry) being used by the online
// "you are offline" banner — a Greek user losing their connection read a
// translated banner on one screen and English on the other.
//
// WHAT THE SERVICE WORKER HAD TO LEARN for this to be true offline:
//
//   1. `caches.match(OFFLINE_URL, { ignoreVary: true })`. A page that
//      reads a cookie may be stored with a Vary header, and a Vary-aware
//      match from a synthetic Request that carries no cookie misses it —
//      which would mean no offline page at all. The flag is correct
//      whether or not the header ever appears; nothing on this page is
//      per-user.
//   2. A `refresh-offline` message. The cached copy is in the language the
//      cookie held at install time, so changing language would otherwise
//      leave yesterday's language here until the next deploy.
//      lib/locale-preference.ts posts that message after every successful
//      switch and the worker re-fetches this page.
//
// Still deliberately dependency-free otherwise: no session, no data fetch,
// no client component. Its own JavaScript chunk is NOT in the cache — the
// install handler fetches the HTML and nothing else — so anything this
// page needs has to be in the HTML.
export default async function OfflinePage() {
  const t = await getTranslations("common");
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10 text-orange-400">
          <WifiOff className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold">{t("offline.title")}</h1>
        <p className="mt-3 text-sm text-muted">{t("offline.lastResortBody")}</p>
        <Link
          href="/dashboard/overview"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400"
        >
          {t("offline.retry")}
        </Link>
      </div>
    </main>
  );
}
