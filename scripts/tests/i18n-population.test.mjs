// check-i18n.js VALIDATES THE KEYS A FILE USES. A FILE THAT USES NONE IS
// NOT IN ITS POPULATION.
//
// That gate is thorough about what it covers: nine locales, every key
// resolved, ICU placeholders, the `'{query}'` escaping trap that ships the
// literal braces in every language, translations identical to English
// flagged unless registered. All of it starts from the keys the tree
// asks for.
//
// So a component that calls no translation function at all — that simply
// writes English into the JSX — is not a failing case. It is not a case.
// Measured on 2026-09-16: 310 .tsx files, 225 use next-intl, and 13 of the
// remaining 85 render user-visible literal text. Not one of them is a
// defect, and that is exactly why this needed writing down:
//
//   five public legal and transparency pages, English by policy
//   six owner-only diagnostic screens, which no customer sees
//   the wordmark, which is a name
//   the Unsplash credit, whose wording their API terms fix verbatim
//
// Thirteen correct decisions and nowhere recording that any of them was a
// decision. The fourteenth — a customer-facing screen someone writes in
// English on a Friday — would look exactly the same to every instrument
// here. docs/shapes.md, "The check covers the participants, not the ones
// who stayed out".
//
// Run: node scripts/tests/i18n-population.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0,
  fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".tsx")) files.push(full.replace(/\\/g, "/"));
  }
})("src");

// JSX comments as well as the two JavaScript forms: `{/* ... */}` is the
// one a component actually uses, and its contents sit in JSX text
// position — exactly where the scan below looks.
const strip = (t) =>
  t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const SOURCE = new Map(files.map((f) => [f, strip(readFileSync(f, "utf8"))]));

const TRANSLATES = /useTranslations\s*\(|getTranslations\s*\(|\bt\(|useFormatter|<FormattedMessage/;

// USER-VISIBLE means one of two things and deliberately not a third.
// A JSX text node of at least two words starting with a capital, or a
// prop the browser renders. NOT every quoted string: className, a route,
// a table name and a key are all strings, and a scan that counted them
// would be the near-zero-precision kind this project deletes rather than
// commits (docs/shapes.md on the line-versus-structure scan).
const JSX_TEXT = />\s*([A-Z][A-Za-z][^<>{}\n]{6,})</g;
const RENDERED_PROP = /\b(title|label|placeholder|alt|aria-label)\s*=\s*"([^"]{6,})"/g;

function visibleLiterals(src) {
  const text = [...src.matchAll(new RegExp(JSX_TEXT.source, "g"))]
    .map((m) => m[1].trim())
    .filter((s) => /[A-Za-z]{3}/.test(s) && /\s/.test(s));
  const props = [...src.matchAll(new RegExp(RENDERED_PROP.source, "g"))].map((m) => `${m[1]}="${m[2]}"`);
  return [...text, ...props];
}

const translating = files.filter((f) => TRANSLATES.test(SOURCE.get(f)));
const untranslated = files
  .filter((f) => !TRANSLATES.test(SOURCE.get(f)))
  .map((f) => ({ file: f, literals: visibleLiterals(SOURCE.get(f)) }))
  .filter((r) => r.literals.length > 0);

check(`.tsx files walked (${files.length})`, files.length >= 250, "the walk found almost nothing");
check(`files that translate (${translating.length})`, translating.length >= 180, "the next-intl detector matched almost nothing, and every file below would be reported as English");
check(
  `files that render literal text without it (${untranslated.length})`,
  untranslated.length >= 5,
  "the literal detector matched nothing, so the register below is checked against an empty set and passes vacuously"
);

// ---------------------------------------------------------------------
// ENGLISH ON PURPOSE. Four reasons, and each entry says which.
// ---------------------------------------------------------------------
const ENGLISH_ON_PURPOSE = {
  "src/app/terms/page.tsx": "legal text. A translated contract is a second contract, and the one that governs is the one that was written.",
  "src/app/privacy/page.tsx": "the same: the policy that binds is the English one, and a paraphrase in nine languages is nine documents nobody has reviewed.",
  "src/app/cookies/page.tsx": "the same, and it is the page a consent banner links to.",
  "src/app/acceptable-use/page.tsx": "the same: a rule enforced in English is published in English.",
  "src/app/ai-transparency/page.tsx": "what the product does with a model and which provider is on. It names providers, models and column names that do not translate, and it is read alongside the policy pages above.",
  "src/app/dashboard/system-health/page.tsx": "owner-only (isAdminEmail), and the words on it are column names and provider errors.",
  "src/components/system-health/pwa-adoption.tsx": "the same screen: install and push-permission counts for the owner.",
  "src/components/system-health/db-exposure.tsx": "the same owner-only screen: which tables each database role can reach, listed by their SQL names, which are not words in any language.",
  "src/components/system-health/capability-status.tsx": "the same screen: which provider keys are configured.",
  "src/components/system-health/storage-diagnostics.tsx": "the same owner-only screen: bucket names and storage policy names, which are identifiers rather than prose.",
  "src/components/costs/cost-dashboard.tsx": "the owner's spend dashboard, reached from /dashboard/costs, which is owner-gated in the page above it.",
  "src/components/logo.tsx": "the wordmark. A brand name is not translated into nine languages; it is the same string everywhere.",
  "src/lib/pdf/deck.tsx":
    "the Unsplash photographer credit. Their API terms fix the wording — 'Photo by <name> on Unsplash', both halves linked — and scripts/unsplash-attribution-proof.mjs exists to prove it renders. Translating it would break the term that lets the product use the photographs at all.",
};

const undeclared = untranslated.filter((r) => !ENGLISH_ON_PURPOSE[r.file]);
check(
  "every file that renders English without next-intl says why",
  undeclared.length === 0,
  undeclared.length
    ? undeclared
        .map((r) => `${r.file} (${r.literals.length}): ${r.literals.slice(0, 2).join(" | ").slice(0, 110)}`)
        .join("\n        ") +
      "\n        Translate it, or add it to ENGLISH_ON_PURPOSE with the reason a person reading nine languages may not have this one."
    : ""
);

// BOTH WAYS. An entry whose file has been translated, or has stopped
// rendering text, or has left the tree, is a sentence that has stopped
// being true.
const stale = Object.keys(ENGLISH_ON_PURPOSE).filter((f) => !untranslated.some((r) => r.file === f));
check(
  "no English-on-purpose entry has gone stale",
  stale.length === 0,
  stale
    .map((f) => (!files.includes(f) ? `${f}: no such file` : TRANSLATES.test(SOURCE.get(f) ?? "") ? `${f}: it translates now — drop the entry` : `${f}: it renders no literal text any more`))
    .join("\n        ")
);
const shortReasons = Object.entries(ENGLISH_ON_PURPOSE).filter(([, why]) => why.length < 50);
check("every reason is an argument", shortReasons.length === 0, shortReasons.map(([f]) => f).join(", "));

// ---------------------------------------------------------------------
// CONTROLS, driving visibleLiterals and TRANSLATES rather than restating.
// ---------------------------------------------------------------------
check("control: a two-word JSX text node is visible", visibleLiterals("<p>Settings saved successfully</p>").length === 1);
check("control: a className is not", visibleLiterals('<div className="flex items-center gap-2" />').length === 0, "the scan is matching attributes the browser never shows");
check("control: a key or a path is not", visibleLiterals('<Link href="/dashboard/settings">{t("open")}</Link>').length === 0);
check("control: a rendered prop is", visibleLiterals('<input placeholder="Search everything" />').length === 1);
check("control: a JSX comment is not", visibleLiterals(strip("<div>{/* Settings saved successfully */}</div>")).length === 0, "the comment stripper is not running, so a note about a string counts as the string");
check("control: a single capitalised word is not", visibleLiterals("<span>Settings</span>").length === 0, "one word is as likely to be an identifier as a sentence; the two-word rule is what keeps precision usable");
check("control: a file calling useTranslations is seen to translate", TRANSLATES.test('const t = useTranslations("dashboard");'));
check("control: a server file calling getTranslations is too", TRANSLATES.test('const t = await getTranslations("dashboard");'));

console.log(`\n        ${files.length} .tsx · ${translating.length} translate · ${untranslated.length} render English, all ${Object.keys(ENGLISH_ON_PURPOSE).length} of them declared`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
