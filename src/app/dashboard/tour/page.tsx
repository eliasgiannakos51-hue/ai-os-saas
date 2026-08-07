import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Compass,
  Globe,
  Target,
  MessageCircle,
  Table2,
  Presentation,
  Bot,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "What can Ionexa do?" };

/**
 * The capability overview, ON DEMAND ONLY.
 *
 * This page exists for whoever asks "what can this thing do?" — it is
 * linked from the sidebar and nowhere else, and it is NEVER shown to a
 * new user automatically. The first-run flow asks what they want to DO
 * and takes them there; a presentation up front is the pattern that made
 * a tester conclude the product was "several LLMs in one, cheaper".
 *
 * Deliberately no pricing here either. Plans appear at limit moments
 * (the smart upgrade triggers), not in an overview a curious user opened
 * to learn what the product does.
 */
const SECTIONS = [
  { key: "website", icon: Globe, href: "/dashboard/website-builder" },
  { key: "mission", icon: Target, href: "/dashboard/mission" },
  { key: "chat", icon: MessageCircle, href: "/dashboard/chat" },
  { key: "data", icon: Table2, href: "/dashboard/files" },
  { key: "presentations", icon: Presentation, href: "/dashboard/presentations" },
  { key: "agents", icon: Bot, href: "/dashboard/agents" },
] as const;

export default async function TourPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.tour");

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={Compass} title={t("title")} description={t("description")} />

        <div className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map(({ key, icon: Icon, href }) => (
            <Link
              key={key}
              href={href}
              className="group rounded-2xl border border-border bg-panel/60 p-4 transition-colors duration-150 hover:border-orange-500/50"
            >
              <Icon className="mb-2 h-5 w-5 text-orange-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">{t(`sections.${key}.title`)}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {t(`sections.${key}.description`)}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-orange-400">
                {t("tryIt")}
                <ArrowRight
                  className="h-3 w-3 transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
