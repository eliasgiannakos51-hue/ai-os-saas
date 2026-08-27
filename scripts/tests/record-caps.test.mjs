// A LIST THAT IS CUT OFF AND DOES NOT SAY SO.
//
// Every module page read every row the account had ever created, with
// every column: `.select("*")` with an order and no limit. Then it
// paginated in the BROWSER — so the controls at the bottom of those pages
// never saved a byte, because everything they page through had already
// arrived. On a young account that is invisible; on a year-old one it is
// the whole table over the wire, on every visit.
//
// THE CAP IS THE EASY HALF. The dangerous half is a cap nobody mentions:
// somebody scrolls to the bottom, their oldest entry is not there, and
// they conclude the product lost it. /dashboard/form-submissions had been
// doing exactly that since it was written — 200 rows, silently, on the
// one page where a missing row is a lost customer.
//
// So this gate asserts both halves together, and neither alone.
//
// Run: node scripts/tests/record-caps.test.mjs
import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
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
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 8).join("\n        "));
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]),
);

const { loadTs } = await import("./load-ts.mjs");
const { RECORD_CAP, isCapped } = await loadTs("src/lib/record-cap.ts");

// The pages that read a whole table for a list, and the limit each uses.
const CAPPED_PAGES = [
  ["src/app/dashboard/[module]/page.tsx", "RECORD_CAP"],
  ["src/app/dashboard/page.tsx", "RECORD_CAP"],
  ["src/components/modules/build-module-page.tsx", "RECORD_CAP"],
  ["src/app/dashboard/product-workflow/page.tsx", "RECORD_CAP"],
  ["src/app/dashboard/trading-workflow/page.tsx", "RECORD_CAP"],
  ["src/app/dashboard/agents/page.tsx", "RECORD_CAP"],
  ["src/app/dashboard/mission/page.tsx", "RECORD_CAP"],
  ["src/app/dashboard/form-submissions/page.tsx", "PAGE_SIZE"],
];

console.log("== 1. the cap itself ==");
check(`RECORD_CAP is a real number (${RECORD_CAP})`, Number.isInteger(RECORD_CAP) && RECORD_CAP >= 100);
// `>=`, not `===`: a caller with a different limit, or a future page
// reading with range(), must still trip it.
check("a full page is reported as capped", isCapped({ length: RECORD_CAP }, RECORD_CAP));
check("...and so is one somehow longer", isCapped({ length: RECORD_CAP + 1 }, RECORD_CAP));
check("...but one row short is not", !isCapped({ length: RECORD_CAP - 1 }, RECORD_CAP));
check("an empty list is not capped", !isCapped({ length: 0 }, RECORD_CAP));

console.log("\n== 2. every list page reads with a limit ==");
const missingLimit = [];
const missingNotice = [];
for (const [file, capName] of CAPPED_PAGES) {
  const src = readFileSync(file, "utf8");
  if (!new RegExp(`\\.limit\\(${capName}\\)`).test(src)) missingLimit.push(`${file}: no .limit(${capName})`);
  // THE NOTICE, not just the cap. Either the page renders it directly, or
  // it hands the cap to GenericList, which renders it.
  const rendersNotice = /<ListCappedNotice/.test(src) || new RegExp(`cap=\\{${capName}\\}`).test(src);
  if (!rendersNotice) missingNotice.push(`${file}: caps but never says so`);
}
checkList(`every list page passes a limit (${CAPPED_PAGES.length} pages)`, missingLimit);
checkList("every capped page can say it is capped", missingNotice);

// GenericList is where five of them say it, so it has to actually do it.
const list = readFileSync("src/components/modules/generic-list.tsx", "utf8");
check(
  "GenericList renders the notice when the rows came back full",
  /cap !== undefined && isCapped\(records, cap\) && <ListCappedNotice cap=\{cap\} \/>/.test(list),
);

console.log("\n== 3. the sentence is true and renders in ten languages ==");
// {count, number} AND NOT A PRE-FORMATTED STRING. Earlier in this branch
// a plural was handed formatNumber(1000) — "1,000" — and ICU called
// Number() on it, printed NaN, and shipped "NaN credits/month" to four of
// five pricing plans. A number placeholder has the same trapdoor.
const notice = readFileSync("src/components/ui/list-capped-notice.tsx", "utf8");
// COMMENTS STRIPPED FIRST. The notice's own comment EXPLAINS the NaN bug
// and therefore contains the word formatNumber — this check failed on the
// prose that exists to prevent the thing it is checking for.
const noticeCode = stripComments(notice);
check(
  "the notice passes a raw number, not formatted text",
  /t\(\s*"listCapped",\s*\{\s*count: cap\s*\}\s*\)/.test(noticeCode) &&
    !/formatNumber/.test(noticeCode),
);
for (const locale of LOCALES) {
  const t = createTranslator({
    locale,
    messages: messages[locale],
    namespace: "common",
    onError: () => {},
  });
  const rendered = t("listCapped", { count: RECORD_CAP });
  const withOther = t("listCapped", { count: 1234 });
  check(
    `${locale}: renders, and the number is really in it`,
    typeof rendered === "string" &&
      rendered.length > 10 &&
      !/NaN/.test(rendered) &&
      rendered !== withOther,
    JSON.stringify(rendered),
  );
}
// And it has to be a NUMBER placeholder, or the count arrives unformatted
// in every locale that groups digits differently.
for (const locale of LOCALES) {
  check(
    `${locale}: the count goes through ICU's number format`,
    /\{count, number\}/.test(messages[locale].common.listCapped),
    messages[locale].common.listCapped,
  );
}

console.log("\n== 4. no list page is left uncapped ==");
// THE SCAN, so a page added next year is caught. Any dashboard page that
// selects every column and orders, without a limit, is reading a whole
// table for a screen.
import { readdirSync, statSync } from "node:fs";
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = `${dir}/${entry}`;
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (entry === "page.tsx") out.push(p);
  }
  return out;
}
const pages = walk("src/app/dashboard");
check(
  `the scan found the dashboard pages (${pages.length})`,
  pages.length >= 38,
  `${pages.length} — a scan that finds nothing passes`,
);
const uncapped = [];
for (const file of pages) {
  const src = readFileSync(file, "utf8");
  // A select("*") followed within a few lines by an order and no limit.
  const re = /\.select\("\*"\)[\s\S]{0,240}?;/g;
  let m;
  while ((m = re.exec(src))) {
    const stmt = m[0];
    if (!/\.order\(/.test(stmt)) continue;
    if (/\.limit\(|\.range\(|\.maybeSingle\(|\.single\(/.test(stmt)) continue;
    uncapped.push(`${file}: select("*") ordered with no limit`);
  }
}
checkList(`no dashboard page reads a whole table for a list (${pages.length} pages)`, uncapped);

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
