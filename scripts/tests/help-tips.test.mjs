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
// This codebase has already paid for that once: Presentation notes was
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
import { existsSync, readdirSync, readFileSync } from "node:fs";

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
// 15 -> 28: the thirteen pages that had a PageHeader and no "?" — every
// remaining one. businessModule is the second shared entry, covering the
// twelve business modules and Ideas.
// 28 -> 31: Chat, Create Studio and Overview, which render no PageHeader
// on purpose and mount the tip at a control of their own instead.
check(
  `pages carrying a tip (${HELP_TIPS.length})`,
  HELP_TIPS.length >= 31,
  `${HELP_TIPS.length} — this floor rises with each page that gains one, and never falls`,
);
// EVERY PAGE WITH A HEADER, or a written reason why not. The floor above
// says the number never falls; this says the number is the right one — a
// new dashboard page with a title and no "?" fails here on the day it is
// written, rather than a year later when somebody counts.
//
// The three exemptions are the pages that render no <PageHeader> at all:
// Chat is a full-viewport workspace, Create Studio draws its own centred
// hero, and Overview opens with a personal greeting. They carry the "?"
// somewhere else, and helpKey is not how they get it.
const dashboardPages = [];
(function walkPages(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walkPages(full);
    else if (entry.name === "page.tsx") dashboardPages.push(full);
  }
})("src/app/dashboard");
const withHeader = dashboardPages.filter((f) =>
  /<PageHeader\b/.test(readFileSync(f, "utf8")),
);
const covered = new Set(HELP_TIPS.flatMap((t) => [t.file, ...(t.alsoIn ?? [])]));
// A SCAN THAT FINDS NOTHING PASSES EVERY CHECK BUILT ON IT. This floor is
// what stops the walk above from going blind — a broken recursion, a
// renamed file convention, a moved app directory — and reporting "every
// page carries a tip" over an empty list.
check(
  `the scan found the dashboard pages (${dashboardPages.length} files, ${withHeader.length} with a header)`,
  dashboardPages.length >= 38 && withHeader.length >= 28,
  `${dashboardPages.length} pages / ${withHeader.length} headers — both floors rise, neither falls`,
);
checkList(
  `every page with a header carries a tip (${withHeader.length} headers)`,
  withHeader.filter((f) => !covered.has(f)),
);
// AND THE PAGES THAT RENDER NO HEADER AT ALL, which is where this check
// was blind: a page with no PageHeader was simply not in the list, so
// Chat, Create Studio and Overview — the three a confused person opens
// first — could have had no answer anywhere and nothing would have said
// so.
//
// A page with no header is covered one of three ways, and the third is
// the only one that is a judgement call, so it is written down with its
// reason rather than left as an absence.
const NO_HEADER_EXEMPT = new Map([
  [
    "src/app/dashboard/documents/[id]/page.tsx",
    "one open document, not a feature: its name is whatever the person typed, and the Documents list that got them here carries the tip",
  ],
]);
const noHeader = dashboardPages.filter((f) => !withHeader.includes(f));
const routed = new Set(HELP_TIPS.map((t) => t.route).filter(Boolean));
const uncoveredNoHeader = noHeader.filter(
  (f) =>
    !routed.has(f) &&
    !/<BuildModulePage\b/.test(readFileSync(f, "utf8")) &&
    !NO_HEADER_EXEMPT.has(f),
);
checkList(
  `every page without a header is answered too (${noHeader.length} pages)`,
  uncoveredNoHeader,
);
// An exemption that stops being true is worse than no exemption: it reads
// as a decision somebody made about the page as it is now.
checkList(
  "no exemption is stale",
  [...NO_HEADER_EXEMPT.keys()].filter(
    (f) => !existsSync(f) || /<PageHeader\b/.test(readFileSync(f, "utf8")),
  ),
);
checkList(
  "every entry names a file that exists",
  HELP_TIPS.flatMap((t) => [t.file, ...(t.alsoIn ?? []), ...(t.route ? [t.route] : [])]).filter(
    (f) => !existsSync(f),
  ),
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
//
// CONTAINMENT, NOT JUST EQUALITY. This compared the three parts with ===
// and a mutation walked straight past it: paste the whole of `does` in
// front of `doesNot` and the strings are not equal, while the limit has
// been buried under a repeat of what the page already said — which is
// precisely the failure this check exists for. One part wholly inside
// another is the same defect as one part equal to another.
for (const locale of LOCALES) {
  const degenerate = [];
  for (const tip of HELP_TIPS) {
    const parts = PARTS.map((p) => lookup(messages[locale], helpTipKey(tip, p)));
    for (let a = 0; a < parts.length; a++) {
      for (let b = 0; b < parts.length; b++) {
        if (a === b) continue;
        if (parts[a].includes(parts[b])) {
          degenerate.push(`${tip.id} (${PARTS[b]} is repeated inside ${PARTS[a]})`);
        }
      }
    }
  }
  checkList(
    `${locale}: no tip repeats one string across its three parts`,
    [...new Set(degenerate)],
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

// --- the thirteen added in this batch -------------------------------------
//
// Same rule as above: every load-bearing number or refusal in the copy is
// read back out of the source it describes. A "?" that lies is worse than
// no "?" at all, and these carry more specific numbers than the first
// fifteen did.
const affiliateRules = readFileSync("src/lib/affiliate/rules.ts", "utf8");
check(
  "affiliate: commission really runs twelve months",
  /COMMISSION_MONTHS = 12\b/.test(affiliateRules),
);
check(
  "affiliate: the rate really is 25%",
  /DEFAULT_RATE = 0\.25\b/.test(affiliateRules),
);
check(
  "affiliate: the payout floor really is 20 euro",
  /MIN_PAYOUT_CENTS = 2000\b/.test(affiliateRules),
);
check(
  "affiliate: self-referral and re-referral really are refused",
  /Refer yourself/.test(affiliateRules) &&
    /already someone else's referral/.test(affiliateRules),
);
// Coding: the four refusals the tip repeats are the four the page itself
// prints, so they cannot drift apart into two different lists.
const codingLimits = messages.en.coding.limits;
for (const limit of [
  "no_repository",
  "no_execution",
  "no_commits",
  "no_whole_project",
]) {
  check(
    `coding: the page states ${limit}`,
    typeof codingLimits[limit] === "string",
  );
}
check(
  "coding: and there really are five operations",
  Object.keys(messages.en.coding.operations).length === 5,
);
// Data analysis: the tip promises the first 50,000 rows, by that number.
const csv = readFileSync("src/lib/data-analysis/csv.ts", "utf8");
check(
  "dataAnalysis: the row cap really is 50,000",
  /MAX_ROWS = 50_000\b/.test(csv),
);
check(
  "dataAnalysis: and truncation is reported rather than hidden",
  /truncated: truncated \|\| body\.length > MAX_ROWS/.test(csv),
);
// Documents: "nothing here is read for chat answers" is the claim, and it
// is a claim about ABSENCE — which nothing but a scan of the callers can
// establish. Every file that reads user_documents is listed; the tip is
// true only while that list contains no chat or AI-context path.
const documentReaders = [];
(function walkSrc(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walkSrc(full);
    else if (/\.tsx?$/.test(entry.name)) {
      if (/from\(["'`]user_documents["'`]\)/.test(readFileSync(full, "utf8"))) {
        documentReaders.push(full);
      }
    }
  }
})("src");
const CHAT_PATHS = /\/(chat|ai\/context|memory)\b/;
checkList(
  `documents: no chat or memory path reads user_documents (${documentReaders.length} readers)`,
  documentReaders.filter((f) => CHAT_PATHS.test(f)),
);
// The three owner-only pages say "Owner only" in ten languages. Each one
// has to actually refuse, and to refuse with notFound rather than a
// message that confirms the page exists.
for (const [id, file] of [
  ["finance", "src/app/dashboard/finance/page.tsx"],
  ["routing", "src/app/dashboard/routing/page.tsx"],
  ["systemHealth", "src/app/dashboard/system-health/page.tsx"],
]) {
  const src = readFileSync(file, "utf8");
  check(
    `${id}: really is owner-only, and 404s rather than explaining`,
    /isAdminEmail\(user\.email\)\) notFound\(\)/.test(src),
  );
}
// Finance: "a metric missing an input says what it needs" — metrics.ts is
// the authority, and the page renders MetricCard from its states.
const metrics = readFileSync("src/lib/billing/metrics.ts", "utf8");
check(
  "finance: a metric without its input really reports what it needs",
  /needs/i.test(metrics) && /computeMetrics/.test(metrics),
);
// Routing: the empty table says so in words rather than rendering zeros.
check(
  "routing: an empty table really says so instead of showing zeros",
  /it is not showing zeros/.test(messages.en.routing.empty),
);
// Trading: the disclaimer is mounted and cannot be dismissed, which is
// what lets the tip say "a record, not advice" and be checkable.
const disclaimer = readFileSync(
  "src/components/trading/trading-disclaimer.tsx",
  "utf8",
);
check(
  "tradingJournal: the disclaimer really is not dismissible",
  /Neither is dismissible/.test(disclaimer) && !/onDismiss|setDismissed/.test(disclaimer),
);
// Trading and product workflow both claim "the same rows as the module",
// which is true only while they read the module's own table through
// getModule rather than a table of their own.
//
// THE TABLE, NOT THE SLUG. The first version of this check compared the
// page's .from() against the module SLUG and passed for Products by
// coincidence — products/products — while failing Trading, whose slug is
// "trading" and whose table is "trades". Reading the table out of
// MODULES is both correct and stricter: a page that started reading some
// other table would now be caught whatever it was called.
const { MODULES } = await loadTs("src/lib/modules.ts");
for (const [id, file, slug] of [
  ["tradingWorkflow", "src/app/dashboard/trading-workflow/page.tsx", "trading"],
  ["productWorkflow", "src/app/dashboard/product-workflow/page.tsx", "products"],
]) {
  const src = readFileSync(file, "utf8");
  const table = MODULES.find((m) => m.slug === slug)?.table;
  check(
    `${id}: really reads the ${slug} module's own rows (${table})`,
    Boolean(table) &&
      new RegExp(`getModule\\("${slug}"\\)`).test(src) &&
      new RegExp(`from\\("${table}"\\)`).test(src),
  );
}
// Reflection: "nothing here is stored" — the page has no table of its
// own, so nothing in it may insert.
const reflectionPage = readFileSync(
  "src/app/dashboard/reflection/page.tsx",
  "utf8",
);
check(
  "reflection: the page really persists nothing",
  !/\.insert\(|\.upsert\(/.test(reflectionPage),
);
// businessModule: one tip for twelve modules plus Ideas. If MODULES grows
// or shrinks the copy's "one kind of work" is still true, but the two
// files it names must stay the two that render them.
check(
  `businessModule: [module] really serves the business modules (${MODULES.length})`,
  MODULES.length >= 12,
);
const businessTip = HELP_TIPS.find((t) => t.id === "businessModule");
check(
  "businessModule: and Ideas is named as the second file",
  (businessTip?.alsoIn ?? []).includes("src/app/dashboard/page.tsx"),
);

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
// AND ON EVERY FILE THAT RENDERS IT. businessModule is served by two
// separate page files with no shared body ([module] for the twelve
// business modules, dashboard/page.tsx for Ideas), so checking `file`
// alone would pass while Ideas quietly lost its "?" — the same shape as
// the upgrade-wall bug above, one level up.
for (const tip of HELP_TIPS) {
  for (const path of [tip.file, ...(tip.alsoIn ?? [])]) {
    const src = readFileSync(path, "utf8");
    const headers = (src.match(/<PageHeader\b/g) ?? []).length;
    const withKey = (
      src.match(new RegExp(`helpKey="${tip.keyPrefix}"`, "g")) ?? []
    ).length;
    check(`${tip.id}: ${path} passes helpKey`, withKey > 0, path);
    if (headers === 0) {
      // A DIRECT MOUNT. Three components carry the "?" themselves because
      // their pages render no shared header on purpose. "On all of its
      // headers" cannot say anything about a file with none — it would
      // read 0 === 0 and pass over a tip that had been deleted — so the
      // claim here is the one that is actually true: mounted once, on the
      // component, as <HelpTip>.
      check(
        `${tip.id}: ${path} mounts the tip itself, exactly once`,
        withKey === 1 && /<HelpTip\b/.test(src),
        `${withKey} occurrences, <HelpTip> ${/<HelpTip\b/.test(src) ? "present" : "ABSENT"} — ${path}`,
      );
    } else {
      check(
        `${tip.id}: on all ${headers} of its headers in ${path}`,
        withKey === headers,
        `${withKey} of ${headers} <PageHeader> carry it — ${path}`,
      );
    }
  }
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
// THE 28px MARGIN BOX IS LOAD-BEARING FOR THREE PAGES.
//
// Chat, Create Studio and Overview mount this control inside a row that
// already exists — a 36px control bar, a 32px heading line, a 40-61px
// hero — and each of those pages claims "nothing moves" only because the
// button's 44px hit area is cancelled by a negative margin on every side.
// Drop the -m-2 and all three rows grow by 16px at once, in the three
// places a confused person looks first.
check(
  "the 44px hit area is still cancelled to a 28px box",
  /-m-2 flex h-11 w-11/.test(tip),
);
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
// EXTRA. The three parts still have to answer on their own, because most
// of these pages have no article at all — nineteen of the twenty-eight —
// and because a tip that needs a round trip to be useful is not a tip.
const linkedTips = HELP_TIPS.filter((t) => t.article);
// A CEILING THAT MOVES, not an equality: writing an article for a page
// that has none is an improvement, and this used to go red on it. What is
// worth pinning is that a tip never claims an article that does not exist,
// which is the check below it.
check(
  `${linkedTips.length} of ${HELP_TIPS.length} tips link to an article`,
  linkedTips.length >= 9,
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
