// THE INSTRUMENT FOR "TWO SITES OF THE SAME KIND LOOK THE SAME", TESTED
// WITHOUT A KEY.
//
// scripts/website-pairs-check.mjs spends about $7.50 per run, so it is not
// in any suite. Its scoring and its report are what this file checks, by
// handing it pages on disk (--dry) with known answers: an identical pair
// that must score 1.00 on every axis and read "same skeleton" / "same
// look", and a pair built to differ on every axis that must not. If either
// verdict came out wrong here, the number the owner is about to pay for
// would be a confident lie — the reason site-fingerprint.mjs has its own
// tests, one level up.
//
// Run: node scripts/tests/website-pairs-check.test.mjs
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = "scripts/website-pairs-check.mjs";
const SIBLING = "scripts/website-variety-check.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

/** A page with every axis the fingerprint reads, set from the arguments. */
function page({ fonts, ground, accent, pads, motionMs, landmarks, decisions }) {
  const family = fonts.map((f) => f.replace(/ /g, "+")).join("&family=");
  const css =
    `body{background:${ground};color:${accent};font-family:'${fonts[0]}',serif}` +
    `h1,h2{font-family:'${fonts[1]}',sans-serif}` +
    pads.map((p, i) => `.s${i}{padding:${p}px 0}`).join("") +
    (motionMs ? `.reveal{transition:transform ${motionMs}ms ease;transform:translateY(${motionMs / 20}px)}` : "");
  const decl =
    `<!-- DESIGN DECISIONS\n` +
    `archetype: ${decisions.archetype}\nhero: ${decisions.hero}\n` +
    `sections: ${decisions.sections.join(", ")}\ntype: ${fonts.join(" / ")}\n-->\n`;
  const body = landmarks
    .map((tag, i) => (tag === "h1" || tag === "h2" ? `<${tag}>Title ${i}</${tag}>` : `<${tag} class="s${i % pads.length}"><p>Text ${i}</p></${tag}>`))
    .join("\n");
  return (
    `${decl}<!doctype html><html><head>` +
    `<link href="https://fonts.googleapis.com/css2?family=${family}&display=swap" rel="stylesheet">` +
    `<style>${css}</style></head><body>\n${body}\n</body></html>`
  );
}

const CAFE = page({
  fonts: ["Lora", "Inter"],
  ground: "#111111",
  accent: "#b45309",
  pads: [32, 64],
  motionMs: 400,
  landmarks: ["header", "nav", "h1", "section", "h2", "section", "ul", "section", "button", "footer"],
  decisions: { archetype: "local-place", hero: "split", sections: ["hero", "menu", "hours", "map"] },
});
const LAW_A = CAFE;
const LAW_B = page({
  fonts: ["Playfair Display", "Work Sans"],
  ground: "#fafafa",
  accent: "#1d4ed8",
  pads: [48, 96, 120],
  motionMs: 0,
  landmarks: ["main", "article", "aside", "form", "table", "figure", "h2", "h3", "footer"],
  decisions: { archetype: "professional-services", hero: "typographic", sections: ["promise", "areas", "people", "contact"] },
});

function run(args, { withKey = false, cwd = process.cwd() } = {}) {
  const env = { ...process.env };
  if (withKey) env.ANTHROPIC_API_KEY = "sk-test-not-real";
  else delete env.ANTHROPIC_API_KEY;
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env, cwd });
  return { status: r.status, out: String(r.stdout ?? ""), err: String(r.stderr ?? "") };
}

const dir = mkdtempSync(join(tmpdir(), "pairs-check-"));
try {
  // -------------------------------------------------------------------
  console.log("== 1. no key and no --dry is a refusal, not a run ==");
  const noKey = run([]);
  check("without a key and without --dry the run exits 2", noKey.status === 2, `exit ${noKey.status}`);
  check("and says which variable is missing", /ANTHROPIC_API_KEY/.test(noKey.err), noKey.err.slice(0, 200));
  check("and made no report", !readFileSafe(join(process.cwd(), "pairs-out", "pairs-report.json")));

  // -------------------------------------------------------------------
  console.log("\n== 2. an identical pair and a pair different on every axis ==");
  writeFileSync(join(dir, "cafe-a.html"), CAFE);
  writeFileSync(join(dir, "cafe-b.html"), CAFE);
  writeFileSync(join(dir, "law-a.html"), LAW_A);
  writeFileSync(join(dir, "law-b.html"), LAW_B);
  const both = run(["--dry", dir]);
  const report = JSON.parse(readFileSync(join(dir, "pairs-report.json"), "utf8"));
  const cafe = report.pairs.find((p) => p.slug === "cafe");
  const law = report.pairs.find((p) => p.slug === "law");

  check("both pairs on disk were scored", report.pairs.length === 2, JSON.stringify(report.pairs.map((p) => p.slug)));
  check("an identical pair scores 1.00 on the landmark sequence", cafe?.landmarks === 1, `landmarks ${cafe?.landmarks}`);
  check("an identical pair scores 1.00 on the edit-distance score", cafe?.editSimilarity === 1, `edit ${cafe?.editSimilarity}`);
  check("an identical pair scores 1.00 visually", cafe?.visual?.overall === 1, JSON.stringify(cafe?.visual));
  check("an identical pair collides on hero and on order", cafe?.sameHero === true && cafe?.sameOrder === true);
  check(
    "an identical pair is reported as the same skeleton",
    cafe?.verdict?.skeleton === "same skeleton" && /cafe\s.*same skeleton/.test(both.out),
    `verdict ${cafe?.verdict?.skeleton}`
  );
  check("an identical pair is reported as the same look", cafe?.verdict?.look === "same look", `verdict ${cafe?.verdict?.look}`);

  check(
    "the different pair scores below the similar-skeleton line",
    typeof law?.structure === "number" && law.structure < 0.7,
    `structure ${law?.structure} (landmarks ${law?.landmarks}, edit ${law?.editSimilarity})`
  );
  check("the different pair scores under the 0.30 visual target", law?.visual?.overall < 0.3, JSON.stringify(law?.visual));
  check(
    "the different pair collides on nothing",
    law?.sameArchetype === false && law?.sameHero === false && law?.sameOrder === false,
    JSON.stringify({ a: law?.sameArchetype, h: law?.sameHero, o: law?.sameOrder })
  );
  check("the different pair is reported as different shapes and looks", law?.verdict?.skeleton === "different shapes" && law?.verdict?.look === "different looks");

  check("pairs without pages are named as skipped", /skipped \(no pages\): photographer, dentist, gym, taverna, accountant, salon, realestate, yoga/.test(both.out), both.out.split("\n").filter((l) => /skipped/.test(l)).join(" | "));
  check("the report lists the same skipped pairs", report.skipped.length === 8 && report.skipped[0] === "photographer");
  check("the summary names the pair that is the same skeleton", /same skeleton in 1 pair\(s\) \(cafe\)/.test(both.out));
  check("the run exits 1 when a pair crosses a hard line", both.status === 1, `exit ${both.status}`);
  check("the verdict says not fixed", /SAME TEMPLATE .*Not fixed/.test(both.out));

  // -------------------------------------------------------------------
  console.log("\n== 3. only the different pair: a clean run exits 0 ==");
  const clean = mkdtempSync(join(tmpdir(), "pairs-check-clean-"));
  writeFileSync(join(clean, "law-a.html"), LAW_A);
  writeFileSync(join(clean, "law-b.html"), LAW_B);
  const ok = run(["--dry", clean]);
  const cleanReport = JSON.parse(readFileSync(join(clean, "pairs-report.json"), "utf8"));
  check("a run with no pair over a hard line exits 0", ok.status === 0, `exit ${ok.status}`);
  check("its report has the one pair", cleanReport.pairs.length === 1 && cleanReport.pairs[0].slug === "law");
  check("and both verdicts are clean", /every pair has its own shape/.test(ok.out) && /every pair looks like its own site/.test(ok.out));
  rmSync(clean, { recursive: true, force: true });

  // -------------------------------------------------------------------
  console.log("\n== 4. nothing scored is its own failure ==");
  const empty = mkdtempSync(join(tmpdir(), "pairs-check-empty-"));
  const none = run(["--dry", empty]);
  check("an empty directory exits 2, not 0", none.status === 2, `exit ${none.status}`);
  check("and says it scored 0 pairs", /pairs scored\s+: 0 of 10/.test(none.out));
  rmSync(empty, { recursive: true, force: true });

  // -------------------------------------------------------------------
  console.log("\n== 5. --pairs N limits the run to the first N ==");
  const one = run(["--dry", dir, "--pairs", "1"]);
  const oneReport = JSON.parse(readFileSync(join(dir, "pairs-report.json"), "utf8"));
  check("--pairs 1 scores the first pair only", oneReport.pairs.length === 1 && oneReport.pairs[0].slug === "cafe");
  check("and skips nothing (the others were not asked for)", oneReport.skipped.length === 0 && !/skipped/.test(one.out));

  // -------------------------------------------------------------------
  console.log("\n== 6. what a paid run would do, read off the source ==");
  const src = readFileSync(SCRIPT, "utf8");
  const sibling = readFileSync(SIBLING, "utf8");
  check(
    "the two sites of a pair are drawn as two different users",
    /\[`pairs-check-\$\{side\}`, 0, brief\]/.test(src),
    "the default seed must vary by side and keep the site count at 0"
  );
  check("--same-user seeds one user's first and second site", /sameUser \? \["pairs-check-a", side === "a" \? 0 : 1, brief\]/.test(src));
  check("the production draw is used, not a bare brief", /variation\.variationDirective\(variation\.pickVariation\(seed\)\)/.test(src));
  check("the production generator is used", /wb\.generateWebsiteHtml\(apiKey, brief/.test(src));
  check("the shipped structural score is measured with the shipped code", /structural\.compareStructure\(htmlA, htmlB\)/.test(src));
  check("every generated page is written to disk for --dry later", /writeFileSync\(file, html\)/.test(src));
  check(
    "the thresholds are the ones website-variety-check.mjs states",
    /SAME_SKELETON = 0\.85;/.test(src) &&
      /SIMILAR_SKELETON = 0\.7;/.test(src) &&
      /SAME_LOOK = 0\.7;/.test(src) &&
      /LOOK_TARGET = 0\.3;/.test(src) &&
      /worstStructure > 0\.85/.test(sibling) &&
      /worstVisual > 0\.7/.test(sibling) &&
      /worstVisual > 0\.3/.test(sibling)
  );
  check("ten pairs, two briefs each, no brief repeated", (() => {
    const briefs = [...src.matchAll(/^\s+(a|b): "([^"]+)",$/gm)].map((m) => m[2]);
    const slugs = [...src.matchAll(/^\s+slug: "([^"]+)",$/gm)].map((m) => m[1]);
    return slugs.length === 10 && briefs.length === 20 && new Set(briefs).size === 20;
  })());
  check("the header states the cost and why it is not a suite", /\$7\.50/.test(src) && /not part of any test suite/i.test(src));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function readFileSafe(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
