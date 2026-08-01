import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GreetingHeader } from "@/components/overview/greeting-header";
import { CreateChat } from "@/components/create/create-chat";
import { QuickActionCard } from "@/components/overview/quick-action-card";
import { StatCard } from "@/components/overview/stat-card";
import { RecentEntriesCard, type RecentEntry } from "@/components/overview/recent-entries-card";
import { AiCoachCard } from "@/components/overview/ai-coach-card";
import { QuickStartButton } from "@/components/overview/quick-start-button";
import { MODULE_ICONS } from "@/lib/module-icons";
import { CLASSIFIER_MODULES, moduleHref } from "@/lib/classifier-modules";
import { Layers, TrendingUp } from "lucide-react";
import type { ModuleRecord } from "@/types/module-record";

export const metadata: Metadata = {
  title: "Overview",
};

const QUICK_ACTIONS = [
  { slug: "ideas", label: "Idea", description: "Capture a new idea" },
  { slug: "research", label: "Research", description: "Log research notes" },
  { slug: "finance", label: "Finance", description: "Track income & expenses" },
  { slug: "trading", label: "Trading", description: "Log a trade" },
  { slug: "products", label: "Product Plan", description: "Plan a new product" },
  { slug: "content", label: "Content", description: "Draft content ideas" },
  { slug: "decisions", label: "Decision", description: "Weigh your options" },
  { slug: "automation", label: "Automation", description: "Save time automating" },
] as const;

export default async function OverviewPage() {
  const t = await getTranslations("dashboard.overview");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const summaries = await Promise.all(
    CLASSIFIER_MODULES.map(async (module) => {
      const [recentRowsResult, recentCountResult] = await Promise.all([
        supabase
          .from(module.table)
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from(module.table)
          .select("id", { count: "exact", head: true })
          .gte("created_at", sevenDaysAgo),
      ]);

      return {
        module,
        href: moduleHref(module.slug),
        count: recentRowsResult.count ?? 0,
        recentCount: recentCountResult.count ?? 0,
        rows: (recentRowsResult.data as ModuleRecord[] | null) ?? [],
      };
    })
  );

  const recentEntries: RecentEntry[] = summaries
    .flatMap((summary) =>
      summary.rows.map((row) => ({
        id: `${summary.module.slug}-${row.id}`,
        title: String(row[summary.module.headlineKey] ?? "untitled"),
        moduleTitle: summary.module.title,
        href: summary.href,
        createdAt: row.created_at,
      }))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const totalThisWeek = summaries.reduce((sum, s) => sum + s.recentCount, 0);
  const mostActive = summaries.reduce<(typeof summaries)[number] | null>(
    (max, s) => (s.count > (max?.count ?? -1) ? s : max),
    null
  );

  // "AI Coach" digest — same recentCount numbers as the stat cards below,
  // just reframed as a sentence. Top 3 modules with activity this week,
  // ranked by how much of it happened there.
  const topModulesThisWeek = summaries
    .filter((s) => s.recentCount > 0)
    .sort((a, b) => b.recentCount - a.recentCount)
    .slice(0, 3);

  const aiCoachSummary =
    topModulesThisWeek.length === 0
      ? t("aiCoach.noActivity")
      : [
          topModulesThisWeek
            .map((s) => t("aiCoach.entryCount", { count: s.recentCount, module: s.module.title }))
            .join(", "),
          t("aiCoach.mostActiveIn", { module: topModulesThisWeek[0].module.title }),
        ].join(". ");

  return (
    <main className="min-h-full bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <GreetingHeader email={user.email ?? ""} />
          <QuickStartButton />
        </div>

        <AiCoachCard title={t("aiCoach.title")} summary={aiCoachSummary} />

        <div className="mt-6">
          <CreateChat showHeading={false} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <QuickActionCard
              key={action.slug}
              href={moduleHref(action.slug)}
              icon={MODULE_ICONS[action.slug]}
              label={action.label}
              description={action.description}
            />
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RecentEntriesCard entries={recentEntries} />

          <StatCard
            icon={Layers}
            label={t("mostActiveModule")}
            value={mostActive && mostActive.count > 0 ? mostActive.module.title : "—"}
            sublabel={
              mostActive && mostActive.count > 0
                ? t("entry", { count: mostActive.count })
                : undefined
            }
          />

          <StatCard
            icon={TrendingUp}
            label={t("totalEntriesThisWeek")}
            value={String(totalThisWeek)}
            sublabel={t("acrossAllModules")}
          />
        </div>
      </div>
    </main>
  );
}
