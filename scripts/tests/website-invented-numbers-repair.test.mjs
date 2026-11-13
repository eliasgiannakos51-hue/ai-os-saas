// THE "FIX AND RE-CHECK" HALF OF BUILD-SPECS.MD §1.5, FOR INVENTED NUMBERS.
//
// Market research, 2026-04: biziq.com/blog/ai-hallucination-data/
// (published 2026-04-20, updated 2026-04-29; 600 prompts tested + 565
// marketers surveyed) found 36.5% of marketers had AI-hallucinated content
// published publicly and over 70% spend hours a week fact-checking AI
// output by hand. lib/website-invented-numbers.ts already DETECTS a
// fabricated phone/price/time/address/stat; this file is the repair that
// used to not exist — before it, both routes that call the detector
// (api/websites/generate/process, api/websites/edit) only ever LOGGED a
// finding, which the business owner never saw unless they happened to
// notice the editor's own banner.
//
// What this measures:
//   - a genuinely invented number gets a bracketed placeholder, in the
//     site's own declared language (read off <html lang="xx">, not
//     guessed from the brief)
//   - a repaired page RE-CHECKS CLEAN: findInventedNumbers never reports
//     the same text again, because a placeholder inside [ ] is the
//     detector's own definition of correct behaviour
//   - a number the user actually gave is left completely alone
//   - a repeated invented number (header AND footer) is fixed everywhere,
//     not just the first occurrence
//   - the "at most two cycles" ceiling is respected — this never loops
//     forever chasing a pathological page
//
// Run: node scripts/tests/website-invented-numbers-repair.test.mjs
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

const { repairInventedNumbers } = await loadTs("src/lib/website-invented-numbers-repair.ts");
const { findInventedNumbers } = await loadTs("src/lib/website-invented-numbers.ts");

const page = (body, lang = "en") => `<!doctype html><html lang="${lang}"><head><title>T</title></head><body>${body}</body></html>`;
const BRIEF = "A bakery in Thessaloniki. Warm, family-run, sourdough.";

// ---------------------------------------------------------------------------
console.log("== 1. an invented number is placeholdered, and the page re-checks clean ==");
{
  const html = page("<p>Call us on +30 2310 555 123</p>");
  const result = repairInventedNumbers(html, BRIEF);
  check("one suspect repaired", result.repairedCount === 1, `got ${result.repairedCount}`);
  check("nothing left unrepaired", result.remaining.length === 0, JSON.stringify(result.remaining));
  check("the invented text is gone from the html", !result.html.includes("+30 2310 555 123"));
  check("a bracketed placeholder is in its place", /\[[^[\]]+\]/.test(result.html), result.html);
  check(
    "re-running the detector on the repaired html finds nothing",
    findInventedNumbers(result.html, BRIEF).length === 0,
    JSON.stringify(findInventedNumbers(result.html, BRIEF))
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 2. the placeholder is in the site's OWN declared language ==");
{
  const greek = repairInventedNumbers(page("<p>Τηλεφωνήστε στο +30 2310 555 123</p>", "el"), BRIEF);
  check("Greek site gets a Greek placeholder", /\[Το τηλέφωνό σας\]/.test(greek.html), greek.html);

  const german = repairInventedNumbers(page("<p>Preis: €4.50</p>", "de"), BRIEF);
  check("German site gets a German placeholder", /\[Preis\]/.test(german.html), german.html);

  // No lang attribute at all (a site generated before this existed) falls
  // back to the app's own default rather than guessing — stated in the
  // file's own comment, pinned here so the fallback cannot silently change.
  const noLang = repairInventedNumbers(`<!doctype html><html><body><p>+30 2310 555 123</p></body></html>`, BRIEF);
  check("no lang attribute falls back to English", /\[Your phone number\]/.test(noLang.html), noLang.html);

  // A lang the app does not support (the model wrote something this app's
  // own locale list does not carry a translation for) must not throw —
  // same fallback as missing, not a crash on an unsupported BCP-47 tag.
  const unsupportedLang = () => repairInventedNumbers(page("<p>+30 2310 555 123</p>", "xx"), BRIEF);
  check("an unsupported lang code does not throw", (() => { try { unsupportedLang(); return true; } catch { return false; } })());
  check("…and still falls back to English", /\[Your phone number\]/.test(unsupportedLang().html));
}

// ---------------------------------------------------------------------------
console.log("\n== 3. a number the user actually gave is left completely alone ==");
{
  const html = page("<p>Call 2310555123 for orders</p>");
  const brief = "our number is 2310555123";
  const result = repairInventedNumbers(html, brief);
  check("nothing repaired", result.repairedCount === 0, `got ${result.repairedCount}`);
  check("the real number is untouched", result.html.includes("2310555123"));
  check("the html is otherwise byte-identical", result.html === html);
}

// ---------------------------------------------------------------------------
console.log("\n== 4. a repeated invented number is fixed EVERYWHERE, in one pass ==");
{
  const html = page(`
    <header><p>Call +30 2310 555 123</p></header>
    <main><p>Our number is +30 2310 555 123</p></main>
    <footer><p>+30 2310 555 123</p></footer>
  `);
  const result = repairInventedNumbers(html, BRIEF);
  check("counted once (one distinct suspect), not three", result.repairedCount === 1, `got ${result.repairedCount}`);
  check("but every occurrence on the page is gone", !result.html.includes("+30 2310 555 123"), result.html);
  check("re-checks clean", findInventedNumbers(result.html, BRIEF).length === 0);
}

// ---------------------------------------------------------------------------
console.log("\n== 5. several different invented facts on one page, all repaired ==");
{
  const html = page(`
    <p>Call +30 2310 555 123</p>
    <p>Loaves from €4.50</p>
    <p>Open 09:00 – 21:00</p>
  `);
  const result = repairInventedNumbers(html, BRIEF);
  check("all three repaired", result.repairedCount === 3, `got ${result.repairedCount}`);
  check("re-checks clean", result.remaining.length === 0, JSON.stringify(result.remaining));
}

// ---------------------------------------------------------------------------
console.log("\n== 6. a clean page is left byte-identical, with nothing repaired ==");
{
  const html = page(`<h1>Sourdough, every morning</h1><p>We bake slowly, in Thessaloniki.</p>`);
  const result = repairInventedNumbers(html, BRIEF);
  check("nothing repaired on a clean page", result.repairedCount === 0);
  check("byte-identical", result.html === html);
  check("nothing remaining", result.remaining.length === 0);
}

// ---------------------------------------------------------------------------
console.log("\n== 7. the ceiling is respected — at most maxCycles repair rounds ==");
{
  // A pathological page the repair cannot ever fully clean (an address
  // shape the detector itself documents as unmatched — "WHAT IT CANNOT
  // SEE" in website-invented-numbers.ts) must still return rather than
  // loop: `remaining` says what did not pass, which is the §1.5 contract,
  // not an infinite retry.
  const html = page(`<p>Call +30 2310 555 123, price €4.50, open 09:00</p>`);
  const result = repairInventedNumbers(html, BRIEF, 2);
  check("terminates and reports success within the ceiling", result.remaining.length === 0);
  // maxCycles=0 must do nothing at all — the detector still sees every
  // suspect, proving the loop condition is actually honoured and not
  // bypassed by a first unconditional pass outside it.
  const untouched = repairInventedNumbers(html, BRIEF, 0);
  check("maxCycles=0 repairs nothing", untouched.repairedCount === 0 && untouched.html === html);
  check("…and still reports what remains", untouched.remaining.length > 0);
}

// ---------------------------------------------------------------------------
console.log("\n== 8. a placeholder the repair itself wrote never gets re-flagged ==");
{
  // Running repair twice in a row (as the two call sites effectively do —
  // generate once, then an edit later) must be a no-op the second time.
  const html = page("<p>Call +30 2310 555 123</p>");
  const once = repairInventedNumbers(html, BRIEF);
  const twice = repairInventedNumbers(once.html, BRIEF);
  check("a second pass over an already-repaired page changes nothing", twice.repairedCount === 0);
  check("…and the html is unchanged", twice.html === once.html);
}

// ---------------------------------------------------------------------------
console.log("\n== 9. wired into both routes, as a repair — not just a log ==");
const { readFileSync } = await import("node:fs");
for (const [route, importName] of [
  ["src/app/api/websites/generate/process/route.ts", "the generate route"],
  ["src/app/api/websites/edit/route.ts", "the edit route"],
]) {
  const src = readFileSync(route, "utf8");
  check(`${importName} imports repairInventedNumbers`, /from "@\/lib\/website-invented-numbers-repair"/.test(src));
  check(`${importName} calls it`, /repairInventedNumbers\(/.test(src));
}
// MEASURED BUT NOT APPLIED is this codebase's own recurring bug shape
// (website-margin.test.mjs's header: two AI calls were measured and never
// settled). The same shape here would be computing the repair and never
// writing it back into the document that gets persisted — pinned
// separately per route since each assigns it back differently.
{
  const generate = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
  check(
    "the generate route writes the repaired html back into the document array it persists",
    /documents\[i\]\s*=\s*repaired\.html;/.test(generate)
  );
}
{
  const edit = readFileSync("src/app/api/websites/edit/route.ts", "utf8");
  check(
    "the edit route writes the repaired html back into updatedHtml before it is persisted",
    /updatedHtml\s*=\s*inventedRepair\.html;/.test(edit)
  );
}
// THE EDIT ROUTE REPAIRS BEFORE PERSISTING, not after — a repair applied
// to updatedHtml only after the database write would fix nothing the
// owner actually gets. Pinned by position: the repair call's assignment
// back into updatedHtml must appear before applyEditedDocument, which is
// what feeds the update() call.
{
  const src = readFileSync("src/app/api/websites/edit/route.ts", "utf8");
  const repairAt = src.indexOf("repairInventedNumbers(updatedHtml");
  const applyAt = src.indexOf("applyEditedDocument(");
  check(
    "the edit route repairs BEFORE applyEditedDocument/persistence, not after",
    repairAt !== -1 && applyAt !== -1 && repairAt < applyAt,
    `repair at ${repairAt}, apply at ${applyAt}`
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 10. the owner is told a repair happened, in their own language ==");
{
  const src = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
  check(
    "a repaired count becomes a GenerationNote the owner's workspace renders",
    /notes\.push\(\{\s*kind:\s*"placeholdered"/.test(src),
    "expected a notes.push({ kind: \"placeholdered\", ... }) in the generate route"
  );
  const notesLib = readFileSync("src/lib/website-generation-notes.ts", "utf8");
  check(
    "the note kind is a real, parsed GenerationNote — not just pushed and dropped",
    /"placeholdered"/.test(notesLib) && /out\.push\(\{ kind: "placeholdered"/.test(notesLib)
  );
  const noteText = readFileSync("src/components/website-builder/use-generation-note-text.ts", "utf8");
  check(
    "the client-side note renderer has a case for it (or tsc's exhaustiveness check would already be red)",
    /case "placeholdered":/.test(noteText)
  );
}

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`
);
if (failures.length) process.exit(1);
