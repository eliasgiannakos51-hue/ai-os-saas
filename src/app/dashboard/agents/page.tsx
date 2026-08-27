import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { listSlackChannels } from "@/lib/integrations/read";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { MODULE_ICONS } from "@/lib/module-icons";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { maxAgentsForPlan, DEFAULT_AGENT_LIMITS } from "@/lib/agents/agent-limits";
import { agentRunEstimatesByDepth } from "@/lib/agents/execute-agent";
import { resolveEffectivePlan, getPurchasedPackCreditPriceEur } from "@/lib/billing/credits";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import {
  AGENT_DEPTH_SPECS,
  AGENT_DEPTH_SECONDS,
  agentMaxSteps,
  TEMPLATE_FILL_MODEL,
  AGENT_BUILDER_MODEL,
} from "@/lib/agents/agent-depth";
import { estimateForAction } from "@/lib/billing/estimate";
import { AgentsWorkspace } from "@/components/agents/agents-workspace";
import type { AgentRun, UserAgent } from "@/lib/agents/agent-config";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.agents");
}

// Autonomous Agents.
//
// This route used to render the `ai_agents` Build-module TRACKER — a row
// the user typed by hand, that never did anything. It now renders the real
// feature. `ai_agents` is left in the database untouched, exactly as
// `ai_documents` was when the Documents module replaced it at
// /dashboard/documents; nothing has been deleted, it is simply no longer
// the thing this route shows.
//
// How many runs to load for the history panel. Enough to answer "has this
// been working?" for every agent on the page without an N+1 per-agent
// query — one query, filtered client-side by agent.
const RUN_HISTORY_LIMIT = 60;

export default async function AgentsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.agents");
  const isAdmin = isAdminEmail(user.email);
  // ONE plan resolution, not two. resolveEffectivePlan calls
  // resolveEffectivePlanSlug internally, so asking for both is a second
  // beta-bypass round trip for a value already in hand — and it is what
  // pushed this page over the four-sequential-awaits budget that
  // scripts/tests/navigation-latency-static.test.mjs enforces.
  const [plan, packCreditPriceEur] = await Promise.all([
    resolveEffectivePlan(user),
    getPurchasedPackCreditPriceEur(user.id),
  ]);
  const planSlug = plan.slug;
  const planCap = maxAgentsForPlan(planSlug);

  if (!isAdmin && planCap <= 0) {
    return (
      <main className="min-h-full bg-dot-grid">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <PageHeader helpKey="help.agents" helpArticle="create-agent" icon={MODULE_ICONS.agents} title={t("title")} description={t("description")} />
          <UpgradeRequired featureName={t("title")} planName="Starter" />
        </div>
      </main>
    );
  }

  // RLS scopes both reads to this user's own rows; the explicit user_id
  // filter is belt-and-braces, and it is also what makes the composite
  // indexes on (user_id, ...) usable.
  const [{ data: agents, error: agentsError }, { data: runs, error: runsError }] = await Promise.all([
    supabase
      .from("user_agents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("agent_runs")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(RUN_HISTORY_LIMIT),
  ]);

  // THE SLACK CHANNELS THE AGENT MAY BE POINTED AT, resolved server-side
  // from this user's own connected workspace. Fetched here rather than by
  // the picker so the browser is never the thing that decides which
  // channels exist — and best-effort, because a Slack outage must not
  // take the Agents page down with it.
  const slackChannels = await listSlackChannels(user.id)
    .then((result) => (result.ok ? result.channels : []))
    .catch(() => []);

  // An admin is not capped, but the workspace needs a number to display
  // and to disable "+ New" against. The highest published allowance is the
  // honest one to show.
  const cap = isAdmin ? Math.max(planCap, DEFAULT_AGENT_LIMITS.enterprise) : planCap;

  // WHAT EACH TIER COSTS THIS ACCOUNT, priced on the server by the same
  // function that sizes the hold. A figure computed in the browser would
  // be a second implementation of the pricing — and the one people read
  // before they commit.
  //
  // Priced against a REPRESENTATIVE task length rather than a specific
  // agent's, because this table is shown beside the create screen before
  // any task exists. The workspace labels it "about", and the preview
  // screen shows the exact figure for the draft it is about to create.
  const pricingConfig = resolvePricingConfig();
  const creditPriceEur = effectiveCreditPriceEurForAccount(plan, packCreditPriceEur, pricingConfig);
  const REPRESENTATIVE_TASK_CHARS = 600;
  const depthPrices = agentRunEstimatesByDepth({
    promptChars: REPRESENTATIVE_TASK_CHARS,
    needsWebSearch: true,
    accountCreditPriceEur: creditPriceEur,
    planSlug,
  });
  // THE TWO NUMBERS THE "use this one / build a new one" CHOICE IS MADE
  // ON, both priced on the server by estimateForAction — the same
  // function that sizes the hold each path takes. A component that
  // computed either of them would be a second implementation of the
  // pricing, shown at the moment of the decision.
  const templateCredits = estimateForAction(
    "agentTemplateFill",
    { model: TEMPLATE_FILL_MODEL, inputChars: REPRESENTATIVE_TASK_CHARS, planSlug },
    pricingConfig,
    creditPriceEur
  ).estimatedCredits;
  const buildCredits = estimateForAction(
    "agentBuild",
    { model: AGENT_BUILDER_MODEL, inputChars: REPRESENTATIVE_TASK_CHARS, planSlug },
    pricingConfig,
    creditPriceEur
  ).estimatedCredits;

  // The rest of the table the picker shows — model, steps, sources, time.
  // Derived from the specs rather than retyped into the component, so a
  // tier whose search budget changes cannot keep advertising the old one.
  const depthFacts = Object.fromEntries(
    (Object.keys(AGENT_DEPTH_SPECS) as (keyof typeof AGENT_DEPTH_SPECS)[]).map((depth) => [
      depth,
      {
        model: AGENT_DEPTH_SPECS[depth].model,
        steps: agentMaxSteps(depth, true),
        sources: AGENT_DEPTH_SPECS[depth].maxSearches,
        seconds: AGENT_DEPTH_SECONDS[depth],
        credits: depthPrices[depth],
      },
    ])
  );

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.agents" helpArticle="create-agent" icon={MODULE_ICONS.agents} title={t("title")} description={t("description")} />

        {/* EU AI Act Article 50 — the user has to know they are configuring
            an AI system and that everything it sends them is AI-generated.
            Stated once, on the surface where agents are created, in
            addition to the notice carried by every delivered email. */}
        <p className="mb-4 rounded-xl border border-border bg-panel/60 p-3 text-[11px] leading-relaxed text-muted">
          {t("aiDisclosure")}
        </p>

        {agentsError && <ErrorMessage detail={`loading agents: ${agentsError.message}`} />}
        {runsError && <ErrorMessage detail={`loading agent runs: ${runsError.message}`} />}

        <AgentsWorkspace
          agents={(agents as UserAgent[] | null) ?? []}
          runs={(runs as AgentRun[] | null) ?? []}
          agentCap={cap}
          accountEmail={user.email ?? ""}
          slackChannels={slackChannels}
          depthFacts={depthFacts}
          templateCredits={templateCredits}
          buildCredits={buildCredits}
        />
      </div>
    </main>
  );
}
