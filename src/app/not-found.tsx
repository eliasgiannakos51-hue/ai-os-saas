import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

// The tab title is the NUMBER, deliberately.
//
// Every other page in the app builds its title through generateMetadata
// (lib/page-title.ts) so it can read the locale cookie. `not-found.tsx` is
// the one file in the App Router that cannot: Next.js resolves metadata
// for it from the static `metadata` export only, and never calls
// `generateMetadata` — so any word here would be frozen in one language.
// "404" is the same in all ten, which is why it is the whole title rather
// than a prefix to an English phrase. The body below, which is where the
// actual sentence lives, does go through next-intl.
export const metadata: Metadata = {
  title: "404",
};

export default async function NotFound() {
  const t = await getTranslations("pageTitle");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <p className="text-sm tracking-widest text-orange-500">Ionexa AI</p>
      <h1 className="mt-2 text-6xl font-bold text-foreground sm:text-7xl">
        404
      </h1>
      <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
        {t("notFoundBody")}
      </p>

      <Link
        href="/dashboard/overview"
        className="mt-10 inline-flex min-h-[44px] items-center justify-center rounded bg-orange-500 px-6 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
      >
        {t("notFoundAction")}
      </Link>
    </main>
  );
}
