// Does template-plurals.test.mjs actually catch anything?
//
// A gate that passes is not evidence. The reported bug — a Greek plural
// missing from a keyword array — is a ONE-WORD deletion in a data file,
// and a gate that reads that file and reports PASS looks identical whether
// it is checking the right thing or nothing at all. So each mutation below
// reintroduces a real defect and the gate must go red for it.
//
// Every mutation runs against a COPY of the tree, so nothing here can edit
// the repository.
//
// Run: node scripts/tests/template-plurals.mutation.mjs
import { readFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const LEX = "scripts/lib/template-plurals.mjs";
const GATE = "scripts/tests/template-plurals.test.mjs";
const FIX = "supabase/migrations/20260907000000_template_keyword_plurals.sql";
const SEED = "supabase/migrations/20260826000000_agent_templates.sql";

let caught = 0;
let missed = 0;

function runGateIn(dir) {
  try {
    execFileSync(process.execPath, [GATE], { cwd: dir, encoding: "utf8", stdio: "pipe" });
    return { red: false, out: "" };
  } catch (err) {
    return { red: true, out: String(err.stdout ?? "") + String(err.stderr ?? "") };
  }
}

function mutate(name, edits) {
  const dir = mkdtempSync(path.join(tmpdir(), "tplmut-"));
  try {
    mkdirSync(path.join(dir, "scripts", "lib"), { recursive: true });
    mkdirSync(path.join(dir, "scripts", "tests"), { recursive: true });
    mkdirSync(path.join(dir, "supabase", "migrations"), { recursive: true });
    for (const f of [LEX, GATE, FIX, SEED]) cpSync(path.join(ROOT, f), path.join(dir, f));

    for (const [file, from, to] of edits) {
      const p = path.join(dir, file);
      // A three-element edit whose `from` is null CREATES the file. That is
      // how the "a migration this gate has never seen" case is built — the
      // first version of this mutation edited a file already on the known
      // list, so the gate skipped it and the mutation reported a hole that
      // was not there.
      if (from === null) { writeFileSync(p, to); continue; }
      const before = readFileSync(p, "utf8");
      if (typeof from === "string" && !before.includes(from)) {
        console.log(`  ERROR ${name}: mutation target not found in ${file}`);
        missed++;
        return;
      }
      writeFileSync(p, before.replace(from, to));
    }

    const { red, out } = runGateIn(dir);
    if (red) {
      caught++;
      const line = out.split("\n").find((l) => l.includes("FAIL  ")) ?? "";
      console.log(`  CAUGHT  ${name}\n          -> ${line.trim()}`);
    } else {
      missed++;
      console.log(`  MISSED  ${name}  <- the gate stayed green`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * THE CONTROL. A mutation suite that only ever asserts "red" cannot tell a
 * gate that checks something from a gate that fails on everything. This
 * asserts the opposite for a change that is genuinely harmless.
 */
function mutateExpectingGreen(name, edits) {
  const dir = mkdtempSync(path.join(tmpdir(), "tplmut-"));
  try {
    mkdirSync(path.join(dir, "scripts", "lib"), { recursive: true });
    mkdirSync(path.join(dir, "scripts", "tests"), { recursive: true });
    mkdirSync(path.join(dir, "supabase", "migrations"), { recursive: true });
    for (const f of [LEX, GATE, FIX, SEED]) cpSync(path.join(ROOT, f), path.join(dir, f));
    for (const [file, from, to] of edits) {
      const p = path.join(dir, file);
      if (from === null) { writeFileSync(p, to); continue; }
      writeFileSync(p, readFileSync(p, "utf8").replace(from, to));
    }
    const { red, out } = runGateIn(dir);
    if (red) {
      missed++;
      const line = out.split("\n").find((l) => l.includes("FAIL  ")) ?? "";
      console.log(`  FALSE+  ${name}  <- gate went red on a harmless change\n          -> ${line.trim()}`);
    } else {
      caught++;
      console.log(`  GREEN   ${name}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("template-plurals mutations\n");

// 1. THE REPORTED BUG, put back: the Greek plural removed from one template.
mutate("Greek plural deleted from competitor-watch", [
  [LEX, '"ανταγωνιστης", "ανταγωνιστες",', '"ανταγωνιστης",'],
  [FIX, "'ανταγωνιστης', 'ανταγωνιστες',", "'ανταγωνιστης',"],
]);

// 2. The same bug in the OTHER direction — the singular missing.
mutate("Greek singular deleted from event-watch", [
  [LEX, '"εκδηλωσεις", "εκδηλωση",', '"εκδηλωσεις",'],
  [FIX, "'εκδηλωσεις', 'εκδηλωση',", "'εκδηλωσεις',"],
]);

// 3. Not Greek. The gate must not be a Greek gate.
mutate("Spanish plural deleted from price-check", [
  [LEX, '"precio", "precios",', '"precio",'],
  [FIX, "'precio', 'precios',", "'precio',"],
]);
mutate("German plural deleted from regulation-monitor", [
  [LEX, '"vorschrift",\n    "vorschriften",', '"vorschrift",'],
  [FIX, "'vorschrift', 'vorschriften',", "'vorschrift',"],
]);
mutate("Arabic plural deleted from price-check", [
  [LEX, '"سعر",\n    "أسعار",', '"سعر",'],
  [FIX, "'سعر', 'أسعار']", "'سعر']"],
]);

// 4. A NEW WORD nobody classified — the thirteenth-template case.
mutate("an unclassified keyword appears", [
  [LEX, '"competitor", "competitors",', '"competitor", "competitors", "συγκριση",'],
  [FIX, "'competitor', 'competitors',", "'competitor', 'competitors', 'συγκριση',"],
]);

// 5. DRIFT: the migration and the lexicon stop agreeing.
mutate("the migration drifts from the lexicon", [
  [FIX, "'rival', 'rivals',", "'rival',"],
]);

// 6. A form group left with one member — the shape that makes a plural
//    unnecessary by definition rather than by fact.
mutate("a form group is reduced to a single form", [
  [LEX, '{ lang: "el", forms: ["τιμη", "τιμες"] },', '{ lang: "el", forms: ["τιμη"] },'],
]);

// 7. A no-plural claim with no reason behind it.
mutate("a no-plural entry loses its reason", [
  [LEX, '{ lang: "en", word: "news", why: "uncountable" },', '{ lang: "en", word: "news", why: "" },'],
]);

// 8. A word declared both inflected and uninflected.
mutate("a word is both a form and a no-plural", [
  [LEX, '{ lang: "en", word: "daily", why: "adjective" },',
        '{ lang: "en", word: "daily", why: "adjective" },\n  { lang: "en", word: "prices", why: "wrong" },'],
]);

// 9. A duplicate keyword — a real edit slip that silently shrinks the array.
mutate("a keyword is duplicated in one template", [
  [LEX, '"rival", "rivals",', '"rival", "rivals", "rival",'],
  [FIX, "'rival', 'rivals',", "'rival', 'rivals', 'rival',"],
]);

// 10. ANOTHER MIGRATION writes keywords, out of this gate's sight.
mutate("a stray migration rewrites keywords", [
  ["supabase/migrations/20261231000000_stray.sql", null,
   "update public.agent_templates set keywords = array['competitor'] where slug = 'competitor-watch';\n"],
]);

// 10b. AND THE CONTROL. A migration that mentions agent_templates without
//      touching keywords must NOT turn the gate red — otherwise check 5 is
//      just "no other migration exists" and would fire on anything.
mutateExpectingGreen("a migration touches agent_templates but not keywords", [
  ["supabase/migrations/20261231000000_innocent.sql", null,
   "alter table public.agent_templates add column if not exists notes text;\n"],
]);

// 11. A thirteenth built-in in the seed that the fix never covers.
mutate("a new built-in is seeded but not covered", [
  [SEED, "  ('daily-news-watch', 'Daily news watch',",
         "  ('brand-new-watch', 'Brand new watch', 'x', 'y', '0 9 * * *', 'simple', true, 'bullets', array['competitor']),\n  ('daily-news-watch', 'Daily news watch',"],
]);

// 12. A whole language dropped — the "we fixed the one that was reported"
//     failure, which is the one this whole task exists because of.
mutate("Italian disappears from the lexicon", [
  [LEX, '{ lang: "it", forms: ["concorrente", "concorrenti"] },', ''],
  [LEX, '{ lang: "it", forms: ["notizia", "notizie"] },', ''],
  [LEX, '{ lang: "it", forms: ["evento", "eventi"] },', ''],
  [LEX, '{ lang: "it", forms: ["sovvenzione", "sovvenzioni"] },', ''],
  [LEX, '{ lang: "it", forms: ["lavoro", "lavori"] },', ''],
  [LEX, '{ lang: "it", forms: ["mercato", "mercati"] },', ''],
  [LEX, '{ lang: "it", forms: ["prezzo", "prezzi"] },', ''],
  [LEX, '{ lang: "it", forms: ["normativa", "normative"] },', ''],
  [LEX, '{ lang: "it", forms: ["versione", "versioni"] },', ''],
  [LEX, '{ lang: "it", forms: ["reputazione", "reputazioni"] },', ''],
  [LEX, '{ lang: "it", forms: ["fornitore", "fornitori"] },', ''],
]);

console.log(`\n${missed === 0 ? "PASS" : "FAIL"}  ${caught} caught, ${missed} missed`);
process.exit(missed === 0 ? 0 : 1);
