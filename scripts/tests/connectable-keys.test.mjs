// THE LIST OF SERVICES THIS APP CAN BE CONNECTED TO CANNOT GO STALE.
//
// scripts/connectable-keys.mjs answers "what can I plug in, what does it
// turn on, what goes silent without it, is there a free tier, where do I
// get one". Half of that is derived from src/lib/env-check.ts and half
// is typed into the script — the provider name, the category, the URL,
// the free tier, none of which exist anywhere in the codebase and none
// of which can.
//
// A typed half is a half that rots, and this repository has the number:
// env-documented.test.mjs exists because a hand-kept list of environment
// variables "had drifted by fifty-nine". So the script checks itself
// BOTH WAYS and exits non-zero on either failure — an entry naming a
// variable the app no longer reads, and a credential the app reads that
// nobody has written a sign-up URL for. This runs it, in the build, so
// the drift is a red line rather than something found the next time
// somebody opens the file.
//
// Run: node scripts/tests/connectable-keys.test.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
};

let out = "";
let code = 0;
try {
  out = execFileSync(process.execPath, ["scripts/connectable-keys.mjs"], { encoding: "utf8", stdio: "pipe" });
} catch (e) {
  out = String(e.stdout ?? "") + String(e.stderr ?? "");
  code = e.status ?? 1;
}
check(
  "the inventory agrees with src/lib/env-check.ts in both directions",
  code === 0,
  out.split("\n").filter((l) => /^(STALE|UNLISTED):/.test(l)).join("\n        ") ||
    "the script exited non-zero — run `node scripts/connectable-keys.mjs`"
);

// AND IT IS NOT MEASURING NOTHING. An empty PROVIDERS table satisfies
// both directions of the check above trivially: nothing is stale and
// nothing is unlisted, because nothing is there. The floor is the
// answer to that, and it is the shape this repo has been bitten by
// often enough to have a scanner for it.
const count = Number(out.match(/\n\s*(\d+) connectable credentials/)?.[1] ?? 0);
check(`the inventory lists credentials at all (${count})`, count >= 15, `${count} — an empty table passes every both-ways check ever written`);

// EVERY ROW LEADS SOMEWHERE. A sign-up URL is the one thing in this
// table a reader will actually use, and "—" in that column is a row
// that tells them a key exists and not how to get it.
const script = readFileSync("scripts/connectable-keys.mjs", "utf8");
const table = script.slice(script.indexOf("const PROVIDERS = {"), script.indexOf("// --- what the app itself says"));
const urls = [...table.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
const providerEntries = [...table.matchAll(/\n  [A-Z][A-Z0-9_]*:\s*\{/g)].length;
check(
  `every entry carries a url (${urls.length} of ${providerEntries})`,
  providerEntries > 0 && urls.length === providerEntries,
  `${providerEntries - urls.length} entries have none`
);
// A FLOOR ON THE COLLECTION, not only on the predicate. `[].every(...)`
// is true, so without the length test this clause passes hardest at the
// moment the table is emptied — the vacuity scripts/tests/gate-vacuity
// scans the whole suite for.
check(
  `...and each is a URL or a command that produces the secret (${urls.length})`,
  urls.length >= 15 && urls.every((u) => /^https:\/\//.test(u) || /^openssl /.test(u)),
  urls.filter((u) => !/^https:\/\//.test(u) && !/^openssl /.test(u)).join(", ") ||
    `${urls.length} urls — too few to be the real table`
);

// NO PRICES. The script's header commits to this and the rule behind it
// is CLAUDE.md's: a number in a document is dated at the point of use or
// produced by the thing that prints it, and a per-token rate typed into
// a table is neither. The URL is what answers "how much", correctly,
// forever.
check(
  "no per-unit price is typed into the table",
  !/[€$]\s?\d|\d+\s?(cents?|per (1M|1k|million|thousand) tokens)/i.test(table),
  "a price here is out of date the week after it is typed — link the pricing page instead"
);

// THE DATE IS THERE, because the provider half cannot be derived and a
// reader has to know how old it is.
check("the provider facts carry the date they were checked", /const CHECKED = "20\d\d-\d\d-\d\d";/.test(script));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
