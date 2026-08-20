import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { CLASSIFIER_MODULES, moduleHref } from "@/lib/classifier-modules";
import { BUILD_MODULES } from "@/lib/build-modules";
import { MEMORY_ICON } from "@/lib/module-icons";
import { MemorySearch, type MemoryResult } from "@/components/memory/memory-search";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import type { ModuleConfig } from "@/lib/modules";
import type { ModuleRecord } from "@/types/module-record";
import { getPlan, planMeetsMinimum } from "@/lib/billing/plans";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { isAdminEmail } from "@/lib/admin";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.memory");
}

// Every table with a ModuleConfig, across both the original 13 business
// modules (CLASSIFIER_MODULES, which is ideas + lib/modules.ts's MODULES)
// and the newer "Build" modules (lib/build-modules.ts) — read-only here, so
// pulling both in is safe and doesn't touch Create Anything's classifier or
// Overview's stats (neither of which imports from this file).
const ALL_MODULES: { config: ModuleConfig; href: string }[] = [
  ...CLASSIFIER_MODULES.map((config) => ({ config, href: moduleHref(config.slug) })),
  ...BUILD_MODULES.map((config) => ({ config, href: `/dashboard/${config.slug}` })),
];

const SNIPPET_MAX_LENGTH = 160;

function buildSnippet(config: ModuleConfig, record: ModuleRecord): string {
  const parts = config.fields
    .filter((field) => field.key !== config.headlineKey)
    .map((field) => record[field.key])
    .filter((value): value is string | number => value !== null && value !== undefined && value !== "")
    .map((value) => String(value));

  const joined = parts.join(" · ");
  return joined.length > SNIPPET_MAX_LENGTH
    ? `${joined.slice(0, SNIPPET_MAX_LENGTH).trimEnd()}…`
    : joined;
}

/** The same bounds lib/timeline.ts uses, for the same reason: this page
 *  reads every module table, and an unbounded read of 21 tables is a
 *  page that stops loading once somebody has real data. */
const PER_MODULE_LIMIT = 60;
const MAX_MEMORY_RESULTS = 200;

export default async function MemoryPage() {
  const t = await getTranslations("dashboard.memory");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);

  if (!isAdmin && !planMeetsMinimum(planSlug, "starter")) {
    return (
      <main className="min-h-full bg-dot-grid">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <PageHeader helpKey="help.memory" helpArticle="chat-memory" icon={MEMORY_ICON} title={t("title")} />
          <UpgradeRequired featureName={t("title")} planName={getPlan("starter")?.name ?? "Starter"} />
        </div>
      </main>
    );
  }

  // BOUNDED, like the surface it is a sibling of. This asked 21 tables for
  // `select("*")` with no limit and then serialised every row of every one
  // of them into the client as props — fine on a demo account, a page-load
  // timeout on a real one. lib/timeline.ts solved the identical problem
  // with the identical shape (60 per module, 200 shown); the same numbers
  // are used here so the two cannot drift into disagreeing about what
  // "recent" means.
  const perModule = await Promise.all(
    ALL_MODULES.map(async ({ config, href }) => {
      const { data } = await supabase
        .from(config.table)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PER_MODULE_LIMIT);
      return { config, href, records: (data as ModuleRecord[] | null) ?? [] };
    })
  );

  const results: MemoryResult[] = perModule
    .flatMap(({ config, href, records }) =>
      records.map((record) => ({
        id: `${config.slug}-${record.id}`,
        moduleTitleKey: config.titleKey,
        moduleHref: href,
        headline: String(record[config.headlineKey] ?? "untitled"),
        snippet: buildSnippet(config, record),
        createdAt: record.created_at,
      }))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_MEMORY_RESULTS);

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          helpKey="help.memory"
          helpArticle="chat-memory"
          icon={MEMORY_ICON}
          title={t("title")}
          description={t("description")}
        />

        <MemorySearch results={results} />
      </div>
    </main>
  );
}
