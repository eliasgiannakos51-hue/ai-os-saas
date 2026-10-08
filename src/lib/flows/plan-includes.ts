import { accountHasCapability, type BooleanCapability } from "@/lib/billing/capability-gate";
import { maxResearchRunsForPlan } from "@/lib/files/limits";
import type { PlanSlug } from "@/lib/billing/plans";
import type { FlowKind } from "@/lib/flows/plan";

/**
 * WHAT THIS PERSON'S PLAN INCLUDES OF A FLOW (package 36), asked the way
 * each step's own route asks it before it spends anything:
 *
 *   site      api/websites/generate       capabilities.websiteBuilder
 *   posts     api/posts/generate          capabilities.posts
 *   slides    api/presentations/generate  capabilities.presentations
 *   research  api/research                maxResearchRunsForPlan above 0
 *   analysis  api/data-analysis/upload    every plan; its credits decide
 *
 * The pictures are asked in lib/flows/availability.ts, with their switch
 * and their key, as lib/images/image-access.ts asks them. The owner
 * passes every gate here, as he does at each route.
 *
 * Until 2026-10-08 all five read as included on every plan: a Free
 * account was offered a site, posts, a research and a deck, approved
 * the plan — its one project went to it (lib/projects/project-limits.ts)
 * — and each tool refused when its step ran.
 *
 * A plan's slug in, no database (the research limits can be set per
 * deployment, in lib/files/limits.ts, and are read from there as the
 * route reads them). Held by scripts/tests/flows.test.mjs, which reads
 * each route's own gate for the capability named here.
 */
export const STEP_CAPABILITY: Record<"site" | "posts" | "slides", BooleanCapability> = {
  site: "websiteBuilder",
  posts: "posts",
  slides: "presentations",
};

export function planIncludes(slug: PlanSlug | null | undefined, isAdmin: boolean): Record<Exclude<FlowKind, "images">, boolean> {
  return {
    research: isAdmin || maxResearchRunsForPlan(slug) > 0,
    site: accountHasCapability(slug, STEP_CAPABILITY.site, isAdmin),
    posts: accountHasCapability(slug, STEP_CAPABILITY.posts, isAdmin),
    slides: accountHasCapability(slug, STEP_CAPABILITY.slides, isAdmin),
    analysis: true,
  };
}
