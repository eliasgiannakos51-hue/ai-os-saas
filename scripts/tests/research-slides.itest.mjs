/*
 * THE NUMBERS, RENDERED (package 11): what lib/research/cited-markdown.ts
 * writes is handed to react-markdown with remark-gfm — the same two the
 * Research screens render through (components/chat/message-content.tsx) —
 * and the HTML that comes out is read. A string that looks like links and
 * renders as text, or as one link where there were two, is a report whose
 * numbers do not open.
 *
 * Run: node scripts/tests/research-slides.itest.mjs
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}

const { linkCitations } = await loadTs("src/lib/research/cited-markdown.ts");
const render = (md) => renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, md));
const anchors = (html) => [...html.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => ({ href: m[1], text: m[2] }));

console.log("research-slides (the numbers, rendered)");
const SOURCES = [
  { title: "Eurostat", url: "https://ec.europa.eu/eurostat/tourism?x=1&y=2" },
  { title: 'Η "ΕΛΣΤΑΤ"', url: "https://www.statistics.gr/el/islands (2025)" },
];
let html = render(linkCitations("Οι **αφίξεις** αυξήθηκαν 12% [1][2], και οι κλίνες [2].\n\n- σημείο [1]\n- άλλο [7]", SOURCES));
const links = anchors(html);
check("every valid number is a link", links.length === 4, JSON.stringify(links));
check("...and \"[1][2]\" is two, each to its own source", links[0]?.text === "[1]" && links[0]?.href.startsWith("https://ec.europa.eu/eurostat/tourism") && links[1]?.text === "[2]" && links[1]?.href.startsWith("https://www.statistics.gr/el/islands"));
check("...an address with spaces and parentheses survives whole", links[1]?.href === "https://www.statistics.gr/el/islands%20(2025)", links[1]?.href);
check("...and one with a query string keeps it", links[0]?.href === "https://ec.europa.eu/eurostat/tourism?x=1&amp;y=2", links[0]?.href);
check("a number with no source is text, marked", html.includes("[7]⚠") && !links.some((l) => l.text === "[7]"));
check("the report's own formatting is read, not printed", html.includes("<strong>αφίξεις</strong>") && html.includes("<li>") && !html.includes("**"));
html = render(linkCitations("Κείμενο χωρίς πηγές.", []));
check("text with no sources renders as text", anchors(html).length === 0 && html.includes("Κείμενο χωρίς πηγές."));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
