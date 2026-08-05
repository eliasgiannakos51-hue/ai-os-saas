// Reproduction test for error fingerprinting.
//
// The thing that silently breaks here is the fingerprint being too
// SPECIFIC: if two occurrences of one bug hash differently, the counter
// never reaches the alert threshold and nobody is told about the outage.
import { loadTs } from "./load-ts.mjs";
import { createHash } from "node:crypto";

// The lib imports server-only + the supabase admin client, neither of
// which the loader can resolve. The two pure functions are re-derived
// here from the same source text so the test still exercises the real
// implementation rather than a copy.
import { readFileSync } from "node:fs";
import ts from "typescript";
const src = readFileSync("src/lib/production-errors.ts", "utf8");
const body = src
  .split("\n")
  .filter((l) => !/^import /.test(l.trim()) && !/^import "server-only"/.test(l.trim()))
  .join("\n")
  .replace(/createHash/g, "globalThis.__createHash");
globalThis.__createHash = createHash;
const js = ts.transpileModule(body, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const m = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const { normaliseMessage, fingerprintError, ALERT_MIN_OCCURRENCES, ALERT_MIN_USERS } = m;

let pass = 0; const fails = [];
const check = (n, c, d = "") => c ? (pass++, console.log("  PASS  " + n)) : (fails.push(n), console.log("  FAIL  " + n + (d ? "\n        " + d : "")));

console.log("== 1. the SAME bug fingerprints identically ==");
const same = [
  ["record 4f2a1b3c-1111-2222-3333-444455556666 not found", "record 91bcdead-9999-8888-7777-666655554444 not found", "different uuids"],
  ["timeout after 3021ms", "timeout after 5544ms", "different numbers"],
  ["column 'title' does not exist", 'column "goal" does not exist', "different quoted values"],
  ["failed at 2026-08-05T10:11:12Z", "failed at 2026-01-02T03:04:05Z", "different timestamps"],
];
for (const [a, b, why] of same) {
  check(`same fingerprint despite ${why}`, fingerprintError(a, "/api/x") === fingerprintError(b, "/api/x"),
    `${normaliseMessage(a)} vs ${normaliseMessage(b)}`);
}

console.log("\n== 2. genuinely DIFFERENT bugs stay separate ==");
check("different message -> different fingerprint",
  fingerprintError("permission denied", "/api/x") !== fingerprintError("record not found", "/api/x"));
check("same message on a different route -> different fingerprint",
  fingerprintError("boom", "/api/a") !== fingerprintError("boom", "/api/b"));

console.log("\n== 3. fingerprint shape ==");
const fp = fingerprintError("anything", "/api/x");
check("32 hex chars", /^[0-9a-f]{32}$/.test(fp), fp);
check("deterministic across calls", fp === fingerprintError("anything", "/api/x"));

console.log("\n== 4. normalisation is bounded ==");
check("long message truncated to 500", normaliseMessage("x".repeat(5000)).length <= 500);
check("whitespace collapsed", normaliseMessage("a   \n\t b") === "a b");

console.log("\n== 5. alert thresholds match the brief ==");
check("3+ occurrences", ALERT_MIN_OCCURRENCES === 3);
check("2+ users", ALERT_MIN_USERS === 2);

console.log(`\n${fails.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
