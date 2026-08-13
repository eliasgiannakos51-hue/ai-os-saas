// Website Builder — the two defects behind "it doesn't research, and then
// it says the generation was interrupted".
//
// These are unit-level properties of the pure modules. The end-to-end
// proof that a narrated generation now succeeds against the real Anthropic
// SDK lives in website-continuation.itest.mjs (sections 11-15); this file
// exists so the same guarantees are checked by the BUILD GATE, which runs
// *.test.mjs only.
//
// Run: node scripts/tests/website-research.test.mjs
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
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}\n        actual   ${a}`);
}

const { loadTs } = await import("./load-ts.mjs");
const { extractHtmlDocument, containsHtmlDocumentStart } = await loadTs(
  "src/lib/website-html-extract.ts"
);
const { looksLikeCompleteHtmlDocument } = await loadTs("src/lib/html-document-check.ts");
const { broadenImageQuery, picsumFallbackUrl } = await loadTs(
  "src/lib/website-image-placeholders.ts"
);

const DOC =
  '<!DOCTYPE html>\n<html lang="el">\n<head><meta charset="utf-8"><title>Καφετέρια</title></head>\n' +
  "<body><header><h1>Καφετέρια</h1></header><main><p>Στα Λαδάδικα.</p></main></body>\n</html>";

// ---------------------------------------------------------------------
console.log("== 1. the interrupted-generation bug: narration before the document ==");
// A web_search turn opens with a sentence about what it is looking up.
// looksLikeCompleteHtmlDocument requires the string to START with a
// doctype, so one sentence in front of a finished page read as unfinished
// and assertCompleteHtmlResponse threw "the generation was interrupted".
const narrated = "Let me check what's around Ladadika first.\n\n" + DOC;
check(
  "the raw response fails the completeness check (this is the bug)",
  !looksLikeCompleteHtmlDocument(narrated)
);
check(
  "the extracted document passes it",
  looksLikeCompleteHtmlDocument(extractHtmlDocument(narrated))
);
check("the narration is removed", !extractHtmlDocument(narrated).includes("Let me check"));
check("the document itself is intact", extractHtmlDocument(narrated) === DOC);

console.log("\n== 2. the continuation gate: 'a document was started' ==");
// The gate used to test whether the output BEGAN with a doctype. A turn
// that researched first and then began writing was judged never to have
// started, so a half-written page was discarded instead of resumed.
const halfWritten = "I'll look up typical opening hours first.\n\n" + DOC.slice(0, 90);
check("a narrated half-written document is recognised as started", containsHtmlDocumentStart(halfWritten));
check("it is still not complete", !looksLikeCompleteHtmlDocument(extractHtmlDocument(halfWritten)));
check("plain prose is NOT treated as a started document", !containsHtmlDocumentStart("I can't help with that."));
check(
  "so a refusal still stops instead of burning continuation rounds",
  extractHtmlDocument("I can't help with that.") === "I can't help with that."
);

console.log("\n== 3. commentary and fences around the document ==");
check(
  "a trailing sign-off is cut",
  extractHtmlDocument(DOC + "\n\nLet me know if you want other colours!") === DOC
);
check("a wrapping markdown fence is cut", extractHtmlDocument("```html\n" + DOC + "\n```") === DOC);
check(
  "narration + fence + sign-off together",
  extractHtmlDocument("Here you go:\n\n```html\n" + DOC + "\n```\n\nEnjoy!") === DOC
);
check("a bare <html> document (no doctype) is found", extractHtmlDocument("Note.\n<html><body>x</body></html>") === "<html><body>x</body></html>");
eq("empty input stays empty", extractHtmlDocument("   "), "");
check("a clean document is returned unchanged", extractHtmlDocument(DOC) === DOC);

console.log("\n== 4. image queries broaden instead of falling straight to a random photo ==");
// A good, specific query can legitimately return nothing from Unsplash. It
// used to fall STRAIGHT to picsum — a photo with no relationship to the
// subject. That is the "wrong images" report.
const attempts = broadenImageQuery("handmade sourdough loaves cooling rack bakery");
check("the most specific query is tried first", attempts[0] === "handmade sourdough loaves cooling rack bakery");
check("it broadens by dropping trailing words", attempts[1] === "handmade sourdough loaves cooling rack");
check("every attempt keeps the subject at the head", attempts.every((a) => a.startsWith("handmade sourdough")));
check("it never degrades to a single word", attempts.every((a) => a.split(" ").length >= 2));
check("the number of round trips is capped", attempts.length <= 4);
eq("a two-word query is tried exactly once", broadenImageQuery("espresso machine"), ["espresso machine"]);
eq("an empty query produces no attempts", broadenImageQuery("   "), []);
check(
  "a one-word query still produces one attempt",
  broadenImageQuery("espresso").length === 1 && broadenImageQuery("espresso")[0] === "espresso"
);
check("the final fallback is still a real, working URL", picsumFallbackUrl("espresso machine").startsWith("https://picsum.photos/seed/"));

console.log("\n== 5. the resolver actually uses the broadening ==");
const resolverSrc = readFileSync("src/lib/website-image-resolver.ts", "utf8");
check("broadenImageQuery is imported", /broadenImageQuery/.test(resolverSrc));
// THESE TWO USED TO MATCH THE OLD SINGLE LOOP, in which each photo walked
// its whole ladder concurrently with every other photo's. That structure had
// a measured defect — on a 20-photo page, eight photos reached picsum
// without the library ever being asked about them — so it is now a
// guaranteed first pass followed by a shared broadening pass. Both
// properties below survive intact; only their spelling changed, and
// scripts/tests/website-image-resolution.itest.mjs now proves them from the
// outside by counting real requests instead of reading for a shape.
check(
  "the ladder is built for every photo",
  /ladders\.set\(slug, broadenImageQuery\(query\)\)/.test(resolverSrc)
);
check(
  "and iterated, not called once — the broader attempts are actually walked",
  /for \(const attempt of \(ladders\.get\(slug\) \?\? \[\]\)\.slice\(1\)\)/.test(resolverSrc)
);
check(
  "picsum is only reached after every attempt, and only for what is still missing",
  /if \(resolved\.has\(slug\)\) continue;[\s\S]{0,120}picsumFallbackUrl\(query\)/.test(resolverSrc)
);
check(
  "...and that fallback runs after broadening, not beside it",
  resolverSrc.indexOf("picsumFallbackUrl(query)") > resolverSrc.indexOf(".slice(1))")
);

console.log("\n== 6. the generation prompt orders research rather than permitting it ==");
const builderSrc = readFileSync("src/lib/website-builder.ts", "utf8");
check("research is mandatory", /MANDATORY RESEARCH/.test(builderSrc));
check(
  "the old permissive wording is gone",
  !/Do NOT search for things you already know well/.test(builderSrc)
);
check("familiarity is explicitly not an excuse", /NOT a reason to skip a search/.test(builderSrc));
check("a named place must be searched", /1\. THE PLACE/.test(builderSrc));
check("the industry must be searched", /2\. THE INDUSTRY/.test(builderSrc));
check("real numbers must be searched", /3\. THE NUMBERS/.test(builderSrc));
check(
  "the boundary against inventing the user's own facts is restated",
  /NEVER establishes facts about THIS user's own business/.test(builderSrc)
);
check(
  "and DO NOT INVENT CRITICAL FACTS still exists",
  /DO NOT INVENT CRITICAL FACTS/.test(builderSrc)
);
const budget = Number(builderSrc.match(/const WEBSITE_MAX_SEARCHES = (\d+)/)?.[1]);
check(`the search budget covers three subjects (${budget})`, budget >= 6);
check(
  "image queries are required to be in English",
  /ALWAYS IN ENGLISH/.test(builderSrc)
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
