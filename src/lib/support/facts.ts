import { PLANS, CURRENCY_SYMBOL, TEAM_SEAT_PRICE, CREDIT_PACKS } from "@/lib/billing/plans";

// The prices, allowances and limits the support assistant is allowed to
// state — generated from the code that enforces them, not written down
// anywhere a human could let drift.
//
// WHY THIS IS NOT A HELP ARTICLE. Everything else the widget answers from
// is prose in help_articles, which somebody edits. Prices are the one
// thing where an out-of-date sentence is not a stale document but a wrong
// quote to a customer. Deriving them from lib/billing/plans.ts means the
// support answer changes in the same commit as the checkout does, and the
// grounding check in grounding.ts then makes any OTHER number impossible
// to state at all.
//
// Client-safe: no secret, no database, nothing but the same constants the
// pricing page renders.

/** Human-readable, and deliberately dense — this is model input, not UI. */
export function buildPlanFacts(): string {
  const lines: string[] = [];
  lines.push("PLANS AND PRICES (every price is per month, in EUR):");
  for (const plan of PLANS) {
    const price =
      plan.slug === "enterprise"
        ? "custom pricing, contact sales"
        : plan.price === 0
          ? "free"
          : `${CURRENCY_SYMBOL}${plan.price} per month`;
    const credits =
      plan.monthlyCredits === "custom" ? "custom credit allowance" : `${plan.monthlyCredits} credits per month`;
    const caps = plan.capabilities;
    const agents =
      caps.maxAiAgents === "unlimited" ? "unlimited AI agents" : `${caps.maxAiAgents} AI agents`;
    const included = [
      caps.websiteBuilder ? "Website Builder" : null,
      caps.mobileSaasBuilder ? "Mobile and SaaS Builder" : null,
      caps.imageVideoGeneration ? "image and video generation" : null,
      caps.aiMemory ? "AI Memory" : null,
      caps.teamCollaboration ? "team collaboration" : null,
      caps.customAiPersona ? "custom AI persona name" : null,
    ].filter(Boolean);
    const excluded = [
      caps.websiteBuilder ? null : "Website Builder",
      caps.mobileSaasBuilder ? null : "Mobile and SaaS Builder",
      caps.imageVideoGeneration ? null : "image and video generation",
      caps.aiMemory ? null : "AI Memory",
      caps.teamCollaboration ? null : "team collaboration",
    ].filter(Boolean);
    lines.push(
      `- ${plan.name}: ${price}. ${credits}. ${agents}. ` +
        `Includes: ${included.length ? included.join(", ") : "none of the paid capabilities"}. ` +
        `Not included: ${excluded.length ? excluded.join(", ") : "nothing — everything is included"}. ` +
        `Team seats: ${plan.hasTeamSeats ? `yes, ${CURRENCY_SYMBOL}${TEAM_SEAT_PRICE} per extra seat per month${plan.teamSeatsIncluded ? `, ${plan.teamSeatsIncluded} included free` : ""}` : "not available"}.`
    );
  }

  lines.push("");
  lines.push("CREDIT PACKS (one-off purchases, on top of the monthly allowance):");
  for (const pack of CREDIT_PACKS) {
    lines.push(`- ${pack.credits} credits for ${CURRENCY_SYMBOL}${pack.price}.`);
  }

  lines.push("");
  lines.push(
    "Credits are what every AI action costs. They reset monthly on paid plans. " +
      "Unused monthly credits do not roll over; purchased credit packs do not expire monthly."
  );
  return lines.join("\n");
}

/**
 * The one-line statement of what the product IS, in the same plain terms
 * the landing page uses. Included in every request so the assistant does
 * not have to infer it from whichever article happened to be retrieved.
 */
export const PRODUCT_FACTS = `WHAT IONEXA IS:
Ionexa AI is one workspace where you describe what you want in plain words
and it gets built or done. The things it really does today, and nothing
else, are: Ionexa Chat (a general AI assistant that can see your own
records), Create Anything (describe something and it is filed into the
right module), a Website Builder that writes a complete single-page site
and can publish it at a real address, Mission Control (turn a goal into
steps with an outcome and a time estimate each, and schedule them),
autonomous AI Agents that run on a schedule and email or Slack their
result, a File Workspace with Deep Research over uploaded files, AI Memory
and search across everything, Integrations with Gmail, Google Drive and
Slack (read-only except Slack), a Marketplace of workspace templates, and
23 business modules for tracking ideas, competitors, research, finance,
learning, trading, decisions, products, content, sales, feedback,
analytics and automations.

Ionexa runs on Anthropic's Claude models. It is a web app: there is no
downloadable desktop or phone application.`;
