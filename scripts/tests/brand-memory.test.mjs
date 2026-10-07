/*
 * THE BUSINESS, REMEMBERED (MASTER 16, package 6): «λέω στο Chat το όνομα
 * και τα χρώματα της επιχείρησής μου, και το Site τα χρησιμοποιεί χωρίς
 * να τα ξαναγράψω».
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. A colour as people say it becomes a hex: Greek and English, any
 *      case, with or without accents, the longer name before the shorter.
 *   2. The extractor's answer is split into rows: each brand line its own.
 *   3. The newest name and the newest colours win.
 *   4. The brief gets exactly the lines the form's own colours produce,
 *      the name when the brief does not already say it, and nothing when
 *      the person already chose colours for this site.
 *   5. The wiring, behind the switch "brand-memory": the chat asks for the
 *      lines only with it on, records each row, and the site generation
 *      reads them under the same memory rule as the memory block, appends
 *      them to the brief the model is sent, and notes what it used.
 *   6. The note is read back defensively and said in ten languages.
 *
 * The same chain against a fake model, from the chat's answer to the
 * request the site generator sends: scripts/tests/brand-memory.itest.mjs.
 *
 * Run: node scripts/tests/brand-memory.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
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
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
const code = (p) => stripComments(readFileSync(p, "utf8"));

const brand = await loadTs("src/lib/memory/brand.ts");
const design = await loadTs("src/lib/website-design-brief.ts");
const notes = await loadTs("src/lib/website-generation-notes.ts");

console.log("brand-memory");

// ---------------------------------------------------------------------
console.log("\n== 1. a colour as people say it ==");
// ---------------------------------------------------------------------
const COLOURS = [
  ["navy", "#1f2a44"],
  ["ναυτικό μπλε", "#1f2a44"],
  ["ΝΑΥΤΙΚΟ ΜΠΛΕ", "#1f2a44"],
  ["σκούρο μπλε", "#1f2a44"],
  ["μπλε", "#1d4ed8"],
  ["χρυσό", "#c9a227"],
  ["Χρυσαφί χρυσό", "#c9a227"],
  ["gold", "#c9a227"],
  ["#C9A227", "#c9a227"],
  ["#fff", "#fff"],
  ["μπορντό", "#7b1e2e"],
  ["περλέ", null],
  ["", null],
];
for (const [said, hex] of COLOURS) {
  check(`"${said}" -> ${hex}`, brand.colourHex(said) === hex, brand.colourHex(said));
}
check('a word inside another word is not a colour ("redesign" is not red)', brand.colourHex("redesign") === null);

// ---------------------------------------------------------------------
console.log("\n== 2. the extractor's answer, as rows ==");
// ---------------------------------------------------------------------
const ANSWER = "Τον λένε Ηλία και φτιάχνει ένα SaaS.\nΕπιχείρηση: «Αύρα Camping».\nΧρώματα επιχείρησης: ναυτικό μπλε και χρυσό";
const rows = brand.splitBrandLines(ANSWER);
check("three rows: the fact, the name, the colours", rows.length === 3, JSON.stringify(rows));
check("the fact is its own row, unchanged", rows[0] === "Τον λένε Ηλία και φτιάχνει ένα SaaS.");
check("the name row, without the quotes and the full stop", rows[1] === "Επιχείρηση: Αύρα Camping", rows[1]);
check("the colours row", rows[2] === "Χρώματα επιχείρησης: ναυτικό μπλε και χρυσό", rows[2]);
check("an answer with no brand line is one row, as before", JSON.stringify(brand.splitBrandLines("Του αρέσει ο καφές.")) === JSON.stringify(["Του αρέσει ο καφές."]));
check("an empty brand line is dropped", JSON.stringify(brand.splitBrandLines("Επιχείρηση: «»")) === "[]");

// ---------------------------------------------------------------------
console.log("\n== 3. the newest name and colours win ==");
// ---------------------------------------------------------------------
// The older name sits BEFORE the newest colours, so reading on past the
// first name would reach it before the search can stop.
const remembered = brand.readBrand([
  { text: "Του αρέσει ο καφές." },
  { text: "Επιχείρηση: Αύρα Camping" },
  { text: "Επιχείρηση: Παλιό Όνομα" },
  { text: "Χρώματα επιχείρησης: ναυτικό μπλε και χρυσό" },
  { text: "Χρώματα επιχείρησης: κόκκινο" },
]);
check("the newest name", remembered.name === "Αύρα Camping", remembered.name);
check("the newest colours, both of them", JSON.stringify(remembered.colours) === JSON.stringify([{ said: "ναυτικό μπλε", hex: "#1f2a44" }, { said: "χρυσό", hex: "#c9a227" }]), JSON.stringify(remembered.colours));
check("nothing remembered, nothing read", JSON.stringify(brand.readBrand([{ text: "Του αρέσει ο καφές." }])) === JSON.stringify({ name: null, colours: [] }));
check("colours split on commas and on \"and\" in English", brand.readBrand([{ text: "Χρώματα επιχείρησης: navy, gold and white" }]).colours.map((c) => c.hex).join(",") === "#1f2a44,#c9a227,#ffffff");

// ---------------------------------------------------------------------
console.log("\n== 4. what reaches the brief ==");
// ---------------------------------------------------------------------
const plain = brand.brandBriefFor(remembered, "Φτιάξε μου site για το camping μου.");
const formLines = design.buildDesignBrief({ ...design.DEFAULT_DESIGN_CHOICES, primaryColor: "#1f2a44", secondaryColor: "#c9a227" }).split("\n").filter((l) => /COLOUR:|Build the rest of the palette/.test(l));
check("the colour lines are exactly the ones the form's own colours write", formLines.length === 3 && formLines.every((l) => plain.brief.includes(l)), plain.brief);
check("the name is named, as said", plain.brief.includes("BUSINESS NAME: «Αύρα Camping»"));
check("...and what was used is reported for the note", plain.used.name === "Αύρα Camping" && plain.used.colours.join("|") === "ναυτικό μπλε|χρυσό");
const named = brand.brandBriefFor(remembered, "Site για το ΑΥΡΑ CAMPING στη Νάξο.");
check("a name the brief already says is not added again (any case, any accent)", !named.brief.includes("BUSINESS NAME") && named.used.name === null);
const chosen = brand.brandBriefFor(remembered, design.applyDesignBrief("Site για camping.", { ...design.DEFAULT_DESIGN_CHOICES, primaryColor: "#ff0000" }));
check("colours chosen in the form for this site win: none are added", !chosen.brief.includes("#1f2a44") && chosen.used.colours.length === 0);
const unknown = brand.brandBriefFor({ name: null, colours: [{ said: "περλέ", hex: null }] }, "Site.");
check("a colour this does not know is passed as said", unknown.brief.includes("BRAND COLOURS, as the person said them: περλέ"));
check("nothing remembered adds nothing", brand.brandBriefFor({ name: null, colours: [] }, "Site.").brief === "");

// ---------------------------------------------------------------------
console.log("\n== 5. the wiring, behind the switch ==");
// ---------------------------------------------------------------------
check('"brand-memory" is declared as a switch', /\n  "brand-memory": "/.test(code("src/lib/flags/flags.ts")));
const extractor = code("src/lib/chat/memory.ts");
check("the extractor asks for the brand lines only with the switch on", /system: brand \? `\$\{EXTRACTION_SYSTEM_PROMPT\}\$\{BRAND_EXTRACTION_RULE\}` : EXTRACTION_SYSTEM_PROMPT/.test(extractor));
check("...naming both prefixes", /BRAND_EXTRACTION_RULE =[\s\S]{0,200}\$\{BRAND_NAME_PREFIX\}[\s\S]{0,400}\$\{BRAND_COLOURS_PREFIX\}/.test(extractor));
check("...and records each row on its own", /for \(const row of brand \? splitBrandLines\(extracted\) : \[extracted\]\) \{[\s\S]{0,200}p_memory_text: row,/.test(extractor));
check("the chat passes the switch", /extractAndStoreMemory\(\{[\s\S]{0,300}brand: await isFeatureOn\("brand-memory", user\)/.test(code("src/app/api/chat/route.ts")));
const site = code("src/app/api/websites/generate/process/route.ts");
check("the site reads the business under the website memory rule AND the switch",
  /memoryActiveFor\(\{ surface: "website", user, planLimit: [^}]+\}\) &&\s*\(await isFeatureOn\("brand-memory", user\)\)\s*\?\s*brandBriefFor\(readBrand\(await loadMemories\(supabase, user\.id,/.test(site));
check("...and the model is sent the brief with it", /generateWebsiteHtml\(\s*apiKey,\s*`\$\{description\}\$\{brand\?\.brief \?\? ""\}`,/.test(site));
check("...and what was used is a note on the row", /notes\.push\(\{ kind: "fromMemory", name: brand\.used\.name, colours: brand\.used\.colours \}\)/.test(site));
const line = code("src/components/website-builder/use-remembered-line.ts");
check("one sentence for it, from the note on the row", /parseGenerationNotes\(record\.generation_notes\)\.find\(\(n\): n is FromMemory => n\.kind === "fromMemory"\)/.test(line) && /notes\.fromMemory\.both/.test(line));
check("the Site shell says it after the site is made", /const fromMemory = remembered\.forRecord\(record\);\s*if \(fromMemory\) say\(/.test(code("src/components/website-builder/website-shell.tsx")));
check("...and so does the old page", /case "fromMemory":\s*return remembered\.sentence\(note\);/.test(code("src/components/website-builder/website-builder-workspace.tsx")));

// ---------------------------------------------------------------------
console.log("\n== 6. the note ==");
// ---------------------------------------------------------------------
const parsed = notes.parseGenerationNotes([
  { kind: "fromMemory", name: "Αύρα Camping", colours: ["ναυτικό μπλε", "χρυσό", 7, ""] },
  { kind: "fromMemory", name: "", colours: [] },
  { kind: "fromMemory", name: "x".repeat(200), colours: ["a", "b", "c", "d", "e"] },
]);
check("a note is read back with only its strings", JSON.stringify(parsed[0]) === JSON.stringify({ kind: "fromMemory", name: "Αύρα Camping", colours: ["ναυτικό μπλε", "χρυσό"] }), JSON.stringify(parsed[0]));
check("an empty one is dropped, and a long one is cut", parsed.length === 2 && parsed[1].name.length === 80 && parsed[1].colours.length === 4);
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the ten languages (${LOCALES.length})`, LOCALES.length === 10);
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.websiteBuilder?.notes?.fromMemory ?? {};
  check(`${file}: the three sentences, with their names in them`,
    /\{name\}/.test(m.name ?? "") && /\{colours\}/.test(m.colours ?? "") && /\{name\}/.test(m.both ?? "") && /\{colours\}/.test(m.both ?? "")
      && !/'\{/.test(`${m.name}${m.colours}${m.both}`));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
