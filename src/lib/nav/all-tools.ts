// ALL TOOLS, AS THE DESIGN GROUPS THEM (ΣΥΣΤΗΜΑ DESIGN §6, 2026-10-05):
// Make, Ask, Organise, Business — four headings, big squares, no «beta».
//
// WHAT IS SHOWN IS THE OWNER'S RULE (NEEDS 19, decided 2026-10-05): a tool
// is shown when it does its main job end to end today, even if it does
// not yet pass every BUILD-SPECS scenario. It is hidden when it is only a
// screen, when it produces nothing, or when its NAME promises something it
// does not do. A hidden tool comes back when it works; its page still opens
// by its address, so nothing anybody has is taken away.
//
// The sidebar's own groups (lib/sidebar-nav.ts) are untouched: the palette
// and the gates on that list still read it. This file only says where each
// of those tools sits on the All tools page, and the gate
// (scripts/tests/all-tools.test.mjs) holds that every visible tool is in
// exactly one group here or hidden here with a reason — both ways.

export type AllToolsGroupKey = "make" | "ask" | "organise" | "business";

export const ALL_TOOLS_GROUPS: readonly { key: AllToolsGroupKey; hrefs: readonly string[] }[] = [
  {
    key: "make",
    hrefs: [
      "/dashboard/website-builder",
      "/dashboard/presentations",
      "/dashboard/posts",
      "/dashboard/documents",
      "/dashboard/coding",
    ],
  },
  {
    key: "ask",
    hrefs: [
      "/dashboard/chat",
      "/dashboard/deep-research",
      "/dashboard/data-analysis",
      "/dashboard/files",
      "/dashboard/voice",
      "/dashboard/search",
      "/dashboard/ai-memory",
    ],
  },
  {
    key: "organise",
    hrefs: [
      "/dashboard/projects",
      "/dashboard/mission",
      "/dashboard/meetings",
      "/dashboard/automation",
      "/dashboard/reflection",
      "/dashboard/timeline",
      "/dashboard/activity",
      "/dashboard/team",
    ],
  },
  {
    key: "business",
    hrefs: ["/dashboard/finance", "/dashboard/sales", "/dashboard/trading", "/dashboard/business-health"],
  },
];

/** Hidden from All tools by the rule above, each with the reason. */
export const HIDDEN_FROM_ALL_TOOLS: Readonly<Record<string, string>> = {
  "/dashboard/predictions":
    "the name promises forecasts; today it finds patterns in the account's own rows, with the sample each rests on, and forecasts nothing",
};

export function allToolsGroupOf(href: string): AllToolsGroupKey | null {
  return ALL_TOOLS_GROUPS.find((g) => g.hrefs.includes(href))?.key ?? null;
}
