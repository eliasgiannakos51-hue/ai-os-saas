// A COUNTED-UP NUMBER ENDS ON THE NUMBER THAT WAS FORMATTED.
//
// src/lib/leading-number.ts (for src/hooks/use-count-up.ts) reads the number back out of a string that
// formatNumber already wrote in the reader's locale, and counts up to it.
// It stripped commas only, so Greek "10.000" — ten thousand — was read as
// 10, and the Activity page's credits card ended on 10 under a header
// that said 10.000 (site audit screenshots, design D.11, 2026-10-04).
// The parser is run here against what formatNumber really writes, in all
// ten locales.
//
// Run: node scripts/tests/count-up.test.mjs
import { loadTs } from "./load-ts.mjs";

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

const { splitLeadingNumber } = await loadTs("src/lib/leading-number.ts");
const { formatNumber } = await loadTs("src/lib/format-number.ts");

console.log("== 1. every locale's own grouping reads back as the same integer ==");
const LOCALES = ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
for (const n of [7, 1234, 10000, 1234567]) {
  for (const l of LOCALES) {
    const shown = formatNumber(n, l);
    const parts = splitLeadingNumber(shown);
    // A locale with its own digits (Arabic) is not counted up at all and
    // renders as written, which is correct; what must never happen is a
    // DIFFERENT number.
    check(`${l}: ${JSON.stringify(shown)} reads as ${n}, or as itself`, parts === null || parts.number === n, JSON.stringify(parts));
  }
}
check('Greek "10.000" is ten thousand', splitLeadingNumber("10.000")?.number === 10000);
check('English "10,000" is ten thousand', splitLeadingNumber("10,000")?.number === 10000);

console.log("\n== 2. what is not a grouped integer is left alone ==");
check('"1.5" is not counted up (a decimal, or ambiguous)', splitLeadingNumber("1.5") === null);
check('"12,34" is not counted up', splitLeadingNumber("12,34") === null);
check('"1,234.567" — grouping AND a decimal — is not counted up', splitLeadingNumber("1,234.567") === null);
check('a dash is not a number', splitLeadingNumber("—") === null);
check("the prefix and the suffix survive", JSON.stringify(splitLeadingNumber("€1,250 left")) === JSON.stringify({ prefix: "€", number: 1250, suffix: " left" }));
check("a plain integer is itself", splitLeadingNumber("42")?.number === 42);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
