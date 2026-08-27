// WHAT THE PAGE WILL NOT DO FOR YOU.
//
// A page description says what something is for. It never says where the
// edge is, and the edge is where users get hurt. Somebody expects
// Published Sites to hand them a domain. Somebody expects an agent to
// send mail on their behalf. Somebody expects Integrations to be able to
// reply to an email, or AI Memory to hold their chat history. Every one of
// those is a reasonable thing to assume from the name, and every one is
// wrong.
//
// This codebase has already paid for that once: Presentation Notes was
// renamed because "Presentations" promised a slide generator the module
// does not contain, and presentation-notes.test.mjs exists to keep the
// promise gone. The "?" makes that lesson routine — `doesNot` is a
// required third part, not a nice-to-have, and every entry in
// lib/help-tips.ts records the specific wrong assumption it corrects.
//
// SELF-CONTAINED ON PURPOSE. lib/support/knowledge-base.ts has 27 articles
// whose hrefs already point at most of these pages, and linking to them
// would have been the obvious move. It is written entirely in Greek, and
// /help renders that to all ten locales — so a "?" that linked there
// would send nine languages to text they cannot read. The tips carry
// their own copy and wait for nothing; see TODO.md.
//
// Run: node scripts/tests/help-tips.test.mjs
import { existsSync, readFileSync } from "node:fs";

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
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 6).join("\n        "));
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(`messages/${l}.json`, "utf8")),
  ]),
);
function lookup(obj, dotted) {
  return dotted
    .split(".")
    .reduce((node, part) => (node == null ? undefined : node[part]), obj);
}

const { loadTs } = await import("./load-ts.mjs");
const { HELP_TIPS, helpTipKey } = await loadTs("src/lib/help-tips.ts");
const PARTS = ["is", "does", "doesNot"];

console.log("== 1. the registry describes real pages ==");
// A RATCHET, NOT AN EQUALITY. This read `=== 13` and went red the moment a
// fourteenth page got a tip — a test that fails on the improvement it exists
// to encourage. The number only ever goes up; what it protects is the scan,
// which is one property rename away from finding nothing.
//
// 12 -> 13: Settings joined when a second branch put a contextual "?" on it —
// the one page where the wrong assumption is expensive, somebody reading
// "Delete account" as a way to clear their records and start again.
// 13 -> 15: trackingModule (one entry covering the six pages that render
// through BuildModulePage, where "Images" reads as a generator) and costs.
check(
  `pages carrying a tip (${HELP_TIPS.length})`,
  HELP_TIPS.length >= 15,
  `${HELP_TIPS.length} — this floor rises with each page that gains one, and never falls`,
);
checkList(
  "every entry names a file that exists",
  HELP_TIPS.filter((t) => !existsSync(t.file)).map((t) => t.file),
);
check(
  "no two entries share an id",
  new Set(HELP_TIPS.map((t) => t.id)).size === HELP_TIPS.length,
);
check(
  "no two entries share a key prefix",
  new Set(HELP_TIPS.map((t) => t.keyPrefix)).size === HELP_TIPS.length,
);

console.log("\n== 2. all three parts, in all ten locales ==");
for (const locale of LOCALES) {
  const missing = [];
  for (const tip of HELP_TIPS) {
    for (const part of PARTS) {
      if (typeof lookup(messages[locale], helpTipKey(tip, part)) !== "string") {
        missing.push(helpTipKey(tip, part));
      }
    }
  }
  checkList(
    `${locale}: every part resolves (${HELP_TIPS.length * 3} keys)`,
    missing,
  );
}
// The aria-label is the only text a screen-reader user gets for the icon.
for (const locale of LOCALES) {
  check(
    `${locale}: the button has a translated label`,
    typeof messages[locale].common.whatIsThisPage === "string",
  );
}

console.log("\n== 3. doesNot actually says NOT ==");
// The failure mode this file exists to prevent: `doesNot` quietly filled
// in with more of what the page DOES, which is how a limit stops being
// stated. Checked in English against a negation, and in every locale
// against being a copy of one of its siblings.
const NEGATION =
  /\b(does not|do not|doesn't|don't|is not|are not|never|no |not )\b/i;
const noNegation = HELP_TIPS.filter(
  (t) => !NEGATION.test(lookup(messages.en, helpTipKey(t, "doesNot"))),
);
checkList(
  "en: every doesNot states a limit",
  noNegation.map((t) => t.id),
);
for (const locale of LOCALES) {
  const degenerate = [];
  for (const tip of HELP_TIPS) {
    const [is, does, doesNot] = PARTS.map((p) =>
      lookup(messages[locale], helpTipKey(tip, p)),
    );
    if (is === does || is === doesNot || does === doesNot)
      degenerate.push(tip.id);
  }
  checkList(
    `${locale}: no tip repeats one string across its three parts`,
    degenerate,
  );
}
// And each page says something different from every other page.
for (const locale of LOCALES) {
  for (const part of PARTS) {
    const values = HELP_TIPS.map((t) =>
      lookup(messages[locale], helpTipKey(t, part)),
    );
    check(
      `${locale}: no two pages share the same "${part}" (${new Set(values).size}/${values.length})`,
      new Set(values).size === values.length,
    );
  }
}
// Every entry has to record WHAT wrong assumption it is correcting, in
// prose — so the next person editing the copy knows what it is
// load-bearing for and does not soften it into nothing.
checkList(
  "every entry records the assumption it corrects",
  HELP_TIPS.filter(
    (t) => typeof t.corrects !== "string" || t.corrects.length < 25,
  ).map((t) => t.id),
);

console.log("\n== 4. the claims match the code ==");
// A "?" that lies is worse than no "?" at all, so the load-bearing claims
// are checked against the source they describe rather than trusted.
//
// Integrations: providers.ts is the authority on what a connection can do.
const providers = readFileSync("src/lib/integrations/providers.ts", "utf8");
check(
  "gmail really is read-only",
  /id: "gmail"[\s\S]{0,400}?access: "read"/.test(providers),
);
check(
  "google drive really is read-only",
  /google_drive"[\s\S]{0,400}?access: "read"/.test(providers),
);
check(
  "slack really is the read-write one",
  /slack"[\s\S]{0,400}?access: "read_write"/.test(providers),
);
// Published: subdomain.ts says the URL is path-based until a wildcard
// domain exists, which is exactly what help.published.doesNot claims.
const subdomain = readFileSync("src/lib/publishing/subdomain.ts", "utf8");
check(
  "published sites really are path-based today",
  /Path-based today/.test(subdomain),
);
// Files: extract.ts refuses a scan by name.
const extract = readFileSync("src/lib/files/extract.ts", "utf8");
// The help tip promises "a scan needs OCR". The wording moved: the
// message used to say "probably a scan" for BOTH a missing text layer and
// a font we could not decode, and the second of those is not a scan and is
// not fixed by OCR — it was every browser-, Word- and LaTeX-written PDF,
// told to go find an OCR tool. The claim the tip makes is still true of
// the case it describes, so this now pins that case by its own words.
check(
  "a scanned PDF really is refused, and OCR named",
  /no text layer[\s\S]{0,120}OCR/.test(extract),
);
check(
  "...and a font we cannot decode is NOT called a scan",
  /font encoding could not be decoded/.test(extract) &&
    !/probably a scan/.test(extract),
);
check("extraction really is capped", /MAX_EXTRACTED_CHARS/.test(extract));
// Agents: the run handler says it emails the result and costs credits.
const agentRun = readFileSync("src/lib/jobs/handlers/agent-run.ts", "utf8");
check(
  "an agent run really emails the result and costs credits",
  /it costs credits, emails the result/.test(agentRun),
);
// AI Memory: the page reads module tables, not conversations. This is the
// claim that was wrong in the first version of the memory empty state, so
// it is the one pinned hardest.
const memoryPage = readFileSync("src/app/dashboard/memory/page.tsx", "utf8");
check(
  "AI Memory really reads the module tables",
  /CLASSIFIER_MODULES/.test(memoryPage) && /BUILD_MODULES/.test(memoryPage),
);
// Scoped to the page's DATA ACCESS, not the whole file: the page now
// carries helpArticle="chat-memory", which contains the word "chat" and
// is a link to an article, not a conversation being read. The claim being
// checked is about what it queries.
check(
  "and touches no conversation at all",
  !/from\(["'`](chat|messages|conversations)/i.test(memoryPage) &&
    !/chat_messages|chat_conversations/.test(memoryPage),
);
for (const locale of LOCALES) {
  const empty = messages[locale].dashboard.memory.empty;
  check(
    `${locale}: the memory empty state no longer claims Chat writes it`,
    typeof empty.why === "string" && !/chat/i.test(empty.why),
  );
}

console.log("\n== 5. the pages render it ==");
// ON EVERY <PageHeader> THE PAGE HAS, not on one of them.
//
// THIS CHECK USED TO BE `src.includes(helpKey="...")` AND IT PASSED WHILE
// THE FEATURE WAS BACKWARDS. Four of these pages render two headers: one
// inside the `if (!isAdmin && cap <= 0)` branch — the upgrade wall — and
// one for the working screen. The helpKey was on the upgrade wall alone,
// so the "?" appeared only for people who cannot use the feature and was
// absent for everyone who can. A substring search cannot see that; it
// found the one occurrence and reported the page as done.
//
// Counting is what makes the claim honest: a tip on n-1 of n headers now
// fails, and the failure names the file.
for (const tip of HELP_TIPS) {
  const src = readFileSync(tip.file, "utf8");
  const headers = (src.match(/<PageHeader\b/g) ?? []).length;
  const withKey = (
    src.match(new RegExp(`helpKey="${tip.keyPrefix}"`, "g")) ?? []
  ).length;
  check(`${tip.id}: its page passes helpKey`, withKey > 0, tip.file);
  check(
    `${tip.id}: on all ${headers} of its headers, not just the upgrade wall`,
    withKey === headers,
    `${withKey} of ${headers} <PageHeader> carry it — ${tip.file}`,
  );
}
const header = readFileSync("src/components/dashboard/page-header.tsx", "utf8");
// One place, so the control never moves between pages — a help affordance
// that moves is one users stop looking for.
check(
  "PageHeader is where the tip lives",
  /helpKey && <HelpTip helpKey=\{helpKey\}/.test(header),
);
check(
  "and it stays optional, so untouched pages are unchanged",
  /helpKey\?: string;/.test(header),
);

console.log("\n== 6. it behaves like a popover, not a tooltip ==");
const tip = readFileSync("src/components/ui/help-tip.tsx", "utf8");
// Three paragraphs on a phone: hover cannot open it and moving away must
// not close it. That means click to open, and three ways out.
check("it opens on press", /onClick=\{\(\) => setOpen/.test(tip));
check("Escape closes it", /event\.key !== "Escape"/.test(tip));
check("a press outside closes it", /pointerdown/.test(tip));
check(
  "and it has a close button too",
  /aria-label=\{tCommon\("close"\)\}/.test(tip),
);
// Focus has to come back, or a keyboard user is dropped at the top of the
// document with no idea where they were.
check(
  "focus returns to the button that opened it",
  /buttonRef\.current\?\.focus\(\)/.test(tip),
);
check("the panel is announced as a dialog", /role="dialog"/.test(tip));
check("the button reports its state", /aria-expanded=\{open\}/.test(tip));
// Listeners only while open — a page full of headers should not carry
// listeners for a panel nobody opened.
check(
  "listeners are bound only while it is open",
  /if \(!open\) return;/.test(tip),
);
// 375px. The first attempt clamped the width with `calc(100vw-2rem)`,
// which is not valid CSS — calc needs spaces around the minus, written
// `_-_` in a Tailwind arbitrary value — so the declaration was dropped
// and the panel took its natural width. A screenshot run measured
// document.scrollWidth > clientWidth and caught it.
//
// Two things are asserted as a result. First that no arbitrary value in
// this file contains a calc with an unspaced operator, which is the class
// of bug rather than the instance. Second that the small-screen layout is
// pinned to both edges, which cannot overflow however wide the content.
const BAD_CALC = /\[[^\]]*calc\([^)]*[a-z0-9%)]-[a-z0-9(]/i;
check("no arbitrary value hides an invalid calc", !BAD_CALC.test(tip));
check(
  "on a phone the panel is pinned to both edges",
  /fixed inset-x-4/.test(tip),
);
check(
  "and anchors under the button only from sm up",
  /sm:absolute[\s\S]{0,80}sm:w-80/.test(tip),
);

console.log("\n== 7. it answers on its own, and links on as an extra ==");
// THIS SECTION USED TO ASSERT THE OPPOSITE, and the flip is the record of
// why. When the tips were written the 27 Help Centre articles were string
// literals in knowledge-base.ts, all in Greek, rendered by /help to every
// locale — so a "?" linking there would have sent nine languages to text
// they could not read, and this file asserted that it linked nowhere.
//
// The articles are rows in help_articles now, one per locale, and /help
// falls back to English visibly. So the link is allowed — but only as an
// EXTRA. The three parts still have to answer on their own, because three
// of the thirteen pages have no article at all and because a tip that needs
// a round trip to be useful is not a tip.
const linkedTips = HELP_TIPS.filter((t) => t.article);
check(
  `${linkedTips.length} of ${HELP_TIPS.length} tips link to an article`,
  linkedTips.length === 9,
);
check(
  "the link is an anchor on /help, not the page itself",
  /\/help#\$\{articleSlug\}/.test(tip),
);
check(
  "and renders only when there is an article",
  /articleSlug && \(/.test(tip),
);
for (const t of HELP_TIPS) {
  check(
    `${t.id}: says what it does NOT do without following any link`,
    typeof lookup(messages.en, helpTipKey(t, "doesNot")) === "string",
  );
}
// The gap this used to guard is closed, and TODO.md records that rather
// than silently dropping the entry.
const todo = readFileSync("TODO.md", "utf8");
check(
  "TODO.md records the Help Centre migration as done",
  /Done: Help Centre migration/.test(todo),
);
check(
  "and still names what is left",
  /fall back to English|falls back to English/i.test(todo),
);

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
