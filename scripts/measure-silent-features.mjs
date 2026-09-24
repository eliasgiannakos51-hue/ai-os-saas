#!/usr/bin/env node
/*
 * WHICH FEATURES GO SILENT WITHOUT A KEY, AND DOES THE SCREEN SAY SO?
 *
 * THE QUESTION THE OWNER ASKED, on 2026-09-24, in the form that matters:
 * "for each key I have NOT set — does the UI say so, or does it go quiet?
 * And does it show a PRICE for a feature that cannot run? Voice did.
 * How many others?"
 *
 * A price beside something that cannot execute is worse than a missing
 * feature. The buyer pays for a plan on the strength of a row in a table,
 * presses the thing, and gets an error — and every screen between those
 * two moments agreed with them.
 *
 * ------------------------------------------------------------------
 * HOW IT ANSWERS, AND WHY IT DERIVES RATHER THAN LISTS
 * ------------------------------------------------------------------
 *
 * The population is lib/billing/feature-catalog.ts: every capability this
 * product sells, with its tier, its routes and its pages. A hand-written
 * list of "features that need a key" would go stale the first time a
 * feature is added — which is the failure this repository has recorded
 * four times, most recently in a scan that typed its own feature list.
 *
 * So for every catalog entry, the scan walks its ROUTES and PAGES and the
 * modules they import, transitively, and collects every provider key
 * those files read: `process.env.X`, `env.X`, and the registry's
 * PROVIDER_KEY_ENV_VARS, which are read by NAME rather than literally
 * (GOOGLE_API_KEY and GROQ_API_KEY appear nowhere as a literal in src).
 *
 * Then it asks two things of each entry that needs a key:
 *
 *   1. Does it appear in the published comparison table — that is, is a
 *      PRICE shown for it?
 *   2. Does anything on the path from the screen to the route TELL the
 *      user the key is missing, rather than failing as a generic error?
 *
 * ------------------------------------------------------------------
 * WHAT IT CANNOT TELL YOU, said before the numbers
 * ------------------------------------------------------------------
 *
 * Which keys are actually set on the deployment. It reads the code, not
 * Vercel. What it produces is the MAP — feature to key to screen — and
 * the map is what makes an answer about a specific deployment possible:
 * `/dashboard/system-health` reads the same registry at run time and
 * reports what is really there.
 *
 * It also cannot see a key read through a helper it fails to follow. The
 * import walk is textual and stops at node_modules, so a provider reached
 * through a dynamic import is invisible. The count of files walked per
 * feature is printed so that a suspiciously small one is visible.
 *
 * Run: node scripts/measure-silent-features.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { loadTs } from "./tests/load-ts.mjs";

const catalog = await loadTs("src/lib/billing/feature-catalog.ts");
const registry = await loadTs("src/lib/ai/providers/registry.ts");

const ENTRIES = catalog.FEATURE_CATALOG ?? catalog.FEATURES ?? [];
if (!Array.isArray(ENTRIES) || ENTRIES.length === 0) {
  console.error("feature-catalog.ts exported no array this scan recognises.");
  process.exit(1);
}

/**
 * THE KEYS THAT ARE A PROVIDER'S, as opposed to the dozens of tuning
 * variables. A provider key is the one whose absence makes a feature
 * impossible rather than differently configured: no amount of retrying
 * transcribes speech without OPENAI_API_KEY.
 *
 * The AI ones come from the registry rather than being typed here, so a
 * provider added to PROVIDER_KEY_ENV_VARS is covered without an edit.
 */
const PROVIDER_KEYS = new Set([
  ...Object.values(registry.PROVIDER_KEY_ENV_VARS ?? {}),
  "ELEVENLABS_API_KEY",
  "UNSPLASH_ACCESS_KEY",
  "RESEND_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "STRIPE_SECRET_KEY",
  "VAPID_PRIVATE_KEY",
]);

/**
 * DOES THIS FILE REFUSE WITHOUT THE KEY, or merely mention it?
 *
 * THE DISTINCTION THE FIRST VERSION DID NOT DRAW, and it produced a
 * headline that RESEND_API_KEY kills 23 of 23 features. It does not. Every
 * route imports logApiError, which can reach the notifier, which reads
 * RESEND_API_KEY — so Resend is REACHABLE from everything and REQUIRED by
 * almost nothing. Reachability is what could happen; this asks what
 * refuses.
 *
 * The shape of a refusal, in this repository, is the key read into a
 * local and then tested for absence on a path that returns: `if (!apiKey)
 * return NextResponse.json({ ok: false, ... })`, or `configured: false`,
 * or an `unavailable` reason code. 400 characters after the read is
 * enough for all of them and short enough that an unrelated return three
 * functions later does not count.
 */
function guardsOn(src, key) {
  for (const m of src.matchAll(new RegExp(`process\\.env\\.${key}\\b`, "g"))) {
    const after = src.slice(m.index, m.index + 400);
    const before = src.slice(Math.max(0, m.index - 120), m.index);
    if (/!\s*$|Boolean\(\s*$|===\s*undefined|\?\?/.test(before)) return true;
    if (/if\s*\(\s*!\w+\s*\)[\s\S]{0,200}?(return|throw|ok:\s*false|configured:\s*false|unavailable)/.test(after)) return true;
    if (/(ok:\s*false|configured:\s*false|"unavailable"|'unavailable')/.test(after)) return true;
  }
  return false;
}

const cache = new Map();
function read(file) {
  if (!cache.has(file)) cache.set(file, existsSync(file) ? readFileSync(file, "utf8") : null);
  return cache.get(file);
}

function resolveImport(spec, from) {
  if (spec.startsWith("@/")) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const p = `src/${spec.slice(2)}${ext}`;
      if (existsSync(p)) return p;
    }
    return null;
  }
  if (!spec.startsWith(".")) return null;
  const base = from.split("/").slice(0, -1).join("/");
  const parts = `${base}/${spec}`.split("/");
  const out = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  const joined = out.join("/");
  for (const ext of [".ts", ".tsx", "/index.ts"]) {
    if (existsSync(joined + ext)) return joined + ext;
  }
  return null;
}

/**
 * Every file reachable from a starting file, textually, inside src —
 * WITH ITS DEPTH, which is the term that separates a dependency from a
 * side effect.
 *
 * RESEND_API_KEY is read behind a proper `if (!apiKey) return { ok:
 * false }` guard, so "is it guarded" says yes, and the first two versions
 * of this scan reported that Resend kills 23 of 23 features. What that
 * guard refuses is THE EMAIL. The route carries on and answers the user.
 *
 * Depth is the cheap approximation of "does the route's own answer depend
 * on this": the route file is 0, what it imports is 1, and Resend arrives
 * at 3 or more through logApiError -> the notifier. It is a heuristic and
 * it is stated as one; the alternative is a data-flow analysis of every
 * route, and the depth at which each key was found is printed so a
 * surprising one can be argued with.
 */
function closure(start, seen = new Map(), depth = 0) {
  if (!start) return seen;
  if (seen.has(start) && seen.get(start) <= depth) return seen;
  const src = read(start);
  if (src === null) return seen;
  seen.set(start, depth);
  for (const m of src.matchAll(/from\s+"([^"]+)"/g)) {
    const next = resolveImport(m[1], start);
    if (next) closure(next, seen, depth + 1);
  }
  return seen;
}

/** A guard this far from the route decides the route's own answer. */
const REQUIRED_MAX_DEPTH = 2;

function entryFiles(entry) {
  const starts = [];
  for (const r of entry.routes ?? []) {
    for (const p of [`src/app/api/${r}/route.ts`, `src/app/api/${r}.ts`]) {
      if (existsSync(p)) starts.push(p);
    }
  }
  for (const pg of entry.pages ?? []) {
    const p = pg === "" ? "src/app/dashboard/page.tsx" : `src/app/dashboard/${pg}/page.tsx`;
    if (existsSync(p)) starts.push(p);
  }
  const all = new Map();
  for (const s of starts) {
    for (const [f, d] of closure(s)) {
      if (!all.has(f) || all.get(f) > d) all.set(f, d);
    }
  }
  return { starts, all };
}

const rows = [];
for (const entry of ENTRIES) {
  const { starts, all } = entryFiles(entry);
  const keyDepth = new Map();
  const required = new Set();
  const failover = new Set();
  const incidental = new Set();
  for (const [f, depth] of all) {
    const src = read(f) ?? "";
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      if (!PROVIDER_KEYS.has(m[1])) continue;
      const isRequired = guardsOn(src, m[1]) && depth <= REQUIRED_MAX_DEPTH;
      if (isRequired) { required.add(m[1]); keyDepth.set(m[1], Math.min(keyDepth.get(m[1]) ?? 99, depth)); }
      else incidental.add(m[1]);
    }
    // READ BY NAME THROUGH THE REGISTRY, and this is where the first
    // version was wrong in the way the whole round has been about.
    //
    // A file that calls runCompletion can reach every provider in
    // PROVIDER_KEY_ENV_VARS, so the first version marked all four as
    // dependencies — and reported that nine sold features die without
    // GOOGLE_API_KEY. They do not. DEFAULT_PROVIDER_ORDER is Anthropic
    // alone; the others are a chain an operator opts into, and their
    // absence changes nothing. "Can reach" is what COULD happen. What
    // DIES is the default.
    if (/runCompletion|completeWith|providerFor/.test(src) && depth <= REQUIRED_MAX_DEPTH) {
      for (const p of registry.DEFAULT_PROVIDER_ORDER ?? []) {
        required.add(registry.PROVIDER_KEY_ENV_VARS[p]);
      }
      for (const [p, v] of Object.entries(registry.PROVIDER_KEY_ENV_VARS ?? {})) {
        if (!(registry.DEFAULT_PROVIDER_ORDER ?? []).includes(p)) failover.add(v);
      }
    }
  }
  for (const k of required) { incidental.delete(k); failover.delete(k); }
  const keys = [...required].sort();
  // AND THE HALF THE OWNER ACTUALLY ASKED ABOUT: when the key is absent,
  // does the SCREEN say so, or does the feature simply go quiet?
  //
  // A "not configured" signal is one of three things this product already
  // uses: an i18n key ending notConfigured, a reason code the workspace
  // renders (`not_configured`, `ai_unavailable`), or the env var's own
  // name reaching a component. Anything else — a generic error, a button
  // that does nothing, a spinner that ends — is SILENCE, which is the
  // state that sells a plan and then disappoints.
  let saysSo = false;
  for (const [f] of all) {
    if (!/^src\/(components|app)\//.test(f)) continue;
    const src = read(f) ?? "";
    if (/notConfigured|not_configured|ai_unavailable|notConfiguredVar/.test(src)) { saysSo = true; break; }
    if ([...PROVIDER_KEYS].some((k) => src.includes(k))) { saysSo = true; break; }
  }

  rows.push({
    id: entry.id,
    saysSo,
    charges: entry.charges,
    sold: !entry.notSold,
    notBuilt: Boolean(entry.notBuilt),
    starts: starts.length,
    walked: all.size,
    keys,
    keyDepth: Object.fromEntries(keyDepth),
    failover: [...failover].sort(),
    incidental: [...incidental].sort(),
  });
}

const needKeys = rows.filter((r) => r.keys.length > 0);
const sold = needKeys.filter((r) => r.sold && !r.notBuilt);

console.log("WHAT GOES SILENT WITHOUT A KEY — derived from the feature catalog\n");
console.log(`  ${rows.length} catalog entries`);
console.log(`  ${needKeys.length} reach at least one provider key`);
console.log(`  ${sold.length} of those are SOLD — a row in the published comparison table\n`);

const byKey = new Map();
for (const r of needKeys) for (const k of r.keys) {
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(r);
}
console.log("== what dies with each key ==\n");
for (const [key, list] of [...byKey].sort((a, b) => b[1].length - a[1].length)) {
  const soldCount = list.filter((r) => r.sold && !r.notBuilt).length;
  const depths = [...new Set(list.map((r) => r.keyDepth[key]).filter((d) => d !== undefined))].sort();
  console.log(`  ${key.padEnd(24)} ${String(list.length).padStart(3)} feature(s), ${soldCount} sold, guarded at depth ${depths.join("/") || "-"}`);
  console.log(`    ${list.map((r) => r.id).sort().join(", ")}`);
}

const withFailover = rows.filter((r) => r.failover.length > 0);
if (withFailover.length) {
  console.log(`\n== reachable but NOT required: the failover chain (${withFailover.length} features) ==`);
  console.log("   DEFAULT_PROVIDER_ORDER is Anthropic alone. These keys are a chain an");
  console.log("   operator opts into; without them nothing goes silent, there is simply");
  console.log("   no second attempt when Anthropic is down.\n");
  const keys = new Set(withFailover.flatMap((r) => r.failover));
  console.log(`   ${[...keys].sort().join(", ")}`);
}

const incidentalKeys = new Set(rows.flatMap((r) => r.incidental));
if (incidentalKeys.size) {
  console.log(`\n== reachable, read, and NOT guarded (${incidentalKeys.size} keys) ==`);
  console.log("   read somewhere in the import closure without an absence check that");
  console.log("   refuses. Usually a logger or a notifier the feature does not depend");
  console.log("   on — RESEND_API_KEY reaches all 51 entries through logApiError, and");
  console.log("   kills none of them.\n");
  console.log(`   ${[...incidentalKeys].sort().join(", ")}`);
}

const silent = rows.filter((r) => r.keys.length > 0 && r.sold && !r.notBuilt && !r.saysSo);
console.log(`\n== SOLD, NEEDS A KEY, AND THE SCREEN NEVER SAYS SO (${silent.length}) ==`);
console.log("   a row with a price in the comparison table, a required key, and no");
console.log("   'not configured' signal anywhere on its own screen. The buyer reads");
console.log("   the price, presses the thing, and gets whatever the generic failure");
console.log("   path produces.\n");
for (const r of silent) {
  console.log(`  ${r.id.padEnd(22)} needs ${r.keys.join(", ")}`);
}
if (silent.length === 0) console.log("   none.");

const speaks = rows.filter((r) => r.keys.length > 0 && r.sold && !r.notBuilt && r.saysSo);
console.log(`\n   ${speaks.length} sold feature(s) DO say so: ${speaks.map((r) => r.id).sort().join(", ")}`);

const thin = rows.filter((r) => r.starts > 0 && r.walked < 3);
if (thin.length) {
  console.log(`\n== walked suspiciously few files (${thin.length}) ==`);
  console.log("   a feature whose closure is two files probably imports through a");
  console.log("   path this textual walk did not follow — its key list is not to be trusted\n");
  for (const r of thin) console.log(`  ${r.id.padEnd(28)} ${r.starts} start(s), ${r.walked} file(s)`);
}

const noStarts = rows.filter((r) => r.starts === 0 && !r.notBuilt);
console.log(`\n  ${noStarts.length} entries have no route or page this scan could open`);
console.log("  (sidebar-only rows, and features whose page is not under /dashboard)");

console.log(
  "\n  THIS READS THE CODE, NOT THE DEPLOYMENT. Which keys are actually set\n" +
    "  is a question for /dashboard/system-health, which reads the same\n" +
    "  registry at run time. What this produces is the map between them."
);
