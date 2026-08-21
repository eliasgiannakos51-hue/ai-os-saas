#!/usr/bin/env node
/*
 * CAN THE UNSPLASH TESTS ACTUALLY GO RED?
 *
 * Two suites claim to defend Unsplash's three API guidelines:
 *
 *   scripts/tests/unsplash-compliance.test.mjs            (the credit is built right)
 *   scripts/tests/unsplash-attribution-durability.test.mjs (it survives an edit)
 *
 * Both are green. Green means nothing until the defect they exist for is
 * put back and they are required to notice. Every mutation below is a
 * REAL failure mode of this integration — the state the code was in
 * before, or the state one plausible edit away — applied to the real
 * files, with the suites re-run and required to fail.
 *
 * A mutation that survives is printed as a hole, because that is what it
 * is: a compliance guarantee nothing is actually holding.
 *
 * Run: node scripts/tests/unsplash-attribution.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DURABILITY = "scripts/tests/unsplash-attribution-durability.test.mjs";
const COMPLIANCE = "scripts/tests/unsplash-compliance.test.mjs";

const PLACEHOLDERS = "src/lib/website-image-placeholders.ts";
const UNSPLASH = "src/lib/unsplash.ts";
const RESOLVER = "src/lib/website-image-resolver.ts";
const EDIT_ROUTE = "src/app/api/websites/edit/route.ts";
const GEN_ROUTE = "src/app/api/websites/generate/process/route.ts";
const BUILDER = "src/lib/website-builder.ts";
const BUDGET = "src/lib/unsplash-budget.ts";
const REGISTRATION = "scripts/tests/unsplash-download-registration.test.mjs";

const MUTANTS = [
  // ------------------------------------------------------------------
  // Guideline 3 — attribution. The shape it was in before any of this.
  // ------------------------------------------------------------------
  {
    name: "the credit stops naming the photographer",
    suites: [COMPLIANCE, DURABILITY],
    file: PLACEHOLDERS,
    from: "`Photo by ${link(profile, name)} on ${link(escapeHtml(UNSPLASH_HOME_URL), \"Unsplash\")}` +",
    to: "`Photo on ${link(escapeHtml(UNSPLASH_HOME_URL), \"Unsplash\")}` +",
  },
  {
    name: "the referral parameters are dropped from the links",
    suites: [COMPLIANCE, DURABILITY],
    file: PLACEHOLDERS,
    from: '  return `${url}${url.includes("?") ? "&" : "?"}${UNSPLASH_UTM}`;',
    to: "  return url;",
  },
  {
    name: "utm_source stops being our registered application name",
    suites: [COMPLIANCE, DURABILITY],
    file: PLACEHOLDERS,
    from: 'export const UNSPLASH_UTM = "utm_source=ionexa&utm_medium=referral";',
    to: 'export const UNSPLASH_UTM = "utm_medium=referral";',
  },
  {
    name: "the photographer's name stops being escaped (injection into a live site)",
    suites: [COMPLIANCE, DURABILITY],
    file: PLACEHOLDERS,
    from: "  const name = escapeHtml(photo.photographerName);",
    to: "  const name = photo.photographerName;",
  },
  {
    name: "the credit is emitted but never attached to the image",
    suites: [COMPLIANCE, DURABILITY],
    file: PLACEHOLDERS,
    from: "      return `${stampProvenance(withUrl, photo)}${buildUnsplashCreditHtml(photo)}`;",
    to: "      return `${stampProvenance(withUrl, photo)}`;",
  },

  // ------------------------------------------------------------------
  // The durability fix itself — the second cause.
  // ------------------------------------------------------------------
  {
    name: "the photographer is no longer written onto the <img> (nothing to restore from)",
    suites: [DURABILITY],
    file: PLACEHOLDERS,
    from: "      return `${stampProvenance(withUrl, photo)}${buildUnsplashCreditHtml(photo)}`;",
    to: "      return `${withUrl}${buildUnsplashCreditHtml(photo)}`;",
  },
  {
    name: "enforcement stops rebuilding and just keeps whatever it finds",
    suites: [DURABILITY],
    file: PLACEHOLDERS,
    from: "export function enforceUnsplashAttribution(html: string): AttributionEnforcement {\n  let restored = 0;",
    to: "export function enforceUnsplashAttribution(html: string): AttributionEnforcement {\n  return { html, restored: 0, removed: 0 };\n  // eslint-disable-next-line no-unreachable\n  let restored = 0;",
  },
  {
    name: "an unattributable photo is displayed anyway instead of removed",
    suites: [DURABILITY],
    file: PLACEHOLDERS,
    from: "    } else {\n      // Nothing left to credit with: the image goes, and so does the\n      // broken remnant of a credit beside it.\n      removed += 1;\n    }",
    to: "    } else {\n      out += tag;\n      removed += 1;\n    }",
  },
  {
    name: "enforcement is dropped from the EDIT path (the path it exists for)",
    suites: [DURABILITY],
    file: EDIT_ROUTE,
    from: "        const attribution = enforceUnsplashAttribution(updatedHtml);\n        updatedHtml = attribution.html;",
    to: "        const attribution = enforceUnsplashAttribution(updatedHtml);",
  },
  {
    name: "enforcement is dropped from the GENERATE path",
    suites: [DURABILITY],
    file: GEN_ROUTE,
    from: "        const attribution = enforceUnsplashAttribution(htmlContent);\n        htmlContent = attribution.html;",
    to: "        const attribution = enforceUnsplashAttribution(htmlContent);",
  },
  {
    name: "enforcement runs BEFORE the photos exist (ordered wrong)",
    suites: [DURABILITY],
    file: EDIT_ROUTE,
    from: "      images = await resolveWebsiteImagePlaceholders(updatedHtml);",
    to: "      updatedHtml = enforceUnsplashAttribution(updatedHtml).html;\n      images = await resolveWebsiteImagePlaceholders(updatedHtml);",
    // The anchor the test asserts on is the resolve call's position; moving
    // enforcement in front of it must be noticed.
    reorder: true,
  },
  {
    name: "the edit prompt stops asking the model to keep the credits",
    suites: [DURABILITY],
    file: BUILDER,
    from: "- PHOTO CREDITS ARE NOT DECORATION.",
    to: "- Photo credits may be tidied up.",
  },

  // ------------------------------------------------------------------
  // Guideline 2 — the download trigger.
  // ------------------------------------------------------------------
  {
    name: "download_location is discarded again (nothing to trigger)",
    suites: [COMPLIANCE],
    file: UNSPLASH,
    from: "  const downloadLocation = nonEmptyString(raw?.links?.download_location);",
    to: '  const downloadLocation = "";',
  },
  {
    name: "the trigger stops authenticating (Unsplash records nothing)",
    suites: [COMPLIANCE],
    file: UNSPLASH,
    from: "    const res = await fetch(photo.downloadLocation, {\n      headers: { Authorization: `Client-ID ${accessKey}` },",
    to: "    const res = await fetch(photo.downloadLocation, {\n      headers: {},",
  },
  {
    name: "the resolver stops triggering downloads at all",
    suites: [COMPLIANCE, REGISTRATION],
    file: RESOLVER,
    from: "  const results = await Promise.all(photos.map((photo) => triggerUnsplashDownload(photo, budget)));",
    to: "  const results = photos.map(() => true);",
  },
  {
    name: "the trigger is charged against the search ceiling again (silently uncredited photos)",
    suites: [COMPLIANCE],
    file: UNSPLASH,
    from: "  if (budget?.halted) return false;",
    to: "  if (budget && !budget.canSpend()) return false;",
  },

  // ------------------------------------------------------------------
  // The ceiling / breaker split. Every one of these was live behaviour.
  // ------------------------------------------------------------------
  {
    name: "canSpend() mutates again — our own ceiling trips Unsplash's breaker",
    suites: [REGISTRATION],
    file: BUDGET,
    from: "    canSpend() {\n      return !halted && spent < limit;\n    },",
    to: '    canSpend() {\n      if (halted) return false;\n      if (spent >= limit) {\n        halted = "budget-exhausted";\n        return false;\n      }\n      return true;\n    },',
  },
  {
    name: "the ceiling is reported through the halt flag again",
    suites: [REGISTRATION],
    file: BUDGET,
    from: "    get ceilingReached() {\n      return spent >= limit;\n    },",
    to: "    get ceilingReached() {\n      return halted === \"budget-exhausted\";\n    },",
  },
  // NOTE, so nobody re-adds it: "createUnsplashBudget(photos.length)" ->
  // "createUnsplashBudget(0)" is an EQUIVALENT MUTANT here, not a hole.
  // triggerUnsplashDownload consults budget.halted and never canSpend(),
  // so shrinking the limit changes no behaviour — which is precisely the
  // property that makes capping registration structurally impossible. The
  // mutation that DOES break it is "the trigger is charged against the
  // search ceiling again" above, on lib/unsplash.ts.
  {
    name: "registration fires for photos that never reached the page",
    suites: [REGISTRATION],
    file: RESOLVER,
    from: "  return { html: result, used: [...resolved.values()], halted: budget.halted };",
    to: "  return { html: result, used: [...resolved.values(), ...resolved.values()], halted: budget.halted };",
  },
  {
    name: "registration runs even when the edit was never saved",
    suites: [REGISTRATION],
    file: EDIT_ROUTE,
    from: "    if (!updateError && updatedRecord) {\n      await registerUnsplashUses(",
    to: "    if (false && updatedRecord) {\n      await registerUnsplashUses(",
  },
  {
    name: "a FLAGGED generation registers its photos anyway",
    suites: [REGISTRATION],
    file: GEN_ROUTE,
    from: "    if (!updateError && updatedRecord && !isFlagged) {",
    to: "    if (!updateError && updatedRecord) {",
  },
  {
    name: "a halted generation fires doomed registrations instead of saying so",
    suites: [REGISTRATION],
    file: RESOLVER,
    from: "  if (halted) {\n    logApiError(",
    to: "  if (false) {\n    logApiError(",
  },

  // ------------------------------------------------------------------
  // Guideline 1 — hotlinking, and the all-or-nothing rule behind it.
  // ------------------------------------------------------------------
  {
    name: "a photo with no photographer is accepted (uncreditable photo ships)",
    suites: [COMPLIANCE],
    file: UNSPLASH,
    from: "  if (!url || !photographerName || !photographerUrl || !downloadLocation) return null;",
    to: "  if (!url) return null;\n  if (!photographerName || !photographerUrl || !downloadLocation)\n    return { url, photographerName: photographerName ?? \"\", photographerUrl: photographerUrl ?? \"\", downloadLocation: downloadLocation ?? \"\" };",
  },
  {
    name: "the hotlink is re-hosted through our own storage",
    suites: [COMPLIANCE],
    file: UNSPLASH,
    from: "  const url = nonEmptyString(raw?.urls?.regular);",
    to: '  const url = nonEmptyString(raw?.urls?.regular)?.replace("https://images.unsplash.com/", "https://our-cdn.example/") ?? null;',
  },
];

let caught = 0;
const missed = [];

for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    missed.push({ ...m, why: "the mutation target no longer exists in the file" });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));

  let caughtBy = null;
  let detail = "";
  try {
    for (const suite of m.suites) {
      try {
        execFileSync("node", [suite], { encoding: "utf8", stdio: "pipe" });
      } catch (e) {
        caughtBy = suite;
        const out = String(e.stdout || "") + String(e.stderr || "");
        detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
        break;
      }
    }
  } finally {
    writeFileSync(m.file, original);
  }

  if (caughtBy) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          by ${caughtBy.split("/").pop()} -> ${detail.slice(0, 140)}`);
  } else {
    missed.push({ ...m, why: "every suite stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}\n          the suites stayed green`);
  }
}

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES — a compliance guarantee nothing is holding:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned a suite red.");
