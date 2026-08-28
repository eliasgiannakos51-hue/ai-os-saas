// A PUBLIC PAGE MAY ONLY ASK FOR WHAT IT IS SENT.
//
// The root layout serialises the whole message catalogue into the HTML of
// every page — 2,659 keys, all ten languages' worth of one. Measured on
// the live home page: 209,715 characters, the catalogue starting at
// 57,710, so 72% of the document is text the page never uses. In Greek
// the same page is 303,706 characters against English's 210,565: a Greek
// visitor pays 93 KB extra before reading a word, and Greek is the
// primary market. Trimming to what public pages really use leaves 7%.
//
// THE RISK IS ENTIRELY ONE-SIDED, and it is why this gate exists before
// the change it guards. Server components call getTranslations(), which
// reads the request's own messages and never touches the client provider
// — a missing namespace cannot break a server-rendered string. It can
// only break a CLIENT component, at runtime, on a public page, in front
// of a stranger who has no account and no reason to come back.
//
// So the list is DERIVED, not declared: this walks the import graph from
// every public entry point, finds the client components, reads the
// namespace each one asks for, and fails if any is missing from
// MARKETING_NAMESPACES — or if a name in that list is used by none of
// them, which would ship bytes for nothing.
//
// AND IT REFUSES WHAT IT CANNOT BOUND. useTranslations() with no
// namespace, t() with a computed key, useMessages() — each can reach any
// key in the catalogue at runtime, and no static list can promise the
// slice is enough. Today there are none on a public route; the day one
// appears, this goes red rather than shipping a page that renders its own
// key names.
//
// Run: node scripts/tests/marketing-messages.test.mjs
import { readFileSync } from "node:fs";
import { appEntries, reachableFrom, isClientComponent } from "../lib/route-graph.mjs";

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
const { MARKETING_NAMESPACES, APP_ROUTE_PREFIXES, pickNamespaces, isMarketingPath } =
  await loadTs("src/lib/i18n/marketing-messages.ts");

const entries = appEntries();
const publicEntries = entries.filter(
  (f) => !APP_ROUTE_PREFIXES.some((p) => f.startsWith(`src/app${p}/`)),
);
const reachable = reachableFrom(publicEntries);
const clientFiles = [...reachable].filter(isClientComponent).sort();

console.log("== 1. the walk really walked ==");
// Three floors. A graph that finds no entry points, no files, or no
// client components would satisfy every check below it perfectly.
check(
  `public entry points (${publicEntries.length})`,
  publicEntries.length >= 15,
  publicEntries.join(", "),
);
check(`files reachable from them (${reachable.size})`, reachable.size >= 79);
check(`client components among them (${clientFiles.length})`, clientFiles.length >= 18);
// And the classification is not just a claim: every page under an
// authenticated prefix must really turn an anonymous visitor away.
const notGuarded = entries
  .filter((f) => APP_ROUTE_PREFIXES.some((p) => f.startsWith(`src/app${p}/`)))
  .filter((f) => f.endsWith("/page.tsx"))
  .filter((f) => {
    const src = readFileSync(f, "utf8");
    return !/redirect\("\/login"\)/.test(src) && !/notFound\(\)/.test(src);
  });
// The dashboard's own layout guards every page beneath it, so a page that
// does not repeat the redirect is not unguarded. What must never happen
// is a prefix with NO guard anywhere.
for (const prefix of APP_ROUTE_PREFIXES) {
  const layout = `src/app${prefix}/layout.tsx`;
  const page = `src/app${prefix}/page.tsx`;
  const guarded = [layout, page].some((f) => {
    try {
      return /redirect\("\/login"\)/.test(readFileSync(f, "utf8"));
    } catch {
      return false;
    }
  });
  check(`${prefix} really requires a session`, guarded);
}
void notGuarded;

console.log("\n== 2. every namespace a public page asks for is sent ==");
const declared = new Set(MARKETING_NAMESPACES);
const used = new Map();
const unbounded = [];
for (const file of clientFiles) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/useTranslations\(\s*["']([^"']+)["']\s*\)/g)) {
    const root = m[1].split(".")[0];
    if (!used.has(root)) used.set(root, new Set());
    used.get(root).add(file);
  }
  // The three shapes no static list can bound.
  if (/useTranslations\(\s*\)/.test(src)) unbounded.push(`${file}: useTranslations() with no namespace`);
  if (/useMessages\(/.test(src)) unbounded.push(`${file}: useMessages() reads the whole catalogue`);
  if (/\bt\(\s*`/.test(src)) unbounded.push(`${file}: t() with a template-literal key`);
  if (/\bt\(\s*[A-Za-z_$][\w$]*\s*[,)]/.test(src)) unbounded.push(`${file}: t() with a variable key`);
}
checkList(
  `no public client component can reach an unlisted key (${clientFiles.length} checked)`,
  unbounded,
);
checkList(
  `every namespace used is declared (${used.size} used, ${declared.size} declared)`,
  [...used.keys()]
    .filter((ns) => !declared.has(ns))
    .sort()
    .map((ns) => `${ns} — used by ${[...used.get(ns)].join(", ")}`),
);
// The reverse: a declared namespace nobody uses is bytes shipped for
// nothing, and a name that has drifted from the catalogue.
checkList(
  "every declared namespace is actually used",
  [...declared].filter((ns) => !used.has(ns)).sort(),
);

console.log("\n== 3. the slice exists in every language ==");
for (const locale of LOCALES) {
  const picked = pickNamespaces(messages[locale]);
  checkList(
    `${locale}: every declared namespace resolves`,
    [...declared].filter((ns) => !(ns in picked)),
  );
}
// pickNamespaces takes what it is given and nothing else.
const sample = { a: 1, b: 2, c: 3 };
check("it picks only what is named", JSON.stringify(pickNamespaces(sample, ["a", "c"])) === '{"a":1,"c":3}');
check("...skips a name the catalogue lacks rather than throwing", JSON.stringify(pickNamespaces(sample, ["a", "zz"])) === '{"a":1}');
check("...and returns nothing for an empty list", JSON.stringify(pickNamespaces(sample, [])) === "{}");

console.log("\n== 4. the split is worth making ==");
// If the saving ever stops being large, the risk stops being worth
// taking, and this says so with the measurement rather than a memory.
const full = JSON.stringify(messages.el).length;
const trimmed = JSON.stringify(pickNamespaces(messages.el)).length;
const savedPercent = Math.round((100 * (full - trimmed)) / full);
check(
  `Greek public pages drop ${savedPercent}% of the catalogue (${full} -> ${trimmed} chars)`,
  savedPercent >= 85,
  `${savedPercent}% — below this the change is not worth its risk`,
);

console.log("\n== 5. routing a path to a slice ==");
check("a marketing path is trimmed", isMarketingPath("/pricing") && isMarketingPath("/"));
check("an app path is not", !isMarketingPath("/dashboard") && !isMarketingPath("/dashboard/files"));
check("...including every declared prefix", APP_ROUTE_PREFIXES.every((p) => !isMarketingPath(p)));
// A PREFIX MATCH ON A SEGMENT BOUNDARY, not a raw string prefix: a future
// /dashboards-public page must not be mistaken for /dashboard.
check("a lookalike path is still marketing", isMarketingPath("/dashboards-public"));
check("anything that is not a path is not marketing", !isMarketingPath("dashboard"));

console.log("\n== 6. NOTHING IS TRIMMED, AND THAT IS THE POINT ==");
// THIS SECTION USED TO ASSERT THE OPPOSITE. It checked that the
// middleware set an x-pathname header and the root layout used it to
// send a public page five namespaces instead of forty. That shipped, and
// it broke every dashboard page: the sidebar rendered `sidebar.items.home`
// and `sidebar.groups.workspace` as raw key names.
//
// WHY THE GATE ABOVE DID NOT CATCH IT, stated plainly because it is the
// lesson. Sections 1-5 answer "what do public pages need". They never
// asked "what happens on the routes that are NOT public" — and the answer
// is that the root layout is SHARED. In the App Router it renders once
// and is reused across client-side navigations beneath it, so the slice
// chosen for /login was still in force after signing in and landing on
// /dashboard/overview. No list of namespaces could have fixed that; the
// pathname is simply not available to a component that does not re-run
// when the path changes.
//
// The same shape as the NaN credits bug earlier in this branch: a check
// that supplies its own inputs never sees what the real world supplies.
//
// So this now pins the REVERT. The analysis in sections 1-5 is kept —
// it is a true and useful account of what a public page needs — and this
// makes sure it stays analysis until a layout per route group exists to
// act on it safely.
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
check(
  "the middleware sets no x-pathname header",
  !/requestHeaders\.set\("x-pathname"/.test(middleware),
);
// AND THE REASON IS WRITTEN WHERE THE NEXT PERSON WILL LOOK. A revert
// with no explanation is an invitation to redo it.
check(
  "the layout records why it cannot be trimmed here",
  /shared layout is rendered once and REUSED/.test(layout),
);

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
