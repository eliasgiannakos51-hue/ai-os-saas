#!/usr/bin/env node
/*
 * CAN offline-state.test.mjs SEE THE OFFLINE PAGE GO BACK TO ENGLISH?
 *
 * It could not, and worse: it REQUIRED that. Two of its checks asserted
 * that app/offline/page.tsx still said "You&apos;re offline" and still
 * carried a comment excusing it — "the locale it would need comes from the
 * request that just failed". The excuse was false (the page is fetched
 * once, over the network, by the service worker's install handler), and
 * because the gate pinned it, fixing the page turned the gate red. A check
 * that has to be deleted before a bug can be fixed is not protecting
 * anything.
 *
 * The three things that now have to hold for a Greek reader to meet a
 * Greek page with no connection are each mutated below:
 *
 *   1. the page resolves its words through next-intl;
 *   2. the worker can still FIND the cached copy once the response varies;
 *   3. a language change re-fetches it, because the install-time copy is
 *      otherwise frozen for the life of the worker.
 *
 * Run: node scripts/tests/offline-locale.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/offline-state.test.mjs";
const PAGE = "src/app/offline/page.tsx";
const SW = "public/sw.js";
const PREF = "src/lib/locale-preference.ts";

const MUTANTS = [
  {
    // 1. THE PAGE GOES BACK TO ENGLISH — the defect the old gate required.
    name: "the last-resort page hardcodes its heading again",
    file: PAGE,
    from: '<h1 className="text-2xl font-semibold">{t("offline.title")}</h1>',
    to: '<h1 className="text-2xl font-semibold">You&apos;re offline</h1>',
    expect: "carries no English sentence of its own",
  },
  {
    // 2. IT STOPS ASKING FOR TRANSLATIONS AT ALL. The shape a "make it
    // static again" change would take.
    name: "the page stops resolving anything through next-intl",
    file: PAGE,
    from: '  const t = await getTranslations("common");\n  return (\n    <main',
    to: '  const t = (k) => k;\n  return (\n    <main',
    expect: "resolves its words through next-intl",
  },
  {
    // 3. THE SENTENCE IS DROPPED FROM ONE LANGUAGE. Nine translated and
    // one silently missing is the shape that reaches production, because
    // nobody reads all ten.
    name: "the Greek body sentence disappears",
    file: "messages/el.json",
    fromJson: ["common", "offline", "lastResortBody"],
    expect: "its three keys exist in all ten languages",
  },
  {
    // 4. VARY MATCHING COMES BACK. A response that declares Vary and a
    // synthetic Request that carries none: no offline page at all, silent,
    // and only for people whose page varies.
    name: "the worker matches the offline shell with Vary honoured",
    file: SW,
    from: "caches.match(OFFLINE_URL, { ignoreVary: true })",
    to: "caches.match(OFFLINE_URL)",
    expect: "finds the offline shell even when the response varies",
  },
  {
    // 5. THE WORKER STOPS RE-FETCHING. Install once, and the language at
    // install time is the language forever.
    name: "the worker forgets how to refresh the offline shell",
    file: SW,
    from: '  if (event.data?.type !== "refresh-offline") return;',
    to: "  return;",
    expect: "re-fetches it when somebody changes language",
  },
  {
    // 6. NOBODY ASKS IT TO. The worker keeps the handler and the switch
    // stops using it — the half of a wiring that a check reading only one
    // side would miss.
    name: "changing language stops telling the worker",
    file: PREF,
    from: "  refreshOfflineShell();\n}",
    to: "}",
    expect: "asked for on every language change",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

/** The mutated text for one mutant, or null when its target is gone. */
function mutate(original, m) {
  if (m.fromJson) {
    const doc = JSON.parse(original);
    let node = doc;
    for (const k of m.fromJson.slice(0, -1)) {
      node = node?.[k];
      if (!node) return null;
    }
    const leaf = m.fromJson[m.fromJson.length - 1];
    if (!(leaf in node)) return null;
    delete node[leaf];
    return JSON.stringify(doc, null, 2) + "\n";
  }
  if (!original.includes(m.from)) return null;
  return original.replace(m.from, m.to);
}

console.log("offline-locale mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
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
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const mutated = mutate(originals.get(m.file), m);
    if (mutated === null) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, mutated);
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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
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
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every step between a language choice and an offline page is load-bearing.");
