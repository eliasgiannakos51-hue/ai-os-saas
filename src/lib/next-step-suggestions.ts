import { moduleHref } from "@/lib/classifier-modules";

export type NextStepSuggestion = { targetSlug: string; href: string; messageKey: string };

// Simple, hardcoded module → suggested-next-module mapping for the
// post-create nudge (see components/create/next-step-suggestion.tsx) — a
// plain object lookup, not an AI call, so it is instant and free. Not
// exhaustive: a module with no obviously useful "next" module (or one
// that would just point back at itself) has no entry, and the caller
// renders nothing for it.
//
// THIS FILE SHIPPED THIRTEEN ENGLISH SENTENCES TO TEN LANGUAGES, and the
// way that survived is the part worth recording. It held `message: "Want
// to weigh this against alternatives in Decisions?"` and the component
// rendered `{suggestion.message}` raw, so a Greek, Japanese or Arabic
// user who created an idea was asked a question in English. Every gate
// this project has missed it, for two reasons that compound:
//
//   1. scripts/tests/i18n-coverage.test.mjs's JSX-text scanner reads
//      `.tsx` only (`if (!file.endsWith(".tsx")) continue;`, twice). This
//      is `.ts`.
//   2. Its DATA_FILES list — the three `.ts` files it does read — names
//      lib/modules.ts, lib/build-modules.ts and lib/classifier-modules.ts
//      by hand, and even for those it checks that message KEYS resolve
//      rather than looking for English prose. This file was never on it.
//
// So the fix is not a translation, it is the shape: nothing here is a
// sentence any more. Each entry names a message key, the component
// translates it, and `scripts/tests/i18n-coverage.test.mjs` fails the
// build if a value in this map is prose rather than a dotted key.
const NEXT_STEP: Record<string, { targetSlug: string; messageKey: string }> = {
  ideas: { targetSlug: "decisions", messageKey: "dashboard.nextStep.ideas" },
  competitors: { targetSlug: "decisions", messageKey: "dashboard.nextStep.competitors" },
  research: { targetSlug: "ideas", messageKey: "dashboard.nextStep.research" },
  finance: { targetSlug: "analytics", messageKey: "dashboard.nextStep.finance" },
  learning: { targetSlug: "ideas", messageKey: "dashboard.nextStep.learning" },
  trading: { targetSlug: "analytics", messageKey: "dashboard.nextStep.trading" },
  decisions: { targetSlug: "products", messageKey: "dashboard.nextStep.decisions" },
  products: { targetSlug: "content", messageKey: "dashboard.nextStep.products" },
  content: { targetSlug: "sales", messageKey: "dashboard.nextStep.content" },
  sales: { targetSlug: "content", messageKey: "dashboard.nextStep.sales" },
  feedback: { targetSlug: "ideas", messageKey: "dashboard.nextStep.feedback" },
  analytics: { targetSlug: "decisions", messageKey: "dashboard.nextStep.analytics" },
  automation: { targetSlug: "analytics", messageKey: "dashboard.nextStep.automation" },
};

export function getNextStepSuggestion(sourceSlug: string): NextStepSuggestion | null {
  const entry = NEXT_STEP[sourceSlug];
  if (!entry) return null;
  return {
    targetSlug: entry.targetSlug,
    messageKey: entry.messageKey,
    href: moduleHref(entry.targetSlug),
  };
}

/** Every source slug that has a suggestion — for the gates, so a check
 *  over this map cannot pass by finding nothing. */
export function nextStepSources(): string[] {
  return Object.keys(NEXT_STEP);
}

// The "matched" CreateResult only carries the source module's href (see
// api/create/route.ts's `href: moduleHref(moduleConfig.slug)`), not its
// slug directly — this recovers it rather than widening the API contract
// just for this one nudge.
export function slugFromHref(href: string): string {
  return href === "/dashboard" ? "ideas" : href.replace(/^\/dashboard\//, "");
}
