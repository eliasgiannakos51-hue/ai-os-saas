"use client";

import { useTranslations } from "next-intl";
import { GlobeMark } from "@/components/ui/globe-mark";

// Full-page loading placeholder (dashboard/loading.tsx and friends).
// Uses the shared `.skeleton` shimmer from globals.css rather than
// Tailwind's `animate-pulse`: a sweeping highlight reads as "content is
// on its way", a pulsing opacity fade reads as "something is blinking at
// you". The staggered animationDelay keeps the bars from sweeping in
// lockstep, which is what makes it look like a page filling in rather
// than one big flashing block.
export function LoadingState() {
  const t = useTranslations("common");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* The same mark as the favicon, the email logo and the thinking
            state — see lib/brand/globe.ts. A whole-app boot is the first
            thing a returning user sees, and it used to show the wordmark
            in a colour and nothing else. */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <GlobeMark size={40} spin />
          <p className="text-center text-xs tracking-widest text-orange-500">Ionexa AI</p>
        </div>
        <div className="space-y-3" aria-label={t("loadingContent")} role="status">
          <div className="skeleton h-4 w-1/3 rounded" />
          <div className="skeleton h-10 w-full rounded" style={{ animationDelay: "120ms" }} />
          <div className="skeleton h-10 w-full rounded" style={{ animationDelay: "240ms" }} />
          <div className="skeleton h-10 w-5/6 rounded" style={{ animationDelay: "360ms" }} />
        </div>
      </div>
    </main>
  );
}
