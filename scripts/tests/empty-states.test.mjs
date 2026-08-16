// AN EMPTY PAGE IS THE FIRST PAGE.
//
// A new account is nothing but empty pages. Twenty of them said the same
// sentence:
//
//     "No entries yet — use the button above to log your first one."
//
// which reports a fact the reader can already see and answers none of the
// questions they have. What is Decisions for? What goes in Analytics that
// is not already in Finance? What does an entry look like? Twenty modules
// with one shared sentence is twenty modules that never introduce
// themselves, and the person reading them has been in the product for
// about ninety seconds.
//
// THE BASELINE. This file counts the surfaces still answering with a
// generic message, and the number may only go DOWN. It landed at 20 and
// the work took it to 0 — which is not a coincidence but the point of
// making emptyKey REQUIRED: with no fallback and no optional field, a
// module that has not been introduced does not compile. So the assertion
// here is exact rather than "no worse than": a ratchet is the right
// instrument for a debt too big to pay at once, and this one is paid.
//
// WHAT COUNTS AS PAID. Not "has a string" — three separate things, in all
// ten locales:
//
//   title    what this page is
//   why      the one sentence that makes it worth typing into
//   example  a real first entry, which can be PRESSED to fill the form
//
// The example is the part that does the teaching, and the press is the
// part that turns reading into having started. A module that fills in the
// title and leaves the example as a copy of the title has not done the
// work, so that is checked too.
//
// Run: node scripts/tests/empty-states.test.mjs
import { readFileSync } from "node:fs";

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
function checkList(name, actual, expected) {
  check(name, actual.length === expected.length, actual.slice(0, 8).join("\n        "));
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);

const { loadTs } = await import("./load-ts.mjs");
const { MODULES, emptyStateKey } = await loadTs("src/lib/modules.ts");
const { BUILD_MODULES } = await loadTs("src/lib/build-modules.ts");
const { CLASSIFIER_MODULES } = await loadTs("src/lib/classifier-modules.ts");

// Every module that renders a list: the thirteen business modules, the
// eight Build modules, and Ideas — which has its own hand-built list but
// the same three parts, mirrored in CLASSIFIER_MODULES.
const IDEAS = CLASSIFIER_MODULES.find((m) => m.slug === "ideas");
const ALL = [...MODULES, ...BUILD_MODULES, IDEAS];

function lookup(obj, dotted) {
  return dotted.split(".").reduce((node, part) => (node == null ? undefined : node[part]), obj);
}

console.log("== 1. THE BASELINE: how many modules still say nothing ==");
// The measurement, before anything is asserted about it. A module is
// "generic" if it names no empty state of its own, or names one whose
// strings are not there — both are the same thing to the person reading
// the page.
const generic = ALL.filter((m) => {
  if (!m.emptyKey) return true;
  return ["title", "why", "example"].some(
    (part) => typeof lookup(messages.en, emptyStateKey(m, part)) !== "string"
  );
});
console.log(`        ${generic.length} of ${ALL.length} modules have no empty state of their own`);
// WAS 20. IS 0. If this ever fails upward, a module was added without
// one; if it fails downward, LOWER THE BASELINE — the number is here to
// be beaten, not defended.
const BASELINE = 0;
check(
  `no module is left with a generic empty state (${generic.length} <= ${BASELINE})`,
  generic.length <= BASELINE,
  generic.map((m) => m.slug).join(", ")
);
check(
  `the baseline is not stale (${generic.length} === ${BASELINE} — if lower, lower this number)`,
  generic.length === BASELINE
);
check(`all twenty-one list surfaces are covered (${ALL.length})`, ALL.length === 21);

console.log("\n== 2. the type is what keeps it that way ==");
// A baseline held by a test alone is held until someone adds a module on
// a Friday. This one is held by the compiler: emptyKey is required, so a
// module without one is not a failing test, it is a build error.
const modulesSrc = readFileSync("src/lib/modules.ts", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
check("emptyKey is required, not optional", /emptyKey: ModuleMessageKey;/.test(modulesSrc));
check("and cannot be plain text", !/emptyKey\?:/.test(modulesSrc) && !/emptyKey: string/.test(modulesSrc));
// The fallback is gone too. Left in, `?? "noEntries"` would make the
// required field a formality — a module could name a key that resolves to
// nothing and land back on the generic sentence without anything saying so.
const listSrc = readFileSync("src/components/modules/generic-list.tsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
check('generic-list.tsx has no "noEntries" fallback', !/noEntries/.test(listSrc));
check("it resolves the key through emptyStateKey()", /emptyStateKey\(module, "title"\)/.test(listSrc));
// Through the ROOT translator: a config carries full dotted keys, and
// t("moduleData.empty.finance.title") inside the `module` namespace
// resolves to nothing and renders the raw path to the user.
check("and through the root translator, not the module namespace", /tKey\(emptyStateKey/.test(listSrc));
// And the generic sentence itself is deleted rather than orphaned.
for (const locale of LOCALES) {
  check(
    `${locale}: the old shared sentence is gone from the catalogue`,
    messages[locale].module.noEntries === undefined
  );
}

console.log("\n== 3. all three parts, in all ten locales ==");
for (const locale of LOCALES) {
  const missing = [];
  for (const m of ALL) {
    for (const part of ["title", "why", "example"]) {
      const key = emptyStateKey(m, part);
      if (typeof lookup(messages[locale], key) !== "string") missing.push(key);
    }
  }
  checkList(`${locale}: every part resolves (${ALL.length * 3} keys)`, missing, []);
}

console.log("\n== 4. translated, not copied ==");
// check-i18n.js already refuses a value identical to English, so this
// asks the question that check cannot: whether a locale answered by
// pasting the same string into all three slots.
for (const locale of LOCALES) {
  const degenerate = [];
  for (const m of ALL) {
    const [title, why, example] = ["title", "why", "example"].map((p) =>
      lookup(messages[locale], emptyStateKey(m, p))
    );
    if (title === why || title === example || why === example) degenerate.push(m.slug);
  }
  checkList(`${locale}: no module repeats one string across the three parts`, degenerate, []);
}

console.log("\n== 5. the example is an example ==");
// The whole value of the example is that it is CONCRETE — "Advertising
// expense, €200" rather than "Add your first expense". Two things give
// that away: instructions address the reader, and specimens are short.
const IMPERATIVE = /^(add|create|log|enter|write|type|start|record|new)\b/i;
for (const locale of ["en"]) {
  const preachy = ALL.filter((m) => IMPERATIVE.test(lookup(messages[locale], emptyStateKey(m, "example"))));
  checkList(`${locale}: no example is really an instruction`, preachy, []);
}
for (const locale of LOCALES) {
  const longWinded = ALL.filter((m) => {
    const example = lookup(messages[locale], emptyStateKey(m, "example"));
    return typeof example === "string" && example.length > 70;
  }).map((m) => m.slug);
  checkList(`${locale}: every example fits on one line`, longWinded, []);
  const titles = ALL.filter((m) => {
    const title = lookup(messages[locale], emptyStateKey(m, "title"));
    return typeof title === "string" && title.length > 60;
  }).map((m) => m.slug);
  checkList(`${locale}: every title is a heading, not a sentence`, titles, []);
}
// Each module's example has to be about THAT module. Twenty copies of one
// good example is the failure mode this whole file exists to prevent, and
// it would satisfy every check above.
for (const locale of LOCALES) {
  const examples = ALL.map((m) => lookup(messages[locale], emptyStateKey(m, "example")));
  check(
    `${locale}: no two modules share an example (${new Set(examples).size}/${examples.length})`,
    new Set(examples).size === examples.length
  );
  const whys = ALL.map((m) => lookup(messages[locale], emptyStateKey(m, "why")));
  check(
    `${locale}: nor a reason to use them (${new Set(whys).size}/${whys.length})`,
    new Set(whys).size === whys.length
  );
}

console.log("\n== 6. pressing the example fills the form ==");
// An example the user can only read teaches; an example they can press
// has them started. The chain is three files long and every link has to
// be there, so each is asserted rather than the endpoints alone.
const emptyStateSrc = readFileSync("src/components/empty-state.tsx", "utf8");
check("EmptyState takes onExample", /onExample\?: \(text: string\) => void;/.test(emptyStateSrc));
check(
  "and renders the example as a BUTTON when it is given",
  /onExample \?/.test(emptyStateSrc) && /onClick=\{\(\) => onExample\(example\)\}/.test(emptyStateSrc)
);
// Without a handler the example must NOT be a button: a control that does
// nothing when pressed is worse than plain text.
check(
  "and as plain text when it is not",
  /<p\s+data-testid="empty-example"/.test(emptyStateSrc)
);
check("generic-list hands the press to the form", /onExample=\{\(text\)/.test(listSrc));
check("as a prefill with a nonce", /prefill=\{prefill\}/.test(listSrc) && /nonce: \(current\?\.nonce \?\? 0\) \+ 1/.test(listSrc));

const formSrc = readFileSync("src/components/modules/generic-add-form.tsx", "utf8");
check("the form accepts it", /prefill\?: \{ text: string; nonce: number \} \| null;/.test(formSrc));
check("opens itself", /setOpen\(true\)/.test(formSrc) && /\[nonce, module\]/.test(formSrc));
check(
  "and fills the headline field",
  /\[module\.headlineKey\]: prefill\.text/.test(formSrc)
);
// Keyed on the nonce, not the text — pressing the same example twice is
// two requests, and the second must not be swallowed as "no change".
check("keyed on the nonce so a second press still works", /const nonce = prefill\?\.nonce;/.test(formSrc));

// Ideas has its own list and its own form, so it needs its own wiring —
// the place a feature like this is quietly left half-done.
const ideasSection = readFileSync("src/components/ideas/ideas-section.tsx", "utf8");
const ideasList = readFileSync("src/components/ideas/ideas-list.tsx", "utf8");
const ideasForm = readFileSync("src/components/ideas/add-idea-form.tsx", "utf8");
check("Ideas is wired the same way", /onExample=\{\(text\)/.test(ideasSection));
check("its list offers the example", /tIdeas\("empty\.example"\)/.test(ideasList));
check("and its form fills in the name", /name: prefill\.text/.test(ideasForm));

console.log("\n== 7. the two surfaces that are not modules ==");
// Files and Integrations are lists too, and a new account sees both. They
// were answering "you have no files" and "you have connected nothing"
// with the SEARCH message — telling a first-time user that their empty
// account is a failed query.
const files = readFileSync("src/components/files/files-workspace.tsx", "utf8");
check(
  "Files answers an empty account, not a failed search",
  /files\.length === 0 \?/.test(files) && /emptyTitle/.test(files)
);
const integrations = readFileSync("src/components/integrations/integrations-list.tsx", "utf8");
check(
  "Integrations does too",
  /connectedCount === 0/.test(integrations) && /t\("emptyTitle"\)/.test(integrations)
);
// No example on Integrations, on purpose: the next step is an OAuth round
// trip, not a form. An EmptyState offering a specimen to press there
// would be a button with nowhere to put the text.
check(
  "and offers no example, because there is no form to fill",
  !/example=/.test(integrations)
);
for (const locale of LOCALES) {
  const t = messages[locale].dashboard.integrations;
  check(
    `${locale}: Integrations says what connecting gets you`,
    typeof t.emptyTitle === "string" && typeof t.emptyBody === "string"
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
