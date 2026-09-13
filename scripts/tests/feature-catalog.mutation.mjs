#!/usr/bin/env node
/*
 * CAN THE TIER GATE SEE A FEATURE ARRIVE WITHOUT A PLAN?
 *
 * The two the owner asked for by name — "πρόσθεσε feature χωρίς tier →
 * κόκκινο" and "βάλε «απεριόριστο» σε κάτι με όριο → κόκκινο" — are the
 * first two below. The rest attack the ways this gate could be true and
 * useless: a scraper that stops scraping, a charge that stops being
 * measured, a bound that stops being visible, a table that goes back to
 * being typed by hand.
 *
 * WHY EACH MUTATION IS A REAL DEFECT AND NOT A TYPO. Every one of them
 * is something a person would plausibly do on an ordinary afternoon:
 * add a page, raise a limit to "unlimited", stop calling an accessor,
 * copy a row into the page because that is where rows used to live.
 *
 * DIFFERENT DIMENSIONS, ON PURPOSE. The sixth way a gate lies is that
 * every mutation probes the same property; the suite fails if any
 * dimension is left with one.
 *
 * Run: node scripts/tests/feature-catalog.mutation.mjs
 */
import { readFileSync, mkdirSync, rmSync } from "node:fs";
// writeFileSync from the sidecar helper, not node:fs — a run killed
// mid-mutation has no finally, and the sidecar is what heals the tree on
// the next run (scripts/tests/mutation-sidecar.test.mjs enforces it).
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/feature-catalog.test.mjs";
const CATALOG = "src/lib/billing/feature-catalog.ts";
const VOICE = "src/lib/voice/voice-pricing.ts";
const PRICING = "src/app/pricing/page.tsx";
const NAV = "src/lib/sidebar-nav.ts";
const TARGETS = [CATALOG, VOICE, PRICING, NAV, GATE];

// A NEW PAGE, WRITTEN TO DISK RATHER THAN DESCRIBED. The gate walks
// src/app/dashboard, so the only honest way to test "somebody added a
// page" is to add one.
const NEW_PAGE_DIR = "src/app/dashboard/zz-mutation-page";
const NEW_PAGE = `${NEW_PAGE_DIR}/page.tsx`;

const MUTANTS = [
  // ---- A. A FEATURE ARRIVES WITH NO TIER ----------------------------
  {
    dimension: "A. a feature with no tier",
    name: "a new page under /dashboard, and nobody says who may use it",
    addPage: true,
    expect: "every dashboard page is claimed",
  },
  {
    dimension: "A. a feature with no tier",
    name: "a new sidebar row, and nobody says who may use it",
    file: NAV,
    from: '      { href: "/dashboard/marketplace", label: "Marketplace", icon: MARKETPLACE_ICON, hintKey: "marketplace" },',
    to: '      { href: "/dashboard/marketplace", label: "Marketplace", icon: MARKETPLACE_ICON, hintKey: "marketplace" },\n      { href: "/dashboard/zz-new-thing", label: "New Thing", icon: MARKETPLACE_ICON, hintKey: "marketplace" },',
    expect: "every sidebar row is claimed",
  },
  {
    // RE-ANCHORED 2026-09-13. This mutant carried the Music row WITHOUT
    // its `hintKey`, which the row gained in the V5 sidebar merge — so
    // `from` matched nothing and the runner reported STALE while every
    // other line of this suite went on passing. A mutant whose target has
    // moved is a check that runs and tests nothing, which is the whole
    // reason the runner reports STALE separately from MISSED rather than
    // folding it into the caught count.
    //
    // Anchored on the `notBuilt: true` at the END of the line, so the row
    // can gain fields without silencing this again.
    dimension: "A. a feature with no tier",
    name: "a held position quietly becomes a real row, still with no plan",
    file: NAV,
    from: 'icon: MUSIC_ICON, hintKey: "music", notBuilt: true },',
    to: 'icon: MUSIC_ICON, hintKey: "music" },',
    expect: "every sidebar row is claimed",
  },

  // ---- B. "UNLIMITED" OVER SOMETHING THAT HAS A LIMIT ---------------
  {
    dimension: 'B. "unlimited" over a real limit',
    name: "voice minutes go unlimited on Ultimate, with no proof attached",
    file: VOICE,
    from: "      ultimate: 900,",
    to: "      ultimate: Number.POSITIVE_INFINITY,",
    expect: 'no "unlimited" without a proof',
  },
  {
    dimension: 'B. "unlimited" over a real limit',
    name: "the storage row that bounds unlimited files stops being sold",
    file: CATALOG,
    from: '    id: "storage",\n    group: "see",',
    to: '    id: "storage",\n    notSold: "mutation",\n    group: "see",',
    expect: "every declared bound is a visible, finite row on the same plan",
  },
  {
    dimension: 'B. "unlimited" over a real limit',
    name: "the file cap stops being read where it is enforced",
    file: CATALOG,
    from: '      routes: ["src/lib/files/ingest.ts"],',
    // api/files/upload delegates the cap to lib/files/ingest.ts and does
    // not name it — which is exactly the shape of a proof pointed at the
    // place that ASKS rather than the place that refuses.
    to: '      routes: ["src/app/api/files/upload/route.ts"],',
    expect: "every unlimited proof's routes still enforce through the accessor",
  },

  // ---- C. THE TABLE STOPS BEING THE CATALOG -------------------------
  {
    dimension: "C. the table drifts from the catalog",
    name: "a row is typed into the page by hand again",
    file: PRICING,
    from: "  const rows = soldFeatures();",
    to: '  const rows = soldFeatures();\n  const extra = [{ labelKey: "somethingNice" }];\n  void extra;',
    expect: "no row is declared by hand in the page",
  },
  {
    dimension: "C. the table drifts from the catalog",
    name: "a feature is added to the catalog and to no locale",
    file: CATALOG,
    from: '  // === NOT SOLD ======================================================',
    to: '  {\n    id: "zzUntranslated",\n    group: "support",\n    minPlan: "free",\n    charges: false,\n    enforcedIn: "src/lib/billing/plans.ts",\n    enforcedSymbol: "PLANS",\n    cell: () => ({ type: "check" }),\n  },\n\n  // === NOT SOLD ======================================================',
    expect: "nothing on the comparison table is untranslated",
  },

  // ---- D. THE MEASUREMENTS THEMSELVES ------------------------------
  {
    dimension: "D. the gate's own scrapers",
    name: "the page walker stops walking, so nothing is unclaimed",
    file: GATE,
    from: '    } else if (entry === want) {\n      out.push(prefix);',
    to: '    } else if (entry === want && false) {\n      out.push(prefix);',
    expect: "the page walker found pages",
  },
  {
    dimension: "D. the gate's own scrapers",
    name: "the credit scan forgets deductCredits, so a charging route reads as free",
    file: GATE,
    from: "const SPENDS = /\\b(reserveCredits|settleReservation|deductCredits)\\s*\\(/;",
    to: "const SPENDS = /\\b(reserveCredits|settleReservation)\\s*\\(/;",
    expect: "no entry claims to charge while none of its routes does",
  },
  {
    dimension: "D. the gate's own scrapers",
    name: "the hand-written-row scanner stops matching anything at all",
    file: GATE,
    from: 'const HAND_WRITTEN_ROW = /labelKey:\\s*"([^"]+)"/g;',
    to: "const HAND_WRITTEN_ROW = /(?!)/g;",
    expect: "the hand-written-row scanner can still see one",
  },

  // ---- E. A CHARGE THAT STOPS BEING DECLARED ------------------------
  {
    dimension: "E. what spends money",
    name: "a paid feature is relabelled free",
    file: CATALOG,
    from: '    routes: ["posts/generate"],\n    charges: true,',
    to: '    routes: ["posts/generate"],\n    charges: false,',
    expect: "no charging route belongs to an entry declared free",
  },
  {
    dimension: "E. what spends money",
    name: "an entry names enforcement that is no longer there",
    file: CATALOG,
    // RE-ANCHORED 2026-09-13: the agents row's evidence became
    // `capabilities.maxAiAgents` when every capability was tagged with
    // the PlanCapabilities field it publishes. The old anchor named
    // `maxAgentsForPlan`, which is still in the file — as the accessor,
    // not as the evidence — so the mutation stopped applying where it
    // meant to.
    from: '    enforcedSymbol: "capabilities.maxAiAgents",',
    to: '    enforcedSymbol: "capabilities.maxAiAgentsXX",',
    expect: "every enforcement reference resolves",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("feature-catalog mutations\n");
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
  rmSync(NEW_PAGE_DIR, { recursive: true, force: true });
};

let caught = 0;
const missed = [];
const byDimension = new Map();
try {
  const base = runGate();
  console.log(`baseline: ${base.green ? "GREEN" : "RED"}`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    byDimension.set(m.dimension, (byDimension.get(m.dimension) ?? 0) + 1);

    if (m.addPage) {
      mkdirSync(NEW_PAGE_DIR, { recursive: true });
      writeFileSync(NEW_PAGE, "export default function Page() {\n  return null;\n}\n");
    } else {
      const before = originals.get(m.file);
      if (!before.includes(m.from)) {
        missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
        console.log(`  MISSED  ${m.name}`);
        continue;
      }
      writeFileSync(m.file, before.replace(m.from, m.to));
    }

    const result = runGate();
    restoreAll();
    const named = result.failed.find((f) => f.includes(m.expect));
    if (named) {
      caught++;
      console.log(`  CAUGHT  ${m.name}\n          -> ${named}`);
    } else {
      missed.push({
        ...m,
        why: result.green
          ? "the gate stayed green"
          : `red, but not on "${m.expect}" — on: ${result.failed.slice(0, 3).join(" | ")}`,
      });
      console.log(`  MISSED  ${m.name}`);
    }
  }
} finally {
  restoreAll();
}

console.log("\ndimensions probed:");
const thin = [];
for (const [dimension, count] of [...byDimension].sort()) {
  console.log(`  ${count} x ${dimension}`);
  if (count < 2) thin.push(dimension);
}
if (thin.length > 0) console.log(`\nTHIN DIMENSIONS (one mutant each): ${thin.join(", ")}`);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
}
if (missed.length > 0 || thin.length > 0) process.exit(1);
console.log(`Every clause holds, across ${byDimension.size} dimensions.`);
