import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { GenericList } from "@/components/modules/generic-list";
import { TimelineList } from "@/components/timeline/timeline-list";
import { ReflectionGenerator } from "@/components/reflection/reflection-generator";
import { PatternInsightCard } from "@/components/trading-workflow/pattern-insight-card";
import { ProductMentorButton } from "@/components/product-workflow/product-mentor-button";
import { ProductMissionButton } from "@/components/product-workflow/product-mission-button";
import { getModule } from "@/lib/modules";
import { RECORD_CAP } from "@/lib/record-cap";
import { PRODUCT_WORKFLOW_ICON } from "@/lib/module-icons";
import { loadLinkedEntities } from "@/lib/entity-links";
import { loadFavoriteIds } from "@/lib/favorites";
import { loadTimelineEntries } from "@/lib/timeline";
import { detectProductDetailInsight, type ProductForPattern } from "@/lib/product-pattern";
import type { ModuleRecord } from "@/types/module-record";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.productWorkflow");
}

const MINI_TIMELINE_LIMIT = 10;

// Second proof of the "workflow depth" pattern first built for Trading
// Workflow (see dashboard/trading-workflow/page.tsx) — an additive layer
// on top of the existing, unmodified Products module
// (/dashboard/products), reusing that module's own add form/list plus
// already-built V2 pieces (Knowledge Graph, Timeline, Mentor Mode,
// Mission Control, Weekly Reflection) scoped to product data. The only
// genuinely new logic is the planning-detail-vs-links insight
// (lib/product-pattern.ts, no AI) and the product-specific Mentor/Mission
// entry points — PatternInsightCard, GenericAddForm/List,
// loadLinkedEntities, loadTimelineEntries, and ReflectionGenerator's
// scope prop were all reused completely unchanged.
export default async function ProductWorkflowPage() {
  const t = await getTranslations("dashboard.productWorkflow");
  const supabase = createClient();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const productsModule = getModule("products");
  if (!productsModule) {
    redirect("/dashboard/products");
  }

  // Capped like the Products module page it mirrors — these are the same
  // rows, so an uncapped read here would undo the cap there.
  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RECORD_CAP);

  const productRows = (products as ModuleRecord[] | null) ?? [];

  // BOTH, in parallel. This page loaded links and not favourites,
  // so GenericList fell back to `favoritedIds?.has(id) ?? false` and
  // every star rendered empty — on records the user really had
  // starred, and which show as starred on the module page.
  const [linkedEntities, favoritedIds] = await Promise.all([
    loadLinkedEntities(supabase, user.id, "products", productRows.map((r) => r.id)),
    loadFavoriteIds(supabase, user.id, "products", productRows.map((r) => r.id)),
  ]);

  const patternProducts: ProductForPattern[] = productRows.map((r) => ({
    id: r.id,
    mvp_features: typeof r.mvp_features === "string" ? r.mvp_features : null,
    roadmap: typeof r.roadmap === "string" ? r.roadmap : null,
    launch_plan: typeof r.launch_plan === "string" ? r.launch_plan : null,
    target_audience: typeof r.target_audience === "string" ? r.target_audience : null,
    linkedCount: (linkedEntities[r.id] ?? []).length,
  }));

  // Pure SQL/JS aggregation (lib/product-pattern.ts), no AI — only
  // contributes a line if there's actually enough data in BOTH groups to
  // say something real; "no products yet" and "not enough data" are the
  // only two states shown otherwise, same honest-fallback convention as
  // Trading Workflow's pattern insight.
  const detailInsight = detectProductDetailInsight(patternProducts);
  const insightMessages: string[] = [];
  if (detailInsight) {
    insightMessages.push(
      t("insight.detailPattern", {
        detailedAvg: detailInsight.detailedAvgLinks,
        detailedCount: detailInsight.detailedCount,
        briefAvg: detailInsight.briefAvgLinks,
        briefCount: detailInsight.briefCount,
      })
    );
  } else {
    insightMessages.push(productRows.length === 0 ? t("insight.noProducts") : t("insight.notEnoughData"));
  }

  const productTimeline = (
    await loadTimelineEntries(supabase, user.id, { moduleSlug: "products", range: "all" })
  ).entries.slice(0, MINI_TIMELINE_LIMIT);

  return (
    <div className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          icon={PRODUCT_WORKFLOW_ICON}
          title={t("title")}
          description={t("description")}
          helpKey="help.productWorkflow"
        />

        <PatternInsightCard title={t("insight.title")} messages={insightMessages} />

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ProductMentorButton label={t("mentorButton")} description={t("mentorButtonDescription")} />
          <ProductMissionButton
            label={t("missionButton")}
            description={t("missionButtonDescription")}
            creatingLabel={t("missionButtonCreating")}
            goal={t("missionGoal")}
          />
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">{t("timelineTitle")}</h2>
          <div className="mt-3">
            <TimelineList entries={productTimeline} />
          </div>
          <Link
            href="/dashboard/timeline?module=products"
            className="mt-2 inline-block text-xs text-orange-400 transition-colors duration-150 hover:underline"
          >
            {t("viewFullTimeline")}
          </Link>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">{t("reflectionTitle")}</h2>
          <div className="mt-3">
            <ReflectionGenerator scope="product" />
          </div>
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">{t("productsTitle")}</h2>

          {error && <ErrorMessage detail={`loading products: ${error.message}`} />}


          <GenericList module={productsModule} cap={RECORD_CAP} records={productRows} linkedEntities={linkedEntities} favoritedIds={favoritedIds} />
        </div>
      </div>
    </div>
  );
}
