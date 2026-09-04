#!/usr/bin/env node
/*
 * CAN marketing-messages.test.mjs SEE A PUBLIC PAGE ASKING FOR A KEY IT
 * WILL NOT BE SENT?
 *
 * This gate exists BEFORE the change it guards, on purpose: trimming the
 * client message payload is a one-sided risk. A namespace missing from
 * the list cannot break a server-rendered string — getTranslations()
 * never touches the client provider — it can only break a CLIENT
 * component, at runtime, on a public page, in front of a stranger with no
 * account and no reason to come back.
 *
 * So the mutations are the ways that could happen and go unnoticed: a
 * component asking for a namespace nobody declared, a component whose key
 * is computed at runtime (which no static list can bound), the import
 * walk finding nothing, the client-component test finding nothing, the
 * picker handing back everything, and the path matcher treating
 * /dashboards-public as /dashboard.
 *
 * Run: node scripts/tests/message-slices.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/message-slices.test.mjs";
const LIB = "src/lib/i18n/message-slices.ts";
const GRAPH = "scripts/lib/route-graph.mjs";
const BANNER = "src/components/cookie-consent-banner.tsx";
const MIDDLEWARE = "src/middleware.ts";
const LAYOUT = "src/app/layout.tsx";
const TARGETS = [GATE, LIB, GRAPH, BANNER, MIDDLEWARE, LAYOUT];

const MUTANTS = [
  // ---- THE OUTAGE, PUT BACK -----------------------------------------
  {
    // Trimming in the root layout broke every dashboard page: a shared
    // layout is not re-rendered across client-side navigations, so the
    // slice chosen for /login was still in force on /dashboard/overview
    // and 121 of 188 client components rendered raw key names.
    name: "the root layout trims the catalogue again",
    file: LAYOUT,
    from: "  const clientMessages = messages;",
    to: "  const clientMessages = pickNamespaces(messages);",
    expect: "the provider is given the whole catalogue",
  },
  {
    name: "the layout goes back to reading a path it cannot trust",
    file: LAYOUT,
    from: "  const clientMessages = messages;",
    to: '  const pathname = headers().get("x-pathname");\n  const clientMessages = messages;',
    expect: "the root layout does not read a path it cannot trust",
  },
  {
    name: "the middleware starts setting x-pathname again",
    file: MIDDLEWARE,
    from: "  const requestHeaders = request.headers;",
    to: '  const requestHeaders = new Headers(request.headers);\n  requestHeaders.set("x-pathname", request.nextUrl.pathname);',
    expect: "the middleware sets no x-pathname header",
  },
  {
    name: "the explanation is deleted, inviting the next person to redo it",
    file: LAYOUT,
    from: "shared layout is rendered once and REUSED",
    to: "shared layout is rendered once and reused",
    expect: "the layout records why it cannot be trimmed here",
  },

  // ---- THE QUESTION THE OLD GATE NEVER ASKED ------------------------
  {
    // A namespace removed from the DASHBOARD's list. The old gate had no
    // dashboard in it at all, so this mutation had nothing to fail.
    name: "a namespace is dropped from the dashboard's list",
    file: LIB,
    from: '      "security", "settings", "sidebar", "voice",',
    to: '      "security", "settings", "voice",',
    expect: "dashboard: every namespace used is declared",
  },
  {
    name: "a namespace nobody uses is added to the dashboard's list",
    file: LIB,
    from: '      "security", "settings", "sidebar", "voice",\n    ],',
    to: '      "security", "settings", "sidebar", "voice", "roadmap",\n    ],',
    expect: "dashboard: every declared namespace is used",
  },
  {
    // The count that decides whether a group may EVER be trimmed.
    name: "the dashboard under-reports its unbounded components",
    file: LIB,
    // 61 -> 62 when the first screen merged in and
    // overview/first-screen-examples.tsx became the sixty-second.
    from: "    unbounded: 62,",
    // NOT `unbounded: 0,`. That was the old `to`, and it is ALSO the
    // marketing group's real value three entries down — so once `from`
    // went stale, check-mutation-tree saw the `to` present, the `from`
    // absent, and reported this mutation as APPLIED in a clean tree.
    // A `to` that can occur legitimately elsewhere in the same file
    // cannot distinguish "mutated" from "normal".
    to: "    unbounded: 1,",
    expect: "dashboard: 62 unbounded component(s)",
  },
  {
    // With no prefix the dashboard stops claiming its own routes, they
    // fall to the catch-all group, and the namespace lists stop matching
    // what each group really reaches.
    name: "a route group stops claiming its prefix",
    file: LIB,
    from: '    prefixes: ["/dashboard"],',
    to: "    prefixes: [],",
    expect: "dashboard: every namespace used is declared",
  },

  // ---- THE FAIL-SAFE ------------------------------------------------
  {
    // An unrecognisable path must land on a group that gets everything.
    name: "an unrecognisable path falls to a trimmable group",
    file: LIB,
    from: "    return ROUTE_GROUPS.find((g) => g.unbounded > 0) ?? ROUTE_GROUPS[0];",
    to: "    return ROUTE_GROUPS.find((g) => g.unbounded === 0) ?? ROUTE_GROUPS[0];",
    expect: "something that is not a path gets an untrimmable group",
  },
  {
    name: "canTrim stops caring about unbounded components",
    file: LIB,
    from: "  return group.unbounded === 0 && group.namespaces.length > 0;",
    to: "  return group.namespaces.length > 0;",
    expect: "the dashboard is not trimmable",
  },
  {
    name: "the path matcher goes back to a raw prefix",
    file: LIB,
    from: "    g.prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`)),",
    to: "    g.prefixes.some((p) => pathname.startsWith(p)),",
    expect: "a lookalike path is not the dashboard",
  },

  // ---- THE INSTRUMENTS ----------------------------------------------
  {
    name: "the import walk follows nothing",
    file: GRAPH,
    from: '      ...[...source.matchAll(/from\\s+["\']([^"\']+)["\']/g)].map((m) => m[1]),',
    to: "      ...[],",
    expect: "the dashboard walk is real",
  },
  {
    name: "no file is recognised as a client component",
    file: GRAPH,
    from: '  /^\\s*["\']use client["\']/m.test(readFileSync(file, "utf8"));',
    to: '  /^\\s*["\']use serverXX["\']/m.test(readFileSync(file, "utf8"));',
    expect: "the dashboard walk is real",
  },
  {
    name: "the entry scan finds no routes",
    file: GRAPH,
    from: "      else if (/^(page|layout|template|error|not-found|loading)\\.tsx$/.test(entry.name)) out.push(full);",
    to: "      else if (false) out.push(full);",
    expect: "the entry scan found routes",
  },
  {
    name: "the picker hands back the whole catalogue",
    file: LIB,
    from: "    if (name in messages) picked[name] = messages[name];",
    to: "    if (name in messages) Object.assign(picked, messages);",
    expect: "it picks only what is named",
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

console.log("marketing-messages mutations\n");
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({
        ...m,
        why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.",
);
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
