// A message key nobody reaches — and why "nobody mentions the string" is
// NOT the same question as "nobody reaches it".
//
// THE CORRECTION THIS FILE RECORDS. A first pass at finding dead i18n
// keys matched "does the key's leaf name appear anywhere in src/, in any
// string context" and reported 58 candidates. Reading each one before
// deleting found that 57 of them were alive, reached through patterns a
// leaf-name match cannot see:
//
//   optionLabelKey()      lib/modules.ts derives "moduleData.options.
//                         crossPlatform" from the RAW value
//                         "cross-platform" that build-modules.ts stores
//                         in an `options: [...]` array — camelCased at
//                         call time, in three components. No string
//                         "crossPlatform" exists anywhere near the
//                         option list; there is nothing for a text
//                         search to find.
//   labelKey / placeholderKey / emptyKey config properties
//                         "moduleData.fields.coldEmail" is a plain
//                         string VALUE on a field config object, read
//                         later by a component that calls
//                         tKey(field.labelKey) — the key exists as
//                         text, but never as a t()-CALL argument, which
//                         is what the first scan actually matched.
//   useTranslations(`aiExamples.${surface}`)
//                         a template-literal PREFIX with a variable
//                         tail — every key under that namespace is
//                         reachable and none of them appear as a
//                         literal anywhere.
//   pageTitle(key) / pageTitleAndDescription(key, key)
//                         lib/page-title.ts's whole job is to take a
//                         key by variable and look it up — a metadata
//                         helper, not a component, so it was outside
//                         where the first scan looked.
//
// Deleting those 57 would have broken sidebar labels, every module's
// field labels and select-option labels, seven AI-example surfaces, and
// the page titles for login/signup/terms/privacy/cookies/help — the
// exact failure this working session has spent itself hunting FOR
// elsewhere: a runtime string invisible to static analysis, except this
// time the direction was reversed and the mistake would have been
// deleting live code, not missing a bug in it.
//
// The one key that really was dead — settings.marginReport.colMargin —
// is gone (the table now renders colMarginCharged/colMarginWouldBe
// instead; colMargin was the column before that split and nothing reads
// it). This file is what stands in for the manual read-every-candidate
// pass that found it, so the next stray key does not need one.
//
// Run: node scripts/tests/orphan-i18n-keys.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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

const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const allKeys = [];
(function walk(o, p) {
  for (const [k, v] of Object.entries(o)) {
    const q = p ? `${p}.${k}` : k;
    if (typeof v === "string") allKeys.push(q);
    else if (v && typeof v === "object") walk(v, q);
  }
})(en, "");

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}
const blob = sourceFiles("src").map((f) => readFileSync(f, "utf8")).join("\n");

// --------------------------------------------------------------------
// EVERY WAY THIS CODEBASE ACTUALLY REACHES A KEY, verified against real
// call sites above before being written down here as a rule:
// --------------------------------------------------------------------

// 1. A literal argument to any t-shaped call: t(...), tKey(...),
//    tCommon(...), t.rich(...). Covers the direct, common case.
const literalKeys = new Set();
for (const m of blob.matchAll(/\bt[A-Za-z]*\(\s*["'`]([a-zA-Z0-9_.-]+)["'`]/g)) literalKeys.add(m[1]);
// next-intl's other translator methods — t.rich() (JSX-embedding
// translations, e.g. the cookie banner's policy links) and t.markup()/
// t.raw() — take their key the same way but through a DOT, which the
// plain call regex above does not allow. Missed entirely without this:
// six real call sites (t.rich("checkInbox"), t.rich("typeToConfirm"),
// t.rich("checkEmail"), t.rich("essential"/"preferences"/"noTracking"))
// read as orphans until this was added.
for (const m of blob.matchAll(/\bt[A-Za-z]*\.(?:rich|markup|raw)\(\s*["'`]([a-zA-Z0-9_.-]+)["'`]/g)) literalKeys.add(m[1]);

// 2. A DYNAMIC PREFIX: any template literal anywhere in src/ shaped
//    `SOME.LITERAL.PREFIX.${expression}` — not just inside a t()/
//    useTranslations() call, because the prefix is often built one hop
//    away and only later handed to t(): lib/errors/problem-codes.ts's
//    `problem.${code}.${part}` is a plain function return, read by
//    t(problemMessageKey(...)) somewhere else entirely. Deliberately
//    over-inclusive — a template literal that happens to look like this
//    for an unrelated reason costs nothing (a few namespaces marked
//    "maybe reachable" that were not), while under-matching here is what
//    put 57 live keys on a deletion list the first time this was tried.
//
// DELIBERATELY NOT INCLUDING `useTranslations("plain.namespace")` here.
// The first version of this rule registered the whole namespace as
// reachable whenever ANY component opened it — including
// useTranslations("common"), which registers "common" and, through the
// any-offset match below, marks EVERY key under common.* reachable
// regardless of whether that specific leaf is ever read. A mutation test
// (add a key nobody calls under `common`, expect the gate to catch it)
// caught this: it did not. Opening a scope is not evidence a SPECIFIC
// key under it is read dynamically — most reads off a scoped translator
// are literal `t("leafKey")` calls, which the literalKeys suffix-match
// two blocks below already covers (it checks every TAIL of the full
// dotted key, so `settings.marginReport.colMarginCharged` matches via
// its bare leaf "colMarginCharged" without needing to know the scope
// name at all). Only an ACTUAL template literal with a variable in it —
// caught by the loop above — is real evidence of dynamic construction.
const dynamicNamespaces = new Set();
for (const m of blob.matchAll(/`([a-zA-Z][a-zA-Z0-9_.-]*)\$\{/g)) {
  dynamicNamespaces.add(m[1].replace(/\.$/, ""));
}

// 2b. A DYNAMIC SUFFIX: any template literal shaped
//    `${expression}.literal.tail` — help-tip.tsx's `${helpKey}.is` /
//    `.does` / `.doesNot` is exactly this: the PREFIX is a prop value
//    (a different key per page — help.agents, help.mission, ...), so
//    there is no fixed namespace to record, only the tail every use of
//    it shares. A message key is reachable if its OWN tail matches one
//    of these recorded suffix chains, at any split point.
const dynamicSuffixes = new Set();
for (const m of blob.matchAll(/`\$\{[^}]+\}\.([a-zA-Z][a-zA-Z0-9_.-]*)`/g)) {
  dynamicSuffixes.add(m[1]);
}

// 3. The FULL dotted key appearing ANYWHERE as a quoted string — not
//    just as a t()-call argument. This is what covers labelKey:
//    "moduleData.fields.coldEmail" style config properties: the string
//    exists, verifiably, it is simply read through a variable
//    (`tKey(field.labelKey)`) one hop away from where it is written.
const quotedFullKeys = new Set();
for (const m of blob.matchAll(/["'`]([a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z][a-zA-Z0-9_-]*)+)["'`]/g)) {
  quotedFullKeys.add(m[1]);
}

// 3b. A BARE LEAF NAME, quoted anywhere with no dot — the same idea as
//    3, one level shallower. push-notification-settings.tsx's
//    `TYPES = [{ stem: "agentResults" }, ...]` then `t(type.stem)` is
//    this exactly: "agentResults" is a real, verifiable string in the
//    source, just never dotted and never a direct t()-call argument.
//    conversation-sidebar.tsx's `{ label: "groupPinned" as const, ... }`
//    is the same shape for chat's date-group headers. A key is
//    reachable this way if its OWN LEAF (last segment) matches such a
//    bare word — deliberately just the leaf, not the full path, since
//    that is all a stem/label config field ever holds.
const bareLeafWords = new Set();
for (const m of blob.matchAll(/["'`]([a-zA-Z][a-zA-Z0-9]*)["'`]/g)) {
  bareLeafWords.add(m[1]);
}

// 3c. CONCATENATED, not dotted: `${expr}Hint` (no dot) in the same file
//    is the second half of the stem/Hint pair above — every label needs
//    a plain t(stem) AND a t(`${stem}Hint`) tail, and this is a
//    different shape from dynamicSuffixes (3d below), which requires a
//    dot. A key is reachable if its leaf ENDS WITH a recorded tail.
const concatSuffixes = new Set();
for (const m of blob.matchAll(/`\$\{[^}]+\}([a-zA-Z][a-zA-Z0-9]*)`/g)) {
  concatSuffixes.add(m[1]);
}

// 3d. CONCATENATED THE OTHER WAY ROUND: `range${expr}` — a literal
//    PREFIX with the variable at the END, no dot.
//
//    THIS RULE'S ABSENCE DELETED LIVE KEYS. Rule 3c above is its mirror
//    image and was the only one of the pair that existed, so
//    `t(\`range${cap(value)}\`)` in timeline-filters.tsx and
//    `t(\`status${... ? "Synthesising" : "Researching"}\`)` in
//    research-workspace.tsx read as "nothing constructs these" — and
//    dashboard.timeline.rangeToday/Week/Month/All plus
//    dashboard.deepResearch.statusResearching were deleted from all ten
//    locales as orphans. They were not orphans. The timeline's range
//    dropdown rendered the raw key names to every user in every
//    language, with four MISSING_MESSAGE console errors per page load,
//    until routes-smoke.prodtest.mjs caught it in a browser.
//
//    The lesson is the rule, not the keys: any half of a template
//    literal that is a fixed string is a claim about which keys exist,
//    and BOTH halves have to be read. A key is reachable if its leaf
//    STARTS WITH a recorded prefix.
const concatPrefixes = new Set();
for (const m of blob.matchAll(/`([a-zA-Z][a-zA-Z0-9]*)\$\{/g)) {
  concatPrefixes.add(m[1]);
}

// 4. optionLabelKey()'s own transform: moduleData.options.<camelCase of
//    a raw option value>. Rather than re-implement camelCasing here (and
//    risk it drifting from the real one in lib/modules.ts), every RAW
//    STRING that appears inside an `options: [...]` array literal
//    anywhere in src/ is camelCased with the SAME transform and checked
//    directly — so this rule breaks, loudly, if the two ever diverge.
function camelizeOptionValue(raw) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, "");
}
const reachableOptionKeys = new Set();
for (const arr of blob.matchAll(/options:\s*\[([^\]]*)\]/g)) {
  for (const s of arr[1].matchAll(/["'`]([^"'`]+)["'`]/g)) {
    reachableOptionKeys.add(`moduleData.options.${camelizeOptionValue(s[1])}`);
  }
}

function isReachable(key) {
  const parts = key.split(".");
  for (let i = 0; i < parts.length; i++) {
    if (literalKeys.has(parts.slice(i).join("."))) return true;
  }
  // Namespaces are checked at EVERY starting offset, not only from the
  // front — `sections.${status}` inside roadmap/page.tsx is captured as
  // the bare fragment "sections" (the "roadmap." half is a SEPARATE
  // useTranslations/getTranslations("roadmap") scope this scan does not
  // attribute call-by-call to the right t()), and it needs to match
  // starting at "sections" in "roadmap.sections.available", not only at
  // position 0. Same reasoning for help/page.tsx's
  // getTranslations("helpCentre") + t(`categories.${category}`).
  for (let start = 0; start < parts.length; start++) {
    for (let end = start + 1; end <= parts.length; end++) {
      if (dynamicNamespaces.has(parts.slice(start, end).join("."))) return true;
    }
  }
  for (let i = 0; i < parts.length; i++) {
    if (dynamicSuffixes.has(parts.slice(i).join("."))) return true;
  }
  if (quotedFullKeys.has(key)) return true;
  if (reachableOptionKeys.has(key)) return true;
  const leaf = parts[parts.length - 1];
  if (bareLeafWords.has(leaf)) return true;
  for (const suffix of concatSuffixes) {
    if (leaf.endsWith(suffix) && leaf !== suffix) return true;
  }
  // The mirror of the line above — see rule 3d for what its absence cost.
  for (const prefix of concatPrefixes) {
    if (leaf.startsWith(prefix) && leaf !== prefix) return true;
  }
  return false;
}

const orphans = allKeys.filter((k) => !isReachable(k));

console.log(`${allKeys.length} keys in messages/en.json`);
console.log(`${literalKeys.size} literal t()-call keys, ${dynamicNamespaces.size} dynamic namespaces, ` +
  `${dynamicSuffixes.size} dynamic suffixes, ${reachableOptionKeys.size} option keys derived from options: [...] arrays`);

// A CLOSED LIST, not an open-ended pass. Every entry here was read by
// hand against its actual call site before being written down (see the
// header). Adding to it is fine when a NEW key is genuinely unreachable
// after the same reading; adding to it to silence this test without
// reading the code is exactly the mistake the header describes.
const KNOWN_ORPHANS = [];

check(`the message-key walk found keys (${allKeys.length})`, allKeys.length >= 2000,
  "orphans is a filter of these — an empty walk makes the check below pass on nothing");
const newOrphans = orphans.filter((k) => !KNOWN_ORPHANS.includes(k));
const staleKnown = KNOWN_ORPHANS.filter((k) => !orphans.includes(k));

check("no new orphaned message key (unreachable by any known construction)", newOrphans.length === 0,
  newOrphans.join("\n        "));
check("KNOWN_ORPHANS has nothing stale — every entry is still actually orphaned", staleKnown.length === 0,
  staleKnown.join(", "));

// The gate has to be able to go red: a key that is genuinely reachable
// by none of the four rules above must be reported.
{
  const fakeKeys = [...allKeys, "this.key.was.never.written.anywhere.xyz123"];
  const stillFlags = !isReachable("this.key.was.never.written.anywhere.xyz123");
  check("a truly unreferenced key is flagged", stillFlags, true);
  void fakeKeys;
}

// And it must NOT flag the real dynamic-construction shapes this file
// exists to recognise — regression coverage for the correction itself.
check("optionLabelKey()'s camelCase transform is understood",
  isReachable("moduleData.options.crossPlatform") && isReachable("moduleData.options.paidAds"));
check("a labelKey config property is understood",
  isReachable("moduleData.fields.coldEmail"));
check("a useTranslations(`prefix.${var}`) namespace is understood",
  isReachable("aiExamples.chat.e1"));
check("a pageTitle()-style key-by-variable call is understood",
  isReachable("pageTitle.systemHealth"));
check("a `${prop}.literalSuffix` template (help-tip's helpKey) is understood",
  isReachable("help.agents.is") && isReachable("help.settings.doesNot"));
check("a two-level dynamic key built outside any t()/useTranslations call is understood",
  isReachable("problem.out_of_credits.what"));
check("a scoped translator's relative dynamic key is understood (roadmap sections)",
  isReachable("roadmap.sections.available"));
check("...and (help centre categories, t.has() included)",
  isReachable("helpCentre.categories.getting-started"));

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED: " + failures.join(" | "));
  process.exit(1);
}
