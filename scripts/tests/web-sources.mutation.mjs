#!/usr/bin/env node
/*
 * WOULD A WRONG SOURCE NUMBER, OR A LEAKED QUOTE, STILL PASS?
 *
 * Run: node scripts/tests/web-sources.mutation.mjs
 *
 * Each edit is one that reads like tidying — "join the markers", "show
 * a snippet on the card", "the cap is arbitrary", "save what streamed" —
 * and each one either points a number at the wrong page, prints the
 * source's own words, or loses the sources on reload.
 * scripts/tests/web-sources.test.mjs must go red on the clause that names it.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/web-sources.test.mjs";
const LIB = "src/lib/chat/web-sources.ts";
const ROUTE = "src/app/api/chat/route.ts";
const CLIENT = "src/components/chat/chat-workspace.tsx";

const MUTANTS = [
  {
    name: "the markers are joined, so \"[1][2]\" renders as one link to the wrong page",
    file: LIB,
    from: 'numbers.map((n) => `[${n}]`).join(" ")',
    to: 'numbers.map((n) => `[${n}]`).join("")',
    expect: "never \"[1][2]\"",
  },
  {
    name: "the card's title is the quoted passage",
    file: LIB,
    from: "sources.push({ n, url, title: safeTitle(c.title, url) });",
    to: "sources.push({ n, url, title: safeTitle((c as { cited_text?: unknown }).cited_text, url) });",
    expect: "the quoted passage is never written anywhere",
  },
  {
    name: "the cap on sources is removed",
    file: LIB,
    from: "        if (sources.length >= MAX_WEB_SOURCES) continue;\n",
    to: "",
    expect: "no more than",
  },
  {
    name: "any URL scheme is accepted",
    file: LIB,
    from: '    if (url.protocol !== "http:" && url.protocol !== "https:") return null;\n',
    to: "",
    expect: "only http(s) pages are kept",
  },
  {
    name: "numbers are guessed into a stream that does not end with the final text",
    file: LIB,
    from: "plain && streamed.endsWith(plain) ? streamed.slice(0, streamed.length - plain.length) + marked : streamed",
    to: "plain ? marked : streamed",
    expect: "text an earlier round wrote is kept",
  },
  {
    name: "the route stores what streamed, so a reload loses the numbers",
    file: ROUTE,
    from: "          content: sourced.text,\n        });",
    to: "          content: assistantText,\n        });",
    expect: "STORES the numbered text",
  },
  {
    name: "the client keeps the streamed text and never shows the numbers live",
    file: CLIENT,
    from: "content: finalContent ?? accumulatedText,",
    to: "content: accumulatedText,",
    expect: "the client swaps the numbered text in",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 300_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("web-sources mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [file, text] of originals) writeFileSync(file, text); };

let caught = 0;
const missed = [];
try {
  const baseline = runGate();
  if (!baseline.green) {
    console.log("BASELINE IS ALREADY RED — fix the gate before measuring it.");
    console.log(baseline.failed.map((f) => `  ${f}`).join("\n"));
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
    try { result = runGate(); } finally { restoreAll(); }
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
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("A source number that points nowhere, or a quote that reaches the screen, goes red here first.");
