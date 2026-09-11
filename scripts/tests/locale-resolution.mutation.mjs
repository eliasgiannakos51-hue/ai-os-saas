#!/usr/bin/env node
/*
 * WHICH LANGUAGE A STRANGER GETS, and the four ways it silently becomes
 * English.
 *
 * This runs on every server render, before anybody has chosen anything.
 * Every failure here looks the same from outside — the page is in English
 * — and English is what most of the people testing it expect to see, so
 * nobody reports it. A Greek browser landing on an English page is not a
 * crash; it is a product that quietly serves one of its ten languages.
 *
 * The resolver is twenty lines of parsing, and each of them is a place
 * where the answer degrades to the default without anything failing.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal, so a
 * mutation written that way is "caught" by the marker gate without any
 * behavioural check having looked at it.
 *
 * Run: node scripts/tests/locale-resolution.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/locale-resolution.test.mjs";
const REQUEST = "src/i18n/request.ts";
const TARGETS = [...new Set([REQUEST])];

const MUTANTS = [
  {
    // 1. q WEIGHTS STOP BEING HONOURED, so source order decides — and a
    // browser that lists English first with a low weight gets English.
    name: "the accepted languages stop being sorted by weight",
    file: REQUEST,
    from: ".sort((a, b) => b.quality - a.quality)",
    to: ".sort(() => 0)",
    expect: "all 16 Accept-Language cases resolve correctly",
  },
  {
    // 2. q=0 STOPS MEANING "NOT THIS ONE". A browser that explicitly
    // refuses a language is then served exactly that language.
    name: "an explicitly refused language is selectable again",
    file: REQUEST,
    from: ".filter((e) => e.tag && e.quality > 0)",
    to: ".filter((e) => e.tag)",
    expect: "all 16 Accept-Language cases resolve correctly",
  },
  {
    // 3. THE HEADER STOPS BEING CASE-INSENSITIVE. `EL-gr` is a legal
    // header and would resolve to nothing.
    name: "the language tag stops being lower-cased",
    file: REQUEST,
    from: "tag: tag.trim().toLowerCase()",
    to: "tag: tag.trim()",
    expect: "all 16 Accept-Language cases resolve correctly",
  },
  {
    // 4. THE RESULT STOPS BEING CHECKED AGAINST THE LOCALES THAT HAVE A
    // MESSAGES FILE, so an unknown code reaches the dynamic import and
    // the render throws — a blank page rather than a wrong language.
    name: "the chosen locale is no longer checked against the supported list",
    file: REQUEST,
    from: '(SUPPORTED_LOCALES as readonly string[]).includes(chosen ?? "")',
    to: "Boolean(chosen)",
    expect: "Accept-Language is only a fallback, not an override",
  },
  {
    // 5. THE COOKIE STOPS WINNING. An explicit choice in the switcher is
    // then undone by the browser's header on the very next request — the
    // shape where a setting appears not to save.
    name: "Accept-Language is read before the cookie",
    file: REQUEST,
    from: "cookieStore.get(LOCALE_COOKIE)?.value",
    to: "cookieStore.get(SOME_OTHER_COOKIE)?.value",
    expect: "the cookie is consulted before Accept-Language",
  },
  {
    // 6. AND AN AUTH ROUND TRIP APPEARS ON THE RENDER PATH — correct in
    // its answer and paid for on every page, by everybody, for ever.
    name: "an auth lookup is added to the render path",
    file: REQUEST,
    from: "export default getRequestConfig(async () => {",
    to: "export default getRequestConfig(async () => {\n  await createServerClient();",
    expect: "no auth lookup happens on the render path",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("locale-resolution mutations\n");

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
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    // An 'all' flag REPLACES EVERY OCCURRENCE. A defect that exists twice in one
    // file — the webhook returns early on a replay in two places — is not
    // re-introduced by changing the first, and the gate stays green for a
    // reason that is about the mutation rather than the code.
    const mutated = m.all
      ? originals.get(m.file).split(m.from).join(m.to)
      : originals.get(m.file).replace(m.from, m.to);
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
console.log("A resolver that quietly falls back to English turns this red.");
