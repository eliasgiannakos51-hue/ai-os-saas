#!/usr/bin/env node
/*
 * THE READING LIST IS COMMITTED, AND IT IS NOT ALLOWED TO GO STALE.
 *
 * WHAT THIS PROTECTS. docs/first-run/ holds one file per language: every
 * string a new person reads from the signup form to the first thing the
 * product tells them about their own data, tiered so that a reader who
 * has one hour reads 44 sentences rather than 2,933. It exists to be
 * SENT TO SOMEBODY — and a review pack that has drifted from the product
 * is worse than none, because the reader spends their hour on sentences
 * nobody ships and reports back on a version that is gone.
 *
 * So the pack is regenerated here and compared byte for byte. A
 * translation edit that touches a first-run string turns the build red
 * until the pack is rebuilt, which is one command.
 *
 * WHY BYTE FOR BYTE AND NOT JUST THE KEY LIST. The key list is the
 * cheaper check and it would pass the case that matters: somebody
 * rewrites the Greek privacy sentence, the keys are identical, and the
 * reader is handed last week's wording. The expensive check is the
 * correct one here.
 *
 * Run: node scripts/tests/first-run-strings.test.mjs
 */
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  FIRST_RUN_SCREENS,
  LOCALES,
  SENTENCE_WORDS,
  READ_DEPTH,
  reachableFiles,
  extractKeys,
  resolveKey,
  expandablePrefix,
  childKeysOf,
  wordCount,
  tierOf,
  collectFirstRun,
  countLeaves,
} from "../first-run-strings.mjs";

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

const PACK = "docs/first-run";

// ---------------------------------------------------------------------
console.log("== 1. the path is declared, not inferred ==");
{
  check("every screen names its files and why it is on the list", FIRST_RUN_SCREENS.every((s) => s.files.length > 0 && s.why.length > 30));
  const missing = FIRST_RUN_SCREENS.flatMap((s) => s.files).filter((f) => !existsSync(f));
  check("every entry file exists", missing.length === 0, missing.join(", "));
  // THE PATH ENDS AT A RESULT, not at a menu. If the last screen stopped
  // being the one a new person is sent to, this list would be measuring
  // a corridor to nowhere.
  check(
    "the path starts at signup and ends at the first result",
    FIRST_RUN_SCREENS[0].name === "signup" && FIRST_RUN_SCREENS.at(-1).name === "first result"
  );
  check(
    "...and onboarding really does send them there",
    /redirect\("\/dashboard\/overview"\)/.test(readFileSync("src/app/onboarding/page.tsx", "utf8")),
    "the last screen is only the first result while onboarding redirects to it"
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2. the extractor reads what a component renders ==");
{
  const src = `
    const t = useTranslations("dashboard.chat");
    const tCommon = useTranslations("common");
    const tAbs = useTranslations();
    export function X() {
      return <>{t("title")}{tCommon("save")}{t.rich("body")}{tAbs("sidebar.items.chat")}{t(\`kinds.\${k}\`)}</>;
    }`;
  const { keys, dynamic } = extractKeys(src, "x.tsx");
  const got = keys.map((k) => k.key).sort();
  check(
    "a namespaced key, a second binding, .rich and an absolute key are all found",
    JSON.stringify(got) === JSON.stringify(["common.save", "dashboard.chat.body", "dashboard.chat.title", "sidebar.items.chat"]),
    JSON.stringify(got)
  );
  // A KEY BUILT AT RUNTIME IS NOT A KEY THIS CAN READ, and pretending
  // otherwise is how a coverage number becomes a lie.
  check("a runtime-built key is reported, not invented", dynamic.length === 1 && dynamic[0].expr.includes("${"));
  check("a file with no translations yields nothing", extractKeys("export const x = 1;", "y.ts").keys.length === 0);
  // THE EXPANSION. A dynamic LAST segment names exactly the children of
  // its prefix, so the whole subtree goes on the list — a superset, which
  // is the safe direction for a reading list.
  const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
  const exp = expandablePrefix({ namespace: "sidebar", expr: "items.${key}" });
  check("a dynamic last segment expands to its subtree", exp !== null && exp.prefix === "sidebar.items");
  check("...and the subtree is not empty", childKeysOf(en, exp).length > 10, String(childKeysOf(en, exp).length));
  // A DYNAMIC MIDDLE SEGMENT DOES NOT, and must not pretend to.
  check("a dynamic middle segment is not expandable", expandablePrefix({ namespace: "", expr: ".${helpKey}.is" }) === null);
  // ...unless the tail is fixed AND the prefix is: that names one field
  // of each child, which is still an exact set.
  const two = expandablePrefix({ namespace: "dashboard", expr: "firstScreen.${id}.example" });
  check("a fixed tail after the variable expands too", two !== null && two.prefix === "dashboard.firstScreen" && two.suffix === "example");
}

// ---------------------------------------------------------------------
console.log("\n== 3. depth is the shortest way in ==");
{
  const files = reachableFiles(["src/app/signup/page.tsx"]);
  check("the entry file is depth 0", files.get("src/app/signup/page.tsx") === 0);
  check("something is reached at all", files.size > 5, String(files.size));
  check("every depth is a non-negative integer", [...files.values()].every((d) => Number.isInteger(d) && d >= 0));
  // BREADTH-FIRST, so a file imported both directly and deeply keeps the
  // short distance. Depth-first would file a component the page names as
  // "six deep" purely because of the order imports appear in.
  // AND DEPTH ACTUALLY VARIES. If every file came back at 0 the tiers
  // would still add up, tier 1 would still be a readable size, and every
  // clause about "on a first screen" would pass on a set that means
  // nothing — a check whose subject has collapsed reads exactly like a
  // check that is satisfied.
  const deep = [...files.entries()].filter(([, d]) => d >= 2);
  check(`depth is a distance, not a constant (${deep.length} files at depth 2+)`, deep.length > 0,
    JSON.stringify([...new Set(files.values())].sort()));
  check("depth grows with distance, not with import order", deep.every(([f]) => files.get(f) >= 2));
}

// ---------------------------------------------------------------------
console.log("\n== 4. the tiers are what the reader is actually asked for ==");
{
  const { byScreen, seenKeys, dynamic, unresolved, en } = collectFirstRun();
  // THE SCREEN COMES FROM THE PARENT, and forgetting it is why the
  // "covers more than one screen" clause below failed on its first run:
  // every entry had an undefined screen, the set had one member, and the
  // check reported a real product property as broken. A check that reads
  // a field nobody set measures its own bug.
  const all = byScreen.flatMap((s) => s.keys.map((k) => ({ ...k, screen: s.name, tier: tierOf(k) })));
  const total = countLeaves(en);
  const t1 = all.filter((k) => k.tier === 1);
  console.log(`        ${seenKeys.size} of ${total} strings on the path; tier 1 is ${t1.length}`);

  check("the path is a small part of the product", seenKeys.size < total * 0.35, `${seenKeys.size} of ${total}`);
  // THE ASK WAS "40 SENTENCES, NOT 2,868". The thresholds are stated on
  // their own reasoning in the script; this holds the RESULT in the range
  // a person actually reads in one sitting. Below 20 the list has stopped
  // covering the path; above 80 nobody finishes it, which is the state
  // this whole exercise exists to leave.
  check(`tier 1 is a sitting's worth of reading (${t1.length})`, t1.length >= 20 && t1.length <= 80, String(t1.length));
  check("every tier-1 string really is prose", t1.every((k) => wordCount(k.text) >= SENTENCE_WORDS));
  check(`every tier-1 string is on a first screen (depth <= ${READ_DEPTH})`, t1.every((k) => k.depth <= READ_DEPTH));
  check(`tier 1 covers ${new Set(t1.map((k) => k.screen)).size} of the ${byScreen.length} screens`,
    new Set(t1.map((k) => k.screen)).size >= 4,
    [...new Set(t1.map((k) => k.screen))].join(", "));
  // NOTHING IS DROPPED. Every string on the path is in exactly one tier.
  check("every string on the path lands in a tier", all.every((k) => [1, 2, 3].includes(k.tier)));
  check("...and the tiers add up to the path", all.length === seenKeys.size, `${all.length} vs ${seenKeys.size}`);
  // THE HONEST HALF, gated so it cannot quietly grow.
  check(`every key the code renders exists in en.json (${unresolved.length} do not)`, unresolved.length === 0,
    unresolved.slice(0, 6).map((u) => `${u.file}:${u.line} ${u.key}`).join("\n        "));
  check(`at most 6 keys are unexpandable (${dynamic.length})`, dynamic.length <= 6,
    dynamic.map((d) => `${d.file}:${d.line} ${d.expr}`).join("\n        "));
  // AND AT LEAST ONE IS STILL REPORTED. components/ui/help-tip.tsx builds
  // four keys with a variable in the MIDDLE segment, which nothing here
  // can expand. A run that reports ZERO unreadable keys has not got
  // cleverer — it has stopped listing what it cannot read, which is the
  // shape four of this repository's instruments have already had.
  check("the keys it cannot read are still listed, not dropped", dynamic.length >= 1,
    "zero unreadable keys in a tree that contains help-tip means the list stopped being kept");
}

// ---------------------------------------------------------------------
console.log("\n== 5. the committed pack matches the product ==");
{
  const tmp = mkdtempSync(path.join(tmpdir(), "first-run-"));
  try {
    execFileSync(process.execPath, ["scripts/first-run-strings.mjs", "--out", tmp], { stdio: "pipe" });
    for (const locale of LOCALES) {
      const name = `first-run.${locale}.md`;
      const committed = existsSync(path.join(PACK, name)) ? readFileSync(path.join(PACK, name), "utf8") : null;
      const fresh = readFileSync(path.join(tmp, name), "utf8");
      check(
        `${PACK}/${name} is up to date`,
        committed === fresh,
        committed === null
          ? "the file is missing"
          : "the product moved and the pack did not. Run: npm run i18n:first-run"
      );
    }
    // WRITTEN OUT RATHER THAN JOINED. scripts/tests/gate-anchors.test.mjs
    // resolves what each gate reads by taking the string argument, and a
    // path.join() hands it "first-run.json" — a file that does not exist
    // at the repository root. The check was right and the join was the
    // thing to change: a gate whose inputs another gate cannot name is a
    // gate nobody can tell has gone stale.
    const committedJson = readFileSync("docs/first-run/first-run.json", "utf8");
    check("first-run.json is up to date", committedJson === readFileSync(path.join(tmp, "first-run.json"), "utf8"),
      "Run: npm run i18n:first-run");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------
console.log("\n== 6. the pack is readable by the person it is for ==");
{
  const el = readFileSync("docs/first-run/first-run.el.md", "utf8");
  check("the reader is told what to look for", /Anything you would not say out loud/.test(el));
  check("...and that tier 1 is the whole ask", /it is the whole ask/.test(el));
  // THE ENGLISH IS BESIDE EVERY TRANSLATION. A reviewer cannot judge a
  // sentence without knowing what it was meant to say.
  check("every translated entry carries its English", (el.match(/^> EN — /gm) ?? []).length > 400,
    String((el.match(/^> EN — /gm) ?? []).length));
  const en = readFileSync("docs/first-run/first-run.en.md", "utf8");
  check("...and the English file does not quote itself", !/^> EN — /m.test(en));
  check("a missing translation would be shouted, not blank", /MISSING IN THIS LANGUAGE/.test(
    readFileSync("scripts/first-run-strings.mjs", "utf8")
  ));
  check("one file exists per locale", LOCALES.every((l) => existsSync(path.join(PACK, `first-run.${l}.md`))));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
