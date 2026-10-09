#!/usr/bin/env node
/*
 * THE OWNER'S MANUAL NAMES ONLY WHAT EXISTS (MASTER «Γ. ΕΓΧΕΙΡΙΔΙΟ ΓΙΑ
 * ΜΕΝΑ»: «Έλεγχος που αποτυγχάνει αν μια οδηγία αναφέρει σελίδα, κουμπί ή
 * αρχείο που δεν υπάρχει πια»; package 40).
 *
 * docs/OWNER.md is read by someone who is not a programmer and who follows
 * it when something is already wrong. A step that names a page that moved
 * or a button that was renamed fails him at exactly that moment. So:
 *
 *   - every question MASTER Γ asks is a heading here, in its own words;
 *   - every link into the product opens a page or a route that exists;
 *   - every «label» is on screen: a value in messages/el.json, or a string
 *     in the code for the few owner screens that are English only;
 *   - every file, every `npm run`, every setting name is real;
 *   - what it says goes to the next provider by itself is what does.
 *
 * Run: node scripts/tests/owner-manual.test.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const OWNER = process.env.OWNER_MANUAL ?? "docs/OWNER.md";
const doc = readFileSync(OWNER, "utf8");
const flat = (s) => s.replace(/\s+/g, " ").trim();
console.log("owner-manual");

// ---------------------------------------------------------------------
console.log("\n== 1. every question MASTER asks has its section ==");
// ---------------------------------------------------------------------
const master = readFileSync("docs/MASTER.md", "utf8");
const brief = master.slice(master.indexOf("Γ. ΕΓΧΕΙΡΙΔΙΟ ΓΙΑ ΜΕΝΑ"), master.indexOf("Έλεγχος που αποτυγχάνει αν μια οδηγία"));
const asked = [...brief.matchAll(/^- ([\s\S]*?)(?=^- |$(?![\s\S]))/gm)].map((m) => flat(m[1]).replace(/\.$/, ""));
const headings = [...doc.matchAll(/^## (.+)$/gm)].map((m) => flat(m[1]));
check(`MASTER Γ asks ${asked.length} questions`, asked.length >= 13, asked.join(" | "));
check(`sections here (${headings.length})`, headings.length >= 13);
const missing = asked.filter((q) => !headings.includes(q));
check("...and each is a heading here, in its own words", missing.length === 0, missing.join(" | "));
const empty = headings.filter((h) => {
  const at = doc.indexOf(`## ${h}`);
  const next = doc.indexOf("\n## ", at + 3);
  return !/\n\s*(\d+\.|-) /.test(doc.slice(at, next === -1 ? undefined : next));
});
check("every section gives steps", empty.length === 0, empty.join(" | "));

// ---------------------------------------------------------------------
console.log("\n== 2. every link into the product opens something ==");
// ---------------------------------------------------------------------
function resolves(path) {
  // A path of the app: a page.tsx or route.ts under src/app, folder by
  // folder BY NAME, (group) folders transparent. Not through a [param]
  // folder: app/dashboard/[module] answers every name and 404s the unknown
  // ones at runtime, so a link the manual gets wrong would still "match".
  const segs = path.split("?")[0].split("/").filter(Boolean);
  function walk(dir, i) {
    if (i === segs.length) return ["page.tsx", "route.ts"].some((f) => existsSync(join(dir, f)));
    if (!existsSync(dir)) return false;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      if (/^\(.+\)$/.test(name) && walk(full, i)) return true;
      if (name === segs[i] && walk(full, i + 1)) return true;
    }
    return false;
  }
  return walk("src/app", 0);
}
const links = [...new Set([...doc.matchAll(/https:\/\/ai-os-saas-five\.vercel\.app(\/[^\s)»,]*)?/g)].map((m) => (m[1] ?? "/").replace(/[.;:]$/, "")))];
check(`links into the product (${links.length})`, links.length >= 7);
const dead = links.filter((l) => l !== "/" && !resolves(l));
check("...each opens a page or a route that exists", dead.length === 0, dead.join(" "));

// ---------------------------------------------------------------------
console.log("\n== 3. every «label» is on screen ==");
// ---------------------------------------------------------------------
const values = new Set();
(function collect(o) {
  if (typeof o === "string") values.add(flat(o));
  else if (o && typeof o === "object") Object.values(o).forEach(collect);
})(JSON.parse(readFileSync("messages/el.json", "utf8")));
function codeStrings() {
  const out = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) for (const m of readFileSync(full, "utf8").matchAll(/["'`>]([^"'`<>{}\n]{2,80})["'`<]/g)) out.add(flat(m[1]));
    }
  };
  walk("src/components");
  walk("src/app");
  return out;
}
const inCode = codeStrings();
const labels = [...new Set([...doc.matchAll(/«([^»]+)»/g)].map((m) => flat(m[1])).filter((l) => l.length > 0))];
check(`labels named (${labels.length})`, labels.length >= 10);
const unseen = labels.filter((l) => !values.has(l) && !inCode.has(l));
check("...each is a word on screen today", unseen.length === 0, unseen.join(" | "));

// ---------------------------------------------------------------------
console.log("\n== 4. every file, script and setting is real ==");
// ---------------------------------------------------------------------
const ticked = [...doc.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
const files = ticked.filter((t) => /^(docs|scripts|src|supabase|checks|\.github)\//.test(t) || /^[A-Z]+\.md$/.test(t)).map((t) => t.replace(/\/?…$/, ""));
const lost = files.filter((f) => !existsSync(f));
check(`files named (${files.length}) exist`, files.length >= 3 && lost.length === 0, lost.join(" "));
const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
const runs = [...doc.matchAll(/npm run ([a-z:-]+)/g)].map((m) => m[1]);
check(`npm scripts named (${runs.length}) exist`, runs.length >= 1 && runs.every((r) => r in scripts), runs.filter((r) => !(r in scripts)).join(" "));
const names = [...new Set(ticked.filter((t) => /^[A-Z][A-Z0-9_]{3,}$/.test(t)))];
const known = ["docs/api-keys.md", "src/lib/ai/providers/key-inventory.ts", "docs/NEEDS-FROM-ELIAS.md"].map((f) => readFileSync(f, "utf8")).join("\n");
const srcEnv = (() => {
  const out = new Set();
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const full = join(dir, n);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs)$/.test(n)) for (const m of readFileSync(full, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)) out.add(m[1]);
    }
  };
  walk("src");
  return out;
})();
const unknown = names.filter((n) => !srcEnv.has(n) && !known.includes(n));
check(`setting names (${names.length}) are ones the code or the key inventory knows`, names.length >= 15 && unknown.length === 0, unknown.join(" "));

// ---------------------------------------------------------------------
console.log("\n== 5. what the manual says goes to the next provider, does ==");
// ---------------------------------------------------------------------
// «Τι κάνω αν πέσει ένας πάροχος AI» said, until 2026-10-08, that the
// product tries the next provider by itself. Only the callers of
// runCompletion (src/lib/ai/providers/complete.ts) do, and Chat is not
// one: with the model answering an error, Chat says so and goes nowhere
// else (first-task-edges.prodtest.mjs, section 4). So the callers are
// read from the code, each has the name the manual gives it, and the
// section names exactly those.
const { stripComments } = await import("../check-mutation-markers.mjs");
const FAILOVER_NAMES = {
  "src/app/api/data-analysis/[id]/ask/route.ts": "η Ανάλυση δεδομένων",
  "src/app/api/data-analysis/[id]/analyse/route.ts": "η Ανάλυση δεδομένων",
  "src/app/api/coding/run/route.ts": "το Coding",
  "src/lib/agents/agent-runner.ts": "οι βοηθοί",
  "src/lib/meetings/meeting-analyse-call.ts": "η σύνοψη των συναντήσεων",
  "src/lib/websites-greek-spelling-check.ts": "ο έλεγχος ορθογραφίας του Site",
};
const callers = [];
(function walkSrc(dir) {
  for (const n of readdirSync(dir).sort()) {
    const full = join(dir, n);
    if (statSync(full).isDirectory()) walkSrc(full);
    else if (/\.tsx?$/.test(n) && full !== join("src", "lib", "ai", "providers", "complete.ts") && /\brunCompletion\(/.test(stripComments(readFileSync(full, "utf8")))) callers.push(full);
  }
})("src");
check(`the callers of runCompletion, read from the code (${callers.length})`, callers.length >= 1);
const unnamed = callers.filter((f) => !(f in FAILOVER_NAMES));
check("...each has the name the manual gives it", unnamed.length === 0, unnamed.join(" "));
const gone = Object.keys(FAILOVER_NAMES).filter((f) => !callers.includes(f));
check("...and every name here is still a caller", gone.length === 0, gone.join(" "));
const providerAt = doc.indexOf("## Τι κάνω αν πέσει ένας πάροχος AI");
const providerSection = flat(doc.slice(providerAt, doc.indexOf("\n## ", providerAt + 3)));
const unsaid = [...new Set(callers.map((f) => FAILOVER_NAMES[f]).filter(Boolean))].filter((n) => !providerSection.includes(n));
check("the manual names every one of them", providerAt > 0 && unsaid.length === 0, unsaid.join(" | "));
const chatFailsOver = /\brunCompletion\(/.test(stripComments(readFileSync("src/app/api/chat/route.ts", "utf8")));
const manualSaysChatStays = /Το Chat, .{0,200}?\*\*δεν\*\* πηγαίνει μόνο του σε άλλον πάροχο/.test(providerSection);
check("...and says what Chat does when its provider fails", chatFailsOver !== manualSaysChatStays, `Chat goes on: ${chatFailsOver}; the manual says it stays: ${manualSaysChatStays}`);

console.log(failures.length ? `\nFAILED: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
