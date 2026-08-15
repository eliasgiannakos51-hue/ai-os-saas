/**
 * Every pricing claim must name the code that delivers it.
 *
 * WHAT THIS EXISTS BECAUSE OF. lib/billing/plans.ts carried this comment,
 * directly above the plan list:
 *
 *   "Every plan's `features` list below only ever lists things that are
 *    actually live today — nothing marked 'Coming Soon'/pending; if a
 *    feature isn't real yet, it simply isn't listed anywhere on this plan."
 *
 * Seven of the bullets under it were not real. "Image & video generation"
 * was a green tick from Starter (EUR 20) upward, delivered as a form that
 * writes a row to `ai_images`. "Mobile & SaaS Builder" was the single
 * exclusive differentiator of the EUR 50 tier, delivered as a four-field
 * notes table. "Shared AI memory" headlined Professional (EUR 100 + EUR 20
 * a seat) with no team path in the schema at all. "3 projects" and
 * "Unlimited projects" metered an entity that does not exist. "Priority
 * processing" and "Highest priority processing" varied no queue, no model
 * and no rate limit. "Marketplace: install only" pointed at a page with no
 * listings table. Four support tiers were sold with no support channel
 * anywhere in the product.
 *
 * A comment cannot enforce that. This can.
 *
 * HOW IT WORKS. Every claim rendered on a pricing surface — the plan
 * bullets, the comparison table rows, the signup grid — must appear in
 * EVIDENCE below with a file and a symbol that has to exist. Adding a
 * bullet therefore means naming the code that implements it, and deleting
 * the code fails the build for the claim it leaves behind.
 *
 * `inherits` is for the bullets that are not claims at all — "Everything in
 * Starter" makes no promise of its own, it points at the tier above.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: judge whether the implementation is
 * GOOD. A symbol existing proves a feature was built, not that it works —
 * that is what the rest of the suite and a human are for. What it stops is
 * the specific failure that happened here, which is a bullet with nothing
 * behind it at all.
 *
 * Run: node scripts/tests/pricing-truth.test.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail !== undefined) console.log(`        ${detail}`);
}

// claim -> the code that delivers it. `symbol` must appear in `file`.
const EVIDENCE = {
  // --- plan bullets -------------------------------------------------
  basicAiChat: { file: "src/app/api/chat/route.ts", symbol: "export async function POST" },
  creditsPerMonth: { file: "src/lib/billing/credits.ts", symbol: "export async function grantCredits" },
  aiMemory: { file: "src/app/dashboard/memory/page.tsx", symbol: "export default async function" },
  websiteAutomationBuilderAccess: { file: "src/lib/website-builder.ts", symbol: "export" },
  upTo2AiAgents: { file: "src/lib/agents/agent-limits.ts", symbol: "maxAgentsForPlan" },
  upTo5AiAgents: { file: "src/lib/agents/agent-limits.ts", symbol: "maxAgentsForPlan" },
  upTo15AiAgentsTeams: { file: "src/lib/agents/agent-limits.ts", symbol: "maxAgentsForPlan" },
  upTo50AiAgents: { file: "src/lib/agents/agent-limits.ts", symbol: "maxAgentsForPlan" },
  upTo100AiAgents: { file: "src/lib/agents/agent-limits.ts", symbol: "maxAgentsForPlan" },
  teamCollaboration: { file: "src/app/api/team/invite/route.ts", symbol: "export async function POST" },
  unlimitedTeamSeatsIncludedNoPerMemberCharge: {
    file: "src/lib/billing/plans.ts",
    symbol: "teamSeatsIncluded",
  },
  unlimitedMembers: { file: "src/app/api/team/invite/route.ts", symbol: "export async function POST" },
  extendedChatMemoryRetention100Vs20RecentFact: {
    file: "src/lib/chat/memory.ts",
    symbol: "DEFAULT_MEMORY_LOAD_LIMIT",
  },
  customAiPersonaNameInIonexaChat: {
    file: "src/components/settings/ai-persona-settings.tsx",
    symbol: "export function AiPersonaSettings",
  },
  customCredits: { file: "src/lib/billing/plans.ts", symbol: '"custom"' },
  everythingInStarter: { inherits: true },
  everythingInGrowth: { inherits: true },
  everythingInProfessional: { inherits: true },
  everythingInUltimate: { inherits: true },

  // --- comparison table rows ----------------------------------------
  aiAgents: { file: "src/lib/agents/agent-limits.ts", symbol: "maxAgentsForPlan" },
  websiteBuilder: { file: "src/lib/website-builder.ts", symbol: "export" },
  teamSeatsAddOn: { file: "src/lib/billing/plans.ts", symbol: "TEAM_SEAT_PRICE" },

  // --- signup capability grid ---------------------------------------
  "Website & Automation Builder": { file: "src/lib/website-builder.ts", symbol: "export" },
  "AI Memory": { file: "src/app/dashboard/memory/page.tsx", symbol: "export default async function" },
  "Team collaboration": { file: "src/app/api/team/invite/route.ts", symbol: "export async function POST" },
  "Team seats": { file: "src/lib/billing/plans.ts", symbol: "hasTeamSeats" },
  "Team seats included free": { file: "src/lib/billing/plans.ts", symbol: "teamSeatsIncluded" },
  "Extended chat memory retention": {
    file: "src/lib/chat/memory.ts",
    symbol: "DEFAULT_MEMORY_LOAD_LIMIT",
  },
  "Custom AI persona name": {
    file: "src/components/settings/ai-persona-settings.tsx",
    symbol: "export function AiPersonaSettings",
  },
};

// --- what the product currently claims ---------------------------------
const { PLANS } = await loadTs("src/lib/billing/plans.ts");

const bulletClaims = [...new Set(PLANS.flatMap((p) => p.features.map((f) => f.textKey)))];

const pricingSrc = readFileSync("src/app/pricing/page.tsx", "utf8");
const rowClaims = [...pricingSrc.matchAll(/labelKey: "([^"]+)"/g)].map((m) => m[1]);

const signupSrc = readFileSync("src/app/signup/signup-flow.tsx", "utf8");
const gridBlock = signupSrc.slice(
  signupSrc.indexOf("const CAPABILITY_ROWS"),
  signupSrc.indexOf("];", signupSrc.indexOf("const CAPABILITY_ROWS"))
);
const gridClaims = [...gridBlock.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);

const allClaims = [...new Set([...bulletClaims, ...rowClaims, ...gridClaims])];

console.log(
  `== every pricing claim names its code (${bulletClaims.length} bullets, ${rowClaims.length} table rows, ${gridClaims.length} grid rows) ==`
);

const undeclared = allClaims.filter((c) => !EVIDENCE[c]);
check("no claim is made without declaring what implements it", undeclared, []);

const missingCode = [];
for (const claim of allClaims) {
  const ev = EVIDENCE[claim];
  if (!ev || ev.inherits) continue;
  if (!existsSync(ev.file)) {
    missingCode.push(`${claim}: ${ev.file} does not exist`);
    continue;
  }
  if (!readFileSync(ev.file, "utf8").includes(ev.symbol)) {
    missingCode.push(`${claim}: ${ev.file} no longer contains \`${ev.symbol}\``);
  }
}
check("every claim's evidence still exists in the codebase", missingCode, []);

// The mirror. An evidence entry with no claim means a bullet was removed
// and its justification left behind — harmless today, and the thing that
// lets the next person re-add the bullet and find it "already approved".
const orphaned = Object.keys(EVIDENCE).filter((k) => !allClaims.includes(k));
check("no evidence entry outlives the claim it justified", orphaned, []);

// --- the seven, by name -------------------------------------------------
// Pinned individually rather than trusting the generic check above: these
// are the specific strings that were sold, and a regression here is a
// regression to misleading advertising, not to a style issue.
console.log("\n== the seven deleted claims stay deleted ==");
const DELETED = [
  "imageVideoGenerationAccess",
  "mobileSaasBuilderAccess",
  "sharedAiMemory",
  "1Workspace3Projects",
  "unlimitedProjects",
  "priorityProcessing",
  "highestPriorityProcessing",
  "marketplaceInstallOnly",
  "communitySupport",
  "emailSupport",
  "prioritySupport",
  "dedicatedSupport",
];
for (const claim of DELETED) {
  checkTrue(`"${claim}" is not offered by any plan`, !allClaims.includes(claim));
}

// The capabilities behind two of them existed only to draw a tick. If they
// come back, the ticks come back with them.
const plansSrc = readFileSync("src/lib/billing/plans.ts", "utf8");
checkTrue("PlanCapabilities has no imageVideoGeneration flag", !plansSrc.includes("imageVideoGeneration"));
checkTrue("PlanCapabilities has no mobileSaasBuilder flag", !plansSrc.includes("mobileSaasBuilder"));

// --- and nowhere else says it either -------------------------------------
// The bullets were one surface. This is the sweep the brief asked for:
// landing, marketing copy, help articles, onboarding, upgrade walls.
console.log("\n== no other surface makes the deleted promises ==");
const SURFACES = [
  "messages/en.json",
  "messages/el.json",
  "src/app/page.tsx",
  "src/app/pricing/page.tsx",
  "src/app/roadmap/page.tsx",
  "src/lib/support/knowledge-base.ts",
  "src/components/onboarding/onboarding-flow.tsx",
  "src/components/billing/upgrade-required.tsx",
  "src/app/signup/signup-flow.tsx",
];
// Phrasings that assert the product HAS the thing. The roadmap is exempt
// from the image/video/marketplace patterns by construction — it lists
// them under "future", which is the honest place for them and the only
// place in the product that was already telling the truth.
const FORBIDDEN = [
  { re: /image\s*&?\s*(and\s*)?video generation/i, what: "image/video generation" },
  { re: /mobile\s*&?\s*(and\s*)?saas builder/i, what: "Mobile & SaaS Builder" },
  { re: /shared ai memory/i, what: "shared AI memory" },
  { re: /unlimited projects|\d+ projects/i, what: "projects as a metered entity" },
  { re: /(highest )?priority processing/i, what: "priority processing" },
  { re: /marketplace: install/i, what: "marketplace installs" },
  { re: /(community|email|priority|dedicated) support/i, what: "a per-plan support tier" },
];
const claimsElsewhere = [];
for (const file of SURFACES) {
  if (!existsSync(file)) continue;
  const src = readFileSync(file, "utf8");
  for (const { re, what } of FORBIDDEN) {
    const m = src.match(re);
    if (m) claimsElsewhere.push(`${file}: ${what} — "${m[0]}"`);
  }
}
check("no surface still advertises a deleted feature", claimsElsewhere, []);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
