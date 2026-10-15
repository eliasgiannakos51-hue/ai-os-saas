#!/usr/bin/env node
/*
 * CAN all-tools-tiles.test.mjs SEE THE SQUARES COME BACK, OR SOMETHING
 * ELSE GO WITH THEM?
 *
 * Each mutant puts back one way the owner's «κρύψε, χωρίς να σβήσεις»
 * could fail: the switch starting where every other one does (the owner
 * sees the squares), the read ignoring where it starts, the page drawing
 * the grid whatever the switch says or asking another one, the hidden page
 * still drawing squares, a tool's page reading the same switch (so it
 * stops opening at its address), the hidden page's line missing in one
 * language, and a prodtest walking the squares on an empty page.
 *
 * Run: node scripts/tests/all-tools-tiles.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/all-tools-tiles.test.mjs";
const LIB = "src/lib/flags/flags.ts";
const PAGE = "src/app/dashboard/tools/page.tsx";
const SITE = "src/app/dashboard/website-builder/page.tsx";
const JA = "messages/ja.json";
const HOME_WALK = "scripts/tests/design-home.prodtest.mjs";
const SMOKE = "scripts/tests/routes-smoke.prodtest.mjs";

const MUTANTS = [
  {
    name: "the switch starts at staff, so the owner sees the squares",
    file: LIB,
    from: 'export const FIRST_AUDIENCE: Partial<Record<FlagKey, FlagAudience>> = { "all-tools-tiles": "off" };',
    to: "export const FIRST_AUDIENCE: Partial<Record<FlagKey, FlagAudience>> = {};",
    expect: "with no row it reads as «Κανείς»",
  },
  {
    name: "the read starts every switch at staff, whatever it was declared to start at",
    file: LIB,
    from: "map((k) => [k, defaultAudienceOf(k)])",
    to: "map((k) => [k, DEFAULT_AUDIENCE])",
    expect: "with no row it reads as «Κανείς»",
  },
  {
    name: "the page draws the grid whatever the switch says",
    file: PAGE,
    from: '  if (!(await isFeatureOn("all-tools-tiles", user))) {',
    to: '  if (!(await isFeatureOn("all-tools-tiles", user)) && false) {',
    expect: "the page asks the switch for THIS person",
  },
  {
    name: "the page asks another switch",
    file: PAGE,
    from: '  if (!(await isFeatureOn("all-tools-tiles", user))) {',
    to: '  if (!(await isFeatureOn("library", user))) {',
    expect: "the page asks the switch for THIS person",
  },
  {
    name: "the hidden page still draws the squares",
    file: PAGE,
    from: '          <p className="text-sm text-muted" data-testid="tools-hidden">{t("tilesHidden")}</p>',
    to: '          <p className="text-sm text-muted" data-testid="tools-hidden">{t("tilesHidden")}</p>\n          <ToolsGrid isOwner={false} />',
    expect: "with it off returns, drawing no grid",
  },
  {
    name: "a tool's own page reads the switch, and stops opening at its address",
    file: SITE,
    from: "export default async function",
    to: 'const HIDDEN_WITH_ALL_TOOLS = "all-tools-tiles";\nexport default async function',
    expect: "the only file in src/ that names the switch",
  },
  {
    name: "the hidden page's line is missing in one language",
    file: JA,
    from: '"tilesHidden": "ホームの入力欄でやりたいことを説明してください。パソコンでは ⌘K を押してツール名を入力することもできます。",',
    to: "",
    expect: "ja: worded",
  },
  {
    name: "a prodtest walks the squares with the switch at its start, on an empty page",
    file: HOME_WALK,
    from: '    feature_flags: [{ key: "all-tools-tiles", audience: "everyone" }],',
    to: "    feature_flags: [],",
    expect: "each of them sets all-tools-tiles",
  },
  {
    // The one that is in the set only because the population is the page:
    // it reads the group headings out of the page's text, never a tile.
    name: "the smoke test reads the page's headings with the squares at their start",
    file: SMOKE,
    from: '  feature_flags: [{ key: "all-tools-tiles", audience: "everyone" }],',
    to: "  feature_flags: [],",
    expect: "each of them sets all-tools-tiles",
  },
];

runMutations({ name: "all-tools-tiles", gate: GATE, targets: [LIB, PAGE, SITE, JA, HOME_WALK, SMOKE], mutants: MUTANTS });
