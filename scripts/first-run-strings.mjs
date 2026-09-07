#!/usr/bin/env node
/*
 * THE 40 SENTENCES A NEW PERSON ACTUALLY READS, IN EVERY LANGUAGE.
 *
 * THE PROBLEM THIS EXISTS FOR. messages/en.json has 2,933 leaf keys and
 * nine translations of each. NOT ONE non-English string has been read by
 * somebody who speaks the language — stated plainly in docs/v5-list.md
 * and true. Handing a native speaker 2,933 sentences is handing them
 * nothing: nobody reads that, so nothing gets read, so the problem stays
 * exactly where it is.
 *
 * A person WILL read forty. So this finds the forty: every string on the
 * path from the signup form to the first thing the product tells them
 * about their own data. If those are wrong the account is lost before any
 * other string is reached, which makes them the ones worth a reader's
 * hour.
 *
 * HOW THE PATH IS DECIDED, and it is a judgement, so it is written down
 * rather than inferred. FIRST_RUN_SCREENS below names each screen and why
 * it is on the list. Everything those files import, transitively, is
 * scanned with them — a string is on the path if the component rendering
 * it is.
 *
 * WHAT IT CANNOT SEE, said before the number rather than after it:
 *
 *   - A KEY BUILT AT RUNTIME. `t(`errors.${code}`)` names a string this
 *     cannot resolve. Every one is COUNTED AND LISTED as unresolved, with
 *     its file and line, because a scan that silently drops what it
 *     cannot read is the fourth instrument in this repository to lie
 *     about its own coverage.
 *   - A STRING BEHIND A BRANCH. An error message only a failing upload
 *     shows is included: this asks what the code CAN render, not what a
 *     particular run did.
 *   - A STRING FROM A ROUTE HANDLER. The API returns codes rather than
 *     sentences — scripts/tests/i18n-coverage.test.mjs holds the count of
 *     server-side English prose at a ratchet — so what a person reads is
 *     rendered on the client, which is what this walks.
 *
 * Run:
 *   node scripts/first-run-strings.mjs                # report only
 *   node scripts/first-run-strings.mjs --out DIR      # write the files
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];

/**
 * THE PATH, DECIDED AND WRITTEN DOWN.
 *
 * Not "every page a logged-in person can reach" — that is the whole
 * product and the whole 2,933. This is the corridor with no doors off it:
 * a person who has just found the site, in order, until the product has
 * told them one true thing about their own data.
 */
export const FIRST_RUN_SCREENS = [
  {
    name: "signup",
    why: "the form itself, plus the plan names beside it — the first prose anyone reads",
    files: ["src/app/signup/page.tsx", "src/app/signup/signup-flow.tsx"],
  },
  {
    name: "login",
    why: "a signup that already has an account lands here, and so does everyone on their second visit",
    files: ["src/app/login/page.tsx", "src/app/login/login-form.tsx"],
  },
  {
    name: "onboarding",
    why: "the first two minutes: the upload, the privacy sentence said before anything is handed over, and the one sentence back",
    files: ["src/app/onboarding/layout.tsx", "src/app/onboarding/page.tsx"],
  },
  {
    name: "dashboard chrome",
    why: "the sidebar, top nav and banners wrap every screen after onboarding, so they are read before anything inside them",
    files: ["src/app/dashboard/layout.tsx"],
  },
  {
    name: "first result",
    why: "where onboarding sends them, and the first screen that is about their data rather than about the product",
    files: ["src/app/dashboard/overview/page.tsx", "src/app/dashboard/page.tsx"],
  },
];

// ---------------------------------------------------------------------
// Resolving imports the way the app does.
const ROOT = process.cwd();
function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = path.join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // node_modules
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(base + ext)) return path.relative(ROOT, base + ext).split(path.sep).join("/");
  }
  return null;
}

/**
 * Every local file reachable from `entries`, with how far it is.
 *
 * DEPTH IS THE WHOLE POINT OF THE RETURN VALUE. "Everything reachable" is
 * 376 strings, and 376 is not a list a person reads either — it is the
 * 2,933 problem with one zero knocked off. Depth 0 is the page itself,
 * depth 1 is a component the page imports by name, and those two are what
 * somebody definitely sees. A toast body six imports down inside a shared
 * primitive may never render for anybody.
 *
 * Breadth-first, so a file reached two ways keeps its SHORTEST distance.
 */
export function reachableFiles(entries) {
  const depth = new Map();
  const queue = entries.map((f) => [f, 0]);
  while (queue.length > 0) {
    const [file, d] = queue.shift();
    if (depth.has(file) || !existsSync(file)) continue;
    depth.set(file, d);
    const src = readFileSync(file, "utf8");
    const specs = [
      ...[...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]),
      // `await import("...")` and `dynamic(() => import("..."))` too: a
      // lazily loaded panel is still a panel the person reads.
      ...[...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
    ];
    for (const spec of specs) {
      const resolved = resolveImport(spec, file);
      if (resolved && !depth.has(resolved)) queue.push([resolved, d + 1]);
    }
  }
  return depth;
}

// ---------------------------------------------------------------------
/**
 * The message keys one file renders.
 *
 * TWO PASSES, because a namespace binding and its uses are not on the
 * same line: first every `const t… = useTranslations("ns")`, then every
 * call on one of those bindings. A binding declared with NO namespace
 * (`useTranslations()`) takes absolute keys, which is why its prefix is
 * the empty string rather than a guess.
 */
export function extractKeys(src, file) {
  const namespaces = new Map();
  for (const m of src.matchAll(
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:["']([^"']*)["'])?\s*\)/g
  )) {
    namespaces.set(m[1], m[2] ?? "");
  }
  const keys = [];
  const dynamic = [];
  if (namespaces.size === 0) return { keys, dynamic };
  const names = [...namespaces.keys()].sort((a, b) => b.length - a.length).join("|");
  // t("x"), t.rich("x"), t.raw("x"), t.has("x") — and the template-literal
  // form, which is a key this cannot resolve and must not pretend to.
  const callRe = new RegExp(`\\b(${names})(?:\\.(?:rich|raw|markup|has))?\\(\\s*(["'\`])([^"'\`]*)\\2`, "g");
  for (const m of src.matchAll(callRe)) {
    const line = src.slice(0, m.index).split("\n").length;
    const ns = namespaces.get(m[1]);
    if (m[2] === "`") {
      // A template literal with no ${} is an ordinary key written with
      // the wrong quotes; one WITH ${} is a key built at runtime.
      const raw = src.slice(m.index).match(/`([^`]*)`/)?.[1] ?? "";
      if (raw.includes("${")) {
        dynamic.push({ file, line, expr: raw.slice(0, 60), namespace: ns });
        continue;
      }
    }
    keys.push({ key: ns ? `${ns}.${m[3]}` : m[3], file, line });
  }
  // A template literal that starts with ${ has no leading text for the
  // regex above to catch, so it is looked for on its own — and DEDUPED
  // against it by line, because a call like t(`a.b.${x}`) matches both
  // passes and would otherwise be reported twice. The first draft did
  // exactly that and inflated the unresolved count by a factor of two,
  // which is the wrong direction to be wrong about coverage.
  const seenLines = new Set(dynamic.map((d) => d.line));
  for (const m of src.matchAll(new RegExp(`\\b(${names})\\(\\s*\`\\$\\{`, "g"))) {
    const line = src.slice(0, m.index).split("\n").length;
    if (seenLines.has(line)) continue;
    seenLines.add(line);
    dynamic.push({ file, line, expr: "`${…}`", namespace: namespaces.get(m[1]) });
  }
  return { keys, dynamic };
}

/**
 * The static prefix of a runtime-built key, when there is one.
 *
 * "dashboard.search.kinds.${result.kind}" -> "dashboard.search.kinds".
 * "`.${helpKey}.is`" -> null: the variable is not the LAST segment, so
 * the set of strings it can name is not a subtree of anything.
 */
export function expandablePrefix(d) {
  const full = d.namespace ? `${d.namespace}${d.expr.startsWith(".") ? "" : "."}${d.expr}` : d.expr;
  // ONE VARIABLE, AT THE END, or one variable with a fixed tail after it.
  // "a.b.${x}" names the strings under a.b; "a.b.${x}.example" names the
  // `example` of each child of a.b — dashboard.firstScreen is written
  // that way, and it is the first screen, so leaving it out would be
  // leaving out the thing the file is named for.
  const tail = full.match(/^([\w.]+)\.\$\{[^}]*\}((?:\.[\w.]+)?)$/);
  if (!tail) return null;
  return { prefix: tail[1].replace(/\.$/, ""), suffix: tail[2].replace(/^\./, "") };
}

/** The dotted keys the expansion above can name. */
export function childKeysOf(messages, expansion) {
  const { prefix, suffix } = expansion;
  let node = messages;
  for (const part of prefix.split(".")) {
    if (!node || typeof node !== "object") return [];
    node = node[part];
  }
  if (!node || typeof node !== "object") return [];
  if (!suffix) {
    return Object.entries(node)
      .filter(([, v]) => typeof v === "string")
      .map(([k]) => `${prefix}.${k}`);
  }
  const out = [];
  for (const [k, v] of Object.entries(node)) {
    if (!v || typeof v !== "object") continue;
    const key = `${prefix}.${k}.${suffix}`;
    if (typeof resolveKey(messages, key) === "string") out.push(key);
  }
  return out;
}

/** The string at a dotted key, or undefined. */
export function resolveKey(messages, key) {
  let node = messages;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

// ---------------------------------------------------------------------
export function collectFirstRun() {
  const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
  const byScreen = [];
  const seenKeys = new Map(); // key -> first screen that renders it
  const allDynamic = [];
  const unresolved = [];
  for (const screen of FIRST_RUN_SCREENS) {
    const files = reachableFiles(screen.files);
    const found = [];
    for (const [file, depth] of files) {
      const { keys, dynamic } = extractKeys(readFileSync(file, "utf8"), file);
      for (const d of dynamic) {
        // A DYNAMIC LAST SEGMENT IS NOT UNKNOWABLE. `t(`sidebar.items.
        // ${key}`)` can produce exactly the children of `sidebar.items`
        // and nothing else, so the whole subtree goes on the list. That
        // is a superset — some of those items may never render for this
        // person — and a superset is the safe direction for a reading
        // list. A dynamic segment in the MIDDLE ("`.${helpKey}.is`") has
        // no such prefix, and those stay unresolved and are printed.
        const prefix = expandablePrefix(d);
        const children = prefix ? childKeysOf(en, prefix) : null;
        if (children && children.length > 0) {
          for (const key of children) {
            if (seenKeys.has(key)) continue;
            seenKeys.set(key, screen.name);
            found.push({
              key,
              file: d.file,
              line: d.line,
              depth,
              text: resolveKey(en, key),
              fromDynamic: `${prefix.prefix}.\${…}${prefix.suffix ? "." + prefix.suffix : ""}`,
            });
          }
        } else {
          allDynamic.push(d);
        }
      }
      for (const k of keys) {
        const text = resolveKey(en, k.key);
        if (text === undefined) {
          unresolved.push(k);
          continue;
        }
        if (seenKeys.has(k.key)) continue;
        seenKeys.set(k.key, screen.name);
        found.push({ ...k, depth, text });
      }
    }
    found.sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key));
    byScreen.push({ ...screen, fileCount: files.size, keys: found });
  }
  // One entry per call site, not one per screen that reaches it: help-tip
  // is imported by four of the five screens, and reporting its four
  // unresolvable keys sixteen times would make the honest half of this
  // report look like the dishonest half.
  const dedupedDynamic = [...new Map(allDynamic.map((d) => [`${d.file}:${d.line}:${d.expr}`, d])).values()];
  return { byScreen, seenKeys, dynamic: dedupedDynamic, unresolved, en };
}

/**
 * WHAT COUNTS AS A SENTENCE, and why there are two numbers rather than
 * one list.
 *
 * "Everything a new person can read" is 598 strings. That is the 2,933
 * problem with one zero knocked off: nobody reads 598 either, so nothing
 * would get read, which is the state this file exists to end.
 *
 * TWELVE WORDS. Below that a string is a LABEL — "Files", "Start free",
 * "Last updated" — and a label is checked in a second by looking at the
 * screen; a wrong one is obvious and cheap. At twelve words and up it is
 * a sentence somebody wrote, and a sentence is where a translation reads
 * like a machine wrote it while every individual word is correct. That is
 * the damage a native speaker is the only instrument for.
 *
 * DEPTH ONE. The page itself and the components it names. Deeper than
 * that is a shared primitive whose text may render for nobody on this
 * path — worth listing, not worth a reader's first hour.
 *
 * THE TWO TOGETHER GIVE 44 STRINGS, which is the size that was asked for
 * and it was not chosen to hit it: the thresholds are stated above on
 * their own reasoning and 44 is what they select. Every other string on
 * the path is still in the file, in tiers below, so nothing is hidden —
 * the tiering decides READING ORDER, not what exists.
 */
export const SENTENCE_WORDS = 12;
export const READ_DEPTH = 1;

/** Words a person reads, with the ICU placeholders taken out — "{count}"
 *  is not a word anybody reads. */
export function wordCount(text) {
  return String(text ?? "")
    .replace(/\{[^}]*\}/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function tierOf(entry) {
  if (entry.depth <= READ_DEPTH && wordCount(entry.text) >= SENTENCE_WORDS) return 1;
  if (entry.depth <= READ_DEPTH) return 2;
  return 3;
}

export const TIERS = [
  {
    n: 1,
    title: "THE SENTENCES — read these",
    note: `On the first screens, ${SENTENCE_WORDS} words or more. This is prose somebody wrote, and prose is where a translation can be correct word by word and still read like nobody says that.`,
  },
  {
    n: 2,
    title: "The labels — skim these",
    note: "On the same screens, shorter than a sentence. Buttons, headings, menu items. A wrong one is usually obvious; you are looking for the one that means something else in your language.",
  },
  {
    n: 3,
    title: "Further in — only if you have time",
    note: "Reachable from these screens but deeper in: shared components, error states, things that may never appear. Listed so nothing is hidden, not because it is the best use of an hour.",
  },
];

/** Every leaf key in a messages file — the denominator. */
export function countLeaves(node) {
  let n = 0;
  for (const v of Object.values(node)) {
    if (v && typeof v === "object") n += countLeaves(v);
    else n++;
  }
  return n;
}

// ---------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;

  const { byScreen, seenKeys, dynamic, unresolved, en } = collectFirstRun();
  const total = countLeaves(en);
  const onPath = seenKeys.size;
  const all = byScreen.flatMap((s) => s.keys.map((k) => ({ ...k, screen: s.name, tier: tierOf(k) })));
  const tierCount = (n) => all.filter((k) => k.tier === n).length;

  console.log("THE FIRST RUN — signup to the first thing the product says about your data\n");
  for (const s of byScreen) {
    console.log(`  ${String(s.keys.length).padStart(3)}  ${s.name}`);
    console.log(`       ${s.why}`);
    console.log(`       ${s.fileCount} files reachable from ${s.files.length} entry point(s)`);
  }
  console.log(`\n  ${onPath} distinct strings on the path, of ${total} in the product (${((onPath / total) * 100).toFixed(1)}%)`);
  console.log("\n  what a reader is actually asked for:");
  for (const t of TIERS) console.log(`    tier ${t.n}: ${String(tierCount(t.n)).padStart(3)}  ${t.title}`);
  console.log(`    (a sentence is ${SENTENCE_WORDS}+ words; the first screens are depth <= ${READ_DEPTH})`);

  // THE HONEST PART. Both of these are places the scan could be wrong,
  // and both are printed whether they are empty or not.
  console.log(`\n  ${dynamic.length} key(s) built at runtime that could NOT be expanded — not counted above:`);
  for (const d of dynamic) console.log(`       ${d.file}:${d.line}  ${d.namespace}${d.expr.startsWith(".") ? "" : "."}${d.expr}`);
  console.log(`\n  ${unresolved.length} key(s) rendered by the code that do not exist in messages/en.json:`);
  for (const u of unresolved.slice(0, 20)) console.log(`       ${u.file}:${u.line}  ${u.key}`);

  if (!outDir) {
    console.log(`\n  (nothing written — pass --out DIR to produce one file per language)`);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const messages = Object.fromEntries(
    LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
  );
  for (const locale of LOCALES) {
    const lines = [];
    lines.push(`# The first run — ${locale}`);
    lines.push("");
    lines.push(
      `Everything a new person reads from the signup form to the first thing the product ` +
        `tells them about their own data: **${onPath} strings**. The whole product is ${total}, ` +
        `which is why this file exists.`
    );
    lines.push("");
    lines.push(
      `**Start with tier 1. It is ${tierCount(1)} sentences and it is the whole ask** — if you ` +
        `only ever read that, the round was worth doing. Tier 2 is ${tierCount(2)} labels to ` +
        `skim. Tier 3 is the rest, listed so nothing is hidden.`
    );
    lines.push("");
    lines.push(
      `**What to look for.** Not correctness alone — a sentence can be correct and still be ` +
        `wrong here. Does it sound like a person wrote it? Would you say it to a customer? Is a ` +
        `technical word translated that should have been left alone, or left in English when ` +
        `nobody would? Anything you would not say out loud is worth marking.`
    );
    lines.push("");
    if (locale === "en") {
      lines.push(`_This is the English original. It is here so a reader of another file can be sent both._`);
      lines.push("");
    }
    for (const tier of TIERS) {
      const mine = all.filter((k) => k.tier === tier.n);
      if (mine.length === 0) continue;
      lines.push(`## Tier ${tier.n} — ${tier.title} (${mine.length})`);
      lines.push("");
      lines.push(`_${tier.note}_`);
      lines.push("");
      for (const screenName of byScreen.map((s) => s.name)) {
        const rows = mine.filter((k) => k.screen === screenName);
        if (rows.length === 0) continue;
        lines.push(`### ${screenName}`);
        lines.push("");
        for (const k of rows) {
          const translated = resolveKey(messages[locale], k.key);
          lines.push(`**\`${k.key}\`**`);
          lines.push("");
          if (locale !== "en") lines.push(`> EN — ${k.text}`);
          lines.push("");
          lines.push(translated === undefined ? "**MISSING IN THIS LANGUAGE**" : translated);
          lines.push("");
        }
      }
    }
    const file = path.join(outDir, `first-run.${locale}.md`);
    writeFileSync(file, lines.join("\n"));
    console.log(`  wrote ${file}  (${lines.length} lines)`);
  }
  const jsonFile = path.join(outDir, "first-run.json");
  writeFileSync(
    jsonFile,
    JSON.stringify(
      {
        total,
        onPath,
        thresholds: { sentenceWords: SENTENCE_WORDS, readDepth: READ_DEPTH },
        tiers: TIERS.map((t) => ({ ...t, count: tierCount(t.n) })),
        screens: byScreen.map((s) => ({
          name: s.name,
          why: s.why,
          keys: s.keys.map((k) => ({ key: k.key, depth: k.depth, tier: tierOf(k), file: k.file })),
        })),
        unexpandable: dynamic,
        unresolved,
      },
      null,
      2
    )
  );
  console.log(`  wrote ${jsonFile}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
