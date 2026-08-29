// EVERY NUMBER ON SCREEN, AND WHETHER IT EXPLAINS ITSELF.
//
// V4.6 #7. A number with a two-word label is a number the reader guesses
// at: "This week" of what, counted how, since when, out of how many. So
// each metric carries a line saying what it counts, a basis saying what
// it was computed from, and a link to the records behind it.
//
// AND IT HAS TO BE WRITTEN THE WAY THE READER'S LANGUAGE WRITES NUMBERS.
// Measured on the real sample account before this existed: a stored 95.6
// printed as "95.6" on the module card, where Greek writes "95,60 €", and
// the billing panel printed "€11920.00" where Greek writes "11.920,00 €".
// A hardcoded "€" in front of toFixed(2) is right in one of the ten
// languages this app ships.
//
// THE PLURAL TRAP IS CHECKED HERE TOO, because it is the mistake this
// branch already made once: an ICU plural formats its own `#`, so handing
// it formatNumber() passes a STRING, and Number("1,000") is NaN. The
// message prints NaN. scripts/tests/plural-forms.test.mjs owns the
// general rule; this file checks the metrics added for #7 specifically.
//
// Run: node scripts/tests/metric-clarity.test.mjs
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
const lookup = (obj, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);

const { formatCurrency, formatNumber } = await loadTs("src/lib/format-number.ts");

// ---------------------------------------------------------------------
console.log("== 1. money is written the way each language writes money ==");
// EXECUTED, not read. The point of this section is that the output is
// right, and only running it can say so.
const EXPECTED = {
  en: "€95.60",
  el: "95,60 €",
  de: "95,60 €",
  fr: "95,60 €",
};
for (const [locale, want] of Object.entries(EXPECTED)) {
  const got = formatCurrency(95.6, locale);
  // Intl uses a narrow no-break space in some locales; compare on the
  // characters that carry meaning rather than on the whitespace.
  const norm = (s) => s.replace(/[\s  ‏]/g, " ").trim();
  check(`${locale}: 95.6 -> "${got}"`, norm(got) === norm(want), `wanted "${want}"`);
}
check(
  "Greek does not use the English form",
  formatCurrency(95.6, "el") !== formatCurrency(95.6, "en"),
  "both locales format identically, so the locale argument is doing nothing"
);
check(
  `grouping is applied: 11920 -> "${formatCurrency(11920, "el")}"`,
  /11.920/.test(formatCurrency(11920, "el")),
  formatCurrency(11920, "el")
);

console.log("\n== 2. and it ends the float question ==");
// The brief asks whether "7.700000000000001" appears anywhere. The honest
// answer is that no call site can promise it does not — a binary float
// reaches the screen through any template string — so the fix is that
// money and counts do not go through template strings at all.
const NASTY = [0.1 + 0.2, 7.7000000000000015, 1.005 * 3, 2.675 * 2];
for (const n of NASTY) {
  const out = formatCurrency(n, "el");
  check(
    `${n} -> "${out}" (no float tail)`,
    !/\d{6,}/.test(out.replace(/[.,]/g, "")) && out.split(/[,.]/).pop().replace(/\D/g, "").length <= 2,
    out
  );
}
check(
  `formatNumber rounds too: ${0.1 + 0.2} -> "${formatNumber(0.1 + 0.2, "el")}"`,
  !/0{6,}|9{6,}/.test(formatNumber(0.1 + 0.2, "el")),
  formatNumber(0.1 + 0.2, "el")
);
check(
  "a non-finite amount is a dash, not NaN",
  formatCurrency(Number.NaN, "el") === "—" && formatCurrency(Infinity, "el") === "—",
  `${formatCurrency(Number.NaN, "el")} / ${formatCurrency(Infinity, "el")}`
);
// THE REASON THE GROUPING OPTION IS THERE, asserted so it cannot be
// dropped as noise: without it the output depends on which CLDR the
// runtime embeds, and server and browser disagree.
const fmtSrc = readFileSync("src/lib/format-number.ts", "utf8");
check(
  "formatCurrency pins useGrouping, like formatNumber",
  /style: "currency"[\s\S]{0,120}?useGrouping: "always"/.test(fmtSrc),
  "without it Node and Chromium disagree on four-digit amounts and the page re-hydrates"
);

console.log("\n== 3. every money field says it is money ==");
const { MODULES } = await loadTs("src/lib/modules.ts");
const { BUILD_MODULES } = await loadTs("src/lib/build-modules.ts");
const allFields = [...MODULES, ...BUILD_MODULES].flatMap((m) =>
  m.fields.map((f) => ({ ...f, slug: m.slug }))
);
check(`the field scan found fields (${allFields.length})`, allFields.length >= 40);
// A KEY THAT LOOKS LIKE MONEY AND IS NOT MARKED. The list is the point:
// the next module with a `price` column is the one that would have been
// rendered as a bare number.
const MONEYISH = /^(amount|price|cost|revenue|value|budget|pnl|total|spend|fee)$/;
const unmarked = allFields.filter((f) => MONEYISH.test(f.key) && f.type === "number" && !f.money);
check(
  "no number field with a money-shaped key is unmarked",
  unmarked.length === 0,
  unmarked.map((f) => `${f.slug}.${f.key}`).join(", ")
);
const marked = allFields.filter((f) => f.money);
check(`and ${marked.length} fields are marked`, marked.length >= 4, marked.map((f) => `${f.slug}.${f.key}`).join(", "));
// The other direction: a marked field must actually be a number, or the
// currency formatter is handed a string.
const misMarked = marked.filter((f) => f.type !== "number");
check("every marked field is a number field", misMarked.length === 0, misMarked.map((f) => f.key).join(", "));

console.log("\n== 4. the record cards format rather than interpolate ==");
const cardSrc = stripComments(readFileSync("src/components/modules/generic-record-card.tsx", "utf8"));
check(
  "the tag value goes through a formatter",
  /displayValue\(field, record\[field\.key\], locale\)/.test(cardSrc),
  "the raw stored value reaches the template string"
);
check(
  "...and the raw interpolation is gone",
  !/\$\{record\[field\.key\]\}/.test(cardSrc),
  "the old unformatted path is still there"
);
check(
  "money and plain numbers take different routes",
  /field\.money \? formatCurrency\([\s\S]{0,40}?: formatNumber\(/.test(cardSrc),
  "a lead score would be rendered as euros, or an amount as a bare number"
);

console.log("\n== 5. every metric on Home explains itself ==");
const overviewSrc = stripComments(readFileSync("src/app/dashboard/overview/page.tsx", "utf8"));
const statCards = (overviewSrc.match(/<HomeStatCard\b/g) ?? []).length;
const creditCards = (overviewSrc.match(/<CreditsHomeStat\b/g) ?? []).length;
const metrics = statCards + creditCards;
console.log(`        ${metrics} metrics in the Home stat row`);
check(`the scan found the metrics (${metrics})`, metrics >= 3);
// THE BRIEF'S LIMIT: at most five metrics on one screen.
check(`${metrics} metrics, limit 5`, metrics <= 5, String(metrics));
const explains = (overviewSrc.match(/explain=\{/g) ?? []).length;
check(
  `all ${metrics} carry an explain line (${explains})`,
  explains === metrics,
  `${explains} of ${metrics}`
);
// `explain` being a REQUIRED prop is what makes the next card impossible
// to add without one; the compiler enforces it, and this says so out loud
// so the requirement is not quietly relaxed to optional.
const statCardSrc = readFileSync("src/components/overview/home-stat-card.tsx", "utf8");
check(
  "explain is required, not optional",
  /\n  explain: string;/.test(statCardSrc),
  "an optional explanation is the one the next card does not get"
);
check(
  "the line renders under the number, not in a tooltip",
  /\{explain\}<\/p>/.test(statCardSrc),
  "a hover does not exist on a phone and is absent while reading"
);

console.log("\n== 6. and opens the records behind it ==");
const hrefs = [...overviewSrc.matchAll(/href=\{?"([^"]+)"/g)].map((m) => m[1]);
const linked = (overviewSrc.match(/href=/g) ?? []).length;
check(`${linked} of the metrics link somewhere`, linked >= 3, String(linked));
check(
  "the entry counts open the timeline",
  hrefs.includes("/dashboard/timeline") && hrefs.some((h) => h.startsWith("/dashboard/timeline?range=")),
  hrefs.join(", ")
);
// THE DESTINATION HAS TO ACCEPT THE FILTER. A link carrying ?range=week
// to a page that ignores it is a link that lies about what it will show.
const { TIMELINE_RANGES } = await loadTs("src/lib/timeline.ts");
const rangeParam = hrefs.find((h) => h.includes("range="))?.split("range=")[1];
check(
  `the timeline really accepts range=${rangeParam}`,
  TIMELINE_RANGES.includes(rangeParam),
  `${rangeParam} is not one of ${TIMELINE_RANGES.join(", ")}`
);
const timelineSrc = readFileSync("src/app/dashboard/timeline/page.tsx", "utf8");
check(
  "...and reads a module filter from the query too",
  /searchParams\.module/.test(timelineSrc),
  "the most-active card links to ?module= and the page ignores it"
);

console.log("\n== 7. the explanations exist in all ten languages ==");
const KEYS = [
  "totalEntriesExplain", "thisWeekExplain", "mostActiveExplain", "creditsExplain",
  "ofTotal", "fromEntries", "openEntries", "openCredits",
];
for (const key of KEYS) {
  const missing = LOCALES.filter(
    (l) => typeof lookup(messages[l], `dashboard.overview.statRow.${key}`) !== "string"
  );
  check(`statRow.${key} in all 10`, missing.length === 0, missing.join(", "));
}
// AND THE TWO PLURALS ARE HANDED NUMBERS, NOT STRINGS. This is the
// mistake this branch made once already, in voice-player.tsx: an ICU
// plural picks its category with Number(), formatNumber(1000) is "1,000",
// and Number("1,000") is NaN.
for (const key of ["ofTotal", "fromEntries"]) {
  check(
    `statRow.${key} is a plural`,
    /\{count, plural,/.test(String(lookup(messages.en, `dashboard.overview.statRow.${key}`))),
    String(lookup(messages.en, `dashboard.overview.statRow.${key}`))
  );
}
const pluralCalls = [...overviewSrc.matchAll(/statRow\.(ofTotal|fromEntries)", \{ count: ([^}]+) \}/g)];
check(`both plural call sites were found (${pluralCalls.length})`, pluralCalls.length === 2);
const formatted = pluralCalls.filter((m) => /format(Number|Currency)/.test(m[2]));
check(
  "neither plural is handed a formatted string",
  formatted.length === 0,
  formatted.map((m) => m[0]).join(" | ") + " — Number(\"1,000\") is NaN and the message prints NaN"
);

console.log("\n== 8. green and red mean something ==");
const reflectionSrc = stripComments(
  readFileSync("src/components/reflection/reflection-generator.tsx", "utf8")
);
check(
  "the week comparison has a neutral state",
  /"up" \| "down" \| "flat"/.test(reflectionSrc),
  "a two-state comparison has to put 'equal' on one side, and both answers are wrong"
);
check(
  "two empty weeks are not a win",
  /totalThisWeek === 0 && stats\.totalLastWeek === 0[\s\S]{0,40}?"flat"/.test(reflectionSrc),
  'this was `thisWeek >= lastWeek ? emerald : red`, so 0 and 0 rendered a green up-arrow'
);
check(
  "...and equal is not a win either",
  !/totalThisWeek >= stats\.totalLastWeek/.test(reflectionSrc),
  "the >= is back: the same number two weeks running reads as an improvement"
);
check(
  "flat is uncoloured",
  /weekTone === "up"[\s\S]{0,160}?text-muted/.test(reflectionSrc),
  "colour on every comparison is colour that means nothing on any of them"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
