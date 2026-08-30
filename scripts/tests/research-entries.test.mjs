// TWO CITATION NAMESPACES, AND THE ONE THAT WAS INVISIBLE.
//
// V4.6. Deep Research read the web and nothing else. It now also reads
// the account: the flat shape of every module, plus one module read
// deeply when the topic points at one, cited as [E1], [E2] alongside the
// web's [1], [2].
//
// THE FAILURE THIS FILE EXISTS FOR is not that [E99] was allowed. It is
// that it was INVISIBLE. checkCitations matched `\[(\d{1,3})\]` — a
// digit straight after the bracket — so "[E99]" matched nothing at all:
// not passed, not failed, unseen. A report citing an entry that does not
// exist came back `ok: true`, and annotateDanglingCitations left the
// marker unmarked because it could not see it either. The reader follows
// it and lands nowhere, exactly as with a dangling [7], and the report
// looks fully cited in both cases.
//
// So every check below is run for BOTH namespaces. An invented [E99] is
// the same severity as an invented [7], and the file says so by asserting
// the same property twice rather than by claiming it once.
//
// Run: node scripts/tests/research-entries.test.mjs
import { loadTs } from "./load-ts.mjs";

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

const { checkCitations, annotateDanglingCitations } = await loadTs(
  "src/lib/verification/citations.ts"
);
const { collateEntrySources, buildEntrySourceBlock, entryCitationRules } = await loadTs(
  "src/lib/research/entry-sources.ts"
);
const { formatAccountSummary } = await loadTs("src/lib/research/research-context.ts");

// ---------------------------------------------------------------------
console.log("== 1. the web namespace still behaves exactly as it did ==");
// THE REGRESSION HALF. Adding a second namespace to a function is the
// classic way to break the first one, and every existing caller passes
// no entry count at all.
check(
  "a report citing [1] and [2] with two sources is ok",
  checkCitations("Growth was strong [1]. Analysts disagree [2].", 2).ok
);
check(
  "a report citing [7] with two sources is NOT ok",
  !checkCitations("Growth was strong [1]. Analysts disagree [7].", 2).ok
);
check(
  "the dangling web marker is named, with its namespace",
  JSON.stringify(
    checkCitations("x [7]", 2).issues.filter((i) => i.kind === "dangling")
  ) === JSON.stringify([{ kind: "dangling", namespace: "web", marker: 7, sourceCount: 2 }]),
  JSON.stringify(checkCitations("x [7]", 2).issues)
);
check(
  "a fenced code block's [1] is not a citation",
  checkCitations("```\nconst a = xs[1];\n```\nNo citations here.", 0).markers.length === 0
);
check(
  "annotate leaves a valid web marker alone",
  annotateDanglingCitations("x [1] y [2]", 2) === "x [1] y [2]"
);
check(
  "annotate marks a dangling web marker",
  annotateDanglingCitations("x [7]", 2) === "x [7]⚠",
  annotateDanglingCitations("x [7]", 2)
);

// ---------------------------------------------------------------------
console.log("\n== 2. the entry namespace, held to the same standard ==");
check(
  "a report citing [E1] and [E2] with two entries is ok",
  checkCitations("Your own finance entries show a drop [E1], and again in April [E2].", 0, 2).ok
);
check(
  "a report citing [E99] with two entries is NOT ok",
  !checkCitations("Your entries show a drop [E99].", 0, 2).ok,
  "this is the case that used to be invisible: not passed, not failed, unseen"
);
check(
  "the dangling entry marker is named, with its namespace",
  JSON.stringify(
    checkCitations("x [E99]", 0, 2).issues.filter((i) => i.kind === "dangling")
  ) === JSON.stringify([{ kind: "dangling", namespace: "entry", marker: 99, sourceCount: 2 }]),
  JSON.stringify(checkCitations("x [E99]", 0, 2).issues)
);
check(
  "entry markers are reported separately from web markers",
  JSON.stringify(checkCitations("a [1] b [E2]", 1, 2).entryMarkers) === JSON.stringify([2]) &&
    JSON.stringify(checkCitations("a [1] b [E2]", 1, 2).markers) === JSON.stringify([1]),
  JSON.stringify(checkCitations("a [1] b [E2]", 1, 2))
);
check(
  "[E0] is not a citation in a 1-based scheme",
  checkCitations("x [E0]", 0, 2).entryMarkers.length === 0
);

// ---------------------------------------------------------------------
console.log("\n== 3. annotate does NOT cut or mark a valid entry marker ==");
// THE BRIEF'S OWN REQUIREMENT, and the reason the annotator matches
// `\[(E?)(\d{1,3})\]` with the E in its own capture group rather than
// folding it into the digits: each marker has to be compared against ITS
// OWN ceiling. Comparing an entry marker to the WEB source count is the
// bug this section is built to catch — with 12 web sources and 2
// entries, [E3] would pass for the wrong reason, and with 0 web sources
// [E1] would be marked despite being perfectly valid.
check(
  "a valid [E1] survives untouched",
  annotateDanglingCitations("your entries show x [E1]", 0, 2) === "your entries show x [E1]",
  annotateDanglingCitations("your entries show x [E1]", 0, 2)
);
check(
  "...even when there are NO web sources at all",
  annotateDanglingCitations("[E1] [E2]", 0, 2) === "[E1] [E2]",
  annotateDanglingCitations("[E1] [E2]", 0, 2)
);
check(
  "a dangling [E99] IS marked",
  annotateDanglingCitations("x [E99]", 0, 2) === "x [E99]⚠",
  annotateDanglingCitations("x [E99]", 0, 2)
);
check(
  "an entry marker is judged against the ENTRY count, not the source count",
  annotateDanglingCitations("[E3]", 12, 2) === "[E3]⚠",
  `got ${annotateDanglingCitations("[E3]", 12, 2)} — 12 web sources must not validate a third entry`
);
check(
  "...and a web marker against the SOURCE count, not the entry count",
  annotateDanglingCitations("[3]", 2, 12) === "[3]⚠",
  `got ${annotateDanglingCitations("[3]", 2, 12)} — 12 entries must not validate a third source`
);
check(
  "both kinds in one document are marked independently",
  annotateDanglingCitations("a [1] b [9] c [E1] d [E9]", 2, 2) === "a [1] b [9]⚠ c [E1] d [E9]⚠",
  annotateDanglingCitations("a [1] b [9] c [E1] d [E9]", 2, 2)
);
// AND THE DEFAULT PATH, because every existing caller passes two
// arguments. With no entry count, an [E1] is dangling — there is no
// list — and that is the correct answer rather than an oversight.
check(
  "with no entries supplied, an [E1] is dangling",
  annotateDanglingCitations("x [E1]", 3) === "x [E1]⚠",
  annotateDanglingCitations("x [E1]", 3)
);

// ---------------------------------------------------------------------
console.log("\n== 4. the entry list is built from rows that can be opened ==");
const READS = [
  {
    slug: "finance",
    title: "Finance",
    shown: 2,
    omitted: 0,
    rows: [
      { id: "11111111-1111-4111-8111-111111111111", headline: "March revenue", atMs: Date.UTC(2026, 2, 14) },
      // NO ID: dropped rather than numbered-and-unlinked. A citation a
      // reader cannot follow is the exact thing this whole file is about.
      { id: null, headline: "A row with no id", atMs: Date.UTC(2026, 2, 15) },
      { id: "22222222-2222-4222-8222-222222222222", headline: "April revenue", atMs: null },
    ],
  },
];
const entries = collateEntrySources(READS);
check(`rows with an id are numbered (${entries.length} of 3)`, entries.length === 2, JSON.stringify(entries));
check(
  "the link opens the record, not the module list",
  entries[0]?.href === "/dashboard/finance?record=11111111-1111-4111-8111-111111111111",
  entries[0]?.href
);
check(
  "a row with no date still gets a link, with no date in the label",
  entries[1]?.href === "/dashboard/finance?record=22222222-2222-4222-8222-222222222222" &&
    entries[1]?.date === "",
  JSON.stringify(entries[1])
);
check(
  "the prompt block numbers them [E1..En]",
  buildEntrySourceBlock(entries) ===
    "[E1] Finance (2026-03-14) — March revenue\n[E2] Finance — April revenue",
  JSON.stringify(buildEntrySourceBlock(entries))
);
check(
  "an empty entry list produces no block at all",
  buildEntrySourceBlock([]) === ""
);
// THE MODEL IS TOLD ABOUT THE NAMESPACE ONLY WHEN THERE IS ONE. A model
// told about a list it does not have is a model that can cite into it.
check("no entries means no [E] instructions", entryCitationRules(0).length === 0);
check(
  "some entries means the rule is stated, with the real ceiling",
  entryCitationRules(3).some((r) => r.includes("[E3]")),
  entryCitationRules(3).join(" | ")
);

// ---------------------------------------------------------------------
console.log("\n== 5. the flat half says what it saw, not what it guesses ==");
const SUMMARIES = [
  { slug: "finance", title: "Finance", rows: [{ atMs: Date.UTC(2026, 2, 14) }, { atMs: Date.UTC(2026, 1, 1) }] },
  { slug: "sales", title: "Sales", rows: [{ atMs: null }] },
];
const flat = formatAccountSummary(SUMMARIES, [{ title: "Competitors" }], 2, 20);
console.log(flat.split("\n").map((l) => `        ${l}`).join("\n"));
check("the busiest module is first", flat.startsWith("- Finance: 2 entries"), flat.split("\n")[0]);
check("the most recent date is the MAX, not the first row", flat.includes("most recent 2026-03-14"), flat);
// OUT OF ORDER ON PURPOSE, and the mutation suite is what said this was
// needed. The fixture above lists its rows newest-first — which is how
// they really arrive — so `dates[0]` and `Math.max(...dates)` agree on
// it, and replacing the max with the first element left the gate GREEN.
// A check that only ever sees sorted input cannot tell sorting from
// selection.
const unordered = formatAccountSummary(
  [
    {
      slug: "finance",
      title: "Finance",
      rows: [{ atMs: Date.UTC(2026, 0, 5) }, { atMs: Date.UTC(2026, 5, 20) }, { atMs: Date.UTC(2026, 2, 1) }],
    },
  ],
  [],
  0,
  20
);
check(
  "...even when the rows are not in date order",
  unordered.includes("most recent 2026-06-20"),
  unordered
);
check("a module with no dated rows says so rather than inventing one", flat.includes("Sales: 1 entry, most recent undated"), flat);
check("empty modules are named, because the absence is the finding", flat.includes("Nothing recorded yet in: Competitors"), flat);
check("active plans are counted", flat.includes("Active plans: 2"), flat);
// THE CAP IS NAMED. `rows.length` at the cap means "the cap", not "the
// count" — user-context.ts's own type says a reader "cannot mistake
// rows.length for a total", and handing a model "Finance: 20 entries"
// when there are two hundred is how a report states a total nobody
// computed.
const capped = formatAccountSummary(
  [{ slug: "finance", title: "Finance", rows: Array.from({ length: 20 }, () => ({ atMs: null })) }],
  [],
  0,
  20
);
check("a module at the cap reports 'at least', never a total", capped.includes("at least 20 entries"), capped);
check("...and the cap itself is stated", capped.includes("up to 20 rows per module — not totals"), capped);
check(
  "an account with nothing in it produces no summary rather than an empty frame",
  formatAccountSummary([], [], 0, 20) === ""
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
