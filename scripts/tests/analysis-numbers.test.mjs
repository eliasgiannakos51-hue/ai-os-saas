// ANALYZE WITH EXCEL: A CHART, AN EXPLANATION, AND HOW EVERY NUMBER WAS
// MADE (MASTER 16, package 16), behind the switch "analysis-provenance".
//
// Analyze already kept the model away from the rows: it is handed
// statistics computed in TypeScript and asked what they mean. What it
// still did was TYPE the numbers back into its prose, and a typed number
// is one nobody can follow back to the file. Now every statistic is a
// FACT with an id; the model writes {F7}; the application writes the
// number and can say what it is. What would be wrong quietly:
//
//   A TYPED NUMBER THAT IS NO FACT, shown anyway. Section 3 hands the
//   parser one and requires the finding gone, and said.
//
//   A FACT THAT IS NOT WHAT IT SAYS. Section 1 reads a real workbook and
//   checks each fact against the arithmetic done here, by hand.
//
//   A PRICE THAT IS NOT THE HOLD. The facts block makes the request
//   longer; section 4 holds the price route and the analyse route to the
//   one function that builds what is sent.
//
//   A CHART VALUE WITH NO ROWS. Section 2 counts them.
//
// Run: node scripts/tests/analysis-numbers.test.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const read = (f) => stripComments(readFileSync(f, "utf8"));
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));

const F = await loadTs("src/lib/data-analysis/facts.ts");
const A = await loadTs("src/lib/data-analysis/analyse.ts");
const { buildChart, AGGREGATIONS } = await loadTs("src/lib/data-analysis/charts.ts");
const { readUpload } = await loadTs("src/lib/data-analysis/store.ts");

/** A real .xlsx: shared strings, a styled date column, numbers. */
async function workbook(header, rows) {
  const zip = new JSZip();
  const strings = [];
  const sid = (s) => { const i = strings.indexOf(s); if (i >= 0) return i; strings.push(s); return strings.length - 1; };
  const col = (i) => String.fromCharCode(65 + i);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const cell = (v, r, c) => {
    const ref = `${col(c)}${r}`;
    if (v && typeof v === "object" && "date" in v) return `<c r="${ref}" s="1"><v>${v.date}</v></c>`;
    if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="s"><v>${sid(v)}</v></c>`;
  };
  const sheetRows = [header, ...rows].map((row, i) => `<row r="${i + 1}">${row.map((v, c) => (v === null ? "" : cell(v, i + 1, c))).join("")}</row>`).join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0"?><workbook><sheets><sheet name="Πωλήσεις" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0"?><styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`);
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0"?><sst>${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

// Excel serials: 45658 is 2025-01-01, 45689 is 2025-02-01, 45717 is 2025-03-01.
const SALES = [
  [{ date: 45658 }, "Νάξος", 1200, 14, "Q1"],
  [{ date: 45658 }, "Πάρος", 800, 9, "Q1"],
  [{ date: 45689 }, "Νάξος", 1500.5, 17, "Q1"],
  [{ date: 45689 }, "Σύρος", 300, 4, "Q1"],
  [{ date: 45717 }, "Πάρος", 950, 11, "Q1"],
  [{ date: 45717 }, "Νάξος", 0.1, 1, "Q1"],
  [{ date: 45717 }, "Νάξος", null, 1, "Q1"],
];
const upload = readUpload(await workbook(["Μήνας", "Νησί", "Έσοδα", "Παραγγελίες", "Τρίμηνο"], SALES));
const { headers, rows, profile } = upload.dataset;
const facts = F.buildFacts(profile);
const find = (kind, column, label) => facts.find((f) => f.kind === kind && f.column === column && (label === undefined || f.label === label));

console.log("== 1. the facts of a real workbook, against the arithmetic done here ==");
{
  ok("the workbook is read as the upload route reads it", upload.ok && rows.length === 7);
  const revenue = SALES.map((r) => r[2]).filter((v) => v !== null);
  const sum = revenue.reduce((s, v) => s + v, 0);
  ok(`every row is a fact: ${facts.find((f) => f.kind === "rows")?.value} rows`, facts[0].id === "F1" && facts[0].kind === "rows" && facts[0].value === 7);
  ok(`the sum of «Έσοδα» is ${sum}, over the ${revenue.length} rows with a value`, Math.abs(find("sum", "Έσοδα").value - sum) < 1e-9 && find("sum", "Έσοδα").rows === revenue.length);
  ok("...its mean is that sum over those rows", Math.abs(find("mean", "Έσοδα").value - sum / revenue.length) < 1e-9);
  ok("...its smallest and largest are the file's", find("min", "Έσοδα").value === 0.1 && find("max", "Έσοδα").value === 1500.5);
  ok("...and the row without a value is counted as missing, not as zero", find("missing", "Έσοδα")?.value === 1 && find("missing", "Έσοδα").rows === 7);
  ok("a category's commonest value is counted: Νάξος in 4 rows", find("topCount", "Νησί", "Νάξος")?.value === 4);
  ok("a date column's first and last dates are facts", find("from", "Μήνας")?.label === "2025-01-01" && find("to", "Μήνας")?.label === "2025-03-01");
  ok("every fact has its own id, F1 onwards", new Set(facts.map((f) => f.id)).size === facts.length && facts.every((f, i) => f.id === `F${i + 1}`));
  const block = F.renderFactsForModel(facts);
  ok("the model is shown every fact, by id, with its value", facts.length > 10 && facts.every((f) => block.includes(`[${f.id}] `)) && block.includes(`[${find("sum", "Έσοδα").id}] sum of "Έσοδα" = 4751 (6 rows)`), block.split("\n").slice(0, 4).join(" | "));
  ok("...and told to write {F7}, never the digits", /write \{F1\}, \{F2\}… where the number goes, never the digits/.test(block) && /never type the digits yourself/.test(F.FACTS_RULE));
}

console.log("\n== 2. every chart value, with the rows it came from ==");
{
  const bar = buildChart({ kind: "bar", title: "t", x: "Νησί", y: "Έσοδα", aggregation: "sum" }, profile, headers, rows);
  const naxos = bar.points.find((p) => p.label === "Νάξος");
  ok("Νάξος: the sum of its three rows with a value, and it says three", naxos && Math.abs(naxos.value - 2700.6) < 1e-9 && naxos.rows === 3, JSON.stringify(naxos));
  ok("the rows of all the bars are the rows with a value", bar.points.reduce((s, p) => s + p.rows, 0) === 6);
  const count = buildChart({ kind: "pie", title: "t", x: "Νησί", aggregation: "count" }, profile, headers, rows);
  ok("a count's rows are the count", count.points.every((p) => p.rows === p.value));
  const many = Array.from({ length: 30 }, (_, i) => [`κ${i}`, String(i + 1)]);
  const wide = (await loadTs("src/lib/data-analysis/profile.ts")).profileTable(["Κατηγορία", "Τιμή"], many);
  const gathered = buildChart({ kind: "bar", title: "t", x: "Κατηγορία", y: "Τιμή", aggregation: "sum" }, wide, ["Κατηγορία", "Τιμή"], many);
  const other = gathered.points.find((p) => p.label === "Other");
  ok("what is gathered into Other carries the rows it gathered", other && other.rows === 30 - 19, JSON.stringify(other));
}

console.log("\n== 3. the reply: every number a fact, or the finding is not shown ==");
{
  const sumId = find("sum", "Έσοδα").id;
  const meanId = find("mean", "Έσοδα").id;
  const raw = JSON.stringify({
    summary: `Επτά γραμμές πωλήσεων, έσοδα {${sumId}} συνολικά. Κάτι για 999 πελάτες. Από 2025-01-01 ως 2025-03-01.`,
    findings: [
      { headline: `Η Νάξος έχει τα περισσότερα έσοδα`, detail: `Μέσος όρος {${meanId}}, το μεγαλύτερο 1500.5 στο Q1.`, columns: ["Έσοδα", "Τρίμηνο"] },
      { headline: "Ένας αριθμός από το πουθενά", detail: "Τα έσοδα αυξήθηκαν 37%.", columns: ["Έσοδα"] },
      { headline: "Μια αναφορά που δεν υπάρχει", detail: "Είναι {F999}.", columns: [] },
    ],
    charts: [{ kind: "bar", title: "Έσοδα ανά νησί", x: "Νησί", y: "Έσοδα", aggregation: "sum" }],
    suggestedQuestions: [`Ποια νησιά είναι πάνω από {${meanId}};`],
  });
  const out = A.parseAnalysisWithFacts(raw, profile, facts, "el");
  const kept = out.findings.findings;
  ok("the finding whose numbers are facts is kept", kept.length === 1 && kept[0].headline === "Η Νάξος έχει τα περισσότερα έσοδα");
  ok("...its reference is the fact", kept[0].detailParts.some((p) => p.fact === meanId));
  ok("...and a number it typed that IS a fact becomes that fact (the largest «Έσοδα»)", kept[0].detailParts.some((p) => p.fact === find("max", "Έσοδα").id));
  ok("...while «Q1», a value of the file, stays a word", kept[0].detailParts.some((p) => "text" in p && p.text.includes("Q1")));
  ok("its plain text carries the numbers as Greek writes them", kept[0].detail === "Μέσος όρος 791,77, το μεγαλύτερο 1.500,5 στο Q1.", kept[0].detail);
  ok("a typed number that is no fact drops its finding, and says so", !kept.some((f) => f.headline.includes("πουθενά")) && out.rejected.some((r) => r.includes("37")));
  ok("a reference to a fact that does not exist drops its finding", !kept.some((f) => f.headline.includes("αναφορά")) && out.rejected.some((r) => r.includes("{F999}")));
  ok("the summary keeps its true sentences and loses the one with 999", out.findings.summary.startsWith("Επτά γραμμές πωλήσεων, έσοδα 4.750,6 συνολικά.") && !out.findings.summary.includes("999"), out.findings.summary);
  ok("...a date written out is the date fact", out.findings.summaryParts.some((p) => p.fact === find("from", "Μήνας").id) && out.findings.summaryParts.some((p) => p.fact === find("to", "Μήνας").id));
  ok("only the facts used are stored, each with what it is", out.findings.facts.length >= 4 && out.findings.facts.every((f) => typeof f.kind === "string" && f.id) && out.findings.facts.length < facts.length);
  ok("a question offered back has its number written in", out.findings.suggestedQuestions[0] === "Ποια νησιά είναι πάνω από 791,77;", out.findings.suggestedQuestions[0]);
  ok("the chart is still the validated chart", out.findings.charts.length === 1 && out.findings.charts[0].x === "Νησί");
  const english = A.parseAnalysisWithFacts(raw, profile, facts, "en");
  ok("in English the same fact reads 4,750.6", english.findings.summary.includes("4,750.6"));
  const typedRounded = F.resolveText("about 4,751 in all", facts, ["Έσοδα"]);
  ok("a typed number rounded as written is the fact it rounds (4,751 is the sum 4,750.6)", typedRounded.stray.length === 0 && typedRounded.parts.some((p) => p.fact === sumId));
  const three = F.resolveText("3 νησιά", facts, ["Νησί"]).parts.find((p) => p.fact);
  ok("a typed number two facts share is the one about the finding's own column", three && facts.find((f) => f.id === three.fact)?.column === "Νησί" && facts.find((f) => f.id === three.fact)?.kind === "distinct", JSON.stringify(three));
  ok("...and one that is not, is not (4,760)", F.resolveText("about 4,760 in all", facts, ["Έσοδα"]).stray.includes("4,760"));
}

console.log("\n== 4. what is sent, priced and held: one function ==");
{
  const params = { fileName: "πωλήσεις.xlsx", profile, headers, rows };
  const off = A.analysisBrief(params, false);
  const on = A.analysisBrief(params, true);
  ok("without the switch, exactly the brief sent before", off.brief === A.buildProfileBrief(params) && off.facts.length === 0);
  ok("with it, the rule and then the facts follow the brief", on.brief.startsWith(off.brief) && on.brief.indexOf(F.FACTS_RULE.trim()) > off.brief.length && on.brief.endsWith(F.renderFactsForModel(on.facts)));
  const analyse = read("src/app/api/data-analysis/[id]/analyse/route.ts");
  const price = read("src/app/api/data-analysis/[id]/price/route.ts");
  ok("the analyse route sends what analysisBrief builds, behind the switch, under the same system prompt", /const withFacts = await isFeatureOn\("analysis-provenance", user\);/.test(analyse) && /analysisBrief\(\s*\{[^}]+\},\s*withFacts\s*\)/.test(analyse) && /system: \[\{ type: "text", text: ANALYSIS_SYSTEM \}\]/.test(analyse) && /messages: \[\{ role: "user", content: brief \}\]/.test(analyse));
  ok("...and reads the reply against the facts it sent", /withFacts \? parseAnalysisWithFacts\(outcome\.text, profile, facts, locale\) : parseAnalysis\(outcome\.text, profile\)/.test(analyse));
  ok("the hold and the quote are both the system prompt and the brief with its facts", /inputChars: ANALYSIS_SYSTEM\.length \+ brief\.length/.test(analyse) && /inputChars: ANALYSIS_SYSTEM\.length \+ brief\.length/.test(price) && /await isFeatureOn\("analysis-provenance", user\)/.test(price) && /analysisBrief\(/.test(price));
  ok("the reader's language is one the app speaks, or English", /\(SUPPORTED_LOCALES as readonly string\[\]\)\.includes\(body\.locale\) \? body\.locale : "en"/.test(analyse));
}

console.log("\n== 5. the screen ==");
{
  const shell = read("src/components/data-analysis/analysis-shell.tsx");
  const chart = read("src/components/data-analysis/analysis-chart.tsx");
  const factText = read("src/components/data-analysis/fact-text.tsx");
  const page = read("src/app/dashboard/data-analysis/page.tsx");
  ok("the page passes the switch", /provenance=\{await isFeatureOn\("analysis-provenance", user\)\}/.test(page));
  ok("with it, the summary and every finding draw their numbers as facts", (shell.match(/provenance && (?:current\.findings\.summaryParts|finding\.headlineParts|finding\.detailParts) \? <FactText parts=/g) ?? []).length === 3);
  ok("a fact is a button that says what it is and from how many rows", /data-testid="fact"/.test(factText) && /onClick=\{\(\) => setOpen\(/.test(factText) && /\{formatFact\(shown, locale\)\} — \{explain\(shown\)\}/.test(factText) && /t\(fact\.kind, \{\s*column: fact\.column \?\? "",\s*other: fact\.other \?\? "",\s*label: fact\.label \?\? "",\s*rows: fact\.rows \?\? 0,/.test(factText));
  ok("every fact used is listed under «How the numbers were made»", /data-testid="analysis-how"/.test(shell) && /facts\.map\(\(fact\) => \(\s*<li key=\{fact\.id\} data-testid="analysis-how-fact">/.test(shell));
  ok("every chart says how each value was made, with its rows, under the switch", /<AnalysisChart key=\{`\$\{chart\.spec\.title\}-\$\{index\}`\} chart=\{chart\} how=\{provenance\} \/>/.test(shell) && /\{how && spec\.kind !== "scatter" \? <ChartHow chart=\{chart\} \/> : null\}/.test(chart) && /tHow\("point", \{ rows: point\.rows \}\)/.test(chart));
  ok("the request says the reader's language", /body: JSON\.stringify\(\{ locale \}\)/.test(shell));
  ok("findings left out for a number are said", /if \(provenance && Number\(body\?\.dropped\) > 0\) note\("tool", t\("how\.dropped", \{ count: Number\(body\.dropped\) \}\)\);/.test(shell));
}

console.log("\n== 6. the words, and the switch ==");
{
  for (const l of LOCALES) {
    const how = messages[l].dataAnalysis?.how ?? {};
    const missing = [
      ...F.FACT_KINDS.filter((k) => typeof how[k] !== "string"),
      ...AGGREGATIONS.filter((a) => typeof how.chart?.[a] !== "string").map((a) => `chart.${a}`),
      ...["title", "press", "chartTitle", "point", "other", "dropped"].filter((k) => typeof how[k] !== "string"),
    ];
    const columnless = ["sum", "mean", "median", "min", "max", "missing", "distinct", "outliers", "topCount", "r", "from", "to"].filter((k) => !String(how[k] ?? "").includes("{column}"));
    ok(`${l}: every kind of fact and every aggregation is explained, naming its column`, missing.length === 0 && columnless.length === 0 && String(how.r ?? "").includes("{other}") && String(how.topCount ?? "").includes("{label}"), [...missing, ...columnless].join(", "));
  }
  ok('the switch "analysis-provenance" is declared', /\n  "analysis-provenance": "/.test(readFileSync("src/lib/flags/flags.ts", "utf8")));
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exitCode = failures.length ? 1 : 0;
