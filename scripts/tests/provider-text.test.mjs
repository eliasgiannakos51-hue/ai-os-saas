// NO ROUTE HANDS THE BROWSER A SENTENCE THE PROVIDER OR THE DATABASE
// WROTE.
//
// WHAT WAS REPORTED (ΑΣ-3.3): "Μηνύματα σφάλματος χωρίς εσωτερικές
// λεπτομέρειες — ανοιχτό — περίπου 12 routes περνούν το κείμενο του
// παρόχου ή της βάσης." The word that matters there is «περίπου». The
// number was never measured, so it could not be acted on and could not
// go stale in a way anybody would notice: a row that says "about 12"
// reads the same whether the answer is 3 or 30.
//
// MEASURED, 2026-10-15, BY THIS FILE: three. One a signed-out stranger
// could reach (api/auth/login returned Supabase's own English, which is
// also what a Greek reader saw), and two behind CRON_SECRET that
// returned Postgres's text for a failed read. All three are fixed; this
// gate is the population, so the fourth is caught on the day it is
// written rather than at the next audit.
//
// THE RULE, AND WHY IT CAN BE MECHANICAL. A value whose name is `err`,
// `e`, or anything ending in `Error` is a caught exception or a
// destructured Supabase error — nothing in this codebase names a result
// object that way. A value named for what it decided — `capCheck`,
// `ownership`, `started`, `validated`, `classification` — is the
// product's own, and its `.message` is a sentence somebody here wrote.
// So the detector is the NAME, and the fixtures below pin it both ways
// before the population is scanned with it.
//
// Run: node scripts/tests/provider-text.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail === undefined ? "" : "\n        " + detail}`); }
}

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** `<something>Error.message`, `err.message`, `e.message` — the shapes a
 *  provider's own words take on their way out. */
const PROVIDER_TEXT = /\b((?:[a-z]\w*)?[eE]rror|err|e)\b\.message/;

/** Every JSON body a route returns. */
function responseBodies(code) {
  return [...code.matchAll(/NextResponse\.json\(\s*(\{[\s\S]{0,600}?\})\s*(?:,\s*\{[^}]*\}\s*)?\)/g)].map((m) => m[1]);
}

console.log("== 1. the detector, pinned both ways ==");
check("yes to a Supabase error's own words", PROVIDER_TEXT.test('{ ok: false, error: signInError.message }'));
check("yes to a caught exception's", PROVIDER_TEXT.test('{ ok: false, error: err.message }'));
check("yes to a Postgres read failure's", PROVIDER_TEXT.test('{ ok: false, error: dueError.message }'));
check("no to a result object the product wrote", !PROVIDER_TEXT.test('{ ok: false, error: capCheck.message }'));
check("no to an ownership decision", !PROVIDER_TEXT.test('{ ok: false, error: ownership.message }'));
check("no to a validator's own issue text", !PROVIDER_TEXT.test('{ ok: false, error: validated.issues[0]?.message }'));
check("no to a plain sentence", !PROVIDER_TEXT.test('{ ok: false, error: "Could not load the runs that are due." }'));
// And the extractor: a scan that stopped matching would report an empty
// offender list and a green line, which is the shape
// scan-unjudged-numbers.mjs exists for.
check("the extractor finds a body", responseBodies('return NextResponse.json({ ok: true }, { status: 200 });').length === 1);

console.log("\n== 2. the population: every route in the tree ==");
const ROUTES = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) walk(p);
    else if (name === "route.ts") ROUTES.push(p);
  }
})("src/app");
check(`routes found (${ROUTES.length})`, ROUTES.length >= 100, "a walk that found nothing would make the check below pass on nothing");

// THE EXCEPTIONS, EACH WITH ITS REASON, AND CHECKED BOTH WAYS so one
// that stops being needed cannot sit here forever.
const ALLOWED = new Map([
  [
    "src/app/api/import/csv/analyse/route.ts",
    "narrowed by `err instanceof CsvError` — CsvError is declared in lib/import/csv-parse.ts and every throw of it carries a sentence written here (\"that file is empty\", \"that file has no rows\")",
  ],
  [
    "src/app/api/import/csv/apply/route.ts",
    "the same narrowing, for the same class, in the route that applies what the other one analysed",
  ],
]);

const offenders = ROUTES.filter((f) => responseBodies(stripComments(readFileSync(f, "utf8"))).some((b) => PROVIDER_TEXT.test(b)));
const unexpected = offenders.filter((f) => !ALLOWED.has(f));
check("no route returns the provider's or the database's own words", unexpected.length === 0,
  unexpected.join("\n        ") + "\n        Say it in the product's own sentence, and give logApiError the original.");

for (const [file, why] of ALLOWED) {
  check(`the exception for ${file.replace("src/app/api/", "")} is still needed`, offenders.includes(file),
    `it no longer matches, so delete the entry — the reason on record was: ${why}`);
  check("...and it narrows on a class this repository declares",
    /instanceof CsvError/.test(readFileSync(file, "utf8")));
}

console.log("\n== 3. the one a signed-out stranger could reach ==");
const login = readFileSync("src/app/api/auth/login/route.ts", "utf8");
check("a failed sign-in answers with a code, not a sentence",
  /code: "sign_in_failed"/.test(login) && !/error: signInError\.message/.test(stripComments(login)));
check("...and the page says it in the reader's language",
  /auth\.login|t\("failed"\)/.test(readFileSync("src/app/login/login-form.tsx", "utf8")),
  "the fallback was already translated; dropping the English is what makes it reachable");
check("...while an unusual provider failure is still recorded",
  /logApiError\("\/api\/auth\/login", signInError/.test(login),
  "a wrong password is not an incident; an auth outage is, and the response no longer carries it");

console.log(
  failures.length === 0
    ? `\nALL PASS: ${pass} passed, 0 failed`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ` + failures.join("\n  - ")
);
process.exit(failures.length === 0 ? 0 : 1);
