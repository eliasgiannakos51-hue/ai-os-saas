// "1 σελίδες". "Χρεώθηκαν 1 credits". "used 1 times".
//
// A COUNT GLUED TO A FIXED NOUN IS WRONG IN EVERY LANGUAGE AT n=1, and it was
// wrong in a hundred and three places here. Some of it was written as `{count}
// file(s)`, which is not a plural — it is a note to the reader apologising for
// not having one, and it does not survive translation: Greek got
// "αρχείο(-α)", Arabic got nothing at all because Arabic has no such trick.
//
// WHAT THE LANGUAGES ACTUALLY NEED, and the numbers are not opinions —
// Intl.PluralRules decides them:
//
//   ar   SIX forms   zero, one, two, few (3-10), many (11-99), other
//   el de en es it   two — one, other
//   fr pt            two, and 0 takes the SINGULAR ("0 crédit restant")
//   ja zh            ONE. A separate singular there would be the mistake.
//
// So the three rules this file enforces, each one taught by a real defect
// found while writing the plurals:
//
//   1. NO FAKE PLURALS. `(s)`, `(es)`, `(-α)`, `mese/i` — the workaround.
//   2. EVERY PLURAL BLOCK COVERS ITS LOCALE'S REACHABLE CATEGORIES. Three
//      Arabic blocks that predate this work declared only one/other, so
//      eleven answers read "11 إجابة" where Arabic wants "11 إجابةً" and
//      three read the plural form of one. Found by this scan, not by eye.
//   3. A COUNTED KEY IS COUNTED IN EVERY LANGUAGE. If any locale pluralises
//      a variable in a key, every other locale either pluralises it too or
//      is listed below with the reason. The reasons are real: "min" and
//      "selected" inflect for nobody.
//
// AND IT RENDERS RATHER THAN PATTERN-MATCHES. A malformed ICU string does
// not fail a regular expression; it throws where the page renders. Every
// plural here is formatted through next-intl — the app's own formatter — at
// one representative number per category.
//
// Run: node scripts/tests/plural-forms.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { createTranslator } from "next-intl";

let pass = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const LOCALES = readdirSync("messages")
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(".json", ""))
  .sort();

const MESSAGES = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(`messages/${l}.json`, "utf8")),
  ]),
);

/** Flatten to dotted-path -> string. */
function flatten(node, prefix = "", out = {}) {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node))
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (typeof node === "string") {
    out[prefix] = node;
  }
  return out;
}
const FLAT = Object.fromEntries(LOCALES.map((l) => [l, flatten(MESSAGES[l])]));

// THE CATEGORIES A LOCALE REALLY REACHES, asked of Intl rather than written
// down here — the whole point is that nobody has to remember that Arabic has
// six and Japanese one. Bounded at 120 because these are interface counts:
// `many` in Spanish only begins at a million and no screen here shows one.
function reachableCategories(locale) {
  const rules = new Intl.PluralRules(locale);
  const found = new Map();
  for (let n = 0; n <= 120; n++) {
    const c = rules.select(n);
    if (!found.has(c)) found.set(c, n);
  }
  return found;
}
const REACH = Object.fromEntries(
  LOCALES.map((l) => [l, reachableCategories(l)]),
);

console.log("plural-forms");
ok(
  `the locales were found (${LOCALES.length})`,
  LOCALES.length >= 10,
  LOCALES.join(", "),
);
{
  const shapes = LOCALES.map((l) => `${l}:${REACH[l].size}`).join(" ");
  console.log(`        ${shapes}`);
  // A FLOOR ON THE FLOOR. If Intl ever answers "one category" for Arabic —
  // a stripped ICU build, a Node without full-icu — every check below turns
  // green by having nothing to check.
  ok(
    "Intl really knows the hard languages (ar 6, ja 1)",
    REACH.ar?.size === 6 && REACH.ja?.size === 1,
    `ar=${REACH.ar?.size} ja=${REACH.ja?.size} — a stripped ICU build makes this whole file vacuous`,
  );
}

// ---------------------------------------------------------------------
console.log("\n== 1. nobody writes (s) instead of a plural ==");
// ---------------------------------------------------------------------
// The workaround, in the forms it actually took in this repository before it
// was removed. It is listed per-language because "(s)" is the English one and
// every translator invented their own.
const FAKE_PLURAL =
  /\((?:s|es|en|ns|ões|-α|ές|ων|εις|e|i)\)|\b(?:mese|giorno|funzione|invio|esecuzione|numero|elemento|riferimento)\/i\b|\bμήνας\/ες\b|\bυποβολή\/ές\b|\bεκτέλεση\/εις\b|\bTag\(e\)|\bMonat\(e\)/;
{
  const fakes = [];
  for (const locale of LOCALES) {
    for (const [key, text] of Object.entries(FLAT[locale])) {
      if (FAKE_PLURAL.test(text))
        fakes.push(`${locale} ${key}: ${text.slice(0, 70)}`);
    }
  }
  ok(
    `no message apologises with a parenthesised suffix (${fakes.length})`,
    fakes.length === 0,
    fakes.slice(0, 12).join("\n        "),
  );
  // AND THE PATTERN CAN GO RED, because "none found" is the shape a dead
  // regular expression has too.
  ok(
    "...and the pattern would recognise one",
    FAKE_PLURAL.test("{count} file(s) selected") &&
      FAKE_PLURAL.test("{count} αρχείο(-α)"),
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2. every plural block covers its locale's categories ==");
// ---------------------------------------------------------------------
/** The branches a plural block declares, and the exact numbers it pins. */
function pluralBranches(text, startIndex) {
  let depth = 1;
  let i = startIndex;
  while (i < text.length && depth > 0) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    i++;
  }
  const body = text.slice(startIndex, i - 1);
  return {
    categories: new Set(
      [...body.matchAll(/(?:^|\s)(zero|one|two|few|many|other)\s*\{/g)].map(
        (m) => m[1],
      ),
    ),
    exact: new Set([...body.matchAll(/=\s*(\d+)\s*\{/g)].map((m) => m[1])),
  };
}
/** Every plural block in a message: [variable, categories, exact]. */
function pluralBlocks(text) {
  return [...text.matchAll(/\{(\w+)\s*,\s*plural\s*,/g)].map((m) => ({
    variable: m[1],
    ...pluralBranches(text, m.index + m[0].length),
  }));
}
let blockCount = 0;
{
  const short = [];
  for (const locale of LOCALES) {
    for (const [key, text] of Object.entries(FLAT[locale])) {
      for (const block of pluralBlocks(text)) {
        blockCount++;
        const missing = [...REACH[locale].keys()].filter((cat) => {
          if (block.categories.has(cat)) return false;
          // `=0 {...}` covers the zero category as exactly as a branch does.
          if (cat === "zero" && block.exact.has("0")) return false;
          return true;
        });
        if (missing.length > 0) {
          short.push(
            `${locale} ${key} [${block.variable}]: missing ${missing.join(", ")}`,
          );
        }
      }
    }
  }
  ok(
    `plural blocks were found (${blockCount})`,
    blockCount >= 200,
    `found ${blockCount}`,
  );
  ok(
    `every block declares the categories its language reaches (${short.length} do not)`,
    short.length === 0,
    short.slice(0, 15).join("\n        ") +
      "\n        Arabic wants zero, one, two, few (3-10), many (11-99) and other." +
      "\n        one/other there means eleven answers read as the plural of one.",
  );
}

// ---------------------------------------------------------------------
console.log("\n== 3. a counted key is counted in every language ==");
// ---------------------------------------------------------------------
// EXEMPTIONS, each a claim about the text that is checked below. Every entry
// says which locales leave the variable bare and why — and the why is always
// the same shape: nothing in that sentence agrees with the number.
const BARE_ON_PURPOSE = new Map([
  [
    "common.filesSelected|count",
    {
      locales: ["de", "en"],
      why: "'selected' and 'ausgewählt' do not inflect for a number",
    },
  ],
  [
    "common.offline.showingCachedAge|minutes",
    {
      locales: ["de", "en", "es", "fr", "it", "pt"],
      why: "'min' is an abbreviation and has no plural",
    },
  ],
  [
    "dashboard.mission.stepMinutes|count",
    {
      locales: ["de", "en", "es", "fr", "it", "pt"],
      why: "same abbreviation; Greek spells the word out, so Greek inflects",
    },
  ],
  [
    "credits.usedWithRemaining|remaining",
    {
      locales: ["ar", "de", "en"],
      why: "'left', 'übrig' and 'متبقٍ' do not agree with the number",
    },
  ],
  [
    "dashboard.reflection.missionStepsLabel|pending",
    {
      locales: ["de", "en"],
      why: "'still pending' and 'noch offen' do not agree with the number",
    },
  ],
]);
{
  // A key is COUNTED if any locale pluralises a variable in it — the app's
  // own translations decide what needs a plural, rather than a list here
  // that the next new string would not be on.
  const counted = new Map();
  for (const locale of LOCALES) {
    for (const [key, text] of Object.entries(FLAT[locale])) {
      for (const block of pluralBlocks(text)) {
        counted.set(
          `${key}|${block.variable}`,
          (counted.get(`${key}|${block.variable}`) ?? new Set()).add(locale),
        );
      }
    }
  }
  ok(
    `counted keys were found (${counted.size})`,
    counted.size >= 60,
    `found ${counted.size}`,
  );

  const gaps = [];
  const usedExemptions = new Set();
  for (const id of [...counted.keys()].sort()) {
    const [key, variable] = id.split("|");
    for (const locale of LOCALES) {
      // ONE CATEGORY MEANS NO PLURAL IS OWED. Japanese and Chinese put every
      // number in `other`; wrapping that in a plural block would be noise
      // pretending to be care.
      if (REACH[locale].size === 1) continue;
      const text = FLAT[locale][key];
      if (text === undefined) continue;
      if (new RegExp(`\\{${variable}\\s*,\\s*plural`).test(text)) continue;
      if (!new RegExp(`\\{${variable}\\}`).test(text)) continue; // not interpolated here at all
      const exempt = BARE_ON_PURPOSE.get(id);
      if (exempt?.locales.includes(locale)) {
        usedExemptions.add(`${id}|${locale}`);
        continue;
      }
      gaps.push(`${locale} ${key} [${variable}]: ${text.slice(0, 60)}`);
    }
  }
  ok(
    `no language was left with a bare number (${gaps.length})`,
    gaps.length === 0,
    gaps.slice(0, 15).join("\n        "),
  );

  // AND EVERY EXEMPTION EARNS ITSELF. One that no longer describes a bare
  // string is a hole somebody could widen without noticing.
  const stale = [];
  for (const [id, entry] of BARE_ON_PURPOSE) {
    for (const locale of entry.locales) {
      if (!usedExemptions.has(`${id}|${locale}`))
        stale.push(`${id} (${locale}): ${entry.why}`);
    }
  }
  ok(
    `every exemption still describes a bare string (${stale.length} do not)`,
    stale.length === 0,
    stale.join("\n        "),
  );
}

// ---------------------------------------------------------------------
console.log("\n== 4. every plural renders, at every number ==");
// ---------------------------------------------------------------------
// The half a regular expression cannot do. A brace short, a category name
// misspelt, a variable renamed on one side — none of it fails a pattern, and
// all of it throws where the page renders.
{
  const broken = [];
  let rendered = 0;
  for (const locale of LOCALES) {
    for (const [key, text] of Object.entries(FLAT[locale])) {
      const blocks = pluralBlocks(text);
      if (blocks.length === 0) continue;
      const parts = key.split(".");
      const leaf = parts.pop();
      const errors = [];
      const t = createTranslator({
        locale,
        messages: MESSAGES[locale],
        namespace: parts.join("."),
        onError: (e) => errors.push(String(e)),
      });
      // Every variable the message names: the counted ones get the number,
      // everything else a marker, so a missing variable surfaces as an error
      // rather than as a silently short sentence.
      const variables = [...text.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]);
      const counted = new Set(blocks.map((b) => b.variable));
      for (const [category, n] of REACH[locale]) {
        const values = {};
        for (const v of variables) values[v] = counted.has(v) ? n : "x";
        let out;
        try {
          out = t(leaf, values);
        } catch (e) {
          errors.push(String(e));
          out = "";
        }
        rendered++;
        if (errors.length > 0) {
          broken.push(
            `${locale} ${key} (${category}): ${errors[0].slice(0, 110)}`,
          );
          break;
        }
        if (typeof out !== "string" || out.trim() === "") {
          broken.push(`${locale} ${key} (${category}): rendered nothing`);
          break;
        }
        // A branch that still contains the raw category name never closed.
        if (/\b(?:zero|one|two|few|many|other)\s*\{/.test(out)) {
          broken.push(
            `${locale} ${key} (${category}): a branch leaked into the output — ${out.slice(0, 70)}`,
          );
          break;
        }
      }
    }
  }
  ok(
    `renderings were performed (${rendered})`,
    rendered >= 400,
    `only ${rendered}`,
  );
  ok(
    `every plural renders cleanly at every category (${broken.length} do not)`,
    broken.length === 0,
    broken.slice(0, 12).join("\n        "),
  );
}

// ---------------------------------------------------------------------
console.log("\n== 5. the checks can go red ==");
// ---------------------------------------------------------------------
// Everything above says "nothing is wrong", which is the shape a gate lies in.
{
  // PARSED, NOT ASSUMED. Indexing [0] straight into the helper made this file
  // DIE with a TypeError when the helper was mutated to find nothing — and a
  // crash prints no summary, so the run reported "red" with no failing check
  // named and the mutation suite could not tell which clause had gone. A gate
  // that cannot say what broke has stopped being an instrument.
  const parse = (text) =>
    pluralBlocks(text)[0] ?? { categories: new Set(), exact: new Set() };
  const twoForm = parse("{count, plural, one {# x} other {# xs}}");
  ok(
    "the block parser can still read a block at all",
    twoForm.categories.size === 2,
    `parsed ${[...twoForm.categories].join(", ") || "nothing"} — every check above reads through this helper`,
  );
  ok(
    "a two-form block is short for Arabic",
    [...REACH.ar.keys()].some((c) => !twoForm.categories.has(c)),
  );
  ok(
    "...and complete for Greek",
    [...REACH.el.keys()].every((c) => twoForm.categories.has(c)),
  );
  const arabic = parse(
    "{count, plural, zero {a} one {b} two {c} few {d} many {e} other {f}}",
  );
  ok(
    "...while a six-form block is complete for Arabic",
    [...REACH.ar.keys()].every((c) => arabic.categories.has(c)),
  );
  const zeroPinned = parse(
    "{count, plural, =0 {none} one {# x} two {#} few {#} many {#} other {#}}",
  );
  ok("...and =0 counts as covering zero", zeroPinned.exact.has("0"));
  ok(
    "French and Portuguese put 0 in the singular",
    REACH.fr.get("one") === 0 && REACH.pt.get("one") === 0,
  );

  // AND THE OTHER EXTREME, which this file would otherwise only assert about
  // in the abstract. Chinese and Japanese have ONE form: 已使用 1 积分 and
  // 已使用 100 积分 are both correct as written, and a plural block there
  // would be ceremony pretending to be care. The rule in
  // language-extremes.test.mjs asks for both ends of the range in any file
  // that reaches for a non-European script, and it caught this one carrying
  // Arabic alone — which was right, because "六 forms" and "one form" are the
  // two facts this gate exists to hold at the same time.
  const CHINESE = "已使用 {count} 积分";
  const JAPANESE = "{count} クレジットを使用";
  ok(
    "a bare count is complete Chinese and complete Japanese",
    pluralBlocks(CHINESE).length === 0 &&
      pluralBlocks(JAPANESE).length === 0 &&
      REACH.zh.size === 1 &&
      REACH.ja.size === 1,
    `zh=${REACH.zh.size} ja=${REACH.ja.size}`,
  );
  ok(
    "...while the same shape in Greek and Arabic is a gap",
    REACH.el.size > 1 && REACH.ar.size > 1,
    "if Intl ever flattens these, section 3 stops reporting anything",
  );
  // The gate must be able to READ Han and kana, not merely contain them: a
  // count string in Chinese has to survive the same round trip.
  ok(
    "...and a Chinese count string still renders",
    (() => {
      const errors = [];
      const t = createTranslator({
        locale: "zh",
        messages: { probe: { chinese: CHINESE, japanese: JAPANESE } },
        namespace: "probe",
        onError: (e) => errors.push(String(e)),
      });
      const one = t("chinese", { count: 1 });
      const many = t("chinese", { count: 100 });
      return (
        errors.length === 0 && one.includes("积分") && many.includes("100")
      );
    })(),
  );
}

// ---------------------------------------------------------------------
console.log("\n== 6. and the callers hand it a NUMBER ==");
// ---------------------------------------------------------------------
// THE HALF THAT SHIPPED THE BUG. Every check above renders these messages
// with real numbers, so all of them were green while production read
// "NaN credits/month" on four of the five pricing plans.
//
// The reason is invisible to the compiler and to any test that supplies its
// own arguments: a plural must SELECT a category before it can print
// anything, and selecting means calling Number() on what the caller passed.
// `{count}` on its own interpolates whatever it is given, so
// `formatNumber(1000, locale)` — the string "1,000" — read correctly for
// years. The moment the message became `{count, plural, ...}`, Number("1,000")
// was NaN, no category matched, and `#` printed NaN. Only the free plan
// survived, because "100" happens to parse.
//
// So this reads the CALL SITES: any variable a message pluralises must be
// handed something that is not a string.
{
  const SRC_DIRS = ["src"];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(full);
    }
  };
  for (const dir of SRC_DIRS) walk(dir);
  ok(
    `the source was walked (${files.length} files)`,
    files.length >= 200,
    `found ${files.length}`,
  );

  // Which variables each message pluralises, indexed by every suffix a
  // caller might name it with — `t("cost")` inside a scoped translator and
  // `t("voice.permission.cost")` are the same message.
  const selectors = new Map();
  for (const [key, text] of Object.entries(FLAT.en)) {
    const variables = pluralBlocks(text).map((b) => b.variable);
    if (variables.length === 0) continue;
    const parts = key.split(".");
    for (const name of [key, parts.slice(-2).join("."), parts.at(-1)]) {
      selectors.set(
        name,
        new Set([...(selectors.get(name) ?? []), ...variables]),
      );
    }
  }
  ok(
    `plural selectors were indexed (${selectors.size} names)`,
    selectors.size >= 60,
    `${selectors.size}`,
  );

  // `t("key", { ... })`, with one level of nesting allowed inside the object.
  const CALL =
    /\bt\w*\(\s*[`"']([\w.${}]+)[`"']\s*,\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
  // A STRING IS THE DEFECT. formatNumber() returns one; so does a literal,
  // and so does anything template-quoted.
  const STRINGY = /^\s*(?:formatNumber\(|["'`])/;
  const stringy = [];
  let callSites = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const call of source.matchAll(CALL)) {
      const [, key, args] = call;
      const parts = key.split(".");
      const variables =
        selectors.get(key) ??
        selectors.get(parts.slice(-2).join(".")) ??
        selectors.get(parts.at(-1)) ??
        // A key built from a variable (`features.${feature.textKey}`) could
        // be any of them, so its arguments are held to the same rule.
        (key.includes("${") ? new Set(["count"]) : null);
      if (!variables) continue;
      for (const variable of variables) {
        const arg = new RegExp(
          `\\b${variable}\\s*:\\s*((?:[^,{}]|\\([^()]*\\))*)`,
        ).exec(args);
        if (!arg) continue;
        callSites++;
        const expression = arg[1]
          .split("\n")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        // A ternary is read on both sides — `x === "custom" ? "" : n` is the
        // exact shape the pricing page shipped.
        const branches = expression.includes("?")
          ? expression
              .split(/\?|:/)
              .map((b) => b.trim())
              .filter(Boolean)
          : [expression];
        if (branches.some((b) => STRINGY.test(b))) {
          stringy.push(
            `${file}:${source.slice(0, call.index).split("\n").length} ${key} [${variable}] = ${expression.slice(0, 70)}`,
          );
        }
      }
    }
  }
  ok(
    `call sites feeding a plural were found (${callSites})`,
    callSites >= 15,
    `found ${callSites}`,
  );
  ok(
    `no caller hands a plural a string (${stringy.length})`,
    stringy.length === 0,
    stringy.slice(0, 12).join("\n        ") +
      "\n        A plural selects its category with Number(). formatNumber(1000) is" +
      '\n        "1,000", Number("1,000") is NaN, and the message prints NaN.' +
      "\n        Pass the number; ICU's `#` formats it for the locale itself.",
  );

  // AND THE RULE IS DEMONSTRATED, not merely asserted — this is the exact
  // failure, reproduced.
  {
    const probe = createTranslator({
      locale: "en",
      messages: {
        p: { n: "{count, plural, one {# credit} other {# credits}}/month" },
      },
      namespace: "p",
      onError: () => {},
    });
    const fromNumber = probe("n", { count: 1000 });
    const fromString = probe("n", { count: "1,000" });
    ok(
      "a number renders the grouped figure",
      fromNumber === "1,000 credits/month",
      fromNumber,
    );
    ok(
      "...and the pre-formatted string renders NaN",
      /NaN/.test(fromString),
      fromString,
    );
    ok("...which is what production showed", fromNumber !== fromString);
  }
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
