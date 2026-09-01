// WHERE THE ANSWER CAME FROM, AND WHETHER IT CAN LIE ABOUT IT.
//
// V4.6 #9. "The user does not know what data the AI is reading. That
// creates both anxiety and wrong expectations."
//
// THE FINDING THAT SHAPED THIS. Before the change, the model could not
// have cited a record if it had wanted to: lib/user-context.ts sent
// HEADLINES ONLY — no ids, no dates, no counts, capped at five rows per
// module. So "based on 12 entries from March" was not a UI feature that
// was missing; it was a sentence the server had no facts to build. Any
// citation the model produced would have been composed, and a composed
// citation is worse than none because it looks checkable.
//
// So the line is arithmetic, not generation — the same argument
// lib/verification/citations.ts makes for research reports and
// lib/jobs/handlers/file-ask.ts already acts on. What this file holds:
//
//   1. the summary counts what it was given, and never a total
//   2. it says so when the cap was hit, because "18 entries" in an
//      account with two hundred is a quiet lie
//   3. an empty module is carried, because "you have nothing in Finance"
//      is a useful refusal and "I have no data" is not
//   4. the chain from the row to the link is unbroken
//   5. the statement exists in all ten languages, in both places
//
// Run: node scripts/tests/provenance.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const at = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);

const { summariseProvenance, hasProvenance, provenanceBriefing } = await loadTs(
  "src/lib/chat/provenance.ts"
);

const MAR = Date.parse("2026-03-04T10:00:00Z");
const MAY = Date.parse("2026-05-20T10:00:00Z");
const row = (id, headline, atMs) => ({ id, headline, atMs });

console.log("== 1. it counts what it was given ==");
const p = summariseProvenance(
  [
    { slug: "finance", title: "Finances", rows: [row("f1", "Invoice 1", MAR), row("f2", "Invoice 2", MAY)] },
    { slug: "ideas", title: "Ideas", rows: [row("i1", "An idea", MAY)] },
    { slug: "sales", title: "Sales", rows: [] },
  ],
  5
);
check("entryCount is the rows in hand", p.entryCount === 3, String(p.entryCount));
check("moduleCount counts only modules that contributed", p.moduleCount === 2, String(p.moduleCount));
check("the span runs oldest to newest", p.oldestMs === MAR && p.newestMs === MAY);
check("sources carry the module they came from", p.sources.every((s) => s.slug && s.title));
// NO TOTAL ANYWHERE. The scan is capped, so a total is a number this
// module cannot know, and a field for it would be filled in eventually.
const provSrc = stripComments(readFileSync("src/lib/chat/provenance.ts", "utf8"));
check(
  "the summary exposes no total-rows field to be filled in later",
  !/\b(totalRows|totalEntries|rowTotal)\b/.test(provSrc),
  "a field named like a total invites a number the capped scan cannot measure"
);

console.log("\n== 2. it admits when it did not read everything ==");
const capped = summariseProvenance(
  [{ slug: "finance", title: "Finances", rows: [row("a", "x", MAY), row("b", "y", MAY), row("c", "z", MAY)] }],
  3
);
check("hitting the cap sets capped", capped.capped === true);
check("...and staying under it does not", p.capped === false, String(p.capped));
check("the cap itself is carried, so the wording can name it", capped.perModuleCap === 3);

console.log("\n== 3. an empty module is information, not absence ==");
check("empty modules are listed by name", p.emptyModules.length === 1 && p.emptyModules[0].title === "Sales");
check(
  "an all-empty account has no provenance to show",
  hasProvenance(summariseProvenance([{ slug: "sales", title: "Sales", rows: [] }], 5)) === false
);
check("...and a populated one does", hasProvenance(p) === true);
// A DATE THAT DID NOT PARSE IS NOT 1970. One of those in the set would
// drag the period back fifty years and print "January 1970 – May 2026".
const undated = summariseProvenance(
  [{ slug: "ideas", title: "Ideas", rows: [row("i1", "x", NaN), row("i2", "y", 0)] }],
  5
);
check("an unparseable date is dropped, not read as 1970", undated.oldestMs === null && undated.newestMs === null);
check("...and the entries still count", undated.entryCount === 2, String(undated.entryCount));

console.log("\n== 3b. two scans, one count ==");
// A Mentor Mode request builds its prompt from TWO scans over overlapping
// module lists (lib/user-context.ts over the classifier modules,
// lib/chat/mentor-context.ts over the linkable ones). Summing both
// reports twelve entries as twenty-four and prints each one twice.
const twice = summariseProvenance(
  [
    { slug: "finance", title: "Finances", rows: [row("f1", "Invoice 1", MAR), row("f2", "Invoice 2", MAY)] },
    { slug: "finance", title: "Finances", rows: [row("f1", "Invoice 1", MAR), row("f3", "Invoice 3", MAY)] },
  ],
  5
);
check("an entry read by both scans counts once", twice.entryCount === 3, String(twice.entryCount));
check("...and appears once in the list", twice.sources.filter((s) => s.id === "f1").length === 1);
check("...while the entry only one scan saw survives", twice.sources.some((s) => s.id === "f3"));
// A row with no id still has to dedupe on something.
const noIds = summariseProvenance(
  [
    { slug: "ideas", title: "Ideas", rows: [row(null, "Same headline", MAY)] },
    { slug: "ideas", title: "Ideas", rows: [row(null, "Same headline", MAY)] },
  ],
  5
);
check("an id-less row dedupes on its headline", noIds.entryCount === 1, String(noIds.entryCount));
// AND THE EMPTY LIST MUST AGREE WITH THE SOURCES. One scan can find a
// module empty while the other reads five rows from it; saying "you have
// nothing in Finance" under an answer that just cited Finance is worse
// than saying nothing.
const mixed = summariseProvenance(
  [
    { slug: "finance", title: "Finances", rows: [] },
    { slug: "finance", title: "Finances", rows: [row("f1", "Invoice", MAY)] },
    { slug: "sales", title: "Sales", rows: [] },
    { slug: "sales", title: "Sales", rows: [] },
  ],
  5
);
check(
  "a module one scan found empty and the other did not is NOT called empty",
  !mixed.emptyModules.some((m) => m.slug === "finance"),
  mixed.emptyModules.map((m) => m.slug).join(", ")
);
check("a module both scans found empty still is", mixed.emptyModules.some((m) => m.slug === "sales"));
check("...and is listed once, not once per scan", mixed.emptyModules.filter((m) => m.slug === "sales").length === 1);

console.log("\n== 4. the briefing tells the model the boundary, not to cite ==");
for (const lang of ["en", "el"]) {
  const brief = provenanceBriefing(p, lang);
  check(`${lang}: the briefing names the empty module`, brief.includes("Sales"), brief.slice(0, 80));
  check(`${lang}: ...and forbids inventing numbers`, /invent|επινοείς/i.test(brief));
}
check(
  "the briefing does not ask the model to produce citations",
  !/\bcite\b|\[\d\]|παραπομπ/i.test(provenanceBriefing(p, "en") + provenanceBriefing(p, "el")),
  "a model asked to cite produces citation-shaped text whether or not it read anything"
);

console.log("\n== 5. the chain from a row to a link is unbroken ==");
const ctxSrc = stripComments(readFileSync("src/lib/user-context.ts", "utf8"));
check("the context carries the rows, not just headlines", /rows: carried,/.test(ctxSrc));
check(
  "the rows and the headlines come from ONE filtered list",
  /const headlines = carried\.map/.test(ctxSrc),
  "derived separately, a blank headline drops from one and the source list credits an entry the model never saw"
);
check("the empty modules survive the filter", /const emptyModules = perModule/.test(ctxSrc));
check("the cap is published rather than re-guessed downstream", /perModuleCap: PER_MODULE_LIMIT/.test(ctxSrc));

const routeSrc = stripComments(readFileSync("src/app/api/chat/route.ts", "utf8"));
check("the route summarises what it sent", /summariseProvenance\(/.test(routeSrc));
// MENTOR MODE READS MORE AND MUST ACCOUNT FOR MORE. Its scan is a
// separate one that goes into the same prompt.
check(
  "the mentor scan's rows are counted too",
  /\.\.\.mentor\.modules,/.test(routeSrc),
  "an answer built on both scans and crediting one is quietly wrong"
);
const mentorSrc = stripComments(readFileSync("src/lib/chat/mentor-context.ts", "utf8"));
check("the mentor scan returns its rows, not just a string", /modules: withData\.map/.test(mentorSrc));
check(
  "...only the modules that survived its own cap",
  /withData\.map\(\(m\) => \(\{ slug: m\.slug, title: m\.title, rows: m\.rows \}\)\)/.test(mentorSrc),
  "MAX_MODULES_IN_SUMMARY drops modules AFTER they are read; crediting those names entries the model never saw"
);
// EVERY SCAN THAT FEEDS A PROMPT FILTERS ON user_id EXPLICITLY.
// lib/user-context.ts carries the long version: relying on RLS alone
// broke the moment a caller passed the service-role client.
for (const f of [
  "src/lib/chat/mentor-context.ts",
  "src/lib/chat/product-mentor-context.ts",
  "src/lib/chat/trading-mentor-context.ts",
]) {
  const src = stripComments(readFileSync(f, "utf8"));
  const takesUserId = /userId: string/.test(src);
  check(
    `${f.split("/").pop()}: filters on user_id rather than trusting RLS`,
    !takesUserId || /\.eq\("user_id", userId\)/.test(src),
    "it takes a userId and never uses it to filter — safe only while every caller passes a session client"
  );
}
// FROM THE NARROWED SET. The relevance pass decides what the model is
// shown; provenance built on the full scan credits modules it never saw.
check(
  "...from the modules that were actually sent, not the full scan",
  /selection\.keep\.map\(\(m\) => \(\{ slug: m\.slug, title: m\.title, rows: m\.rows \}\)\)/.test(routeSrc),
  "building this from fullContext would credit modules the relevance pass dropped"
);
check("the briefing is appended to the context", /provenanceBriefing\(provenance, "el"\)/.test(routeSrc));
check("the meta event carries it", /provenance: hasProvenance\(provenance\) \? provenance : undefined/.test(routeSrc));

const lineSrc = stripComments(readFileSync("src/components/chat/provenance-line.tsx", "utf8"));
check("the line links each source to its record", /\?record=\$\{encodeURIComponent\(s\.id\)\}/.test(lineSrc));
check("...and lists an unlinkable one rather than dropping it", /s\.id \? \(/.test(lineSrc));
const listSrc = stripComments(readFileSync("src/components/modules/generic-list.tsx", "utf8"));
check("the module list opens the record named in the URL", /searchParams\.get\("record"\)/.test(listSrc));
check(
  "...and ignores an id that is not on the page",
  /if \(!records\.some\(\(r\) => r\.id === requestedRecordId\)\) return;/.test(listSrc),
  "a stale id would open a panel with no record in it"
);

console.log("\n== 6. the statement exists, in ten languages and in both places ==");
for (const locale of LOCALES) {
  const body = at(messages[locale], "dashboard.chat.dataScope.body");
  check(`${locale}: the data-scope statement is there`, typeof body === "string" && body.length > 40, String(body));
}
// THREE CLAIMS, and the third is the one that answers the anxiety: it
// does not change anything unless asked.
const en = at(messages.en, "dashboard.chat.dataScope.body");
check("it says what it sees", /entries/i.test(en), en);
check("it says what it does not see", /not see/i.test(en), en);
check("it says it changes nothing unasked", /not change/i.test(en), en);
const wsSrc = stripComments(readFileSync("src/components/chat/chat-workspace.tsx", "utf8"));
check("it is on the first screen", /t\("dataScope\.title"\)/.test(wsSrc) && /t\("dataScope\.body"\)/.test(wsSrc));
check('it is in the chat\'s "?"', /scopeKey="dashboard\.chat\.dataScope"/.test(wsSrc));
const tipSrc = stripComments(readFileSync("src/components/ui/help-tip.tsx", "utf8"));
check("...and the popover renders what it is handed", /t\(`\$\{scopeKey\}\.body`\)/.test(tipSrc));
// ONE WORDING, TWO PLACES. Two copies drift the first time one is edited.
check(
  "both places read the same key",
  (wsSrc.match(/dataScope/g) ?? []).length >= 3,
  "the first screen and the help popover must not hold separate copies"
);

// ICU: `#` does the formatting inside a plural. A formatNumber() around
// it makes Number("1,000") — which is NaN. That has been done once.
console.log("\n== 7. the counts are ICU plurals, formatted by ICU ==");
for (const locale of LOCALES) {
  const plain = at(messages[locale], "dashboard.chat.provenance.plain");
  check(`${locale}: the provenance wording exists`, typeof plain === "string" && plain.length > 0, String(plain));
}
check(
  "the component does not pre-format a plural's count",
  !/formatNumber\(/.test(lineSrc),
  'Number("1,000") is NaN — the # inside the plural does the formatting'
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
