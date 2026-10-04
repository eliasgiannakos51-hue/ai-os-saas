/**
 * WHICH TOOLS ARE IN BETA — the discreet tag on an All tools tile
 * (docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN, «ALL TOOLS»: «Εργαλεία beta με
 * διακριτική ένδειξη»).
 *
 * The source is docs/TOOLS-STATUS.md, where a tool is "beta" until every
 * scenario of docs/BUILD-SPECS.md passes as a test and it has been seen
 * working in a browser. This list is that table's "beta" rows, by href;
 * scripts/tests/all-tools.test.mjs reads the table and holds the two in
 * step BOTH ways, so a tool that graduates loses its tag in the same
 * commit that changes its row.
 *
 * Until the tool registry of ΦΑΣΗ 1 exists (docs/QUEUE.md), this is the
 * one place the product knows a tool's status.
 */
export const BETA_TOOLS: readonly string[] = [
  "/dashboard/website-builder",
  "/dashboard/presentations",
  "/dashboard/posts",
  "/dashboard/coding",
  "/dashboard/chat",
  "/dashboard/deep-research",
  "/dashboard/data-analysis",
  "/dashboard/predictions",
  "/dashboard/voice",
  "/dashboard/projects",
  "/dashboard/mission",
  "/dashboard/meetings",
  "/dashboard/reflection",
  "/dashboard/team",
  "/dashboard/files",
  "/dashboard/finance",
  "/dashboard/sales",
  "/dashboard/trading",
  "/dashboard/ai-memory",
  "/dashboard/automation",
  "/dashboard/agents",
];

export function isBetaTool(href: string): boolean {
  return BETA_TOOLS.includes(href);
}
