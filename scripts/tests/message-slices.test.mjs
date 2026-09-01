// WHAT EACH AREA OF THE APP NEEDS FROM THE MESSAGE CATALOGUE — EVERY
// AREA, WHICH IS THE PART THAT WAS MISSING.
//
// THE OUTAGE THIS FILE IS THE ANSWER TO. An earlier version of this gate
// asked one question — "what do public pages need?" — and answered it
// correctly: 15 entry points, 79 files, 18 client components, 5
// namespaces, all derived rather than declared, 11 mutations, every one
// caught. On the strength of that the root layout began sending public
// pages five namespaces instead of forty, and every dashboard page broke:
// the sidebar rendered `sidebar.items.home`, `sidebar.groups.workspace`
// and eight more as raw key names, for every user.
//
// The gate had never rendered a dashboard route. Eleven mutations probed
// one question from eleven angles; none asked what the change did to the
// routes it was not designed for. The same shape as the NaN-credits bug
// earlier in the same branch: a check that supplies its own inputs never
// sees what the real world supplies.
//
// THE RULE, since it is general: AN OPTIMISATION THAT REMOVES SOMETHING
// MUST PROVE WHAT IT DOES NOT REMOVE, ON EVERY PATH — not only on the
// paths it was written for.
//
// So this walks EVERY entry point in src/app, groups them, and derives
// each group's namespaces from the real import graph. It also counts the
// components that can reach a key no list can predict, because one of
// those disqualifies a whole group from ever being trimmed — and the
// dashboard has twenty.
//
// Run: node scripts/tests/message-slices.test.mjs
import { readFileSync } from "node:fs";
import { appEntries, reachableFrom, isClientComponent } from "../lib/route-graph.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 10).join("\n        "));
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]),
);

const { loadTs } = await import("./load-ts.mjs");
const { ROUTE_GROUPS, groupForPath, canTrim, pickNamespaces, isMarketingPath, APP_ROUTE_PREFIXES } =
  await loadTs("src/lib/i18n/message-slices.ts");

const entries = appEntries();
const groupOf = (file) => {
  const claimed = ROUTE_GROUPS.find((g) =>
    g.prefixes.some((p) => file.startsWith(`src/app${p}/`)),
  );
  return claimed ?? ROUTE_GROUPS.find((g) => g.prefixes.length === 0);
};

const UNBOUNDED_SHAPES = [
  [/useTranslations\(\s*\)/, "useTranslations() with no namespace"],
  [/useMessages\(/, "useMessages() reads the whole catalogue"],
  [/\bt\(\s*`/, "t() with a template-literal key"],
  [/\bt\(\s*[A-Za-z_$][\w$]*\s*[,)]/, "t() with a variable key"],
];

const measured = new Map();
for (const group of ROUTE_GROUPS) {
  const seeds = entries.filter((f) => groupOf(f) === group);
  const reachable = reachableFrom(seeds);
  const clientFiles = [...reachable].filter(isClientComponent).sort();
  const namespaces = new Map();
  const unbounded = [];
  for (const file of clientFiles) {
    // COMMENTS ARE NOT CODE. A file whose comment EXPLAINS the unbounded
    // shapes — for instance one recording why its labels are resolved on
    // the server so it does not use a template-literal key — was counted
    // as having one, and a component that is bounded precisely because
    // somebody thought about it got listed among the ones that are not.
    // Prose about a rule is not a breach of it. Same stripComments the
    // GDPR, marker and help-tip gates use.
    const src = stripComments(readFileSync(file, "utf8"));
    for (const m of src.matchAll(/useTranslations\(\s*["\']([^"\']+)["\']\s*\)/g)) {
      const root = m[1].split(".")[0];
      if (!namespaces.has(root)) namespaces.set(root, new Set());
      namespaces.get(root).add(file);
    }
    for (const [shape, why] of UNBOUNDED_SHAPES) {
      if (shape.test(src)) unbounded.push(`${file}: ${why}`);
    }
  }
  measured.set(group.name, { seeds, reachable, clientFiles, namespaces, unbounded });
}

console.log("== 1. every entry point in the app is in exactly one group ==");
check(`the entry scan found routes (${entries.length})`, entries.length >= 56, entries.length);
checkList(
  "every entry belongs to a group",
  entries.filter((f) => !groupOf(f)),
);
const counted = [...measured.values()].reduce((n, m) => n + m.seeds.length, 0);
check(
  `every entry is counted exactly once (${counted} of ${entries.length})`,
  counted === entries.length,
);
for (const group of ROUTE_GROUPS) {
  const m = measured.get(group.name);
  check(
    `${group.name}: ${m.seeds.length} entries, ${m.reachable.size} files, ${m.clientFiles.length} client components`,
    m.seeds.length > 0 && m.clientFiles.length > 0,
  );
}
// THE DASHBOARD IS THE GROUP THAT BROKE, so its floors are pinned
// hardest: a walk that lost it would make every check below vacuous.
const dash = measured.get("dashboard");
check(
  `the dashboard walk is real (${dash.clientFiles.length} client components)`,
  dash.clientFiles.length >= 188,
  `${dash.clientFiles.length} — this is the group an earlier gate never looked at`,
);

console.log("\n== 2. each group's namespaces are recorded, and complete ==");
for (const group of ROUTE_GROUPS) {
  const m = measured.get(group.name);
  const declared = new Set(group.namespaces);
  checkList(
    `${group.name}: every namespace used is declared (${m.namespaces.size} used)`,
    [...m.namespaces.keys()]
      .filter((ns) => !declared.has(ns))
      .sort()
      .map((ns) => `${ns} — used by ${[...m.namespaces.get(ns)][0]}`),
  );
  checkList(
    `${group.name}: every declared namespace is used`,
    [...declared].filter((ns) => !m.namespaces.has(ns)).sort(),
  );
}

console.log("\n== 3. a group with an unbounded component can never be trimmed ==");
// One useTranslations() with no namespace can reach any key at runtime.
// The count is pinned per group, so a component added to the dashboard
// cannot quietly make it look trimmable.
for (const group of ROUTE_GROUPS) {
  const m = measured.get(group.name);
  check(
    `${group.name}: ${m.unbounded.length} unbounded component(s), recorded as ${group.unbounded}`,
    m.unbounded.length === group.unbounded,
    m.unbounded.slice(0, 5).join("\n        "),
  );
  check(
    `${group.name}: canTrim says ${canTrim(group)}`,
    canTrim(group) === (group.unbounded === 0),
  );
}
check(
  "the dashboard is not trimmable, and that is a fact about its code",
  !canTrim(ROUTE_GROUPS.find((g) => g.name === "dashboard")),
);
check(
  "marketing is the only trimmable group",
  ROUTE_GROUPS.filter(canTrim).map((g) => g.name).join(",") === "marketing",
);

console.log("\n== 4. routing a path to a group, fail-safe in every direction ==");
check("a dashboard path lands on the dashboard group", groupForPath("/dashboard/overview").name === "dashboard");
check("...and the bare prefix too", groupForPath("/dashboard").name === "dashboard");
check("an onboarding path lands on onboarding", groupForPath("/onboarding").name === "onboarding");
check("a public path lands on marketing", groupForPath("/pricing").name === "marketing");
// A LOOKALIKE IS NOT A MATCH: /dashboards-public must not be mistaken for
// /dashboard, and it must not be trimmed as if it were marketing either —
// it is marketing, which is correct, because no group claims it.
check("a lookalike path is not the dashboard", groupForPath("/dashboards-public").name === "marketing");
// AN UNRECOGNISABLE PATH GETS THE UNTRIMMABLE GROUP. This is the
// fail-safe: the only wrong answer that costs a user a working page is
// trimming something that needed more.
const unknown = groupForPath("not-a-path");
check("something that is not a path gets an untrimmable group", !canTrim(unknown), unknown.name);
check("...and an empty string too", !canTrim(groupForPath("")));

console.log("\n== 5. the slice exists in every language ==");
for (const locale of LOCALES) {
  for (const group of ROUTE_GROUPS) {
    const picked = pickNamespaces(messages[locale], group.namespaces);
    checkList(
      `${locale}/${group.name}: every declared namespace resolves`,
      group.namespaces.filter((ns) => !(ns in picked)),
    );
  }
}
const sample = { a: 1, b: 2, c: 3 };
check("it picks only what is named", JSON.stringify(pickNamespaces(sample, ["a", "c"])) === '{"a":1,"c":3}');
check("...skips a name the catalogue lacks rather than throwing", JSON.stringify(pickNamespaces(sample, ["a", "zz"])) === '{"a":1}');
check("...and returns nothing for an empty list", JSON.stringify(pickNamespaces(sample, [])) === "{}");
check("isMarketingPath still agrees with the groups", isMarketingPath("/pricing") && !isMarketingPath("/dashboard/files"));
void APP_ROUTE_PREFIXES;

console.log("\n== 6. NOTHING IS TRIMMED, AND THAT IS THE POINT ==");
// The root layout is SHARED: rendered once, reused across client-side
// navigations beneath it. A visitor lands on /login, gets the marketing
// slice, presses sign in — login-form.tsx does router.push(), a
// CLIENT-SIDE navigation — and arrives at /dashboard/overview with the
// five namespaces chosen for the login page. 121 of the dashboard's 188
// client components would render raw keys.
//
// So the pathname is not usable input at this level, whatever the list
// says. These pin the revert until there is a layout per route group.
const layout = readFileSync("src/app/layout.tsx", "utf8");
check(
  "the provider is given the whole catalogue",
  /const clientMessages = messages;/.test(layout) &&
    /<NextIntlClientProvider locale=\{locale\} messages=\{clientMessages\}>/.test(layout),
  "a shared root layout cannot vary its payload per child route",
);
check(
  "the root layout does not read a path it cannot trust",
  !/x-pathname/.test(layout) && !/isMarketingPath/.test(layout),
);
const middleware = readFileSync("src/middleware.ts", "utf8");
check("the middleware sets no x-pathname header", !/requestHeaders\.set\("x-pathname"/.test(middleware));
check(
  "the layout records why it cannot be trimmed here",
  /shared layout is rendered once and REUSED/.test(layout),
);
// And the sign-in path that made it a client-side navigation is still
// what it was, so the explanation above stays true.
check(
  "signing in is still a client-side navigation",
  /router\.push\("\/dashboard\/overview"\)/.test(readFileSync("src/app/login/login-form.tsx", "utf8")),
);

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
