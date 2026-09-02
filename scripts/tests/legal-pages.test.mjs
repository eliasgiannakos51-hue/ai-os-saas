#!/usr/bin/env node
/*
 * THE THREE PAGES THAT WERE WRITTEN, FINISHED, AND NEVER REACHABLE.
 *
 * /acceptable-use, /ai-transparency and /contact were written on
 * 2026-08-08 on a branch, and on 2026-09-02 production still answered
 * 404 for all three. Measured, not inferred:
 *
 *     $ curl -o /dev/null -w '%{http_code}' .../ai-transparency
 *     404
 *
 * Four weeks. Nothing anywhere said they were missing, because "a page
 * that does not exist" has no file to fail a check and no string to fail
 * check-i18n. The absence was invisible by construction.
 *
 * So this gate is built the other way round: from the LIST OF LINKS the
 * product promises (lib/footer-links.ts), it demands a route on disk and
 * a label in all ten locales. Add a link, and the gate starts requiring
 * the page. Delete the page, and the gate goes red while the link is
 * still there.
 *
 * ------------------------------------------------------------------
 * WHY THE HEADING GETS ITS OWN SECTION
 * ------------------------------------------------------------------
 *
 * Because production was serving, on the same day, in every language:
 *
 *     <h1 class="mt-4 text-2xl font-bold ...">privacy_policy</h1>
 *
 * LegalLayout took `title: string` and rendered it. Its callers passed
 * "privacy_policy", "terms_of_service", "cookie_policy". The TAB was
 * correct — generateMetadata goes through a real catalogue key — so
 * anybody checking the title bar saw a translated page. Section 4 asserts
 * the property that was actually violated: every titleKey a legal page
 * passes must RESOLVE, in all ten locales, and none of them may be a
 * snake_case literal.
 *
 * ------------------------------------------------------------------
 * ar AND zh ARE NAMED, NOT COUNTED
 * ------------------------------------------------------------------
 *
 * A loop over ten locales that reports "10/10" is satisfied by ten
 * English strings. The two that break first are the right-to-left one and
 * the one with no Latin characters, so they are asserted by name as well
 * as in the sweep.
 *
 * Run: node scripts/tests/legal-pages.test.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
/**
 * A FAILURE DETAIL IS FOR A HUMAN, SO IT IS BOUNDED.
 *
 * Found by mutation, not by review. Defanging at() below makes it return
 * the whole message catalogue, and one check prints the value it got —
 * so a single FAIL line became ~180KB of JSON, ten of them blew past
 * execFileSync's 1MB maxBuffer in legal-pages.mutation.mjs, and the
 * process was killed BEFORE it printed its "Failures:" summary.
 *
 * The runner reads that summary to learn which check caught the mutant.
 * With no summary it recorded "the gate went red, but on nothing" — a
 * gate that was working perfectly, reported as a survivor, because its
 * own diagnostics were too loud to be read. A verbose instrument is an
 * unreadable one.
 */
const DETAIL_MAX = 300;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    const d = detail == null ? "" : String(detail);
    const shown = d.length > DETAIL_MAX ? `${d.slice(0, DETAIL_MAX)}… (+${d.length - DETAIL_MAX} chars)` : d;
    console.log(`  FAIL  ${name}${shown ? "\n        " + shown : ""}`);
  }
}

const LOCALES = ["ar", "de", "el", "en", "es", "fr", "it", "ja", "pt", "zh"];
const msg = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);

// ---------------------------------------------------------------------
console.log("== 0. the sweep is actually sweeping ten languages ==");
// ---------------------------------------------------------------------
// EVERY "in all ten (10/10)" BELOW IS RELATIVE TO THIS ARRAY. Shorten it
// to ["en"] and every one of them still reports a perfect score, in the
// form "(1/1)", while nine languages go unchecked — a gate that has
// stopped working and says so in a number nobody reads as suspicious.
// Found by mutating this file, not by reasoning about it.
const onDisk = readdirSync("messages")
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();
// THE FLOOR FIRST. `onDisk.every(...)` is satisfied by an empty onDisk,
// so a readdirSync that returned nothing — wrong cwd, renamed directory —
// would pass the coverage check below while comparing against nothing.
// scripts/tests/gate-vacuity.test.mjs is what named this; it is a real
// hole, not a formality.
check(`messages/ was read and holds locale files (${onDisk.length})`, onDisk.length >= 10);
check(
  `the sweep covers every locale file on disk (${LOCALES.length} vs ${onDisk.length})`,
  LOCALES.length >= 10 && LOCALES.length === onDisk.length && onDisk.every((l) => LOCALES.includes(l)),
  `on disk: ${onDisk.join(", ")}\n        swept:   ${[...LOCALES].sort().join(", ")}`
);
// Named, because "ten of ten" is also what ten English files report.
check("…and zh and ar are among them", LOCALES.includes("zh") && LOCALES.includes("ar"));

/** A dotted path, or undefined. Never throws on a missing branch. */
function at(root, dotted) {
  return dotted.split(".").reduce((node, key) => (node == null ? undefined : node[key]), root);
}

/** Locales where `dotted` is not a usable string. */
function missingIn(dotted, min = 1) {
  return LOCALES.filter((l) => {
    const v = at(msg[l], dotted);
    return typeof v !== "string" || v.trim().length < min;
  });
}

/**
 * A MISSING FILE IS A FAILING CHECK, NOT A STACK TRACE.
 *
 * The first version of this gate called readFileSync and loadTs directly.
 * Run against the tree as it was before these pages existed, it did not
 * report "the page is missing" — it threw ENOENT out of section 1 and
 * printed nothing else. Two things were wrong with that, and the second
 * is the serious one:
 *
 *   The exit code was still 1, so CI would have been red. Fine.
 *
 *   But scripts/tests/run-mutations.mjs identifies which check caught a
 *   mutant by parsing "  - <name>" lines out of this gate's output. A
 *   crash prints none, so EVERY mutant would have looked caught by the
 *   same nothing — a mutation suite reporting a perfect score while
 *   testing one code path. The instrument would have been lying about
 *   itself, which is worse than the gap it was measuring.
 */
function readOrNull(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** loadTs, degraded to `{}` so a missing module fails checks by name. */
async function loadOrEmpty(file) {
  try {
    return await loadTs(file);
  } catch (err) {
    console.log(`  (could not load ${file}: ${String(err && err.message).slice(0, 100)})`);
    return {};
  }
}

/** The route file Next would serve for `href`, or null. */
function routeFileFor(href) {
  for (const ext of ["tsx", "ts"]) {
    const p = `src/app${href}/page.${ext}`;
    if (existsSync(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------
console.log("== 1. the footer's links all lead somewhere ==");
// ---------------------------------------------------------------------
const { FOOTER_LINKS = [], LEGAL_AND_SUPPORT_LINKS = [] } = await loadOrEmpty("src/lib/footer-links.ts");

check("lib/footer-links.ts exports a non-empty FOOTER_LINKS", Array.isArray(FOOTER_LINKS) && FOOTER_LINKS.length > 0);

const THE_THREE = ["/acceptable-use", "/ai-transparency", "/contact"];
for (const href of THE_THREE) {
  check(`${href} is in the footer`, FOOTER_LINKS.some((l) => l.href === href));
}

const routeless = FOOTER_LINKS.filter((l) => !routeFileFor(l.href));
check(
  `every footer link has a route on disk (${FOOTER_LINKS.length - routeless.length}/${FOOTER_LINKS.length})`,
  routeless.length === 0,
  routeless.map((l) => l.href).join(", ")
);

// The other direction. A page can exist and be linked from nowhere, which
// is the exact state these three were in for four weeks.
for (const href of THE_THREE) {
  check(`${href} exists as a page`, routeFileFor(href) !== null);
}

// ---------------------------------------------------------------------
console.log("\n== 2. …and every link has a label in all ten locales ==");
// ---------------------------------------------------------------------
for (const link of FOOTER_LINKS) {
  const dotted = `landing.${link.labelKey}`;
  const gone = missingIn(dotted);
  check(
    `${link.href} → ${dotted} in all ten (${LOCALES.length - gone.length}/10)`,
    gone.length === 0,
    gone.join(", ")
  );
}

// NAMED, not counted. Ten English strings would satisfy the sweep above.
for (const href of THE_THREE) {
  const link = FOOTER_LINKS.find((l) => l.href === href);
  if (!link) continue;
  for (const locale of ["zh", "ar"]) {
    const v = at(msg[locale], `landing.${link.labelKey}`);
    const en = at(msg.en, `landing.${link.labelKey}`);
    check(
      `${href} label in ${locale} is not the English string`,
      typeof v === "string" && v.trim().length > 0 && v !== en,
      `${locale}=${JSON.stringify(v)} en=${JSON.stringify(en)}`
    );
  }
}

// ---------------------------------------------------------------------
console.log("\n== 2b. …and a crawler is told they exist ==");
// ---------------------------------------------------------------------
// MEASURED AGAINST PRODUCTION, not assumed. On 2026-09-02 the live
// sitemap.xml listed five URLs — "", /pricing, /help, /terms, /privacy —
// for an app with eight public pages. /cookies and /roadmap had been in
// the landing footer for weeks and were in neither sitemap.ts nor
// robots.ts, because both kept their own hand-written copy of "the
// public pages". The three added here would have made it five missing.
//
// Both now map over FOOTER_LINKS, so this asserts the derivation is
// still there rather than re-listing the routes a third time — a third
// list is how there came to be two that disagreed.
const sitemapSrc = readOrNull("src/app/sitemap.ts") ?? "";
const robotsSrc = readOrNull("src/app/robots.ts") ?? "";
check("the sitemap derives its own pages from the footer list", /FOOTER_LINKS\.map\(/.test(sitemapSrc));
check("…and so does robots.txt", /FOOTER_LINKS\.map\(/.test(robotsSrc));
check(
  "the sitemap still carries the two public pages that are NOT in the footer",
  /"",\s*"\/help"/.test(sitemapSrc),
  "the home page and /help have no footer entry, so mapping the footer alone would drop them"
);

// ---------------------------------------------------------------------
console.log("\n== 3. the pages are reachable from inside the app too ==");
// ---------------------------------------------------------------------
// The footer belongs to the landing page, which a signed-in user has no
// reason to visit again. An Article 50 disclosure reachable only from a
// marketing page is not reachable.
check(
  "LEGAL_AND_SUPPORT_LINKS covers all three",
  THE_THREE.every((href) => LEGAL_AND_SUPPORT_LINKS.some((l) => l.href === href)),
  LEGAL_AND_SUPPORT_LINKS.map((l) => l.href).join(", ")
);
const settings = readOrNull("src/app/dashboard/settings/page.tsx") ?? "";
check("the settings page imports the list", /LEGAL_AND_SUPPORT_LINKS/.test(settings));
check(
  "…and renders it, rather than importing it unused",
  /LEGAL_AND_SUPPORT_LINKS\.map\(/.test(settings)
);
for (const dotted of ["settings.legalLinks.title", "settings.legalLinks.description"]) {
  const gone = missingIn(dotted);
  check(`${dotted} in all ten (${LOCALES.length - gone.length}/10)`, gone.length === 0, gone.join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== 4. the heading is a translation, not the key ==");
// ---------------------------------------------------------------------
const layout = readOrNull("src/components/legal/legal-layout.tsx") ?? "";
check("LegalLayout resolves its title through next-intl", /getTranslations/.test(layout));
check("…and renders t(titleKey), not the raw prop", /\{t\(titleKey\)\}/.test(layout));

// Every legal page's titleKey, read from the pages themselves.
const LEGAL_PAGES = [
  "src/app/terms/page.tsx",
  "src/app/privacy/page.tsx",
  "src/app/cookies/page.tsx",
  "src/app/acceptable-use/page.tsx",
  "src/app/ai-transparency/page.tsx",
];
let titleKeysFound = 0;
for (const file of LEGAL_PAGES) {
  check(`${file} exists`, existsSync(file));
  if (!existsSync(file)) continue;
  const src = readOrNull(file) ?? "";

  // The bug, stated as a property: a snake_case literal in the title slot.
  check(
    `${file} passes no snake_case title literal`,
    !/<LegalLayout[^>]*\btitle=["'][a-z]+_[a-z_]+["']/s.test(src),
    "this is exactly what shipped privacy_policy to production"
  );

  const m = src.match(/titleKey=["']([^"']+)["']/);
  check(`${file} passes a titleKey`, m !== null);
  if (!m) continue;
  titleKeysFound++;
  const gone = missingIn(m[1]);
  check(
    `  …${m[1]} resolves in all ten (${LOCALES.length - gone.length}/10)`,
    gone.length === 0,
    gone.join(", ")
  );
}
check(`all ${LEGAL_PAGES.length} legal pages were actually read`, titleKeysFound === LEGAL_PAGES.length,
  `found ${titleKeysFound}`);

// The chrome the layout renders itself.
for (const dotted of ["legal.lastUpdated", "legal.draftNotice", "legal.factualNotice", "legal.backHome"]) {
  const gone = missingIn(dotted);
  check(`${dotted} in all ten (${LOCALES.length - gone.length}/10)`, gone.length === 0, gone.join(", "));
}
check(
  `legal.lastUpdated carries the {date} placeholder in all ten (over ${LOCALES.length})`,
  LOCALES.length >= 10 &&
    LOCALES.every((l) => String(at(msg[l], "legal.lastUpdated") ?? "").includes("{date}")),
  LOCALES.filter((l) => !String(at(msg[l], "legal.lastUpdated") ?? "").includes("{date}")).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 5. /ai-transparency does not carry the retracted claims ==");
// ---------------------------------------------------------------------
// Five statements in the August draft had stopped being true. A
// transparency page is the one page where a stale sentence does real
// harm, so each is asserted gone BY ITS OWN WORDS — a claim that comes
// back in a copy-paste is caught, and the reason it was removed is
// recorded next to the assertion rather than in a commit message.
const transparency = readOrNull("src/app/ai-transparency/page.tsx");
check("the ai-transparency page can be read at all", transparency !== null);
// Only the rendered body: the header comment records the retractions on
// purpose and must not be mistaken for the claims themselves.
const body = transparency === null ? "" : transparency.slice(transparency.indexOf("<LegalLayout"));
const RETRACTED = [
  {
    claim: /shown in your usage history in Settings/,
    why: "ai-usage-settings.tsx has no model column; /dashboard/routing and /dashboard/costs both notFound() for non-admins",
  },
  {
    claim: /How this was made/,
    why: "that string occurs nowhere in this repository — the panel was never built",
  },
  {
    claim: /writes slides with cited sources/,
    why: 'build-modules.ts: "a CRUD tracker … with no AI call anywhere in it"',
  },
  {
    claim: /No second model reviews the content/,
    why: "website-security-review.ts IS a second model call — this was my own wrong correction, caught here",
  },
  {
    claim: /via the Anthropic API\b/,
    why: "the catalogue lists four providers; section 2 now says which are on",
  },
];
for (const { claim, why } of RETRACTED) {
  check(`retracted: ${claim.source}`, !claim.test(body), why);
}

// And the replacements are present, so "removed" cannot be satisfied by
// deleting the section.
for (const [what, re] of [
  ["the four providers are named", /OpenAI|Gemini|Groq/],
  ["…and which are actually on", /only one switched on by default/i],
  ["the static scan is named as the thing that blocks", /not published/],
  ["the model review is named as the thing that does not", /second opinion, not a gate/],
  ["Presentation notes is described as using no AI", /use no AI at all/],
  ["the two features added since August are covered", /AI Coding/],
  ["the unmarked-published-sites gap is stated", /machine-readable marking/],
]) {
  check(what, re.test(body));
}

// ---------------------------------------------------------------------
console.log("\n== 6. /contact says what state the mailer is in ==");
// ---------------------------------------------------------------------
const route = readOrNull("src/app/api/contact/route.ts");
const page = readOrNull("src/app/contact/page.tsx");
check("the contact API route exists", route !== null);
check("the contact page exists", page !== null);

// THE LINE resend-config.ts EXISTS TO DELETE. `RESEND_FROM_EMAIL || "…"`
// makes "no verified sender" and "configured" the same code path.
check(
  "the route does not re-implement the FROM fallback",
  !/RESEND_FROM_EMAIL\s*\|\|/.test(route ?? ""),
  "that || is what turns the shared test sender into a silent state"
);
check("the route reads senderStatus()", /senderStatus\(\)/.test(route ?? ""));
check("…and takes its FROM from senderAddress()", /senderAddress\(\)/.test(route ?? ""));

// The state rides on every answer, success included — a caller must not
// have to provoke an error to learn that mail is not configured.
const responses = [...(route ?? "").matchAll(/NextResponse\.json\(\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);
const silent = responses.filter((r) => !/senderStatus/.test(r));
check(
  `every response carries senderStatus (${responses.length - silent.length}/${responses.length})`,
  responses.length > 0 && silent.length === 0,
  silent.map((s) => s.trim().slice(0, 60)).join(" | ")
);
check("no_key is answered 503, not 200", /status:\s*503/.test(route ?? ""));

// The page renders three different things, and on no_key it renders NO
// form: a form that cannot send takes a person's words and their
// expectation of an answer, and produces nothing.
check("the page branches on the sender state", /senderStatus\(\)/.test(page ?? ""));
check('…and renders no form when there is no key', /status === "no_key" \?/.test(page ?? ""));
check("…and marks the form degraded on the shared test sender", /degraded=\{status === "test_sender"\}/.test(page ?? ""));

const form = readOrNull("src/components/contact/contact-form.tsx");
check("the contact form component exists", form !== null);
check("the success message is hedged when degraded", /sentDegraded/.test(form ?? ""));

// The design tokens. bg-bg and text-fg are not colours this app has, and
// a class that does not exist renders as no styling rather than as an
// error.
for (const [file, src] of [["contact page", page ?? ""], ["contact form", form ?? ""]]) {
  check(`${file} uses tokens that exist`, !/\b(?:bg-bg|text-fg|btn-primary)\b/.test(src));
}

for (const dotted of [
  "contact.title", "contact.intro", "contact.send", "contact.sent", "contact.sentDegraded",
  "contact.privacyNote", "contact.outage.titleNoKey", "contact.outage.bodyNoKey",
  "contact.outage.titleTestSender", "contact.outage.bodyTestSender",
  "contact.outage.helpInstead", "contact.outage.noFormExplanation",
]) {
  const gone = missingIn(dotted);
  check(`${dotted} in all ten (${LOCALES.length - gone.length}/10)`, gone.length === 0, gone.join(", "));
}
for (const locale of ["zh", "ar"]) {
  check(
    `contact.outage.bodyTestSender in ${locale} is not the English string`,
    at(msg[locale], "contact.outage.bodyTestSender") !== at(msg.en, "contact.outage.bodyTestSender")
  );
}

// ---------------------------------------------------------------------
console.log("\n== 7. senderStatus, run rather than grepped ==");
// ---------------------------------------------------------------------
// The three states are the whole design, so they are exercised on real
// environments instead of being asserted about as text.
const { senderStatus, senderAddress } = await loadOrEmpty("src/lib/email/resend-config.ts");
check("resend-config exports senderStatus and senderAddress",
  typeof senderStatus === "function" && typeof senderAddress === "function");
const status = typeof senderStatus === "function" ? senderStatus : () => "<not loaded>";
const address = typeof senderAddress === "function" ? senderAddress : () => "";
const KEY = "re_" + "x".repeat(20);
check('no key            → "no_key"', status({}) === "no_key");
check('key, no FROM      → "test_sender"', status({ RESEND_API_KEY: KEY }) === "test_sender");
check(
  'key, blank FROM   → "test_sender"',
  status({ RESEND_API_KEY: KEY, RESEND_FROM_EMAIL: "   " }) === "test_sender"
);
check(
  'key, real FROM    → "ok"',
  status({ RESEND_API_KEY: KEY, RESEND_FROM_EMAIL: "Ionexa <hi@ionexa.example>" }) === "ok"
);
check(
  "the FROM with no variable set is the shared test sender",
  address({}).includes("resend.dev")
);

// ---------------------------------------------------------------------
console.log(`\n${failures.length === 0 ? "OK" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failures.length === 0 ? 0 : 1);
