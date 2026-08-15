#!/usr/bin/env node
/*
 * Bare English text rendered straight into JSX.
 *
 *     <span>We use cookies for essential functionality…</span>
 *     <button>Accept</button>
 *     <p title="Owner access — unlimited credits">
 *
 * The sibling of the conditional-branch check in
 * scripts/tests/i18n-coverage.test.mjs. That one catches
 * `{cond ? "A" : "B"}`; this catches the literal that is simply THERE.
 *
 * PARSED, NOT GREPPED, for the same reason: a regex over .tsx cannot tell
 * a text node from an attribute value, a className from a title, or an
 * import specifier from a sentence. Everything below walks the real AST.
 *
 * THE HARD PART IS NOT FINDING TEXT — IT IS NOT DROWNING IN IT. A .tsx
 * file is full of strings that are not user-facing prose: units ("MB"),
 * separators ("·"), format tokens, ids, single letters. The filters below
 * are deliberately narrow, and `--verbose` prints what was rejected and
 * why, so the filtering can be argued with rather than trusted.
 *
 * Usage:
 *   node scripts/jsx-text-report.mjs            # the report
 *   node scripts/jsx-text-report.mjs --verbose  # + every rejection, with its reason
 *   node scripts/jsx-text-report.mjs --json     # machine-readable
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();

/**
 * Next.js image-generation routes render to a PNG at ONE url, fetched by
 * social crawlers that send no cookie — so the locale this app resolves
 * from NEXT_LOCALE simply does not exist at that moment. Their text is not
 * translatable through the app's i18n at all, which makes flagging it a
 * false report rather than a finding.
 *
 * Excluded by what the file IS, not by name in an allowlist: any
 * `opengraph-image`, `twitter-image`, `icon` or `apple-icon` convention
 * file has the same property.
 */
const IMAGE_ROUTE = /\/(opengraph-image|twitter-image|icon|apple-icon)(\.[a-z0-9]+)?\.tsx$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") && !IMAGE_ROUTE.test(p.split(path.sep).join("/"))) {
      out.push(p.split(path.sep).join("/"));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// (α) Obviously technical — never user prose, whatever the word count
// ---------------------------------------------------------------------------

/** Units, formats and symbols that are the same in every language. */
const TECHNICAL_TOKENS = new Set([
  // storage / size
  "b", "kb", "mb", "gb", "tb", "kib", "mib", "gib",
  // css / layout
  "px", "rem", "em", "vh", "vw", "fr", "ch",
  // time
  "ms", "s", "sec", "min", "hr", "h", "d", "am", "pm", "utc", "gmt",
  // currency and maths
  "eur", "usd", "gbp", "x", "%", "+", "-", "=", "±",
  // formats the app names verbatim
  "csv", "json", "pdf", "html", "css", "svg", "png", "jpg", "jpeg", "webp",
  "md", "txt", "docx", "xlsx", "url", "api", "id", "ids", "ai", "ui", "sql",
  "rgb", "rgba", "hex", "uuid", "http", "https", "oauth", "rss", "seo",
]);

/** Brand and proper nouns this product does not translate. */
const PROPER_NOUNS = new Set([
  "ionexa", "supabase", "anthropic", "claude", "stripe", "vercel", "google",
  "gmail", "drive", "slack", "github", "next.js", "react", "postgres",
  "postgresql", "resend", "openai", "deep research", "create studio",
  "ionexa chat", "ionexa ai",
]);

/**
 * (β) Single words that ARE user-facing, despite being one word.
 *
 * A one-word text node is usually a fragment between two interpolations
 * ("of", "and") or a token. These are the exceptions: the vocabulary of
 * button and control labels, which are exactly the strings a user reads
 * and exactly the ones a single-word filter would otherwise hide.
 */
const UI_VOCABULARY = new Set([
  "accept", "decline", "cancel", "save", "saved", "saving", "delete", "deleted",
  "remove", "removed", "close", "closed", "open", "next", "back", "previous",
  "continue", "confirm", "confirmed", "submit", "send", "sent", "edit", "editing",
  "update", "updated", "create", "created", "add", "added", "new", "search",
  "filter", "sort", "share", "shared", "copy", "copied", "download", "upload",
  "uploading", "retry", "refresh", "reload", "loading", "done", "finish",
  "finished", "start", "started", "stop", "stopped", "pause", "paused",
  "resume", "settings", "help", "yes", "no", "ok", "okay", "skip", "publish",
  "published", "unpublish", "preview", "export", "import", "rename", "duplicate",
  "archive", "restore", "undo", "redo", "apply", "reset", "clear", "select",
  "deselect", "all", "none", "more", "less", "expand", "collapse", "login",
  "logout", "signin", "signout", "signup", "register", "upgrade", "downgrade",
  "subscribe", "unsubscribe", "connect", "disconnect", "enable", "disable",
  "enabled", "disabled", "on", "off", "error", "warning", "success", "failed",
  // Added after the first run: every one of these was sitting in the
  // rejected pile as a real button label the single-word rule had hidden.
  "dismiss", "install", "uninstall", "view", "navigate", "unlink", "link",
  "resolve", "resolved", "reject", "rejected", "approve", "approved", "prev",
  "page", "generate", "regenerate", "run", "running", "invite", "leave", "join",
]);

/** Attributes whose string value is read by a human or a screen reader. */
const TEXT_ATTRIBUTES = new Set([
  "title", "aria-label", "aria-description", "aria-placeholder", "aria-roledescription",
  "placeholder", "alt", "label", "aria-valuetext",
]);

const wordsOf = (text) => text.split(/[\s ]+/).filter(Boolean);
const alphaWord = (w) => /[A-Za-z]{2,}/.test(w);

/**
 * A token nobody translates: a unit, or a code identifier.
 *
 * `export_all_data()` and `danger_zone` render inside prose on the privacy
 * page as the literal names of things in the product. Translating them
 * would point the reader at a setting that does not exist under that name.
 */
const isTechnical = (w) => {
  const bare = w.toLowerCase().replace(/[.,:;!?]/g, "");
  if (TECHNICAL_TOKENS.has(bare.replace(/[()]/g, ""))) return true;
  if (/_/.test(bare) || /\(\)$/.test(bare)) return true; // snake_case, call()
  if (/^[a-z]+[A-Z]/.test(w)) return true; // camelCase
  return false;
};

/**
 * Text that is ALREADY translated, but borrows a Latin word.
 *
 *   "Αν ρωτήσεις κάτι από αυτά στο chat, θα πάρεις … χωρίς χρέωση credits."
 *
 * Two Latin words ("chat", "credits") cleared the 2-word prose rule, and a
 * fully translated Greek paragraph was reported as untranslated English.
 * Every language this app ships borrows product vocabulary like that, so
 * the test is which script the text is mostly IN — not whether it contains
 * any Latin at all.
 */
function isMostlyNonLatin(text) {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const other = [...text].filter((c) => /\p{L}/u.test(c) && !/[A-Za-z]/.test(c)).length;
  return other > 0 && latin <= other;
}

/**
 * Decides whether a piece of rendered text is user prose.
 * Returns null when it is, or the reason it was rejected.
 */
/**
 * JSX escapes its own text: `you&apos;ve` reaches the AST verbatim, and a
 * word-splitter reads `&apos` as a word. Decoded before anything counts
 * words, so `&apos` stops appearing in the rejected pile as if it were one.
 */
const decodeEntities = (t) =>
  t
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

function rejectionReason(raw) {
  const text = decodeEntities(raw).replace(/\s+/g, " ").trim();
  if (!text) return "empty";
  // Non-Latin text is already translated — this scanner only looks for
  // English that escaped.
  if (!/[A-Za-z]/.test(text)) return "no latin letters";
  if (/^[^A-Za-z]*$/.test(text)) return "punctuation or symbols only";
  if (isMostlyNonLatin(text)) return "already translated (mostly non-Latin script)";

  const words = wordsOf(text);
  const meaningful = words.filter((w) => alphaWord(w) && !isTechnical(w));
  if (meaningful.length === 0) return `only technical tokens (${words.join(" ")})`;

  const lower = text.toLowerCase().replace(/[.,:;!?—–]/g, "").trim();
  if (PROPER_NOUNS.has(lower)) return `proper noun (${text})`;

  if (meaningful.length === 1) {
    const single = meaningful[0].toLowerCase().replace(/[.,:;!?()—–]/g, "");
    if (UI_VOCABULARY.has(single)) return null; // (β) one word, but a control label
    return `single word, not UI vocabulary (${single})`;
  }
  // Two or more real words: prose until proven otherwise.
  return null;
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------
const hits = [];
const rejected = [];

for (const file of walk(path.join(ROOT, "src"))) {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const line = (node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;

  const visit = (node) => {
    // Bare text between JSX tags.
    if (ts.isJsxText(node)) {
      const reason = rejectionReason(node.text);
      const entry = {
        file,
        line: line(node),
        kind: "JSX text",
        text: decodeEntities(node.text).replace(/\s+/g, " ").trim().slice(0, 90),
      };
      if (reason) rejected.push({ ...entry, reason });
      else if (entry.text) hits.push(entry);
    }
    // A string literal as a text-bearing attribute.
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText();
      if (TEXT_ATTRIBUTES.has(name)) {
        const reason = rejectionReason(node.initializer.text);
        const entry = {
          file,
          line: line(node),
          kind: `${name}=`,
          text: node.initializer.text.slice(0, 90),
        };
        if (reason) rejected.push({ ...entry, reason });
        else hits.push(entry);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ hits, rejectedCount: rejected.length }, null, 2));
  process.exit(0);
}

const byFile = new Map();
for (const h of hits) {
  if (!byFile.has(h.file)) byFile.set(h.file, []);
  byFile.get(h.file).push(h);
}

console.log(`BARE JSX TEXT — ${hits.length} hit(s) in ${byFile.size} file(s)`);
console.log(`(${rejected.length} rejected by the filters; --verbose to see them)\n`);
for (const [file, list] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${file}  (${list.length})`);
  for (const h of list) console.log(`    ${String(h.line).padStart(4)}  [${h.kind}] ${h.text}`);
}

// SINGLE WORDS THE (β) RULE HID, ALWAYS PRINTED.
//
// The one-word rule buys a low false-positive rate by hiding anything that
// is not in a curated control vocabulary — which means it also hides real
// one-word labels ("Score", "Verdict", "TAM"). Listing them here is the
// difference between a filter and a blind spot: the number is visible, so
// the trade can be argued with instead of discovered later.
const singleWordMisses = new Map();
for (const r of rejected) {
  const m = r.reason.match(/^single word, not UI vocabulary \((.+)\)$/);
  if (m && /^[a-z][a-z-]{2,}$/.test(m[1])) {
    if (!singleWordMisses.has(m[1])) singleWordMisses.set(m[1], []);
    singleWordMisses.get(m[1]).push(`${r.file.split("/src/")[1]}:${r.line}`);
  }
}
console.log(`\nPOSSIBLE MISSES — ${singleWordMisses.size} distinct single words the (β) rule hid.`);
console.log("These are NOT counted as hits. Add any that is a real label to UI_VOCABULARY.");
for (const [word, where] of [...singleWordMisses.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(where.length).padStart(3)}x  ${word.padEnd(18)} ${where[0]}`);
}

if (process.argv.includes("--verbose")) {
  const reasons = new Map();
  for (const r of rejected) {
    const key = r.reason.replace(/\(.*\)/, "").trim();
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  console.log("\nREJECTED, by reason:");
  for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${reason}`);
  }
  console.log("\nSingle words rejected as not-UI-vocabulary (check for misses):");
  const singles = new Map();
  for (const r of rejected) {
    const m = r.reason.match(/^single word, not UI vocabulary \((.+)\)$/);
    if (m) singles.set(m[1], (singles.get(m[1]) ?? 0) + 1);
  }
  for (const [w, n] of [...singles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    console.log(`  ${String(n).padStart(5)}  ${w}`);
  }
}
