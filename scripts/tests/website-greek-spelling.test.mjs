// THE SPELLING NOTE, AND THE THREE WAYS IT COULD BE WORSE THAN NOTHING.
//
// Reported from a real generated site on 2026-09-05: "ρεμπα" where the
// word is "ρεύμα". The prompt says nothing about spelling and no
// post-generation pass read the words, so the check is new. What makes it
// safe is not that it finds typos — it is what it refuses to do:
//
//   1. IT NEVER ASKS ABOUT THE OWNER'S OWN WORDS. A village, a surname, a
//      business name written in the brief is the owner's spelling of their
//      own thing. Flagging it is the product telling somebody their name
//      is wrong.
//   2. IT NEVER SHOWS A WORD THAT WAS NOT ON THE PAGE. The model answers
//      with a JSON array; anything in it that was not in the question is
//      dropped, so an invented "correction" cannot reach the owner.
//   3. IT NEVER REWRITES. The note carries words, and the page is
//      untouched.
//
// Run: node scripts/tests/website-greek-spelling.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

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

// READ BEFORE LOADING, ON PURPOSE.
//
// loadTs cannot follow the Anthropic SDK, so a provider import in the pure
// half does not fail a check — it throws on the import line and takes the
// whole file down before one check has run. A gate that dies is not a gate
// that says what is wrong. These two are text, so they run first and
// report; the load below then has something to load.
const pureSrc = readFileSync("src/lib/website-greek-spelling.ts", "utf8");
console.log("== 0. the split that keeps the rules testable ==");
check("the pure half imports no provider", !/providers\/complete/.test(pureSrc));
check("...and folds with the shared fold, not a private one", /const fold = foldForMatch;/.test(pureSrc));

const { greekWordsToCheck, keepOnlyAsked, parseWordList, SPELLING_WORD_CAP } = await loadTs(
  "src/lib/website-greek-spelling.ts"
);

const page = (body) => `<!doctype html><html><head><style>.a{color:red}</style><script>var x="ρεύμαscript"</script></head><body>${body}</body></html>`;

// ---------------------------------------------------------------------
console.log("== 1. which words are asked about ==");
check(
  "a Greek word on the page is asked about",
  greekWordsToCheck(page("<p>Παρέχουμε ρεμπα και νερό</p>"), "").includes("ρεμπα")
);
check(
  "script and style contents are not words on the page",
  !greekWordsToCheck(page("<p>Καλημέρα</p>"), "").some((w) => w.includes("script"))
);
check("a page with no Greek asks nothing", greekWordsToCheck(page("<p>Hello there friends</p>"), "").length === 0);
check(
  "words shorter than four letters are not asked about",
  !greekWordsToCheck(page("<p>και να το με</p>"), "").length
);
check(
  "ALL-CAPS is skipped — a wordmark is a design choice and capitals lose the accents",
  !greekWordsToCheck(page("<h1>ΚΑΦΕΤΕΡΙΑ</h1><p>καφετερια μας</p>"), "").includes("ΚΑΦΕΤΕΡΙΑ")
);
check("...but the same word in lower case is asked about", greekWordsToCheck(page("<h1>ΚΑΦΕΤΕΡΙΑ</h1><p>καφετερια μας</p>"), "").includes("καφετερια"));

// ---------------------------------------------------------------------
console.log("\n== 2. the owner's own words are never asked about ==");
// THE ONE THAT MATTERS MOST. A brand, a village, a surname the owner
// typed is their spelling of their own thing.
check(
  "a word from the brief is not asked about",
  !greekWordsToCheck(page("<p>Η ταβέρνα Μαγκουφάνα σας περιμένει</p>"), "Ταβέρνα Μαγκουφάνα στη Νάξο").includes("Μαγκουφάνα")
);
check(
  "...even when the brief accents it and the page does not",
  !greekWordsToCheck(page("<p>Καλαμπακα</p>"), "εστιατόριο στην Καλαμπάκα").includes("Καλαμπακα"),
  JSON.stringify(greekWordsToCheck(page("<p>Καλαμπακα</p>"), "εστιατόριο στην Καλαμπάκα"))
);
check(
  "...and even when the page ends it in a final sigma and the brief does not",
  !greekWordsToCheck(page("<p>συνδρομής</p>"), "συνδρομησ πακέτα").includes("συνδρομής")
);
// THE THREE CASES ABOVE ALL USE A CAPITALISED NAME, AND SINCE SECTION 8
// THAT MEANS TWO MECHANISMS PROTECT THEM: the exact-fold set AND the
// proper-noun stems. Two of this suite's mutations went WRONG on that —
// they removed one mechanism and the other kept the check green, so the
// suite reported red on a neighbouring clause instead of the one it
// aimed at. These two cases use lower-case common nouns, which the stems
// deliberately never touch, so each isolates the mechanism it names.
check(
  "the exact-fold set alone protects a common noun from the brief",
  !greekWordsToCheck(page("<p>παραδοσιακά</p>"), "εστιατόριο με παραδοσιακά πιάτα").includes("παραδοσιακά")
);
check(
  "...and the shared fold alone protects it across an accent",
  !greekWordsToCheck(page("<p>παραδοσιακα</p>"), "εστιατόριο με παραδοσιακά πιάτα").includes("παραδοσιακα"),
  JSON.stringify(greekWordsToCheck(page("<p>παραδοσιακα</p>"), "εστιατόριο με παραδοσιακά πιάτα"))
);
check(
  "a word NOT in the brief is still asked about",
  greekWordsToCheck(page("<p>Η ταβέρνα Μαγκουφάνα έχει ρεμπα</p>"), "Ταβέρνα Μαγκουφάνα").includes("ρεμπα")
);

// ---------------------------------------------------------------------
console.log("\n== 3. the list is bounded and has no repeats ==");
// 200 DISTINCT GREEK WORDS, and the first draft of this fixture made
// none. `λεξηαριθμος${i}` differs only in digits, and digits are not Greek
// letters — the word matcher saw the same run 200 times and deduplication
// left ONE word, so the cap could be deleted and this section stayed
// green. Greek letters are what has to vary.
const GREEK_ALPHABET = "αβγδεζηθικλμνξοπρστυφχψω";
const many = Array.from({ length: 200 }, (_, i) => {
  const a = GREEK_ALPHABET[i % 24];
  const b = GREEK_ALPHABET[(i * 7 + 3) % 24];
  const c = GREEK_ALPHABET[Math.floor(i / 24) % 24];
  return `λεξη${a}${b}${c}`;
}).join(" ");
const capped = greekWordsToCheck(page(`<p>${many}</p>`), "");
// The fixture must really contain more distinct words than the cap, or
// "at most 60" is satisfied by a page that only had three.
const distinctInFixture = new Set(many.split(" ")).size;
check(`the fixture has more distinct words than the cap (${distinctInFixture} > ${SPELLING_WORD_CAP})`, distinctInFixture > SPELLING_WORD_CAP, String(distinctInFixture));
check(`at most ${SPELLING_WORD_CAP} words are sent (${capped.length})`, capped.length === SPELLING_WORD_CAP, String(capped.length));
check(
  "the same word twice is asked about once",
  greekWordsToCheck(page("<p>ρεμπα ρεμπα ρεμπα</p>"), "").filter((w) => w === "ρεμπα").length === 1
);

// ---------------------------------------------------------------------
console.log("\n== 4. the answer is filtered to the question ==");
const asked = ["ρεμπα", "καφετερια"];
check("a word that was asked about survives", keepOnlyAsked(["ρεμπα"], asked).join() === "ρεμπα");
check(
  "a word the model invented is dropped",
  keepOnlyAsked(["ρεύμα", "ρεμπα"], asked).join() === "ρεμπα",
  JSON.stringify(keepOnlyAsked(["ρεύμα", "ρεμπα"], asked))
);
check("a whole sentence is dropped", keepOnlyAsked(["The word ρεμπα is wrong"], asked).length === 0);
check("a non-string is dropped", keepOnlyAsked([42, null, {}, "ρεμπα"], asked).join() === "ρεμπα");
check("a non-array answer yields nothing", keepOnlyAsked({ words: ["ρεμπα"] }, asked).length === 0);
check("the same word twice yields it once", keepOnlyAsked(["ρεμπα", "ρεμπα"], asked).join() === "ρεμπα");
check("an empty answer yields nothing", keepOnlyAsked([], asked).length === 0);

console.log("\n== 4b. the reply is parsed without throwing ==");
check("a bare array parses", JSON.stringify(parseWordList('["ρεμπα"]')) === '["ρεμπα"]');
check("an array inside prose parses", JSON.stringify(parseWordList('Here you go: ["ρεμπα"] — that is all')) === '["ρεμπα"]');
check("prose with no array yields an empty list", JSON.stringify(parseWordList("everything looks fine")) === "[]");
check("broken JSON yields an empty list", JSON.stringify(parseWordList('["ρεμπα"')) === "[]");
check("an empty reply yields an empty list", JSON.stringify(parseWordList("")) === "[]");

// ---------------------------------------------------------------------
console.log("\n== 5. it reports, and never rewrites ==");
const src = readFileSync("src/lib/websites-greek-spelling-check.ts", "utf8");
// NOT "the word html never appears after a return" — visibleTextOf
// legitimately does `return html.replace(...)` to get TEXT out of a page,
// and a check that forbade that would be testing the wrong thing. What
// must hold is that nothing this module EXPORTS hands back a page: every
// exported signature returns words.
const exportedReturns = [...src.matchAll(/export (?:async )?function \w+\([\s\S]*?\):\s*([^{]+)\{/g), ...pureSrc.matchAll(/export (?:async )?function \w+\([\s\S]*?\):\s*([^{]+)\{/g)].map((m) => m[1].trim());
// STATED AS THE RULE, NOT AS A LIST OF TODAY'S TYPES. This was an
// allowlist — `/string\[\]|unknown/` — and it went red the day an
// exported predicate returned `boolean`, which cannot be a page. An
// allowlist has to be widened for every helper, and widening a check to
// admit a new shape is how one eventually gets widened to admit the bad
// one. The page shape is a bare `string`: that is what is forbidden.
const pageShaped = exportedReturns.filter((r) => /^(?:Promise<)?string>?$/.test(r.replace(/\s/g, "")));
check(`every exported function returns words, never a page (${exportedReturns.length} exports, ${pageShaped.length} page-shaped)`,
  exportedReturns.length >= 4 && pageShaped.length === 0,
  exportedReturns.join(" | "));
check("a failure is an empty list, never a thrown generation", /catch \(err\)[\s\S]{0,200}?return \[\];/.test(src));
check("...and a refusal from the provider is too", /if \(!outcome\.ok\) return \[\];/.test(src));
check("it is a classification call, the cheap route", /purpose: "classification"/.test(src));
// THE TOKENS REACH AN ACCUMULATOR. billing-coverage.test.mjs refuses a
// runCompletion whose usage goes nowhere; this file has to refuse it too,
// or deleting that one line leaves this gate green and only the other one
// red — and a reader of THIS file would think the call was free.
check(
  "the call records its usage on the caller's accumulator",
  /costs\.record\("generation", outcome\.usage/.test(src)
);
check(
  "...and the accumulator is required, so forgetting it is a type error",
  /options: \{ costs: CostRecorder/.test(src)
);
check("...with a bounded reply", /maxTokens: 300/.test(src));
const route = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
check("the route records the words as a note", /notes\.push\(\{ kind: "spelling", words: misspelled \}\)/.test(route));
check("...and does not touch htmlContent with them", !/htmlContent = .*misspell/i.test(route));

// ---------------------------------------------------------------------
console.log("\n== 6. the note survives a round trip through the column ==");
const { parseGenerationNotes } = await loadTs("src/lib/website-generation-notes.ts");
check(
  "a spelling note is read back",
  JSON.stringify(parseGenerationNotes([{ kind: "spelling", words: ["ρεμπα"] }])) === '[{"kind":"spelling","words":["ρεμπα"]}]'
);
check("an empty word list is dropped", parseGenerationNotes([{ kind: "spelling", words: [] }]).length === 0);
check("non-strings inside are dropped", JSON.stringify(parseGenerationNotes([{ kind: "spelling", words: [1, "ρεμπα", null] }])) === '[{"kind":"spelling","words":["ρεμπα"]}]');
check("a malformed note is dropped, not thrown", parseGenerationNotes([{ kind: "spelling", words: "ρεμπα" }]).length === 0);
check(
  "a long list is capped so the panel cannot become a wall of text",
  parseGenerationNotes([{ kind: "spelling", words: Array.from({ length: 50 }, (_, i) => `λ${i}`) }])[0].words.length === 20
);

// ---------------------------------------------------------------------
console.log("\n== 7. the sentence exists in all ten languages ==");
const locales = ["en", "el", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
for (const loc of locales) {
  const m = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
  const v = m?.dashboard?.websiteBuilder?.notes?.spelling;
  check(`${loc}: the note has a sentence`, typeof v === "string" && v.length > 20, String(v));
  check(`${loc}: ...that carries both the count and the words`, typeof v === "string" && v.includes("{words}") && v.includes("{count"), String(v));
}

// ---------------------------------------------------------------------
console.log("\n== 8. the owner's own name, in every case Greek puts it in ==");
//
// PROMISE 1 OF THIS FILE, AND IT WAS TRUE FOR ONE FORM ONLY. The
// exclusion matched the FOLD of a brief word against the fold of a page
// word — exact-form matching. Greek does not write the same noun twice
// the same way: a brief saying "Ζαχαροπλαστείο στο Χαλάνδρι" produces a
// page saying "στην καρδιά του Χαλανδρίου", and the second is not the
// first.
//
// MEASURED ON A REAL GENERATED SITE, 2026-09-06: "Χαλανδρίου" was in the
// list of words the model was asked to judge as misspellings. Six of six
// constructed cases leaked the same way.
const { ownNameStems, isOwnName } = await loadTs("src/lib/website-greek-spelling.ts");
const withText = (b) => `<!doctype html><html><body><p>Καλώς ήρθατε, ${b} σήμερα εδώ.</p></body></html>`;

const OWN = [
  ["Ταβέρνα στο Χαλάνδρι.", "Χαλανδρίου"],
  ["Φούρνος του Παπαδόπουλου.", "Παπαδόπουλος"],
  ["Κατάστημα στη Θεσσαλονίκη.", "Θεσσαλονίκης"],
  ["Ξενοδοχείο στο Ναύπλιο.", "Ναυπλίου"],
  ["Καφενείο στα Ιωάννινα.", "Ιωαννίνων"],
  ["Κάβα Παπαδόπουλος.", "Παπαδόπουλου"],
];
const leaked = OWN.filter(([brief, w]) => greekWordsToCheck(withText(w), brief).includes(w));
check(
  `no inflection of the owner's own name is put to the model (${OWN.length} cases, ${leaked.length} leaked)`,
  OWN.length >= 6 && leaked.length === 0,
  leaked.map(([b, w]) => `${w} (brief: ${b})`).join(" | ")
);

// THE OTHER DIRECTION, AND IT MATTERS MORE. Over-excluding is worse than
// the bug: a checker that silences a real typo to protect a name has
// stopped being a spelling checker. Two of these begin with the same
// letters as the owner's name on purpose.
const MUST_ASK = [
  ["Ζαχαροπλαστείο στο Χαλάνδρι.", "ρεμπα", "the word from the original bug report"],
  ["Ταβέρνα στο Χαλάνδρι.", "χαλαρός", "begins like Χαλάνδρι, different word"],
  ["Ταβέρνα στο Χαλάνδρι.", "χάλασε", "same"],
  ["Φούρνος του Παπαδόπουλου.", "παπαρούνα", "begins like the surname, unrelated"],
  ["Ζαχαροπλαστείο στο Χαλάνδρι.", "ζαχαροπλαστιο", "a typo in a COMMON noun from the brief"],
  ["Κατάστημα στη Θεσσαλονίκη.", "καταστιμα", "a typo in the sentence-initial word"],
];
const silenced = MUST_ASK.filter(([brief, w]) => !greekWordsToCheck(withText(w), brief).includes(w));
check(
  `no real misspelling is silenced to protect a name (${MUST_ASK.length} cases, ${silenced.length} silenced)`,
  MUST_ASK.length >= 6 && silenced.length === 0,
  silenced.map(([, w, why]) => `${w} — ${why}`).join(" | ")
);

// A SENTENCE-INITIAL CAPITAL IS A SENTENCE, NOT A NAME. Stemming it would
// stop the checker asking about every word beginning "ζαχαροπλαστ",
// including a real typo in one — which is why the two checks above can
// both be green.
check(
  `only not-sentence-initial capitals become stems (${JSON.stringify(ownNameStems("Ζαχαροπλαστείο στο Χαλάνδρι."))})`,
  ownNameStems("Ζαχαροπλαστείο στο Χαλάνδρι.").length === 1 &&
    ownNameStems("Ζαχαροπλαστείο στο Χαλάνδρι.")[0].startsWith("χαλα"),
  "the first word of a sentence is capitalised because it is first"
);
check(
  "a brief with no proper noun yields no stems",
  ownNameStems("Θέλω μια σελίδα για το κατάστημά μου.").length === 0
);
// AND THE CEILING IS THE REPOSITORY'S OWN. isOwnName accepts an ending up
// to MAX_INFLECTION longer than the stem — the same constant stem() in
// lib/text/unicode-patterns.ts uses — so a much longer word that merely
// starts the same way is not swallowed.
check(
  "a far longer word that merely starts the same way is still asked about",
  !isOwnName("χαλανδριουπολιτικοσυνδεσμος", ownNameStems("Ταβέρνα στο Χαλάνδρι."))
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
