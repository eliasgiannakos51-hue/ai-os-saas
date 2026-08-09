// EU AI Act art. 50 — the notice the user can actually SEE, and the
// disclaimer that fires on mild questions too.
//
// REPORTED: "the user sees no AI indication anywhere", and "the medical
// disclaimer only appears if the question is serious".
//
// Both were accurate. The disclosure existed in three places, none of
// which is a screen: inside the body of an agent email, as a line of
// markdown at the bottom of a saved document, and as a `disclosure` string
// in an API response that only one component ever rendered. Article 50
// asks for content to be recognisable AS AI-GENERATED to the person
// receiving it — metadata is not that, and neither is a sentence inside a
// file they have to open.
//
// Run: node scripts/tests/ai-transparency.test.mjs
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

const read = (p) => readFileSync(p, "utf8");
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];

console.log("== 1. there is one visible notice component, and it is not hidden ==");
const notice = read("src/components/ai/ai-generated-notice.tsx");
check("it renders text, not only an icon", /t\("short"\)/.test(notice) && /t\("long"\)/.test(notice));
// Every aria-hidden in this file must be on the decorative icon and
// nothing else. A screen-reader user has the same right to know a model
// wrote this; hiding the text would look compliant and not be.
const ariaHiddenLines = notice
  .split("\n")
  // Code only — the file's own header comment discusses aria-hidden.
  .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
  .filter((line) => line.includes("aria-hidden"));
check("the icon is marked decorative", ariaHiddenLines.length > 0);
check(
  "and aria-hidden appears ONLY on the icon",
  ariaHiddenLines.every((line) => line.includes("<Sparkles")),
  `offending lines: ${ariaHiddenLines.filter((l) => !l.includes("<Sparkles")).join(" | ")}`
);
check("it is translated, not hardcoded", /useTranslations\("common\.aiGenerated"\)/.test(notice));

console.log("\n== 2. every AI surface renders it ==");
const SURFACES = [
  ["chat", "src/components/chat/chat-workspace.tsx"],
  ["websites", "src/components/website-builder/website-builder-workspace.tsx"],
  ["research", "src/components/research/research-workspace.tsx"],
];
for (const [label, file] of SURFACES) {
  const src = read(file);
  check(`${label} imports the notice`, /from "@\/components\/ai\/ai-generated-notice"/.test(src));
  check(`${label} actually renders it`, /<AiGeneratedNotice/.test(src));
}
// Files already rendered a disclosure of its own before this change — the
// check is that it still does, not that it was converted.
const files = read("src/components/files/files-workspace.tsx");
check("file Q&A still shows its disclosure on screen", /\{answer\.disclosure\}/.test(files));
// Agent output leaves the app entirely, so its notice lives in the email.
const agentEmail = read("src/lib/email/send-agent-emails.ts");
check("agent emails still carry the notice", /aiGeneratedNotice\(language\)/.test(agentEmail));
const deliver = read("src/lib/agents/deliver.ts");
check("and so does every other agent delivery channel", /aiGeneratedNotice\(language\)/.test(deliver));

console.log("\n== 3. the notice is translated in every locale ==");
for (const locale of LOCALES) {
  const messages = JSON.parse(read(`messages/${locale}.json`));
  const block = messages.common?.aiGenerated;
  check(`${locale} has both strings`, Boolean(block?.short) && Boolean(block?.long));
  if (locale !== "en") {
    const en = JSON.parse(read("messages/en.json")).common.aiGenerated;
    check(`${locale} is not the English string copied over`, block?.long !== en.long);
  }
}

console.log("\n== 4. the regulated-topic disclaimer is unconditional ==");
const conduct = read("src/lib/ai-conduct.ts");
check('English says "ALWAYS" IS LITERAL', /"ALWAYS" IS LITERAL/.test(conduct));
check("Greek says the same", /ΤΟ "ΠΑΝΤΑ" ΕΙΝΑΙ ΚΥΡΙΟΛΕΚΤΙΚΟ/.test(conduct));
check("mild questions are named explicitly (EN)", /applies to MILD, everyday questions too/.test(conduct));
check("mild questions are named explicitly (EL)", /Ισχύει και στις ΗΠΙΕΣ/.test(conduct));
check(
  "the model is told not to judge severity itself",
  /Do NOT judge for yourself whether a topic is "serious enough/.test(conduct)
);
check(
  "and it is capped at one sentence so it does not become noise",
  /one sentence at the end, not a paragraph/.test(conduct)
);
check("all three regulated domains are still covered", /HEALTH[\s\S]{0,400}LEGAL[\s\S]{0,400}FINANCIAL/.test(conduct));
check("the answer still comes first", /Answer properly first, then the one sentence/.test(conduct));

console.log("\n== 5. a research report is saved where a screen can open it ==");
// Found while wiring the notice: the report was inserted into
// `ai_documents`, the LEGACY tracker, while the UI linked to
// /dashboard/documents/<id>, which reads `user_documents`. Every
// "Open as a document" link was a guaranteed 404.
const runRoute = read("src/app/api/research/[id]/run/route.ts");
const docPage = read("src/app/dashboard/documents/[id]/page.tsx");
check("the document page reads user_documents", /\.from\("user_documents"\)/.test(docPage));
check("so the report is written to user_documents", /\.from\("user_documents"\)/.test(runRoute));
check("and no longer to the legacy tracker", !/\.from\("ai_documents"\)/.test(runRoute));
check("stored in the { html } shape the editor expects", /content: \{ html: documentHtml \}/.test(runRoute));

console.log("\n== 6. and it cannot inject markup into the editor ==");
// document-editor.tsx does `editorRef.current.innerHTML = doc.content.html`.
// A research report is built from pages strangers wrote.
const { loadTs } = await import("./load-ts.mjs");
const { researchReportToDocumentHtml } = await loadTs("src/lib/research/report-to-html.ts");

const attacked = researchReportToDocumentHtml({
  markdown: '## <img src=x onerror=alert(1)>\n\nA claim <script>alert(2)</script> here.',
  sources: [
    { title: '<script>alert(3)</script>', url: "javascript:alert(4)" },
    { title: "Real source", url: "https://example.com/a" },
  ],
  disclosure: "AI-generated <b>notice</b>",
  sourcesHeading: "Sources",
});
check("no script tag survives", !/<script/i.test(attacked));
check("no img tag is created from input", !/<img/i.test(attacked));
// The strongest form of the claim: EVERY tag in the output is one this
// function constructed. Asserting "the string onerror does not appear"
// would be weaker AND wrong — it appears, harmlessly, inside escaped text
// as `&lt;img src=x onerror=...&gt;`, which is exactly the correct
// outcome. What matters is that nothing from the input became markup.
const ALLOWED_TAGS = new Set(["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "a", "/h2", "/h3", "/p", "/ul", "/ol", "/li", "/strong", "/em", "/a"]);
const tagsFound = [...attacked.matchAll(/<(\/?[a-z0-9]+)/gi)].map((m) => m[1].toLowerCase());
check(
  "every tag in the output is from the allowlist",
  tagsFound.every((tag) => ALLOWED_TAGS.has(tag)),
  `unexpected: ${[...new Set(tagsFound.filter((t) => !ALLOWED_TAGS.has(t)))].join(", ")}`
);
// And the only attributes are the three the anchor builder writes.
const attrsFound = [...attacked.matchAll(/<[a-z0-9]+\s+([^>]*)>/gi)]
  .flatMap((m) => [...m[1].matchAll(/([a-zA-Z-]+)=/g)].map((a) => a[1]));
check(
  "and the only attributes are href/target/rel",
  attrsFound.every((a) => ["href", "target", "rel"].includes(a)),
  `unexpected: ${[...new Set(attrsFound)].join(", ")}`
);
check("a javascript: url never becomes an href", !/href="javascript:/i.test(attacked));
check("a hostile source title is escaped, not dropped", /&lt;script&gt;/.test(attacked));
check("a real https source still becomes a link", /href="https:\/\/example\.com\/a"/.test(attacked));
check("external links carry noopener noreferrer", /rel="noopener noreferrer"/.test(attacked));
check("citation numbering is preserved even for a rejected url", /\[1\]/.test(attacked) && /\[2\]/.test(attacked));
check("the disclosure is escaped too", !/<b>notice<\/b>/.test(attacked));

const normal = researchReportToDocumentHtml({
  markdown: "## Summary\n\nThe **key** finding is *clear*.\n\n- one\n- two\n\n1. first\n2. second",
  sources: [{ title: "Source A", url: "https://example.com" }],
  disclosure: "AI-generated.",
  sourcesHeading: "Sources",
});
check("headings render", /<h2>Summary<\/h2>/.test(normal));
check("paragraphs render", /<p>The <strong>key<\/strong> finding is <em>clear<\/em>\.<\/p>/.test(normal));
check("bullet lists render", /<ul><li>one<\/li><li>two<\/li><\/ul>/.test(normal));
check("numbered lists render", /<ol><li>first<\/li><li>second<\/li><\/ol>/.test(normal));
check("the AI disclosure travels with the document", /<em>AI-generated\.<\/em>/.test(normal));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
