#!/usr/bin/env node
/*
 * THE EMAILS, IN EVERY LANGUAGE, FOR SOMEBODY WHO SPEAKS IT.
 *
 * docs/first-run/first-run.<locale>.md is the review pack for the
 * interface, and it walks components — so it holds no email at all
 * (docs/v5-closing-report.md, "For the emails: there is no pack"). The
 * emails are the messages a customer reads when they are NOT looking at
 * the product, and they are read with more attention than a button.
 *
 * This is the pack for them, V6 1.10d (docs/QUEUE.md). Same shape as the
 * interface pack, one file per language, English beside every line:
 *
 *   tier 1  the sentences of the emails a person is sure or likely to get
 *           — the welcome, a new sign-in, a deletion, a cancellation, a
 *           job that got stuck or finished, an agent's result. Prose of
 *           SENTENCE_WORDS words or more. About forty: an hour of a
 *           reader's time.
 *   tier 2  the sentences of the rest (the weekly digest, form
 *           submissions, the blurbs).
 *   tier 3  everything shorter — subjects, labels, the footer.
 *
 * THE POPULATION IS THE NAMESPACE. Every leaf under `email` in
 * messages/en.json lands in exactly one tier, and a group that is not in
 * EMAIL_GROUPS below fails scripts/tests/email-strings.test.mjs rather
 * than being dropped — a pack that silently loses a new email is the
 * thing this exists to stop.
 *
 * Run:
 *   node scripts/email-strings.mjs              # report only
 *   node scripts/email-strings.mjs --out DIR    # write the files
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LOCALES, wordCount } from "./first-run-strings.mjs";

export const SENTENCE_WORDS = 5;

/**
 * Every email group, in the order a person meets them, and why. `likely`
 * is the judgement that decides tier 1, written down rather than inferred.
 */
export const EMAIL_GROUPS = [
  { group: "welcome", likely: true, why: "every account gets it, minutes after signing up" },
  { group: "newDevice", likely: true, why: "a sign-in from a new device — a security email, read closely" },
  { group: "stuck", likely: true, why: "a website generation that did not finish" },
  { group: "scheduledRun", likely: true, why: "a scheduled job finished" },
  { group: "agent", likely: true, why: "an agent's result or failure" },
  { group: "cancelled", likely: true, why: "the subscription was cancelled — the last thing a leaving customer reads" },
  { group: "deletion", likely: true, why: "confirming that an account is being deleted" },
  { group: "digest", likely: false, why: "the weekly digest, for those who opt in" },
  { group: "formSubmission", likely: false, why: "somebody filled in a form on a published site" },
  { group: "blurbs", likely: false, why: "short lines shared by several emails" },
  { group: "footer", likely: false, why: "the footer under every email" },
];

/** Every leaf under `node`, as [dotted key, text]. A string is one leaf. */
export function leaves(node, prefix) {
  if (node === null || typeof node !== "object") return [[prefix, String(node)]];
  return Object.entries(node).flatMap(([k, v]) => leaves(v, `${prefix}.${k}`));
}

export function tierOf(groupSpec, text) {
  const sentence = wordCount(text) >= SENTENCE_WORDS;
  if (sentence && groupSpec.likely) return 1;
  if (sentence) return 2;
  return 3;
}

export const TIERS = [
  { n: 1, title: "THE SENTENCES — read these", note: `From the emails a person is sure or likely to receive, ${SENTENCE_WORDS} words or more.` },
  { n: 2, title: "The other emails' sentences — if you have time", note: "The digest, form submissions and shared lines. Fewer people get them." },
  { n: 3, title: "Subjects, labels and the footer — skim", note: "Short lines. A wrong one is usually obvious; look for the one that means something else in your language." },
];

export function collectEmails(en) {
  const known = new Set(EMAIL_GROUPS.map((g) => g.group));
  const unlisted = Object.keys(en.email ?? {}).filter((g) => !known.has(g));
  const missingGroups = EMAIL_GROUPS.filter((g) => !(g.group in (en.email ?? {}))).map((g) => g.group);
  const rows = EMAIL_GROUPS.filter((g) => g.group in (en.email ?? {})).flatMap((spec) =>
    leaves(en.email[spec.group], `email.${spec.group}`).map(([key, text]) => ({
      key,
      text,
      group: spec.group,
      tier: tierOf(spec, text),
    }))
  );
  return { rows, unlisted, missingGroups };
}

export function resolveKey(messages, key) {
  let node = messages;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object" || !(part in node)) return undefined;
    node = node[part];
  }
  return typeof node === "object" ? undefined : String(node);
}

export function renderPack(locale, rows, messages) {
  const count = (n) => rows.filter((r) => r.tier === n).length;
  const lines = [];
  lines.push(`# The emails — ${locale}`);
  lines.push("");
  lines.push(
    `Every line of every email the product sends: **${rows.length} strings**. ` +
      `The interface has its own pack, \`first-run.${locale}.md\`, beside this one.`
  );
  lines.push("");
  lines.push(
    `**Start with tier 1. It is ${count(1)} sentences and it is the whole ask.** ` +
      `Tier 2 is ${count(2)} more sentences from emails fewer people get. Tier 3 is ${count(3)} short lines to skim.`
  );
  lines.push("");
  lines.push(
    `**What to look for.** An email is read when the product is not on screen, often on a phone, ` +
      `sometimes as the only thing a person reads from us that week. Does it sound like a person ` +
      `wrote it? Is it the right register — the same "you" as the app? Would you send it to a ` +
      `customer under your own name? \`{name}\`-style placeholders are filled in when it is sent.`
  );
  lines.push("");
  if (locale === "en") {
    lines.push(`_This is the English original. It is here so a reader of another file can be sent both._`);
    lines.push("");
  }
  for (const tier of TIERS) {
    const mine = rows.filter((r) => r.tier === tier.n);
    if (mine.length === 0) continue;
    lines.push(`## Tier ${tier.n} — ${tier.title} (${mine.length})`);
    lines.push("");
    lines.push(`_${tier.note}_`);
    lines.push("");
    for (const spec of EMAIL_GROUPS) {
      const groupRows = mine.filter((r) => r.group === spec.group);
      if (groupRows.length === 0) continue;
      lines.push(`### ${spec.group} — ${spec.why}`);
      lines.push("");
      for (const r of groupRows) {
        const translated = resolveKey(messages[locale], r.key);
        lines.push(`**\`${r.key}\`**`);
        lines.push("");
        if (locale !== "en") lines.push(`> EN — ${r.text}`);
        lines.push("");
        lines.push(translated === undefined ? "**MISSING IN THIS LANGUAGE**" : translated);
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
  const { rows, unlisted, missingGroups } = collectEmails(messages.en);
  console.log("THE EMAILS — every line, tiered for a reader\n");
  for (const spec of EMAIL_GROUPS) {
    const mine = rows.filter((r) => r.group === spec.group);
    console.log(`  ${String(mine.length).padStart(3)}  ${spec.group.padEnd(15)} tier 1: ${mine.filter((r) => r.tier === 1).length}`);
  }
  for (const t of TIERS) console.log(`  tier ${t.n}: ${String(rows.filter((r) => r.tier === t.n).length).padStart(3)}  ${t.title}`);
  console.log(`\n  ${unlisted.length} group(s) in messages/en.json not in EMAIL_GROUPS: ${unlisted.join(", ") || "none"}`);
  console.log(`  ${missingGroups.length} group(s) in EMAIL_GROUPS not in messages/en.json: ${missingGroups.join(", ") || "none"}`);
  if (!outDir) {
    console.log("\n  (nothing written — pass --out DIR to produce one file per language)");
    return;
  }
  mkdirSync(outDir, { recursive: true });
  for (const locale of LOCALES) {
    const file = path.join(outDir, `emails.${locale}.md`);
    writeFileSync(file, renderPack(locale, rows, messages));
    console.log(`  wrote ${file}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
