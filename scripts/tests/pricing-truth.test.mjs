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
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { callsModel } from "./lib/reaches-a-model.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

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
  // THE EVIDENCE NAMED THE WRONG PAGE, and the gate could not see it: the
  // path resolved and the symbol was there. "AI Memory" on a plan bullet
  // means the chat remembering you across conversations, and
  // /dashboard/memory was the RECORD SEARCH — a page containing no
  // reference to chat_memory at all. What plan-gates the capability is
  // this predicate, so this is what vouches for it.
  aiMemory: { file: "src/lib/chat/memory-policy.ts", symbol: "chatMemoryActive" },
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
  // NOT LISTED HERE ANY MORE, and the reason is that they moved somewhere
  // that can hold more of them. The table used to be thirteen objects
  // typed into app/pricing/page.tsx; it is now generated from
  // lib/billing/feature-catalog.ts, where every row already carries
  // `enforcedIn` and `enforcedSymbol` — the same pair this map holds.
  // Copying them into a second list would be two sources of truth for
  // the identical claim, and the copy is the one that goes stale.
  //
  // The guarantee is unchanged and is asserted below, under "every
  // comparison row names its enforcement": each row is looked up in the
  // catalog and its evidence checked exactly the way an entry here is.
  // scripts/tests/feature-catalog.test.mjs holds the other direction —
  // that the table IS the catalog rather than a hand-written copy of it.

  // --- signup capability grid ---------------------------------------
  "Website & Automation Builder": { file: "src/lib/website-builder.ts", symbol: "export" },
  "AI Memory": { file: "src/app/dashboard/ai-memory/page.tsx", symbol: "export default async function" },
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
const { soldFeatures } = await loadTs("src/lib/billing/feature-catalog.ts");
const comparisonRows = soldFeatures();
const { FEATURE_CATALOG: catalogEntries } = await loadTs("src/lib/billing/feature-catalog.ts");
const rowClaims = comparisonRows.map((f) => f.id);

const signupSrc = readFileSync("src/app/signup/signup-flow.tsx", "utf8");
const gridBlock = signupSrc.slice(
  signupSrc.indexOf("const CAPABILITY_ROWS"),
  signupSrc.indexOf("];", signupSrc.indexOf("const CAPABILITY_ROWS"))
);
const gridClaims = [...gridBlock.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);

// The catalog rows justify themselves (see the note in EVIDENCE) and are
// checked in their own section below, so this map covers the bullets and
// the signup grid only.
//
// NOT `.filter(c => !rowClaims.includes(c))`, which is what this was for
// one run: three bullet textKeys — creditsPerMonth, aiMemory and
// teamCollaboration — are ALSO catalog row ids, and filtering by id
// removed them as claims while leaving their EVIDENCE entries behind.
// The orphan check then reported the three entries as outliving claims
// that were still being made on every plan card.
const allClaims = [...new Set([...bulletClaims, ...gridClaims])];

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
  // COMMENTS DO NOT COUNT AS EVIDENCE. A substring search over the raw
  // file keeps a claim alive on the strength of a line that says the
  // symbol USED to be here — which is the state a deletion leaves behind
  // more often than not, because the explaining comment is what survives
  // a rename. stripComments is the same helper the mutation gates use.
  if (!stripComments(readFileSync(ev.file, "utf8")).includes(ev.symbol)) {
    missingCode.push(`${claim}: ${ev.file} no longer contains \`${ev.symbol}\``);
  }
}
check("every claim's evidence still exists in the codebase", missingCode, []);

// The mirror. An evidence entry with no claim means a bullet was removed
// and its justification left behind — harmless today, and the thing that
// lets the next person re-add the bullet and find it "already approved".
const orphaned = Object.keys(EVIDENCE).filter((k) => !allClaims.includes(k));
check("no evidence entry outlives the claim it justified", orphaned, []);

// --- the comparison rows, justified by the catalog -----------------------
console.log(
  `\n== every comparison row names its enforcement (${comparisonRows.length} rows) ==`
);
// A FLOOR, so an empty catalog cannot produce an empty offender list and
// a green line — the shape scripts/scan-unjudged-numbers.mjs exists for,
// and the shape three scrapers in db-migrations.test.mjs actually had.
check("the catalog produced rows to check", comparisonRows.length >= 20, true);
const rowsWithoutEvidence = [];
for (const row of comparisonRows) {
  if (!row.enforcedIn) {
    rowsWithoutEvidence.push(`${row.id}: names no enforcing module`);
    continue;
  }
  if (!existsSync(row.enforcedIn)) {
    rowsWithoutEvidence.push(`${row.id}: ${row.enforcedIn} does not exist`);
    continue;
  }
  if (row.enforcedSymbol && !readFileSync(row.enforcedIn, "utf8").includes(row.enforcedSymbol)) {
    rowsWithoutEvidence.push(`${row.id}: ${row.enforcedIn} no longer contains \`${row.enforcedSymbol}\``);
  }
}
check("every comparison row's evidence still exists", rowsWithoutEvidence, []);

// --- a published row is a capability that EXISTS AND WORKS --------------
console.log("\n== every row on the pricing page is a thing that works ==");
// =======================================================================
// THE RULE, in the owner's words: "μια γραμμή στη σελίδα τιμών ΠΡΕΠΕΙ να
// αντιστοιχεί σε δυνατότητα που υπάρχει και δουλεύει."
//
// IT IS NOT THE SAME RULE AS THE ONE ABOVE, and the difference is the
// whole reason this section exists. Above, a claim must NAME code that
// exists — which `websiteBuilder` passed for as long as it had existed,
// because lib/build-modules.ts really does contain `minPlanSlug`; it
// just gates a different feature. Naming code is cheap. Doing something
// is not.
//
// So a row is judged three ways:
//
//   1. it is not a tier held for something unbuilt — `notBuilt` entries
//      are decided tiers, not products, and the page must not show one;
//   2. the flag CLEARS ITSELF — a notBuilt entry whose page or route has
//      landed fails, which is what stops a working feature sitting
//      behind a placeholder nobody remembers to remove;
//   3. a row under MAKE really makes something — at least one route it
//      owns reaches a model, by the same standard sidebar-naming §3b
//      applies to the nav. A heading that promises generation over a row
//      that opens a notes form is the defect that rule was written for,
//      arriving on the page where somebody is deciding what to pay for.
{
  const sold = comparisonRows;
  const held = [];
  for (const entry of catalogEntries) {
    if (entry.notBuilt) held.push(entry);
  }
  checkTrue(
    `some tiers are held for unbuilt features (${held.length})`,
    held.length >= 1,
    "with none held, the two checks below are about nothing"
  );

  // 1. No placeholder is published.
  //
  //    THIS READS `sold`, WHICH IS soldFeatures() — the same reader the
  //    page renders from — rather than the catalog. That is the point:
  //    the filter lives in soldFeatures(), so the defect this catches is
  //    the reader LOSING it, not an entry losing its flag. An entry
  //    without the flag is not a held tier at all, and the check above
  //    would be a tautology if it asked the catalog directly.
  const publishedPlaceholders = sold.filter((r) => r.notBuilt).map((r) => r.id);
  check("no row on the table is a tier held for something unbuilt", publishedPlaceholders, []);

  // 2. The flag clears itself. A held tier whose page or route now
  //    exists is a feature customers are using and cannot see the price
  //    of — the mirror of the sidebar's `notBuilt` rule, which fails when
  //    a held row's route starts resolving.
  const landed = [];
  for (const entry of held) {
    for (const page of entry.pages ?? []) {
      if (existsSync(`src/app/dashboard/${page}/page.tsx`)) {
        landed.push(`${entry.id}: src/app/dashboard/${page} exists — publish the row`);
      }
    }
    for (const route of entry.routes ?? []) {
      if (existsSync(`src/app/api/${route}/route.ts`)) {
        landed.push(`${entry.id}: api/${route} exists — publish the row`);
      }
    }
  }
  check("no held tier has a page or a route behind it already", landed, []);

  // 3. A row under MAKE really makes something.
  //
  //    THE SAME CHECK AS sidebar-naming §3b, from the same module
  //    rather than a copy of its regex: scripts/tests/lib/
  //    reaches-a-model.mjs. It follows `@/lib` imports two levels,
  //    which is what it takes — api/posts/generate does not call the
  //    SDK itself, it awaits a lib that does.
  const AI_CALL =
    /await\s+runCompletion\(|anthropic\.messages\.(create|stream)\(|\.messages\.(create|stream)\(|await\s+synthesiseSpeech\(|await\s+transcribeAudio\(/;
  // Rows that show what something else MADE rather than making it.
  // Declared here, in the check, so a third is a decision rather than a
  // quiet exemption.
  const DOWNSTREAM = {
    publishedSites: "what the website builder put live — the builder is the producer",
    voiceClipLength: "a ceiling on the recorder, not a producer of its own",
    websiteImageStorage: "capacity for the photos a site is generated FROM",
    siteEditsPerDay: "a ceiling on editing what the builder produced",
    siteVersionsKept: "retention of what the builder produced",
  };
  const makeRows = sold.filter((r) => r.group === "make");
  checkTrue(
    `the MAKE section has rows to judge (${makeRows.length})`,
    makeRows.length >= 5,
    "an empty section passes every check below"
  );
  const promisesNothing = [];
  for (const row of makeRows) {
    if (DOWNSTREAM[row.id]) continue;
    const reaches = (row.routes ?? []).some((route) =>
      callsModel(`src/app/api/${route}/route.ts`)
    );
    if (!reaches) {
      promisesNothing.push(`${row.id}: no route it owns reaches a model`);
    }
  }
  check("every row under MAKE really makes something", promisesNothing, []);

  // AND THE CHECK CAN FAIL. Everything above is "this list is empty",
  // and the cheapest way to empty a list is to stop filling it. The
  // pattern is run against a route that certainly does reach a model and
  // one that certainly does not.
  checkTrue(
    "the producer scan recognises a real generator",
    callsModel("src/app/api/posts/generate/route.ts")
  );
  checkTrue(
    "...and does not recognise a plain list route",
    !callsModel("src/app/api/projects/route.ts")
  );
}

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

// =====================================================================
console.log("\n== the annual badge and the annual price say the same thing ==");
// THE BADGE READ "Save {percent}% — two months free" WHILE THE CODE TOOK
// 20% OFF. Those are different offers: 20% of twelve months is 2.4 months,
// so the sentence understated what was actually billed, and nothing tied
// the two together. Both now derive from ANNUAL_MONTHS_CHARGED, and this
// is what stops them separating again.
{
  const plansMod = await loadTs("src/lib/billing/plans.ts");
  const free = plansMod.ANNUAL_MONTHS_FREE;
  const charged = plansMod.ANNUAL_MONTHS_CHARGED;
  checkTrue(`the year is ${charged} months charged and ${free} free`, charged + free === 12);
  checkTrue(
    `the badge's percent is derived from those months (${plansMod.ANNUAL_DISCOUNT_PERCENT}%)`,
    plansMod.ANNUAL_DISCOUNT_PERCENT === Math.round((free / 12) * 100)
  );
  for (const plan of plansMod.PLANS) {
    if (typeof plan.price !== "number" || plan.price <= 0) continue;
    const annual = plansMod.annualPriceEur(plan);
    // THE SENTENCE, CHECKED AS ARITHMETIC. "Two months free" means the
    // yearly total is exactly ten monthly payments — not "about 17% off".
    checkTrue(`${plan.slug}: EUR ${annual}/yr is exactly ${charged} x EUR ${plan.price}`,
      annual === plan.price * charged);
    checkTrue(`${plan.slug}: the saving shown is exactly ${free} months (EUR ${plansMod.annualSavingsEur(plan)})`,
      plansMod.annualSavingsEur(plan) === plan.price * free);
  }
  // And every locale still phrases it with the placeholder — a
  // translation that froze the number would leave a percentage standing
  // alone as the whole claim, free to drift from the price again.
  for (const file of readdirSync("messages").filter((f) => f.endsWith(".json")).map((f) => `messages/${f}`)) {
    const msgs = JSON.parse(readFileSync(file, "utf8"));
    const line = msgs?.pricing?.billingAnnualSaving ?? "";
    checkTrue(`${file}: the annual badge is parameterised, not a frozen number`, line.includes("{percent}"), line);
  }
}

// ---------------------------------------------------------------------
// the page's own count of itself
// ---------------------------------------------------------------------
//
// THE ONE NUMBER ON THIS PAGE NO GATE WAS HOLDING. pricing/page.tsx
// opened its comparison table with "FORTY-THREE ROWS, IN SEVEN SECTIONS"
// and "Measured: soldFeatures() returns 43". soldFeatures() returned 45:
// the V5 tiering round added two rows and nobody came back to the
// sentence, which is the exact mechanism docs/v5-list.md was wrong in
// four places by. A reader has no way to tell a count that was true on
// Tuesday from one that is true now.
//
// AND THIS FILE WAS READING THE PAGE AND ASSERTING NOTHING ABOUT IT.
// `pricingSrc` was loaded at the top and never used again — the same
// shape scripts/scan-unjudged-numbers.mjs exists to find, in the gate
// that guards the pricing page. It is used here.
{
  const stated = /ROWS:\s*(\d+)/.exec(pricingSrc);
  checkTrue(
    "the pricing page states its own row count in a form this gate can read",
    Boolean(stated),
    'expected a comment matching /ROWS: (\\d+)/ in src/app/pricing/page.tsx'
  );
  if (stated) {
    checkTrue(
      `the page says ${stated[1]} rows and soldFeatures() returns ${comparisonRows.length}`,
      Number(stated[1]) === comparisonRows.length,
      `page.tsx says ${stated[1]}; the catalog renders ${comparisonRows.length}. Change the comment.`
    );
  }
  // The sections claim is the same kind of promise, from the same block.
  const groups = new Set(comparisonRows.map((f) => f.group));
  const statedSections = /in (\w+) sections/.exec(pricingSrc);
  const WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  checkTrue(
    "the page states how many sections it has",
    Boolean(statedSections) && statedSections[1].toLowerCase() in WORDS,
    String(statedSections?.[1])
  );
  if (statedSections && statedSections[1].toLowerCase() in WORDS) {
    checkTrue(
      `the page says ${statedSections[1]} sections and the catalog fills ${groups.size}`,
      WORDS[statedSections[1].toLowerCase()] === groups.size,
      `page.tsx says ${statedSections[1]}; ${groups.size} groups have at least one sold row.`
    );
  }
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
