// THE ROADMAP IS HIDDEN UNTIL V7.5, AND THE HIDING IS A DECISION ON PAPER.
//
// The instruction: take /roadmap out of the sidebar and the footer, keep
// the page at its URL, and leave a comment saying why — "Κρυμμένο μέχρι
// το V7.5. Χωρίς πραγματικούς χρήστες, ένα roadmap είναι υπόσχεση σε
// κανέναν." — so that the next person who finds a finished page linked
// from nowhere reads a reason rather than assuming an accident.
//
// THE RULE THIS FILE HOLDS, in both directions:
//
//   hidden AND the comment stands      -> the state that was asked for
//   linked AND the comment stands      -> RED. Somebody put the link back
//                                         without retracting the reason
//                                         it was removed. Either the reason
//                                         is wrong (delete it) or the link
//                                         is (delete that).
//   hidden AND no comment              -> RED. A page linked from nowhere
//                                         with nothing saying why is the
//                                         accident this comment exists to
//                                         rule out.
//   linked AND no comment              -> green. The roadmap was brought
//                                         back on purpose. V7.5, presumably.
//
// AND THE PAGE ITSELF IS NOT DELETED. "Hidden" means unlinked, not gone:
// /roadmap must still be a route with a default export, so the URL works
// for anybody who has it.
//
// WHAT IS SCANNED. Every .ts/.tsx under src/ except the roadmap page
// itself — so the footer list, the sidebar config, the landing page, the
// help page and any component are all covered, and a link added in a new
// file is caught the same as one put back in the old one. sitemap.ts and
// robots.ts derive from FOOTER_LINKS and carry no literal, so the
// derivation is what keeps the crawler from being told about a page the
// site does not link to.
//
// Run: node scripts/tests/roadmap-hidden.test.mjs
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
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

const FOOTER = "src/lib/footer-links.ts";
const PAGE = "src/app/roadmap/page.tsx";
const HIDE_COMMENT = "Κρυμμένο μέχρι το V7.5";

// ---------------------------------------------------------------------
console.log("== 1. the page still exists at its URL ==");
// ---------------------------------------------------------------------
check(`${PAGE} exists`, existsSync(PAGE), "hidden means unlinked, not deleted");
const pageSrc = existsSync(PAGE) ? stripComments(readFileSync(PAGE, "utf8")) : "";
check(
  "...and exports a page (default export)",
  /export\s+default\s+(async\s+)?function/.test(pageSrc),
  "a route file with no default export is a 404, which is deletion with extra steps"
);

// ---------------------------------------------------------------------
console.log("\n== 2. what links to /roadmap, across the whole app ==");
// ---------------------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}
const files = walk("src").filter((f) => f !== PAGE);
// A FLOOR ON THE SCAN, or an empty walk agrees with every rule below.
check(`the scan found the app (${files.length} files)`, files.length >= 400, String(files.length));

// A LITERAL "/roadmap" in code — not in a comment, because three files
// mention the route in prose (robots.ts, sitemap.ts, help/page.tsx) to
// explain why it is NOT listed. Comments are not links.
const LINK_RE = /["'`]\/roadmap["'`?#]/;
const linkers = files.filter((f) => LINK_RE.test(stripComments(readFileSync(f, "utf8"))));

// AND THE FOOTER LIST, EXECUTED. A regex over footer-links.ts would also
// match; running the real array is what the sitemap and robots.txt read,
// so it is what is asserted.
const { FOOTER_LINKS } = await loadTs(FOOTER);
check("FOOTER_LINKS loads and is non-empty", Array.isArray(FOOTER_LINKS) && FOOTER_LINKS.length > 0);
const inFooter = (FOOTER_LINKS ?? []).some((l) => l.href === "/roadmap");

const linked = inFooter || linkers.length > 0;
console.log(
  `        footer: ${inFooter ? "LINKED" : "not linked"}; literal links in ${linkers.length} file(s)` +
    (linkers.length ? `: ${linkers.join(", ")}` : "")
);

// ---------------------------------------------------------------------
console.log("\n== 3. the decision and the code agree ==");
// ---------------------------------------------------------------------
const footerSrc = readFileSync(FOOTER, "utf8");
const marked = footerSrc.includes(HIDE_COMMENT);
console.log(`        the hide comment ${marked ? "stands" : "is gone"} in ${FOOTER}`);

if (marked) {
  check(
    "the roadmap is hidden while the comment says it is hidden",
    !linked,
    `re-added without removing the hide comment — in ${[inFooter ? FOOTER : null, ...linkers].filter(Boolean).join(", ")}. ` +
      "Either delete the comment (the roadmap is back on purpose) or delete the link."
  );
} else {
  check(
    "the roadmap is linked, since the comment saying it is hidden is gone",
    linked,
    "hidden without saying so — a finished page linked from nowhere, with no reason written down, is the accident this file exists to prevent"
  );
}

// The comment is not a bare marker: the reason travels with it.
if (marked) {
  check(
    "...and the comment carries the reason, not only the version",
    /υπόσχεση σε κανέναν/.test(footerSrc),
    "the sentence that says WHY is what stops somebody re-adding it as a tidy-up"
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
