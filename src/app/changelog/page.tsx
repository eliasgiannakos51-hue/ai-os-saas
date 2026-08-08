import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Sparkles, Wrench, Bug, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppBackground } from "@/components/ui/app-background";
import { Logo } from "@/components/logo";
import { formatRelativeTime } from "@/lib/format-time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What's new in Ionexa AI.",
};

const TYPE_ICONS = { feature: Sparkles, improvement: Wrench, fix: Bug } as const;

/**
 * The public changelog (V3 Task 13). Reads through the same RLS policy
 * as everyone else — published entries only — so a draft cannot appear
 * here no matter what this code does. Deliberately NOT plan-segmented:
 * the public page is the record; segmentation is an in-app concern
 * (/api/changelog), because "what exists" and "what's relevant to you"
 * are different questions.
 */
export default async function ChangelogPage() {
  const t = await getTranslations("changelog");
  const locale = await getLocale();
  const supabase = createClient();

  const { data: updates } = await supabase
    .from("product_updates")
    .select("id, title, description, type, published_at")
    .order("published_at", { ascending: false })
    .limit(100);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background px-4 py-12">
      <AppBackground />
      <div className="relative z-10 mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Logo iconOnly className="h-7 w-7" />
            <span className="text-sm font-bold text-foreground">IONEXA</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t("backHome")}
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-foreground">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("pageSubtitle")}</p>

        <div className="mt-8 space-y-4">
          {(updates ?? []).length === 0 && (
            <p className="rounded-2xl border border-border bg-panel/60 p-4 text-sm text-muted">
              {t("empty")}
            </p>
          )}
          {(updates ?? []).map((update) => {
            const Icon = TYPE_ICONS[update.type as keyof typeof TYPE_ICONS] ?? Wrench;
            return (
              <article key={update.id} className="rounded-2xl border border-border bg-panel/60 p-4">
                <div className="flex items-center gap-2">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${update.type === "feature" ? "text-orange-400" : "text-muted"}`}
                    aria-hidden="true"
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {t(`types.${update.type}`)}
                  </span>
                  {update.published_at && (
                    <span className="ml-auto text-[11px] text-muted/70">
                      {formatRelativeTime(update.published_at, locale)}
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-base font-semibold text-foreground">{update.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">{update.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
