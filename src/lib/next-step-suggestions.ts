import { moduleHref } from "@/lib/classifier-modules";

export type NextStepSuggestion = { targetTitle: string; href: string; message: string };

// Simple, hardcoded module → suggested-next-module mapping for the
// post-create nudge (see components/create/next-step-suggestion.tsx) — a
// plain object lookup, not an AI call, so it's instant and free. Not
// exhaustive: a module with no obviously useful "next" module (or one
// that would just point back at itself) has no entry, and the caller
// renders nothing for it.
const NEXT_STEP: Record<string, { targetSlug: string; targetTitle: string; message: string }> = {
  ideas: {
    targetSlug: "decisions",
    targetTitle: "Decisions",
    message: "Want to weigh this against alternatives in Decisions?",
  },
  competitors: {
    targetSlug: "decisions",
    targetTitle: "Decisions",
    message: "Want to factor this into a Decision?",
  },
  research: {
    targetSlug: "ideas",
    targetTitle: "Ideas",
    message: "Turn this into an Idea?",
  },
  finance: {
    targetSlug: "analytics",
    targetTitle: "Analytics",
    message: "Want to track this trend in Analytics?",
  },
  learning: {
    targetSlug: "ideas",
    targetTitle: "Ideas",
    message: "Got an idea from this? Log it in Ideas.",
  },
  trading: {
    targetSlug: "analytics",
    targetTitle: "Analytics",
    message: "Want to see this trend in Analytics?",
  },
  decisions: {
    targetSlug: "products",
    targetTitle: "Products",
    message: "Ready to turn this into a Product plan?",
  },
  products: {
    targetSlug: "content",
    targetTitle: "Content",
    message: "Want to add a Content plan for this?",
  },
  content: {
    targetSlug: "sales",
    targetTitle: "Sales",
    message: "Want to line up outreach in Sales?",
  },
  sales: {
    targetSlug: "content",
    targetTitle: "Content",
    message: "Want new content to support this?",
  },
  feedback: {
    targetSlug: "ideas",
    targetTitle: "Ideas",
    message: "Turn this feedback into an Idea?",
  },
  analytics: {
    targetSlug: "decisions",
    targetTitle: "Decisions",
    message: "Want to make a Decision based on this?",
  },
  automation: {
    targetSlug: "analytics",
    targetTitle: "Analytics",
    message: "Want to track the time this saves in Analytics?",
  },
};

export function getNextStepSuggestion(sourceSlug: string): NextStepSuggestion | null {
  const entry = NEXT_STEP[sourceSlug];
  if (!entry) return null;
  return { targetTitle: entry.targetTitle, message: entry.message, href: moduleHref(entry.targetSlug) };
}

// The "matched" CreateResult only carries the source module's href (see
// api/create/route.ts's `href: moduleHref(moduleConfig.slug)`), not its
// slug directly — this recovers it rather than widening the API contract
// just for this one nudge.
export function slugFromHref(href: string): string {
  return href === "/dashboard" ? "ideas" : href.replace(/^\/dashboard\//, "");
}
