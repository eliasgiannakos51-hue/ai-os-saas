// A VARIABLE THAT DOES NOT EXIST WHERE THE CODE RUNS.
//
// env-documented.test.mjs asks whether all 143 environment variables are
// written down, and they are. It never asks WHERE each one is read. Those
// are different questions, and only the second one can take a page down:
// in a browser bundle `process.env.FOO` is not the machine's environment.
// Next.js inlines `NEXT_PUBLIC_*` (and NODE_ENV) at build time and
// eliminates every other reference, so a module that ships to the browser
// and reads `CRON_SECRET` reads `undefined` there and something real on
// the server — the same function, the same input, two answers.
//
// THE SYMPTOM IS NOT AN ERROR. It is a link that points at /s/acme in one
// place and / in another, or a price read from defaults in the browser
// and from the configured value on the server. Nothing throws, so nothing
// is logged, and the page renders — wrongly, in all ten languages at once
// because the language is not what is wrong.
//
// AND THE OTHER DIRECTION, which is the one that really does blank a
// page: a `NEXT_PUBLIC_*` variable that is UNSET AT BUILD TIME inlines as
// the literal `undefined`. `createBrowserClient(undefined!, undefined!)`
// throws from its constructor, React unmounts the subtree, and the
// person gets an empty screen. The `!` that makes TypeScript accept it is
// what removes the only warning anybody would have seen.
//
// WHAT WAS MEASURED, 2026-09-18, by building rather than by asserting:
// `npx next build` under scripts/env-sensitivity.mjs's deployedEnv() with
// CRON_SECRET and PUBLISHED_SITE_DOMAIN set to unique markers, then
// grepping .next/static. Neither marker appears. NO `process.env.X`
// reference of any kind survives in a browser chunk. So nothing leaks and
// nothing is broken today — both non-public reads sit in functions the
// bundler drops because no browser code calls them.
//
// THAT IS A PROPERTY OF TREE-SHAKING, NOT OF THE CODE, and it is what
// this file makes explicit: it is true only while nothing in the client
// bundle calls those functions, which is one import away from changing
// and which nothing anywhere records. Re-derive the measurement with:
//
//   node -e 'import("./scripts/env-sensitivity.mjs").then(({deployedEnv})=>{
//     const e=deployedEnv(); e.CRON_SECRET="ZZCRONZZ";
//     require("child_process").spawnSync("npx",["next","build"],{env:e,stdio:"inherit"});})'
//   grep -rl ZZCRONZZ .next/static/
//
// Run: node scripts/tests/client-env-reach.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full.replace(/\\/g, "/"));
  }
})("src");

// Comments stripped, because this file's own header spells several of
// the patterns below and three gates in this repository have already
// read their own prose as code.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SOURCE = new Map(files.map((f) => [f, strip(readFileSync(f, "utf8"))]));

// ---------------------------------------------------------------------
// THE POPULATION IS THE BUNDLE, NOT THE DIRECTORY.
//
// "Client component" is not a folder and not a filename. It is every file
// reachable by import from a file carrying the "use client" directive,
// stopping at `import "server-only"` — which is the same boundary Next
// itself enforces, so this is the real edge rather than a proxy for it.
// Both files found below are plain `src/lib/*.ts` with no directive of
// any kind; a scan of `src/components` would have found neither.
// ---------------------------------------------------------------------
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = "src/" + spec.slice(2);
  else if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else return null;
  for (const c of [base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx"]) {
    if (SOURCE.has(c)) return c;
  }
  return null;
}
const importsOf = (f) =>
  [...SOURCE.get(f).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => resolveImport(f, m[1])).filter(Boolean);

const isClientEntry = (f) => /^\s*["']use client["']/m.test(SOURCE.get(f));
const isServerOnly = (f) => /import\s+["']server-only["']/.test(SOURCE.get(f));

const entries = files.filter(isClientEntry);
const bundle = new Map(); // file -> the client entry that first pulled it in
{
  const queue = entries.map((e) => [e, e]);
  while (queue.length) {
    const [f, entry] = queue.shift();
    if (bundle.has(f)) continue;
    bundle.set(f, entry);
    for (const next of importsOf(f)) if (!bundle.has(next) && !isServerOnly(next)) queue.push([next, entry]);
  }
}

check(`.ts/.tsx files walked (${files.length})`, files.length >= 400, "the walk found almost nothing");
check(`"use client" entries (${entries.length})`, entries.length >= 150, "the directive detector matched almost nothing");
check(
  `files reachable in a client bundle (${bundle.size})`,
  bundle.size >= 250,
  "the import resolver returned nothing, so every check below is over an empty set"
);
check(
  "…and the bundle is larger than the set of entries",
  bundle.size > entries.length,
  "the graph is not being followed — only the entries themselves are in it, so no lib/ module can ever be reported"
);
check(
  "…and server-only modules are kept out of it",
  ![...bundle.keys()].some(isServerOnly),
  [...bundle.keys()].filter(isServerOnly).slice(0, 3).join(", ") +
    "\n        a server-only module inside the client population would make every finding below a false one"
);

// ---------------------------------------------------------------------
// 1. WHAT IS READ IN THERE.
// ---------------------------------------------------------------------
const READ = /process\s*\.\s*env\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)/g;
// `process.env[name]` — the form env-usage.mjs exists for, because a name
// held in a variable is a name no compiler checks. In a browser bundle it
// is worse than the dotted form: it cannot be inlined at all, so it
// ALWAYS reads undefined, and it cannot be eliminated either.
const COMPUTED = /process\s*\.\s*env\s*\[/;
// Passing the whole object is the same question one step out: whatever
// receives it gets the browser's shim rather than an environment.
const WHOLE = /process\s*\.\s*env\b(?!\s*[.[])/;

const INLINED = (name) => name.startsWith("NEXT_PUBLIC_") || name === "NODE_ENV";

const reads = [];
for (const [f, entry] of bundle) {
  const src = SOURCE.get(f);
  for (const m of src.matchAll(new RegExp(READ.source, "g"))) reads.push({ file: f, entry, name: m[1], at: m.index });
  if (COMPUTED.test(src)) reads.push({ file: f, entry, name: "<computed>", at: src.search(COMPUTED) });
  if (WHOLE.test(src)) reads.push({ file: f, entry, name: "<whole object>", at: src.search(WHOLE) });
}
check(
  `process.env reads inside the client bundle (${reads.length})`,
  reads.length >= 4,
  "the read detector matched almost nothing, so the register below is checked against an empty set and passes vacuously"
);
const notInlined = reads.filter((r) => !INLINED(r.name));
check(
  `…of which are not inlined in a browser (${notInlined.length})`,
  notInlined.length >= 1,
  "nothing is reported as non-public — either the tree really is clean, in which case delete the register below, or INLINED has gone wrong and is excusing everything"
);

// ---------------------------------------------------------------------
// 2. EACH ONE IS DECLARED, AND THE DECLARATION IS CHECKED RATHER THAN
//    BELIEVED.
//
// A reason of the form "it is fine, nothing in the browser calls it" is
// true the day it is written and silently false afterwards. So the entry
// names the FUNCTION that does the reading, and this file proves that no
// other file in the client bundle mentions it. The written reason and the
// mechanical check say the same thing, and the check is what fails.
// ---------------------------------------------------------------------
const NOT_INLINED_ON_PURPOSE = {
  // ---- kind: "unreachable" — the bundler drops it ------------------
  "src/lib/function-limits.ts": {
    variable: "CRON_SECRET",
    fn: "internalHandoffToken",
    kind: "unreachable",
    why:
      "the module reaches the browser through website-generation-limits.ts (imported by website-builder-workspace.tsx) for its plan limits, and internalHandoffToken is the only thing in it that reads an environment. It is the token one server route sends another, so a browser has no use for it. Measured 2026-09-18: neither a unique CRON_SECRET marker nor the string x-ionexa-internal appears in .next/static, so the function is dropped whole and the secret does not reach a browser.",
  },
  "src/lib/publishing/subdomain.ts": {
    variable: "PUBLISHED_SITE_DOMAIN",
    fn: "publishedSiteBasePath",
    kind: "unreachable",
    why:
      "the module is genuinely client code — the publish dialog validates a subdomain as it is typed and previews the address with publishedSiteUrl and SUBDOMAIN_TOKEN, which is why that token exists. publishedSiteBasePath is the one function that asks the environment which URL shape is configured, and it is called only from api/websites/[id]/publish. Measured 2026-09-18: the string example.invalid, unique to its body, is in no chunk. If the dialog called it the preview would be path-shaped in the browser and host-shaped on the server, and nothing would throw.",
  },
  "src/lib/voice/voice-pricing.ts": {
    variable: "<whole object>",
    fn: "voiceMinutesForPlan",
    kind: "unreachable",
    why:
      "use-recorder.ts imports MAX_CLIP_SECONDS from here, which is a number rather than a setting, and that is what pulls the module in. voiceMinutesForPlan takes `env = process.env` as a default parameter and would return the built-in allowance rather than VOICE_MINUTES_<PLAN> in a browser. Measured 2026-09-18: no chunk contains VOICE_MINUTES_, so the parser is dropped.",
  },

  // ---- kind: "runs_in_browser" — it is there, and it executes ------
  //
  // THESE TWO ARE NOT A MISTAKE AND NOT A CLEAN BILL EITHER. They are an
  // accepted divergence that was recorded in ONE comment in ONE component
  // — website-builder-workspace.tsx:1163, "DEFAULTS, not
  // resolvePricingConfig(): this runs in the browser, where the
  // server-only pricing env vars are not readable" — while margin-policy's
  // own header claimed the opposite about the same code path. Written
  // down here so the acceptance has one home and the next reader does not
  // have to find the right comment to know which sentence is true.
  "src/lib/billing/pricing-config.ts": {
    variable: "<whole object>",
    fn: "resolvePricingConfig",
    kind: "runs_in_browser",
    browserGets:
      "an empty environment: every override falls back to DEFAULTS, and the [pricing-config] warnings it would log about bad values are logged against nothing.",
    why:
      "client components import DEFAULTS from here, a plain constant, and pass it explicitly wherever a config is wanted — so resolvePricingConfig is present in the bundle (its warning string is in chunk 6096, measured 2026-09-18) but short-circuited by the `config ?? resolvePricingConfig()` in margin-policy. It is one omitted argument away from running, which is why it is written down rather than called safe.",
  },
  "src/lib/billing/margin-policy.ts": {
    variable: "<whole object>",
    fn: "resolveMarginFor",
    kind: "runs_in_browser",
    browserGets:
      "no CREDIT_MARGIN_<FEATURE>_<PLAN> override at all — the margin comes from PLAN_MARGIN_DEFAULTS and the passed config, so an operator who sets a per-feature override moves the real charge and not the estimate.",
    why:
      "use-cost-estimate.ts calls estimateForAction, which calls resolveMarginFor with three arguments, leaving `env = process.env` as the default. It really does execute in a browser: the string CREDIT_MARGIN_ is in two chunks, measured 2026-09-18. The divergence is ACCEPTED — the estimate is an estimate, settlement charges the measured cost and releases the rest of the hold — and the cost of it is that a per-feature override is invisible in the preview. Closing it would need a NEXT_PUBLIC_ mirror of the overrides, which is a decision about exposing pricing policy to the browser rather than a bug fix.",
  },
};

const undeclared = notInlined.filter((r) => {
  const d = NOT_INLINED_ON_PURPOSE[r.file];
  return !d || (d.variable !== r.name && r.name !== "<computed>" && r.name !== "<whole object>");
});
check(
  "every non-public variable read in the client bundle is declared",
  undeclared.length === 0,
  undeclared.map((r) => `${r.file} reads ${r.name}   <- ${r.entry}`).join("\n        ") +
    "\n        In a browser this reads undefined. Move the read behind a server boundary, make the variable NEXT_PUBLIC_, or declare it with the reason."
);

// BOTH WAYS. An entry for a file that has left the bundle, stopped
// reading an environment, or been deleted is a sentence that has stopped
// being true — and it is the kind that reads as coverage.
const staleFiles = Object.keys(NOT_INLINED_ON_PURPOSE).filter((f) => !notInlined.some((r) => r.file === f));
check(
  "no declaration outlives what it was written about",
  staleFiles.length === 0,
  staleFiles
    .map((f) =>
      !SOURCE.has(f)
        ? `${f}: no such file`
        : !bundle.has(f)
          ? `${f}: no longer reaches a client bundle — drop the entry`
          : `${f}: no longer reads a non-public variable — drop the entry`
    )
    .join("\n        ")
);

// ---------------------------------------------------------------------
// AND THE KIND IS CHECKED, NOT TAKEN.
//
// "Nothing in the browser calls it" is true the day it is written and
// silently false afterwards — which is the whole disease this repository
// keeps finding. So each entry names the FUNCTION doing the reading and
// declares which of two things is the case, and BOTH are verified against
// the bundle in the direction that can go wrong:
//
//   unreachable      no other file in the client bundle names it. One
//                    import makes that false, and this goes red.
//   runs_in_browser  at least one other file in the bundle DOES name it,
//                    and the entry says what the browser gets instead. If
//                    that stops being true the entry has become alarming
//                    prose about code that is now fine, which is its own
//                    kind of lie.
//
// The comment stripper matters here: website-builder-workspace.tsx names
// resolvePricingConfig in prose, explaining why it does NOT call it, and
// a scan that read comments would report the opposite of the truth.
// ---------------------------------------------------------------------
const KINDS = ["unreachable", "runs_in_browser"];
const badKind = Object.entries(NOT_INLINED_ON_PURPOSE).filter(([, d]) => !KINDS.includes(d.kind));
check("every declaration says which kind it is", badKind.length === 0, badKind.map(([f]) => f).join(", "));

const namesIt = (fn, exceptFile) =>
  [...bundle.keys()].filter((f) => f !== exceptFile && new RegExp(`\\b${fn}\\b`).test(SOURCE.get(f)));

const wrongKind = [];
for (const [file, d] of Object.entries(NOT_INLINED_ON_PURPOSE)) {
  if (!SOURCE.has(file)) continue;
  if (!new RegExp(`function\\s+${d.fn}\\b|const\\s+${d.fn}\\s*=`).test(SOURCE.get(file))) {
    wrongKind.push(`${file}: ${d.fn} is not defined there any more — the entry names a function that moved or was renamed`);
    continue;
  }
  const callers = namesIt(d.fn, file);
  if (d.kind === "unreachable" && callers.length > 0) {
    wrongKind.push(
      `${file}: ${d.fn} is declared unreachable, but ${callers.slice(0, 2).join(", ")} name it and are in the client bundle — it reads ${d.variable} as undefined there now`
    );
  }
  if (d.kind === "runs_in_browser") {
    if (callers.length === 0) {
      wrongKind.push(`${file}: ${d.fn} is declared to run in a browser and nothing in the bundle names it any more — re-classify it as unreachable`);
    }
    if (!d.browserGets || d.browserGets.length < 40) {
      wrongKind.push(`${file}: a read that runs in a browser must say what the browser gets instead`);
    }
  }
}
check(
  `each declaration's kind matches the bundle (${Object.keys(NOT_INLINED_ON_PURPOSE).length} declared, ` +
    `${Object.values(NOT_INLINED_ON_PURPOSE).filter((d) => d.kind === "runs_in_browser").length} run in a browser)`,
  wrongKind.length === 0,
  wrongKind.join("\n        ")
);
const shortWhy = Object.entries(NOT_INLINED_ON_PURPOSE).filter(([, d]) => d.why.length < 80);
check("every reason is an argument", shortWhy.length === 0, shortWhy.map(([f]) => f).join(", "));

// ---------------------------------------------------------------------
// 3. THE PUBLIC ONES, WHICH FAIL THE OTHER WAY.
//
// `NEXT_PUBLIC_X!` is not a guarantee, it is a silenced warning. Unset at
// BUILD time the variable inlines as undefined and the `!` is the reason
// nobody hears about it until a screen is blank. So a bare dereference is
// allowed only for a variable the environment registry calls required —
// which is the one claim that makes "it will always be set" checkable.
// ---------------------------------------------------------------------
const registry = await loadTs("src/lib/env-check.ts");
const LEVEL = new Map((registry.ENV_REQUIREMENTS ?? []).map((r) => [r.name, r.level]));
check(
  `the environment registry loaded (${LEVEL.size} entries)`,
  LEVEL.size >= 20,
  "ENV_REQUIREMENTS came back empty, so every variable below would look unrequired and this section would be noise rather than a check"
);

// GUARDED means the value is tested before it is used: `?? null`, `||`,
// `?.`, a ternary, or an `if`. UNGUARDED is the bare read, with or
// without the non-null `!`.
const UNGUARDED = (src, name) => {
  const re = new RegExp(`process\\s*\\.\\s*env\\s*\\.\\s*${name}\\s*(!?)\\s*([^\\s)]|\\))`, "g");
  for (const m of src.matchAll(re)) {
    const after = src.slice(m.index + m[0].length - 1, m.index + m[0].length + 6);
    if (/^\s*(\?\?|\|\||\?\.|===|!==|==|!=|\?)/.test(after)) continue;
    return true;
  }
  return false;
};
const publicReads = reads.filter((r) => r.name.startsWith("NEXT_PUBLIC_"));
const unguardedOptional = [];
for (const r of publicReads) {
  if (!UNGUARDED(SOURCE.get(r.file), r.name)) continue;
  if (LEVEL.get(r.name) === "required") continue;
  unguardedOptional.push(`${r.file}: ${r.name} is used without a fallback and the registry calls it ${LEVEL.get(r.name) ?? "nothing at all"}`);
}
check(
  `every unguarded public variable is one the registry requires (${publicReads.length} public reads)`,
  unguardedOptional.length === 0,
  unguardedOptional.join("\n        ") +
    "\n        Unset at build time it inlines as undefined, and the page that dereferences it renders blank in every language."
);

// ---------------------------------------------------------------------
// CONTROLS — they drive the detectors above rather than restating them.
// ---------------------------------------------------------------------
check("control: a NEXT_PUBLIC name is inlined", INLINED("NEXT_PUBLIC_SITE_URL"));
check("control: NODE_ENV is too", INLINED("NODE_ENV"));
check("control: a bare name is not", !INLINED("CRON_SECRET"), "every server variable would be excused as public");
check("control: a name merely containing it is not", !INLINED("MY_NEXT_PUBLIC_THING"), "the test is a prefix, not a substring");
// The directive detector, driven on strings rather than on the tree. The
// first version of this line was a tangle that evaluated to `|| true` and
// asserted nothing — a control that cannot fail is the thing this project
// deletes rather than commits, and it was sitting in a file about checks
// that pass while measuring nothing.
const SAYS_CLIENT = (src) => /^\s*["']use client["']/m.test(src);
check("control: the directive is seen", SAYS_CLIENT('"use client";\nexport default function A(){}'));
check("control: single quotes count too", SAYS_CLIENT("'use client';\nexport function B(){}"));
check("control: a file without it is not an entry", !SAYS_CLIENT("export function C(){}"));
check(
  "control: the directive named in prose is not the directive",
  !SAYS_CLIENT(strip('// a component carrying "use client" ships to the browser\nexport function D(){}')),
  "the comment stripper is not running, so a note about the directive counts as the directive"
);
check(
  "control: a computed read is found",
  COMPUTED.test('const v = process.env[name];'),
  "process.env[name] is the form a compiler never checks, and it is never inlined"
);
check("control: a dotted read is not mistaken for a computed one", !COMPUTED.test("const v = process.env.FOO;"));
check(
  "control: passing the whole object is found",
  WHOLE.test("parsePricingConfig(process.env)"),
  "a function handed process.env in the browser is handed a shim, and answers from defaults"
);
check("control: a dotted read is not mistaken for the whole object", !WHOLE.test("const v = process.env.FOO;"));
check("control: a bare dereference is unguarded", UNGUARDED("createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, x)", "NEXT_PUBLIC_SUPABASE_URL"));
check("control: a ?? fallback is guarded", !UNGUARDED("process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null", "NEXT_PUBLIC_VAPID_PUBLIC_KEY"));
check("control: an || fallback is guarded", !UNGUARDED('process.env.NEXT_PUBLIC_BUILD_ID || "dev"', "NEXT_PUBLIC_BUILD_ID"));
check("control: an equality test is guarded", !UNGUARDED('process.env.NEXT_PUBLIC_BUILD_ID === "x"', "NEXT_PUBLIC_BUILD_ID"));

console.log(
  `\n        ${entries.length} client entries · ${bundle.size} files in the bundle · ` +
    `${reads.length} env reads · ${notInlined.length} not inlined, all declared`
);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
