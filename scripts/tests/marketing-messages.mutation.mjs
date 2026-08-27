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
 * Run: node scripts/tests/marketing-messages.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/marketing-messages.test.mjs";
const LIB = "src/lib/i18n/marketing-messages.ts";
const GRAPH = "scripts/lib/route-graph.mjs";
const BANNER = "src/components/cookie-consent-banner.tsx";
const MIDDLEWARE = "src/middleware.ts";
const LAYOUT = "src/app/layout.tsx";
const TARGETS = [GATE, LIB, GRAPH, BANNER, MIDDLEWARE, LAYOUT];

const MUTANTS = [
  {
    // THE BUG THIS IS ALL FOR: a public component asks for a namespace
    // that will not be in its payload.
    name: "a public component starts using an undeclared namespace",
    file: BANNER,
    from: 'const t = useTranslations("cookies.banner");',
    to: 'const t = useTranslations("dashboard.overview");',
    expect: "every namespace used is declared",
  },
  {
    name: "a declared namespace is dropped while still in use",
    file: LIB,
    from: '  "cookies",\n',
    to: "",
    expect: "every namespace used is declared",
  },
  {
    name: "a namespace nobody uses is left in the list",
    file: LIB,
    from: '  "pricing",\n]',
    to: '  "pricing",\n  "moduleData",\n]',
    expect: "every declared namespace is actually used",
  },
  {
    // No static list can bound a runtime key.
    name: "a public component asks for its namespace at runtime",
    file: BANNER,
    from: 'const t = useTranslations("cookies.banner");',
    to: "const t = useTranslations();",
    expect: "no public client component can reach an unlisted key",
  },
  {
    name: "a public component computes its key",
    file: BANNER,
    from: 'const t = useTranslations("cookies.banner");',
    to: 'const t = useTranslations("cookies.banner");\n  const which = "title";\n  void t(which);',
    expect: "no public client component can reach an unlisted key",
  },
  {
    // THE CLASSIFICATION ITSELF. /onboarding is behind a login and its
    // tree contains a component that calls useTranslations() with no
    // namespace. Call it public and the gate must notice.
    name: "an authenticated area is reclassified as public",
    file: LIB,
    from: 'export const APP_ROUTE_PREFIXES = ["/dashboard", "/onboarding"] as const;',
    to: 'export const APP_ROUTE_PREFIXES = ["/dashboard"] as const;',
    expect: "no public client component can reach an unlisted key",
  },

  // ---- the instruments ----------------------------------------------
  {
    name: "the import walk follows nothing",
    file: GRAPH,
    from: '      ...[...source.matchAll(/from\\s+["\']([^"\']+)["\']/g)].map((m) => m[1]),',
    to: "      ...[],",
    expect: "files reachable from them",
  },
  {
    name: "no file is recognised as a client component",
    file: GRAPH,
    from: '  /^\\s*["\']use client["\']/m.test(readFileSync(file, "utf8"));',
    to: '  /^\\s*["\']use serverXX["\']/m.test(readFileSync(file, "utf8"));',
    expect: "client components among them",
  },
  {
    name: "the entry scan finds no routes",
    file: GRAPH,
    from: "      else if (/^(page|layout|template|error|not-found|loading)\\.tsx$/.test(entry.name)) out.push(full);",
    to: "      else if (false) out.push(full);",
    expect: "public entry points",
  },
  {
    name: "the picker hands back the whole catalogue",
    file: LIB,
    from: "    if (name in messages) picked[name] = messages[name];",
    to: "    if (name in messages) Object.assign(picked, messages);",
    expect: "it picks only what is named",
  },
  // ---- the wiring ---------------------------------------------------
  {
    name: "the middleware stops telling the layout the path",
    file: MIDDLEWARE,
    from: 'requestHeaders.set("x-pathname", request.nextUrl.pathname);',
    to: 'requestHeaders.set("x-pathnameXX", request.nextUrl.pathname);',
    expect: "the middleware tells the layout which path is rendering",
  },
  {
    name: "one NextResponse.next is left on the original headers",
    file: MIDDLEWARE,
    from: "    const rebuilt = NextResponse.next({ request: { headers: requestHeaders } });",
    to: "    const rebuilt = NextResponse.next({ request: { headers: request.headers } });",
    expect: "every NextResponse.next carries the copy",
  },
  {
    // THE FAIL-SAFE. Without the pathname guard, a request the middleware
    // never touched would be trimmed on a guess.
    name: "a missing path is treated as marketing instead of unknown",
    file: LAYOUT,
    from: "    pathname && isMarketingPath(pathname) ? pickNamespaces(messages) : messages;",
    to: "    isMarketingPath(pathname ?? \"/\") ? pickNamespaces(messages) : messages;",
    expect: "...and sends everything when the path is unknown",
  },
  {
    name: "the provider goes back to the whole catalogue",
    file: LAYOUT,
    from: "<NextIntlClientProvider locale={locale} messages={clientMessages}>",
    to: "<NextIntlClientProvider locale={locale} messages={messages}>",
    expect: "the provider is given the trimmed object",
  },
  {
    name: "the path matcher goes back to a raw prefix",
    file: LIB,
    from: "    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),",
    to: "    (prefix) => pathname.startsWith(prefix),",
    expect: "a lookalike path is still marketing",
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
