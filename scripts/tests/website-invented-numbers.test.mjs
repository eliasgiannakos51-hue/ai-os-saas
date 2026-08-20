// "Το site έβγαλε νούμερα που δεν του έδωσα" — the check that can see it.
//
// The prompt has always said "never invent a phone number, a price, an
// opening time". It said so while the sites were coming back with invented
// phone numbers, so the prompt was never the guarantee — it was the
// request. findInventedNumbers is the guarantee: it reads the generated
// page and the user's own brief and reports every number on the page that
// the brief does not contain.
//
// The bias it must hold in BOTH directions is what this file measures:
//   - a number the user gave must NEVER be reported (a false accusation
//     trains the owner to ignore the list, and then the list is worthless)
//   - a number the user did not give must ALWAYS be reported
//
// Run: node scripts/tests/website-invented-numbers.test.mjs
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

const { findInventedNumbers } = await loadTs("src/lib/website-invented-numbers.ts");

const page = (body) => `<!doctype html><html><head><title>T</title></head><body>${body}</body></html>`;
const kinds = (html, brief) => findInventedNumbers(html, brief).map((s) => s.kind);
const texts = (html, brief) => findInventedNumbers(html, brief).map((s) => s.text);

// ---------------------------------------------------------------------------
console.log("== 1. a number that came from nowhere is caught, by kind ==");
// One brief, deliberately free of digits, so every number below is
// unambiguously the model's own invention.
const BRIEF = "A bakery in Thessaloniki. Warm, family-run, sourdough.";

const invented = [
  ["phone", "<p>Call us on +30 2310 555 123</p>"],
  ["phone", "<p>Tel: (0030) 231 0555123</p>"],
  ["price", "<p>Sourdough loaf — €4.50</p>"],
  ["price", "<p>From 12.00 EUR</p>"],
  ["time", "<p>Open 09:00 – 21:00</p>"],
  ["address", "<p>25 Ermou Street, Thessaloniki</p>"],
  ["address", "<p>Λεωφόρος Νίκης 42</p>"],
  ["stat", "<p>98% of our customers come back</p>"],
  ["stat", "<p>5.000+ loaves baked</p>"],
  ["stat", "<p>Serving 12.000 families</p>"],
  ["stat", "<p>15 years of experience</p>"],
  ["stat", "<p>Postcode 54622</p>"],
];
for (const [kind, body] of invented) {
  const got = findInventedNumbers(page(body), BRIEF);
  check(
    `${kind}: ${body.replace(/<[^>]*>/g, "").trim()}`,
    got.length > 0 && got.some((s) => s.kind === kind),
    `got ${JSON.stringify(got)}`
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 2. a number the USER gave is never reported ==");
// Same numbers, this time present in the brief — sometimes formatted
// differently, which is how a real user writes them.
const given = [
  ["+30 2310 555 123", "our number is 2310555123"],
  ["+30 2310 555 123", "call 0030 2310 555 123"],
  ["€4.50", "a loaf costs 4,50 euro"],
  ["09:00 – 21:00", "we open 9:00 and close 21:00"],
  ["09:00", "open from 9.00"],
  ["25 Ermou Street", "we are at 25 Ermou Street"],
  ["98% of customers return", "98% of customers return"],
  ["5.000+ loaves", "we have baked 5000 loaves"],
  ["15 years of experience", "15 years in business"],
  ["Postcode 54622", "Thessaloniki 54622"],
];
for (const [body, brief] of given) {
  const got = findInventedNumbers(page(`<p>${body}</p>`), brief);
  check(`"${body}" with brief "${brief}"`, got.length === 0, `got ${JSON.stringify(got)}`);
}

// ---------------------------------------------------------------------------
console.log("\n== 3. the brief's own numbers cannot be used as an alibi ==");
// The first version of this file matched a page number against a brief
// number by substring in EITHER direction. That meant a bare "5" anywhere
// in the brief silently excused every phone number containing a 5 — which
// is most of them. This is that bug, as a test.
check(
  "a lone digit in the brief does not excuse an invented phone",
  kinds(page("<p>+30 2310 555 123</p>"), "a bakery with 5 tables").includes("phone"),
  JSON.stringify(findInventedNumbers(page("<p>+30 2310 555 123</p>"), "a bakery with 5 tables"))
);
check(
  "a two-digit number in the brief does not excuse an invented price",
  kinds(page("<p>€45</p>"), "we bake 5 kinds of bread").includes("price")
);
check(
  "the year in a brief does not excuse an invented postcode",
  kinds(page("<p>54622</p>"), "founded in 2015").includes("stat")
);
check(
  "but a phone WITH prefix is still excused by the same phone WITHOUT it",
  findInventedNumbers(page("<p>+30 2310 555 123</p>"), "ring 2310555123").length === 0
);

// ---------------------------------------------------------------------------
console.log("\n== 4. an opening-hours RANGE in the brief covers each end ==");
// "10:00-18:00" typed as one token must satisfy a page that prints "18:00"
// on its own, or the site's real hours get reported as invented.
check(
  "range in brief, one end on the page",
  findInventedNumbers(page("<p>Mon–Fri 18:00</p>"), "open 10:00-18:00").length === 0,
  JSON.stringify(findInventedNumbers(page("<p>Mon–Fri 18:00</p>"), "open 10:00-18:00"))
);
check(
  "range in brief, both ends on the page",
  findInventedNumbers(page("<p>10:00 – 18:00</p>"), "open 10:00-18:00").length === 0
);
check(
  "a THIRD time, not in the range, is still caught",
  kinds(page("<p>Sunday 07:30</p>"), "open 10:00-18:00").includes("time")
);

// ---------------------------------------------------------------------------
console.log("\n== 5. things a reader never sees are not facts ==");
const brief5 = "a bakery";
check(
  "CSS lengths in a <style> block",
  findInventedNumbers(page("<style>.a{padding:24px;width:1440px;line-height:1.55}</style><p>Bread</p>"), brief5)
    .length === 0
);
check(
  "constants in a <script> block",
  findInventedNumbers(page("<script>const N=10000;const P=49.99;</script><p>Bread</p>"), brief5).length === 0
);
check(
  "an inline style attribute",
  findInventedNumbers(page(`<div style="max-width:1200px;gap:32px"><p>Bread</p></div>`), brief5).length === 0
);
check(
  "an SVG path",
  findInventedNumbers(page(`<svg viewBox="0 0 1024 1024"><path d="M512 128L896 512"/></svg><p>Bread</p>`), brief5)
    .length === 0
);
check(
  "an HTML entity",
  findInventedNumbers(page("<p>Bread &#8212; fresh &mdash; daily</p>"), brief5).length === 0
);
check(
  "an HTML comment",
  findInventedNumbers(page("<!-- generated in 1200ms, 45000 tokens --><p>Bread</p>"), brief5).length === 0
);
check(
  "a class name that happens to hold digits",
  findInventedNumbers(page(`<div class="grid-cols-12 pt-24 text-[64px]"><p>Bread</p></div>`), brief5).length === 0
);

// ---------------------------------------------------------------------------
console.log("\n== 5b. the boundaries the mutation run found untested ==");
// Four survivors of the mutation run below had no test standing over them.
// Each of these is that missing test, written against the behaviour the
// code already has, so the behaviour cannot be removed unnoticed.
const twoPrices = findInventedNumbers(page("<p>4.50 12.00</p>"), "a bakery");
check(
  `two adjacent numbers are two suspects, not one long phone (${JSON.stringify(twoPrices.map((s) => s.text))})`,
  twoPrices.length === 2 && twoPrices.every((s) => s.kind !== "phone"),
  JSON.stringify(twoPrices)
);
check(
  "a big number in a tag ATTRIBUTE is not a fact on the page",
  findInventedNumbers(page(`<img src="x.jpg" width="1600" height="900" alt="Bread"><p>Bread</p>`), "a bakery")
    .length === 0
);
check(
  "…but a tel: link IS, even when its label says 'Call us'",
  kinds(page(`<a href="tel:+302310555123">Call us</a>`), "a bakery").includes("phone"),
  JSON.stringify(findInventedNumbers(page(`<a href="tel:+302310555123">Call us</a>`), "a bakery"))
);
check(
  "a long number in the brief does not excuse a SHORT invented one inside it",
  kinds(page("<p>€55</p>"), "call 2310555123").includes("price"),
  JSON.stringify(findInventedNumbers(page("<p>€55</p>"), "call 2310555123"))
);
check(
  "the brief's numbers are read at every grouping, not only whole tokens",
  findInventedNumbers(page("<p>Open until 18:00</p>"), "hours 10:00-18:00 daily").length === 0
);

// ---------------------------------------------------------------------------
console.log("\n== 6. a placeholder is the CORRECT behaviour, not a fake ==");
// This is what the builder is told to do when it has no number: leave a
// slot the owner fills in. Reporting it would punish the right answer.
for (const body of [
  "<p>Call us on [+30 210 1234567]</p>",
  "<p>Open [09:00 – 17:00]</p>",
  "<p>{{ +30 2310 000000 }}</p>",
  "<p>[YOUR PHONE]</p>",
]) {
  check(`placeholder not reported: ${body.replace(/<[^>]*>/g, "").trim()}`,
    findInventedNumbers(page(body), "a bakery").length === 0,
    JSON.stringify(findInventedNumbers(page(body), "a bakery")));
}
check(
  "…but a real number NEXT TO a placeholder still is",
  kinds(page("<p>[YOUR ADDRESS] — call +30 2310 555 123</p>"), "a bakery").includes("phone")
);

// ---------------------------------------------------------------------------
console.log("\n== 7. a year is a year, not a claim ==");
for (const year of ["1998", "2015", "2026", "2099"]) {
  check(
    `© ${year} is not reported`,
    findInventedNumbers(page(`<p>© ${year} Bakery</p>`), "a bakery").length === 0,
    JSON.stringify(findInventedNumbers(page(`<p>© ${year} Bakery</p>`), "a bakery"))
  );
}
check("…but 1899 is out of the year window and IS reported", kinds(page("<p>1899</p>"), "a bakery").includes("stat"));
check("…and 2101 is too", kinds(page("<p>2101</p>"), "a bakery").includes("stat"));
check(
  "a year-shaped number with a claim marker is still a claim",
  kinds(page("<p>2000+ customers</p>"), "a bakery").includes("stat")
);

// ---------------------------------------------------------------------------
console.log("\n== 8. the same number is reported once, not once per pattern ==");
const dup = findInventedNumbers(
  page("<p>€4.50</p><p>Also 4.50 EUR</p><p>and again €4,50</p>"),
  "a bakery"
);
check(`one entry for one number (${dup.length})`, dup.length === 1, JSON.stringify(dup));

// ---------------------------------------------------------------------------
console.log("\n== 9. it reports the text as the reader sees it ==");
const t = texts(page("<p>Call +30 2310 555 123 today</p>"), "a bakery");
check(`the reported text is findable on the page (${JSON.stringify(t)})`, t.some((x) => x.includes("2310")));

// ---------------------------------------------------------------------------
console.log("\n== 10. a clean page produces an empty list ==");
// Nothing to report is the normal outcome; a detector that always finds
// something is noise, and noise gets ignored.
const clean = page(`
  <h1>Sourdough, every morning</h1>
  <p>We bake slowly, in Thessaloniki, with flour milled nearby.</p>
  <a href="/contact">Get in touch</a>
  <p>© 2026 Bakery</p>
`);
check("no suspects on a page with no numbers", findInventedNumbers(clean, "a bakery in Thessaloniki").length === 0,
  JSON.stringify(findInventedNumbers(clean, "a bakery in Thessaloniki")));

// ---------------------------------------------------------------------------
console.log("\n== 11. the same brief, ten pages: only the invented ones fire ==");
// A cross-product rather than a sample: each of the five kinds, present in
// the brief and absent from it, and the verdict must flip on exactly that.
const matrix = [
  ["phone", "+30 2310 555 123", "call +30 2310 555 123"],
  ["price", "€4.50", "a loaf is €4.50"],
  ["time", "08:30", "we open 08:30"],
  ["address", "25 Ermou Street", "find us at 25 Ermou Street"],
  ["stat", "98%", "98% come back"],
];
for (const [kind, onPage, briefWithIt] of matrix) {
  const withBrief = findInventedNumbers(page(`<p>${onPage}</p>`), briefWithIt);
  const without = findInventedNumbers(page(`<p>${onPage}</p>`), "a bakery in Thessaloniki");
  check(
    `${kind}: silent when given, loud when not`,
    withBrief.length === 0 && without.length > 0,
    `given -> ${JSON.stringify(withBrief)} ; not given -> ${JSON.stringify(without)}`
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 12. it is wired into the generator, not just written ==");
const { readFileSync } = await import("node:fs");
const route = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
check("the generate route imports it", /from "@\/lib\/website-invented-numbers"/.test(route));
check("…and calls it on the generated html", /findInventedNumbers\(/.test(route));

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`
);
if (failures.length) process.exit(1);
