// "I said something to the AI, it put the post somewhere else, and I did
// not understand what it does there."
//
// V4.6 #11.3. There WAS a link after a creation. It said "Open it".
//
// That is the whole bug: one generic string shared by all six types, so
// the confirmation never named the place. Only a module entry mentioned
// its destination, and only on a separate line further down the page —
// which is why the one report that reached us was about a module entry
// and said "somewhere else" rather than "nowhere".
//
// The rule this file holds: every type Create Studio can produce must
// come back with somewhere to go AND the name of where that is. Six
// types, checked one by one, because five out of six is the version of
// this bug that gets reported next.
//
// THE NAME IS THE SIDEBAR'S OWN KEY, not a literal written here. The
// destination is a place in this app that already has a translated name
// in ten languages; a second name invented for confirmations is how
// "Goals & Plans" in the nav becomes "Mission Control" in a receipt.
//
// Run: node scripts/tests/create-destination.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
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

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const lookup = (obj, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);

const { CREATE_STUDIO_TYPES } = await loadTs("src/lib/create-studio/plan.ts");
const hookSrc = stripComments(readFileSync("src/lib/create-studio/use-create-studio.ts", "utf8"));

// ---------------------------------------------------------------------
console.log("== 1. the six types, and a scan that really found them ==");
check(
  `CREATE_STUDIO_TYPES lists ${CREATE_STUDIO_TYPES.length} types`,
  CREATE_STUDIO_TYPES.length === 6,
  CREATE_STUDIO_TYPES.join(", ")
);
// EVERY TYPE HAS A BRANCH. A type in the list with no case falls through
// to nothing, which is a creation that silently does not happen.
const missingCase = CREATE_STUDIO_TYPES.filter((t) => !hookSrc.includes(`case "${t}":`));
check("every type has a branch in the hook", missingCase.length === 0, missingCase.join(", "));

console.log("\n== 2. every result says where it went ==");
// setResult({...}) blocks, one per outcome. Each must carry both a place
// to go and the name of it.
const results = [...hookSrc.matchAll(/setResult\(\{([\s\S]*?)\}\);/g)].map((m) => m[1]);
check(`the scan found result blocks (${results.length})`, results.length >= 6, String(results.length));
const withoutDestination = results.filter((r) => !/destinationKey:/.test(r));
check(
  "every result carries a destinationKey",
  withoutDestination.length === 0,
  withoutDestination.map((r) => (r.match(/type: "(\w+)"/) ?? [])[1] ?? "?").join(", ")
);
const withoutHref = results.filter((r) => !/href:/.test(r));
check("...and an href", withoutHref.length === 0, String(withoutHref.length));
// THE KEY IS NOT THE VALUE. This checked only that `href:` appears, so
// `href: null` — a result with a destination the user cannot open — read
// as a pass. Its own mutation proved it: replacing a real href with
// `null` left the gate green.
//
// `href: data.href ?? null` stays legitimate: that is a value the server
// supplies and may genuinely not have. What is forbidden is the literal
// written into the result itself.
const nullHref = results.filter((r) => /href:\s*null\s*,/.test(r));
check(
  "...and no result hard-codes href: null, which is a destination nobody can open",
  nullHref.length === 0,
  nullHref.map((r) => (r.match(/type: "(\w+)"/) ?? [])[1] ?? "?").join(", ")
);
// AND EVERY TYPE IS REPRESENTED among them, so "all results have one" is
// not true of a set that happens to exclude a type.
const typesWithResult = new Set(
  results.map((r) => (r.match(/type: "(\w+)"/) ?? [])[1]).filter(Boolean)
);
const noResult = CREATE_STUDIO_TYPES.filter((t) => !typesWithResult.has(t));
check(
  `all ${CREATE_STUDIO_TYPES.length} types produce a result`,
  noResult.length === 0,
  `${noResult.join(", ")} — a type that never sets a result shows no confirmation at all`
);

console.log("\n== 3. the names are the sidebar's, and they resolve ==");
const keys = [...hookSrc.matchAll(/destinationKey: "([^"]+)"/g)].map((m) => m[1]);
check(`literal destination keys found (${keys.length})`, keys.length >= 5, keys.join(", "));
const notSidebar = keys.filter((k) => !k.startsWith("sidebar.items."));
check(
  "every one is a sidebar item key",
  notSidebar.length === 0,
  `${notSidebar.join(", ")} — a name invented here drifts from the nav`
);
for (const key of [...new Set(keys)]) {
  const missing = LOCALES.filter((l) => typeof lookup(messages[l], key) !== "string");
  check(`${key} resolves in all 10 locales`, missing.length === 0, missing.join(", "));
}
// The module-entry branch takes its key from the server rather than a
// literal, because which module it routed to is only known at run time.
check(
  "the module entry takes its destination from the routing result",
  /destinationKey: data\.moduleTitleKey/.test(hookSrc),
  "a hardcoded module name would be wrong for every module but one"
);

console.log("\n== 4. the chain that carries it actually exists ==");
// handler -> outcome type -> hook. A break anywhere leaves the module
// entry with no name, which is the one case the user reported.
const handlerSrc = stripComments(readFileSync("src/lib/jobs/handlers/create.ts", "utf8"));
check(
  "the create job returns the module's title key",
  /moduleTitleKey: moduleConfig\.titleKey/.test(handlerSrc),
  "the server never sends it, so the client has nothing to name"
);
const outcomeSrc = stripComments(readFileSync("src/lib/create-studio/create-via-job.ts", "utf8"));
check(
  "the outcome type declares it",
  /moduleTitleKey\?: string;/.test(outcomeSrc),
  "declared nowhere, so the read below is untyped and silently undefined"
);
check(
  "...and reads it off the job result",
  /moduleTitleKey: r\.moduleTitleKey/.test(outcomeSrc),
  "the server sends it and the client drops it on the floor"
);

console.log("\n== 5. the key is split, not handed whole to a translator ==");
// A full catalogue path needs a translator that can reach the whole
// catalogue -- and a component that can do that disqualifies the entire
// dashboard route group from message slicing. The path is split instead:
// namespace declared statically, remainder resolved inside it.
const { DESTINATION_NAMESPACE, destinationLabelKey } = await loadTs(
  "src/lib/create-studio/destination.ts"
);
check(
  "the namespace is the sidebar's",
  DESTINATION_NAMESPACE === "sidebar",
  String(DESTINATION_NAMESPACE)
);
check(
  "a sidebar path becomes a key inside that namespace",
  destinationLabelKey("sidebar.items.missionControl") === "items.missionControl",
  String(destinationLabelKey("sidebar.items.missionControl"))
);
// NULL RATHER THAN A RAW PATH. Anything outside the namespace cannot be
// named here, and saying so is what makes the caller fall back instead of
// printing "createStudio.result.website" at somebody.
check(
  "a key outside the namespace is refused",
  destinationLabelKey("dashboard.createStudio.openCreated") === null,
  String(destinationLabelKey("dashboard.createStudio.openCreated"))
);
check("no destination is refused", destinationLabelKey(null) === null);
check(
  "the bare namespace is refused",
  destinationLabelKey("sidebar.") === null,
  String(destinationLabelKey("sidebar."))
);
// A NAMESPACE THAT IS A PREFIX OF ANOTHER WORD IS NOT THIS NAMESPACE.
check(
  "a lookalike namespace is refused",
  destinationLabelKey("sidebarItems.websiteBuilder") === null,
  String(destinationLabelKey("sidebarItems.websiteBuilder"))
);
// AND EVERY KEY THE HOOK ACTUALLY SETS SURVIVES THE SPLIT AND RESOLVES
// UNDER THE DECLARED NAMESPACE -- the round trip, not the two halves.
for (const key of [...new Set(keys)]) {
  const leaf = destinationLabelKey(key);
  const missing = LOCALES.filter(
    (l) => typeof lookup(messages[l], `${DESTINATION_NAMESPACE}.${leaf}`) !== "string"
  );
  check(`${key} survives the split and resolves`, leaf !== null && missing.length === 0, `${leaf} / ${missing.join(", ")}`);
}

console.log("\n== 6. the confirmation names the place ==");
const uiSrc = stripComments(readFileSync("src/components/create/create-studio.tsx", "utf8"));
check(
  "the component declares the namespace instead of taking the root",
  /useTranslations\(DESTINATION_NAMESPACE\)/.test(uiSrc) && !/useTranslations\(\s*\)/.test(uiSrc),
  "an unbounded translator here stops the whole dashboard from being sliced"
);
check(
  "the link label uses the destination",
  /t\("madeItHere", \{\s*where: tDestination\(destinationLabelKey\(studio\.result\.destinationKey\)!\),?\s*\}\)/.test(
    uiSrc
  ),
  'the label is still the generic "Open it" for every type'
);
// THE CONDITION IS THE SPLIT KEY, NOT THE RAW ONE. Branching on the raw
// key sends an unnameable destination down the naming path.
check(
  "the choice is made on the split key",
  /\{destinationLabelKey\(studio\.result\.destinationKey\)\s*\n?\s*\?/.test(uiSrc),
  "branching on the raw key would name a destination it cannot name"
);
// THE HANDLE THE BROWSER GATE FINDS IT BY. Without it,
// create-destination.prodtest.mjs located the link as
// a[href="/dashboard/mission"] and matched the SIDEBAR's "Goals & Plans",
// passing two of that case's assertions on a nav item.
check(
  "the link carries the handle the browser gate reads",
  /data-testid="studio-destination-link"/.test(uiSrc),
  "the prodtest would fall back to matching by href, which the nav also has"
);
check(
  "and falls back rather than rendering nothing",
  /: t\("openCreated"\)/.test(uiSrc),
  "a result with no destination would render an empty button"
);
for (const locale of LOCALES) {
  const s = lookup(messages[locale], "dashboard.createStudio.madeItHere");
  check(`${locale}: madeItHere names a place`, typeof s === "string" && s.includes("{where}"), String(s));
}
// THE OLD STRING IS STILL THERE ON PURPOSE — it is the fallback — but it
// must not be what the six types get.
check(
  "openCreated is only the fallback",
  (uiSrc.match(/t\("openCreated"\)/g) ?? []).length === 1,
  "it is being used as the label somewhere else too"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
