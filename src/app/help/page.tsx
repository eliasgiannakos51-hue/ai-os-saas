import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppBackground } from "@/components/ui/app-background";
import { Logo } from "@/components/logo";
import { HelpIndex } from "@/components/help/help-index";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Help Center",
  description: "How Ionexa AI works — guides, credits, billing and troubleshooting.",
};

/**
 * The help centre (V3 Task 13). Public: an article that answers a
 * question before signup is doing its best work. Content lives in
 * help_articles (RLS: published only); this page groups by category and
 * hands the list to a client component for instant search.
 */
export default async function HelpPage() {
  const t = await getTranslations("help");
  const supabase = createClient();

  const { data: articles } = await supabase
    .from("help_articles")
    .select("slug, title, category, sort_order")
    .order("sort_order", { ascending: true })
    .limit(200);

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

        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
            <LifeBuoy className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
            <p className="mt-0.5 text-sm text-muted">{t("subtitle")}</p>
          </div>
        </div>

        <HelpIndex articles={articles ?? []} />
      </div>
    </main>
  );
}
