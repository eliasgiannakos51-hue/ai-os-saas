#!/usr/bin/env node
/*
 * NUMBERED WEB SOURCES IN A CHAT ANSWER — the numbers, the cards, and
 * whether they survive a reload.
 *
 * Run: node scripts/tests/web-sources.test.mjs
 *
 * lib/chat/web-sources.ts turns the web-search citations Anthropic puts on
 * an answer's text blocks into "[1]" in the sentence and a definition after
 * the answer. Four things are held here:
 *
 *   1  the numbering: first seen, deduplicated, capped, only http(s), never
 *      the quoted passage, never "[1][2]" (CommonMark reads that as ONE
 *      link — the text "1" pointing at source 2)
 *   2  the RENDERING, by the same react-markdown the chat uses: the
 *      definitions are invisible and every "[n]" becomes a link to source n.
 *      A check on the string alone would pass with a format the renderer
 *      prints as raw text.
 *   3  the round trip: what is stored parses back to the same cards
 *   4  the wiring, comments stripped: the route stores the numbered text and
 *      sends it, the client swaps it in, the thread renders the cards
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
};

const { attachWebSources, parseWebSources, MAX_WEB_SOURCES } = await loadTs("src/lib/chat/web-sources.ts");

// The shape of a real answer that searched: text blocks, some carrying
// web_search_result_location citations (with the source's own words in
// cited_text, which must never reach the screen).
const cite = (url, title, quote = "THE SOURCE'S OWN WORDS") => ({
  type: "web_search_result_location",
  url,
  title,
  cited_text: quote,
  encrypted_index: "x",
});
const A = "https://www.example.gr/kafes-times";
const B = "https://stats.example.org/report?year=2026";
const blocks = [
  { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "τιμή καφέ" } },
  { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
  { type: "text", text: "Ο μέσος espresso κοστίζει 2,10 € ", citations: [cite(A, "Τιμές καφέ 2026")] },
  { type: "text", text: "και ανέβηκε 6% φέτος.", citations: [cite(B, 'Report "2026"\nline two'), cite(A, "Τιμές καφέ 2026")] },
  { type: "text", text: " Αυτό είναι δικό μου συμπέρασμα.", citations: null },
];
const streamed = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");

console.log("== 1. the numbering ==");
const none = attachWebSources("Απλή απάντηση.", [{ type: "text", text: "Απλή απάντηση.", citations: null }]);
check("an answer that did not search is left exactly as it streamed", none.text === "Απλή απάντηση." && none.sources.length === 0);
const r = attachWebSources(streamed, blocks);
check("two pages, numbered in the order they are first cited", r.sources.length === 2 && r.sources[0].url === A && r.sources[1].url === B, JSON.stringify(r.sources));
check("...a page cited twice keeps its first number", (r.text.match(/\[1\]/g) ?? []).length >= 2);
check("the number sits after the span it supports, before its trailing space", r.text.includes("2,10 € [1] και"), r.text.slice(0, 120));
check("...two numbers on one span are separate links: never \"[1][2]\"", !/\]\[/.test(r.text) && r.text.includes("φέτος. [2] [1]"), r.text.slice(0, 160));
check("an uncited sentence gets no number", r.text.includes(" Αυτό είναι δικό μου συμπέρασμα.\n"));
check("the quoted passage is never written anywhere", !r.text.includes("THE SOURCE'S OWN WORDS") && !JSON.stringify(r.sources).includes("OWN WORDS"));
check("a title cannot break its definition (quotes and newlines removed)", r.sources[1].title === "Report 2026 line two", JSON.stringify(r.sources[1].title));

const prefixed = attachWebSources("Έψαξα στις εγγραφές σου. " + streamed, blocks);
check("text an earlier round wrote is kept, and the numbers still land", prefixed.text.startsWith("Έψαξα στις εγγραφές σου. Ο μέσος espresso κοστίζει 2,10 € [1]"));
const cut = attachWebSources("Ο μέσος espresso κοστ", blocks);
check("a stream that does not end with the final text gets no guessed numbers — only the cards", cut.text.startsWith("Ο μέσος espresso κοστ\n\n[1]: <") && !/κοστ \[/.test(cut.text));

const many = Array.from({ length: MAX_WEB_SOURCES + 3 }, (_, i) => ({
  type: "text",
  text: `Γεγονός ${i}. `,
  citations: [cite(`https://site${i}.example.com/`, `Site ${i}`)],
}));
const capped = attachWebSources(many.map((b) => b.text).join(""), many);
check(`no more than ${MAX_WEB_SOURCES} sources`, capped.sources.length === MAX_WEB_SOURCES);
check("...and a sentence citing a page past the cap carries no number for it", !capped.text.includes(`[${MAX_WEB_SOURCES + 1}]`));

const unsafe = attachWebSources("Δες εδώ.", [
  { type: "text", text: "Δες εδώ.", citations: [cite("javascript:alert(1)", "x"), cite("ftp://files.example.com/a", "y"), cite("https://ok.example.com/a b", "z")] },
]);
check("only http(s) pages are kept", unsafe.sources.length === 1 && unsafe.sources[0].url === "https://ok.example.com/a%20b", JSON.stringify(unsafe.sources));

console.log("\n== 2. what react-markdown makes of it ==");
const html = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, r.text));
check("every number becomes a link to its page", html.includes(`<a href="${A}" title="Τιμές καφέ 2026">1</a>`) && html.includes(`<a href="${B.replace(/&/g, "&amp;")}"`), html.slice(0, 300));
check("the definitions are not printed", !html.includes("]: &lt;") && !html.includes("[1]:"), html.slice(-200));
const adjacent = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, `x [1][2]\n\n[1]: <${A}>\n[2]: <${B}>`));
check("the control: \"[1][2]\" really does render as ONE link — which is why the space is there", (adjacent.match(/<a /g) ?? []).length === 1, adjacent);

console.log("\n== 3. the round trip ==");
const back = parseWebSources(r.text);
check("what is stored parses back to the same cards", JSON.stringify(back) === JSON.stringify(r.sources), JSON.stringify(back));
check("an answer without definitions has no cards", parseWebSources("Απλή απάντηση με [1] μέσα.").length === 0);

console.log("\n== 4. the wiring (comments stripped) ==");
const route = stripComments(readFileSync("src/app/api/chat/route.ts", "utf8"));
const client = stripComments(readFileSync("src/components/chat/chat-workspace.tsx", "utf8"));
check("the route keeps every round's blocks, so the last one is the answer's", /lastRoundBlocks = finalResponse\.content;/.test(route));
check("...numbers the answer from them", /const sourced = attachWebSources\(assistantText, lastRoundBlocks\);/.test(route));
check("...STORES the numbered text, so a reload shows the same", /role: "assistant",\s*content: sourced\.text,/.test(route));
check("...and sends it at the end of the stream", /content: sourced\.sources\.length > 0 \? sourced\.text : undefined,/.test(route));
check("the client swaps the numbered text in", /content: finalContent \?\? accumulatedText,/.test(client) && /finalContent = event\.content;/.test(client));
check("the thread renders the cards under every answer", /<SourceCards content=\{msg\.content\} \/>/.test(client));

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exitCode = failures.length === 0 ? 0 : 1;
