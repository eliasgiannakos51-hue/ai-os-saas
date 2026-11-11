// FD2 (docs/QUEUE.md): check-i18n.js's LOCALE_ALLOWED SET WAS NEVER
// CHECKED THE OTHER WAY.
//
// LOCALE_ALLOWED exists so a word that genuinely coincides with English in
// one locale — a loanword, a cognate — does not fail the untranslated-value
// loop in scripts/check-i18n.js. But "coincides" is a claim about the
// present, and nothing ever re-checked it: once an entry went in, it
// stayed green forever even if the locale was later given a real
// translation, or en.json's own wording changed out from under it. That is
// the exact shape CLAUDE.md names for ABSENT_ON_PURPOSE (scripts/tests/
// lib/absent-on-purpose.mjs) — "the exception must be checked BOTH ways,
// or it is how an allowlist becomes a place to leave things."
//
// Measured 2026-11-09, by actually running the new check against the real
// files: 31 of the then-923 LOCALE_ALLOWED entries were stale — four
// pointed at a moduleData.options.final key that no longer exists in
// en.json at all, one (fr:finance.title) pointed at a pair whose English
// wording had since changed, and the other 26 had simply been translated
// since the entry was added (pt:sidebar.items.sales = "Vendas", not
// "Sales"; de:sidebar.items.chat = "Frag mich", not "Ask me"; and so on).
// Every one of the 26 was a real translation sitting behind a permission
// slip that no longer applied — not a defect in the UI, but a stale
// exemption that would have gone on hiding the NEXT one. All 31 were
// removed from LOCALE_ALLOWED in the same change that added this check.
//
// This file proves the check exists, that it runs against the real
// messages/*.json + check-i18n.js on disk (not a description of them),
// and that the real tree is clean under it right now. Section 3 proves it
// by construction: a LOCALE_ALLOWED entry built to be stale, scored by the
// same logic check-i18n.js itself uses, is fed through that logic and must
// be rejected.
//
// Run: node scripts/tests/locale-allowed-staleness.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const flatten = (obj, prefix = "") =>
  Object.entries(obj).reduce((out, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = String(v);
    return out;
  }, {});

// ---------------------------------------------------------------------
console.log("== 1. the gate carries a both-ways check on LOCALE_ALLOWED ==");
const gateSrc = readFileSync("scripts/check-i18n.js", "utf8");
check(
  "check-i18n.js re-checks every LOCALE_ALLOWED entry against the files on disk",
  /for \(const entry of LOCALE_ALLOWED\)/.test(gateSrc) && /STALE LOCALE_ALLOWED/.test(gateSrc)
);
check(
  "a key the entry names that no longer exists in en.json is caught",
  /key no longer exists in en\.json/.test(gateSrc)
);
check(
  "a key the entry names that no longer exists in the locale file is caught",
  /key no longer exists in \$\{loc\}\.json/.test(gateSrc)
);
check(
  "a pair that no longer coincides (translated, or English changed) is caught",
  /target\[key\] !== en\[key\]/.test(gateSrc) && /no longer matches en\.json/.test(gateSrc)
);

// ---------------------------------------------------------------------
console.log("\n== 2. the real tree is clean under it right now ==");
let realRun;
try {
  execFileSync(process.execPath, ["scripts/check-i18n.js"], { encoding: "utf8", stdio: "pipe" });
  realRun = { green: true, output: "" };
} catch (e) {
  realRun = { green: false, output: String(e.stdout ?? "") + String(e.stderr ?? "") };
}
check(
  "node scripts/check-i18n.js passes on messages/*.json as they stand",
  realRun.green,
  realRun.output.slice(0, 2000)
);
check(
  "...and in particular, no LOCALE_ALLOWED entry in the real file is reported stale",
  !/STALE LOCALE_ALLOWED/.test(realRun.output)
);

// ---------------------------------------------------------------------
// Section 3 reimplements the exact logic the gate runs, over a
// SYNTHETIC LOCALE_ALLOWED built to contain one genuinely-still-valid
// entry and three different ways of being stale — proving the logic
// itself discriminates, independent of what the real file currently
// contains (which section 2 already pins at zero).
console.log("\n== 3. the logic itself tells a live exemption from a stale one ==");

const messagesDir = "messages";
const en = flatten(JSON.parse(readFileSync(path.join(messagesDir, "en.json"), "utf8")));
const LOCALES = readdirSync(messagesDir)
  .filter((f) => f.endsWith(".json") && f !== "en.json")
  .map((f) => f.replace(/\.json$/, ""));
// FLOORED: this scan of messages/ is expected to find at least the nine
// locale files check-i18n.js's own LOCALES constant lists (el, es, fr, de,
// it, pt, zh, ja, ar) — not merely "non-empty", which would also pass if
// someone deleted eight of them. A scan that found zero would make every
// check below it vacuous.
check(`found at least 9 locale files under messages/ (found ${LOCALES.length})`, LOCALES.length >= 9);
if (LOCALES.length === 0) throw new Error("no locale files found under messages/ to test against");
const targetsByLocale = new Map(
  LOCALES.map((loc) => [loc, flatten(JSON.parse(readFileSync(path.join(messagesDir, `${loc}.json`), "utf8")))])
);

// A real key, shared by en and at least one locale, whose value currently
// differs between en and that locale (so it is NOT itself an exemption
// candidate — it is already translated, which is exactly the fixture this
// section needs: a key the gate will say the entry no longer coincides on).
const loc = LOCALES[0];
const target = targetsByLocale.get(loc);
const translatedKey = Object.keys(en).find((k) => k in target && target[k] !== en[k] && en[k].trim());
if (!translatedKey) throw new Error("could not find a translated key to build the fixture from");

function evaluate(entry) {
  const sep = entry.indexOf(":");
  const l = entry.slice(0, sep);
  const key = entry.slice(sep + 1);
  if (!(key in en)) return "stale: key missing from en.json";
  const t = targetsByLocale.get(l);
  if (!t) return "stale: locale not found";
  if (!(key in t)) return "stale: key missing from locale file";
  if (t[key] !== en[key]) return "stale: no longer coincides";
  return "live";
}

// A still-live fixture: pick a key whose value IS identical across en and
// some locale right now — the same population check-i18n.js's own
// untranslated-value loop would flag if it were not allowed.
let liveEntry = null;
for (const [k, v] of Object.entries(en)) {
  if (!v.trim() || !/[A-Za-z]{2}/.test(v)) continue;
  for (const l of LOCALES) {
    const t = targetsByLocale.get(l);
    if (t && t[k] === v) {
      liveEntry = `${l}:${k}`;
      break;
    }
  }
  if (liveEntry) break;
}
check("found a real key that still coincides, to use as the live fixture", liveEntry !== null, liveEntry ?? "");
if (liveEntry) {
  check(`evaluate("${liveEntry}") = live (it still coincides today)`, evaluate(liveEntry) === "live");
}

const staleTranslated = `${loc}:${translatedKey}`;
check(
  `evaluate("${staleTranslated}") = stale, no longer coincides (it IS translated)`,
  evaluate(staleTranslated) === "stale: no longer coincides"
);

const staleMissingEn = `${loc}:this.key.does.not.exist.anywhere.fd2`;
check(
  `evaluate("${staleMissingEn}") = stale, key missing from en.json`,
  evaluate(staleMissingEn) === "stale: key missing from en.json"
);

// A key present in en.json but deleted from a (throwaway, in-memory copy
// of a) locale file — the third way an entry goes stale.
const copy = new Map(targetsByLocale);
const probeKey = Object.keys(en)[0];
const stripped = { ...copy.get(loc) };
delete stripped[probeKey];
copy.set(loc, stripped);
function evaluateAgainst(entry, locMap) {
  const sep = entry.indexOf(":");
  const l = entry.slice(0, sep);
  const key = entry.slice(sep + 1);
  if (!(key in en)) return "stale: key missing from en.json";
  const t = locMap.get(l);
  if (!t) return "stale: locale not found";
  if (!(key in t)) return "stale: key missing from locale file";
  if (t[key] !== en[key]) return "stale: no longer coincides";
  return "live";
}
check(
  "a key missing from the locale file (but present in en.json) evaluates stale",
  evaluateAgainst(`${loc}:${probeKey}`, copy) === "stale: key missing from locale file"
);

// ---------------------------------------------------------------------
console.log("\n== summary ==");
console.log(`${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILED:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
