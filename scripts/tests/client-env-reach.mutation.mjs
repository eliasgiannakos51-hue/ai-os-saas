#!/usr/bin/env node
/*
 * CAN client-env-reach.test.mjs SEE A SERVER VARIABLE REACH A BROWSER?
 *
 * env-documented.test.mjs stays green through every one of these: its
 * question is whether a variable is written down, and all 143 are. Where
 * each one is READ is a different question, and the only one that can
 * blank a screen.
 *
 *   1. a client component starts reading a server variable — the case
 *      the whole file exists for, in the form a person writes it.
 *   2. the same through the shapes no `process.env.NAME` scan sees: the
 *      whole object passed to a parser, and the computed lookup.
 *   3. a declared-unreachable function becomes reachable — the written
 *      reason turning false with nobody editing the reason.
 *   4. the reverse: a read declared to run in a browser stops doing so,
 *      leaving alarming prose about code that is now fine.
 *   5. a NEXT_PUBLIC_ variable that is NOT required is dereferenced
 *      without a fallback — unset at build time it inlines as undefined
 *      and the page renders blank in every language.
 *   6. the populations going blind: the import graph, the "use client"
 *      detector, the server-only boundary.
 *
 * Run: node scripts/tests/client-env-reach.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/client-env-reach.test.mjs";
const CLIENT = "src/components/credits/use-cost-estimate.ts";
const SUPABASE = "src/lib/supabase/client.ts";
const PWA = "src/components/pwa/pwa-provider.tsx";
const SUBDOMAIN = "src/lib/publishing/subdomain.ts";

const MUTANTS = [
  {
    // THE CASE ITSELF. A client hook reaching for a server secret. It
    // compiles, TypeScript is happy, and in a browser it is undefined.
    name: "a client component reads a server variable",
    file: CLIENT,
    from: "export function useCostEstimate",
    to: 'const _tok = process.env.CRON_SECRET;\nexport function useCostEstimate',
    expect: "is declared",
  },
  {
    // THE SHAPE NO NAME-SCAN SEES. No variable is spelled anywhere, so a
    // grep for process.env.SOMETHING finds nothing at all.
    name: "a client component hands the whole environment to a parser",
    file: CLIENT,
    from: "export function useCostEstimate",
    to: "const _cfg = JSON.stringify(process.env);\nexport function useCostEstimate",
    expect: "is declared",
  },
  {
    name: "a client component reads a name held in a variable",
    file: CLIENT,
    from: "export function useCostEstimate",
    to: 'const _k = "CRON_SECRET";\nconst _v = process.env[_k];\nexport function useCostEstimate',
    expect: "is declared",
  },
  {
    // A REASON THAT HAS STOPPED BEING TRUE. publishedSiteBasePath is
    // declared unreachable; one import from a client component makes the
    // sentence false, and nobody edits a sentence they are not reading.
    name: "a function declared unreachable is named by a client file",
    file: CLIENT,
    from: 'import { estimateForAction, type ActionProfileKey } from "@/lib/billing/estimate";',
    to: 'import { estimateForAction, type ActionProfileKey } from "@/lib/billing/estimate";\nimport { publishedSiteBasePath } from "@/lib/publishing/subdomain";',
    expect: "kind matches the bundle",
  },
  {
    // AND THE OTHER DIRECTION. An entry that says "this runs in a
    // browser" when it no longer does is prose that makes a clean thing
    // look dangerous — the register rotting the harmless way.
    name: "a read declared to run in a browser stops saying what the browser gets",
    file: GATE,
    // The field dropped rather than shortened. The first version cut the
    // sentence in half and the remainder was still long enough to pass —
    // a mutation that did not reach the clause it was named for, which is
    // the defect this repository found in schema-canaries a week ago.
    from: "    browserGets:",
    to: "    browserGot:",
    expect: "kind matches the bundle",
  },
  {
    // THE BLANK PAGE. NEXT_PUBLIC_BUILD_ID is not required — it has a
    // fallback today. Take the fallback away and an unset build inlines
    // undefined straight into the render.
    name: "an optional public variable is dereferenced without a fallback",
    file: PWA,
    from: "process.env.NEXT_PUBLIC_BUILD_ID ??",
    to: "process.env.NEXT_PUBLIC_BUILD_ID.trim() ??",
    expect: "unguarded public variable is one the registry requires",
  },
  {
    // THE POPULATION. Without the graph only the 228 entry files are in
    // scope, and every finding in this file lives in src/lib.
    name: "the import graph stops being followed, so only the entries are in scope",
    file: GATE,
    from: "    for (const next of importsOf(f)) if (!bundle.has(next) && !isServerOnly(next)) queue.push([next, entry]);",
    to: "",
    expect: "bundle is larger than the set of entries",
  },
  {
    // THE BOUNDARY. Drop it and every server module is 'in the client
    // bundle' — the check would go red on 150 correct files, which is a
    // gate nobody believes rather than one that found something.
    name: "the server-only boundary is ignored, so the whole tree is 'client'",
    file: GATE,
    from: "const isServerOnly = (f) => /import\\s+[\"']server-only[\"']/.test(SOURCE.get(f));",
    to: "const isServerOnly = () => false;",
    expect: "server-only modules are kept out of it",
  },
  {
    // THE DETECTOR. A gate that reads comments would report
    // website-builder-workspace.tsx as CALLING resolvePricingConfig,
    // when its comment explains why it does not — the exact inversion.
    name: "the comment stripper stops running, so prose about a call counts as the call",
    file: GATE,
    from: 'const strip = (t) => t.replace(/\\/\\*[\\s\\S]*?\\*\\//g, "").replace(/^\\s*\\/\\/.*$/gm, "");',
    to: "const strip = (t) => t;",
    expect: "directive named in prose is not the directive",
  },
  {
    // THE REGISTRY. An empty ENV_REQUIREMENTS makes every variable look
    // unrequired, so section 3 would fire on correct code — and its floor
    // is what says so instead.
    name: "the environment registry comes back empty",
    file: GATE,
    from: "const LEVEL = new Map((registry.ENV_REQUIREMENTS ?? []).map((r) => [r.name, r.level]));",
    to: "const LEVEL = new Map();",
    expect: "environment registry loaded",
  },
  {
    // THE INLINE RULE. Treat every name as public and the whole first
    // half of the file excuses everything.
    name: "every variable is treated as inlined",
    file: GATE,
    from: 'const INLINED = (name) => name.startsWith("NEXT_PUBLIC_") || name === "NODE_ENV";',
    to: "const INLINED = () => true;",
    expect: "not inlined in a browser",
  },
  {
    // AND THE SAME RULE THE OTHER WAY: a prefix test turned into a
    // substring one would excuse MY_NEXT_PUBLIC_THING, which is not
    // public at all.
    name: "the public prefix becomes a substring test",
    file: GATE,
    from: 'const INLINED = (name) => name.startsWith("NEXT_PUBLIC_") || name === "NODE_ENV";',
    to: 'const INLINED = (name) => name.includes("NEXT_PUBLIC_") || name === "NODE_ENV";',
    expect: "a name merely containing it is not",
  },
  {
    // THE GUARD DETECTOR. If `??` stops counting as a fallback the gate
    // fires on correct code; if everything counts, it never fires.
    name: "every read is treated as guarded",
    file: GATE,
    from: "const UNGUARDED = (src, name) => {",
    to: "const UNGUARDED = () => false;\nconst __unused = (src, name) => {",
    expect: "control: a bare dereference is unguarded",
  },
  {
    // THE ONE THAT WOULD MATTER MOST IN PRODUCTION, put back: the
    // Supabase browser client losing the non-null assertion is not the
    // defect — the defect is the variable being optional. Here the
    // registry entry is downgraded instead, which is the edit somebody
    // would actually make while tidying.
    name: "a required public variable is downgraded in the registry",
    file: "src/lib/env-check.ts",
    from: '{ name: "NEXT_PUBLIC_SUPABASE_URL", level: "required"',
    to: '{ name: "NEXT_PUBLIC_SUPABASE_URL", level: "recommended"',
    expect: "unguarded public variable is one the registry requires",
  },
];

runMutations({
  name: "client-env-reach",
  gate: GATE,
  targets: [GATE, CLIENT, SUPABASE, PWA, SUBDOMAIN, "src/lib/env-check.ts"],
  mutants: MUTANTS,
});
