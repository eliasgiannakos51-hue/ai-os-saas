// TRANSLATE AS ITS OWN TOOL (the owner's "ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ",
// 2026-10-24), built piece by piece behind the switch "translate-tool".
// This suite holds piece 1 (the screen) and piece 2 (text in, translation
// out, paragraph by paragraph) — scripts/tests/translate.test.mjs keeps
// holding the site/document translation this tool grew out of.
//
// Run: node scripts/tests/translate-tool.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const read = (f) => stripComments(readFileSync(f, "utf8"));
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));

const TEXT = await loadTs("src/lib/translate/text-source.ts");
const PROMPT = await loadTs("src/lib/translate/translate-prompt.ts");

console.log("== 1. pasted text, split into paragraphs and back ==");
{
  const { paragraphs, pieces, from } = TEXT.planText("Καλησπέρα σε όλους.\n\nΔεύτερη παράγραφος εδώ.\n\n\nΤρίτη, μετά δύο κενές γραμμές.");
  ok("three paragraphs, blank runs collapsed to one split", paragraphs.length === 3, JSON.stringify(paragraphs));
  ok("each piece is the paragraph's own text, kind plain", pieces.every((p, i) => p.text === paragraphs[i] && p.kind === "plain"));
  ok("the source language is detected", from === "el", from);

  const rebuilt = TEXT.rebuildText(paragraphs, ["Good evening everyone.", "", null]);
  ok("a real translation replaces its paragraph", rebuilt.paragraphs[0] === "Good evening everyone.");
  ok("a blank or missing translation keeps the original, and is counted", rebuilt.paragraphs[1] === paragraphs[1] && rebuilt.paragraphs[2] === paragraphs[2] && rebuilt.kept === 2);

  ok("whitespace-only or empty text makes no paragraphs", TEXT.planText("   \n\n  ").pieces.length === 0);
  ok("a ceiling exists, under the site/document one (60,000)", TEXT.MAX_TRANSLATE_TEXT_CHARS > 0 && TEXT.MAX_TRANSLATE_TEXT_CHARS < 60_000);
  ok("at most five targets at once", TEXT.MAX_TRANSLATE_TARGETS === 5);

  const chars = TEXT.translateTextLiveEstimateChars(1000, 3);
  ok("the live estimate proxy scales with both the text and the number of languages", chars === 3 * (1000 + TEXT.TRANSLATE_SYSTEM_OVERHEAD_CHARS) && TEXT.translateTextLiveEstimateChars(1000, 0) === 0);
}

console.log("== 2. the register, and the same-shaped prompt ==");
{
  ok("three styles, and only those three are accepted", JSON.stringify(PROMPT.TRANSLATE_STYLES) === JSON.stringify(["formal", "friendly", "source"]) && PROMPT.isTranslateStyle("formal") && !PROMPT.isTranslateStyle("casual"));
  const formal = PROMPT.translateTextSystemPrompt("en", "formal");
  const friendly = PROMPT.translateTextSystemPrompt("en", "friendly");
  const source = PROMPT.translateTextSystemPrompt("en", "source");
  ok("each register says something different, and only itself", formal !== friendly && friendly !== source && formal.includes("formal") && friendly.includes("friendly") && source.includes("Match the register"));
  ok("the tool-forced schema is the same one the site/document translation uses", /Keep numbers, prices, currencies, dates/.test(formal) && /Never merge, split, skip, explain or add/.test(formal));
  ok("the live input-chars counter grows with more text, and the system prompt counts once per call", PROMPT.translateTextInputChars([{ text: "a", kind: "plain" }], "en", "formal") < PROMPT.translateTextInputChars([{ text: "a".repeat(5000), kind: "plain" }], "en", "formal"));
}

console.log("== 3. the switch, and the screen gated by it, independently of `ready` ==");
{
  const flags = read("src/lib/flags/flags.ts");
  ok("the switch is declared", /"translate-tool":/.test(flags));
  const page = read("src/app/dashboard/translate/page.tsx");
  ok("the page checks the switch, not the tile's `ready`", /isFeatureOn\("translate-tool", user\)/.test(page));
  ok("a reader the switch is not open to still sees the Coming Soon screen, whatever `ready` says", /ComingSoonShell/.test(page) && !/\bready\b/.test(page.replace(/already/g, "")));
}

console.log("== 4. the route: price without a hold, one hold for every target, same-language is a free no-op ==");
{
  const route = read("src/app/api/translate/text/route.ts");
  ok("GET-shaped price, POST-shaped run, same as the site/document route: here both are POST, told apart by mode", /mode === "price"/.test(route) && /mode === "run"/.test(route) === false && /if \(mode === "price"\)/.test(route));
  ok("a price is computed with no reservation taken", (() => {
    const priceBranch = route.slice(route.indexOf('if (mode === "price")'), route.indexOf("if (!anyProviderConfigured"));
    return !/reserveCredits\(/.test(priceBranch);
  })());
  ok("one reservation for every live target together", route.match(/reserveCredits\(/g)?.length === 1);
  ok("settled once, after every target finished, never on failure", route.indexOf("settleReservation(") > route.lastIndexOf("translateTextPieces(") && !/if \(failure\)[\s\S]{0,400}settleReservation/.test(route));
  ok("a target already in the detected language costs nothing and asks the model nothing", /liveTargets = targets\.filter\(\(t\) => t !== plan\.from\)/.test(route) && !/translateTextPieces[\s\S]{0,200}sameLanguageTargets/.test(route));
  ok("every target equal to the source, with none different, refuses before any price or hold", /if \(liveTargets\.length === 0\) return NextResponse\.json\(\{ ok: false, code: "same_language"/.test(route));
  ok("the switch gates the route too, before parsing what was sent", route.indexOf('isFeatureOn("translate-tool"') < route.indexOf("if (!parsed.ok)"));
  ok("never more than five targets, never a locale outside the supported ten", /targets\.length > MAX_TRANSLATE_TARGETS/.test(route) && /isSupportedTargetLocale/.test(route));
}

console.log("== 5. the catalog, and the screen's own namespace, in all ten locales ==");
{
  const catalog = read("src/lib/billing/feature-catalog.ts");
  const entry = catalog.slice(catalog.indexOf('id: "translateTool"'), catalog.indexOf('id: "translateTool"') + 900);
  ok("the real route is claimed, and the entry says it charges", /"translate\/text"/.test(entry) && /charges: true/.test(entry));
  for (const locale of LOCALES) {
    const t = messages[locale]?.dashboard?.translateTool;
    ok(`${locale}: the standalone screen's own keys exist`, Boolean(t?.empty?.heading && t?.empty?.examples?.a && t?.empty?.examples?.b && t?.empty?.examples?.c && t?.placeholder && t?.targetsLabel && t?.styleLabel && t?.style?.formal && t?.style?.friendly && t?.style?.source && t?.detectedFrom && t?.sameLanguageNote && t?.kept && t?.done && t?.translating && t?.errors?.nothing && t?.errors?.tooLong && t?.errors?.sameLanguage && t?.errors?.insufficient && t?.errors?.rateLimited && t?.errors?.unavailable && t?.errors?.unusable && t?.errors?.failed));
  }
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
