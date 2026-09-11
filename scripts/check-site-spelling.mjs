#!/usr/bin/env node
/*
 * POINT THE SHIPPED SPELLING CHECKER AT A SITE THAT ALREADY EXISTS.
 *
 * WHY THIS FILE HAD TO BE WRITTEN AT ALL. lib/websites-greek-spelling-
 * check.ts has exactly one caller — app/api/websites/generate/process/
 * route.ts, at the end of a generation — so the only way to see it read a
 * page was to generate a new page. "Does it work on the site I already
 * have?" had no answer that did not cost a whole website build.
 *
 * WHAT IT RUNS. The SHIPPED rules, not a copy of them:
 *
 *   - which words are asked about   -> greekWordsToCheck, imported
 *   - which answers are kept        -> keepOnlyAsked, imported
 *   - the reply parser              -> parseWordList, imported
 *   - the system prompt             -> READ OUT OF THE SOURCE FILE
 *   - the model                     -> COMPUTED the way complete.ts does
 *
 * The last two are the ones a runner normally gets wrong. A retyped prompt
 * and a hardcoded model id both pass forever while the real ones drift,
 * and then this file reports on something the product no longer does. Both
 * are read from the tree at run time, and this file REFUSES rather than
 * falling back to a copy when it cannot read them — see systemPromptFrom
 * Source and productionModel.
 *
 * WHAT IT COSTS. One message. The word list is capped at
 * SPELLING_WORD_CAP, the reply at 300 tokens; on a normal site that is a
 * few hundred tokens in total and a fraction of a cent. --dry-run makes
 * the whole selection and prints it without calling anybody, which answers
 * three of the four questions this was built for at zero cost.
 *
 * Run: node scripts/check-site-spelling.mjs --url <URL> --brief "<brief>"
 *      node scripts/check-site-spelling.mjs --html page.html --brief "..." --dry-run
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadTs } from "./tests/load-ts.mjs";

const CHECKER_SRC = "src/lib/websites-greek-spelling-check.ts";
const PURE_SRC = "src/lib/website-greek-spelling.ts";
const CATALOG_SRC = "src/lib/ai/providers/catalog.ts";

/**
 * THE PROMPT, TAKEN FROM THE FILE THAT SHIPS IT.
 *
 * `const SYSTEM = [ "...", "..." ].join(" ")` — parsed, not re-typed. If
 * somebody adds a line to that array tomorrow, this runner sends the new
 * line too; if somebody changes its shape so this parser cannot read it,
 * this throws and the run stops. THE ALTERNATIVE IS THE ONE THIS
 * REPOSITORY KEEPS FINDING: a copy that passes forever while the original
 * moves. honeypot-rtl.prodtest.mjs reads its rule catalogue the same way
 * and for the same reason.
 */
export function systemPromptFromSource(src) {
  const m = src.match(/const SYSTEM = \[([\s\S]*?)\]\.join\(" "\);/);
  if (!m) {
    throw new Error(
      `Cannot read the system prompt out of ${CHECKER_SRC}. It is no longer ` +
        `\`const SYSTEM = [...].join(" ")\`. REFUSING rather than sending a ` +
        `prompt this runner made up: a run against the wrong instruction ` +
        `answers a question nobody asked.`
    );
  }
  const lines = JSON.parse(`[${m[1].replace(/,\s*$/, "")}]`);
  if (!Array.isArray(lines) || lines.length === 0 || lines.some((l) => typeof l !== "string")) {
    throw new Error(`The SYSTEM array in ${CHECKER_SRC} did not parse into strings.`);
  }
  return lines.join(" ");
}

/**
 * THE MODEL PRODUCTION ACTUALLY USES, read out of the file that ships it.
 *
 * NOT HARDCODED HERE, for the same reason the prompt is not: a model id
 * typed into a script agrees with production on the day it is typed and
 * never again. `const MODEL = "..."` is parsed out of the checker, then
 * looked up in the catalogue so the PRICES beside it are the ones the
 * credit charge is computed from rather than numbers this file remembers.
 *
 * THIS FUNCTION FOUND SOMETHING WHEN IT WAS FIRST WRITTEN, and the finding
 * is why the parse exists at all. There was no `const MODEL` to read: the
 * call named no model, so complete.ts read it as `originTier = "mid"` and
 * substituteModel returned claude-sonnet-4-6 (3/15) rather than the
 * claude-haiku-4-5 (1/5) that "one cheap classification call" sounds like.
 * The checker now names it. If somebody removes the line again this throws
 * instead of quietly reporting on whichever model the default lands on.
 */
export function shippedModel(src, catalog) {
  const m = src.match(/const MODEL = "([^"]+)";/);
  if (!m) {
    throw new Error(
      `No \`const MODEL = "..."\` in ${CHECKER_SRC}. The call is back on ` +
        `complete.ts's default tier, which is "mid" — sonnet, not haiku. ` +
        `REFUSING: this runner would report a price for a model it guessed.`
    );
  }
  const model = catalog.catalogModel(m[1]);
  if (!model) throw new Error(`${CHECKER_SRC} names "${m[1]}", which is not in ${CATALOG_SRC}.`);
  return model;
}

/** What complete.ts would fall back to for this purpose if no model were
 *  named — kept so the report can print the difference rather than assert
 *  it. `purpose: "classification"` with no model means tier "mid". */
export function unnamedDefaultModel(catalog) {
  return catalog.substituteModel("anthropic", "mid", []);
}

/** USD, from the catalogue's own prices — the same table the credit charge
 *  is computed from, so a wrong number here is wrong in the same direction
 *  as the bill rather than in a new one. */
export function costOf(model, usage) {
  const input = (usage.input_tokens ?? 0) / 1e6 * model.inputPerMTok;
  const output = (usage.output_tokens ?? 0) / 1e6 * model.outputPerMTok;
  return { input, output, total: input + output };
}

/** A word list's worst case, for the refusal below: every word plus the
 *  prompt in, the whole 300-token ceiling out. */
export function worstCaseCost(model, words, systemPrompt) {
  const chars = systemPrompt.length + JSON.stringify(words).length;
  // Greek is roughly one token per two characters through this tokenizer;
  // halving is generous in the direction that OVERSTATES the cost, which
  // is the safe direction for a spending refusal.
  return costOf(model, { input_tokens: Math.ceil(chars / 2), output_tokens: 300 }).total;
}

export function parseArgs(argv) {
  const out = { flags: new Set(), values: new Map() };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out.flags.add(name);
    else {
      out.values.set(name, next);
      out.flags.add(name);
      i += 1;
    }
  }
  return {
    has: (n) => out.flags.has(n),
    get: (n) => out.values.get(n),
  };
}

/**
 * THE PAGE. fetch first; curl second, with --tls-max 1.2.
 *
 * NOT A PREFERENCE — a measured one. Chromium and node's fetch both fail
 * their TLS handshake against this project's own production host from
 * inside this environment, and `curl --tls-max 1.2` is the invocation that
 * works. (`--ssl-version-max` is not a curl flag and was tried first.)
 * Whichever one served the page is printed, so a reader can tell.
 */
async function fetchPage(url) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { html: await res.text(), via: "fetch" };
  } catch (err) {
    try {
      const html = execFileSync("curl", ["-sS", "-L", "--tls-max", "1.2", url], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        timeout: 60_000,
      });
      return { html, via: `curl --tls-max 1.2 (fetch said: ${err.message})` };
    } catch (curlErr) {
      throw new Error(`neither fetch nor curl could read ${url}: ${err.message} / ${curlErr.message}`);
    }
  }
}

async function callAnthropic({ apiKey, model, system, words, signal }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody({ model, system, words })),
    signal,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${body.slice(0, 400)}`);
  const json = JSON.parse(body);
  const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
  return { text, usage: json.usage ?? {}, model: json.model };
}

/**
 * THE REQUEST, BUILT WHERE A TEST CAN SEE IT.
 *
 * The same shape findGreekMisspellings sends: the system prompt, ONE user
 * message holding the JSON word list, 300 tokens, temperature 0. Pulled
 * out of the fetch so scripts/tests/check-site-spelling.test.mjs can
 * assert that nothing but greekWordsToCheck's output ever reaches the
 * body — the promise this whole checker rests on is that the owner's own
 * village is not in it, and a promise inside a network call is a promise
 * no gate can read.
 */
export function requestBody({ model, system, words }) {
  return {
    model: model.id,
    max_tokens: 300,
    temperature: 0,
    system,
    messages: [{ role: "user", content: JSON.stringify(words) }],
  };
}

/**
 * EVERY Greek word on the page, split into "asked about" and the rule
 * that held it back.
 *
 * THE PREDICATES ARE THE SHIPPED ONES — greekWordsOnPage, briefWordFolds,
 * ownNameStems, isOwnName, and the shared fold — so this cannot disagree
 * with the product about what a Greek word is or what protects one. What
 * it restates is the ORDER greekWordsToCheck applies them in, which is
 * the one thing an explanation needs and a predicate does not carry.
 *
 * THE PARTITION IS THE CHECK. asked + held == onPage, exactly, with no
 * word in two buckets: if the real function grows a sixth reason, the
 * arithmetic stops adding up and the gate says so instead of the report
 * quietly filing the word under "beyond the cap".
 */
export function auditWords(pure, fold, html, brief) {
  const onPage = pure.greekWordsOnPage(html);
  const asked = pure.greekWordsToCheck(html, brief);
  const askedSet = new Set(asked);
  const stems = pure.ownNameStems(brief);
  const briefFolds = pure.briefWordFolds(brief);
  const askedFolds = new Set(asked.map(fold));
  const held = { allCaps: [], ownWord: [], ownName: [], duplicate: [], overCap: [] };
  for (const w of onPage) {
    if (askedSet.has(w)) continue;
    if (w === w.toUpperCase()) held.allCaps.push(w);
    else if (briefFolds.has(fold(w))) held.ownWord.push(w);
    else if (pure.isOwnName(w, stems)) held.ownName.push(w);
    else if (askedFolds.has(fold(w))) held.duplicate.push(w);
    else held.overCap.push(w);
  }
  return { onPage, asked, stems, held };
}

const MISSING = [];
function need(cond, what) {
  if (!cond) MISSING.push(what);
  return cond;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args.has("dry-run");

  // ---- what is missing, ALL OF IT, before anything else happens -------
  // A runner that stops at the first missing input costs the owner one
  // round trip per input. Every one that is absent is named here.
  const url = args.get("url");
  const htmlFile = args.get("html");
  need(url || htmlFile, "--url <URL of the published site>  (or --html <file>)");
  // THE BRIEF IS NOT OPTIONAL, and this is the one refusal in the file.
  //
  // The brief is the ONLY thing standing between the owner and the product
  // asking whether their own village is a typo — greekWordsToCheck drops
  // every word in it, and ownNameStems drops the inflections too. Run with
  // no brief and the first thing this prints is the owner's own surname in
  // a list headed "possibly misspelled". `--brief ""` says it on purpose.
  need(args.has("brief") || args.has("brief-file"), '--brief "<the brief the site was generated from>"');
  const apiKey = args.get("key") ?? process.env.ANTHROPIC_API_KEY;
  if (!dryRun) need(apiKey, "ANTHROPIC_API_KEY  (in the environment, or --key <key>)");

  if (MISSING.length > 0) {
    console.log("SKIPPED — this runner has not run, and here is everything it needs:\n");
    for (const m of MISSING) console.log(`  MISSING  ${m}`);
    console.log(
      "\n  --dry-run needs no key: it selects the words and prints them without\n" +
        "  calling anybody, which answers 'does it ask about words I wrote?' for $0.\n"
    );
    process.exit(2);
  }

  const briefFile = args.get("brief-file");
  const brief = briefFile ? readFileSync(briefFile, "utf8") : (args.get("brief") ?? "");
  if (brief.trim() === "") {
    console.log("  WARNING  the brief is empty. NOTHING protects the owner's own words:");
    console.log("           a village, a surname or a business name on the page will be");
    console.log("           put to the model like any other word.\n");
  }

  // ---- the page ------------------------------------------------------
  let html;
  let via;
  if (htmlFile) {
    if (!existsSync(htmlFile)) throw new Error(`No such file: ${htmlFile}`);
    html = readFileSync(htmlFile, "utf8");
    via = `local file ${htmlFile}`;
  } else {
    ({ html, via } = await fetchPage(url));
  }
  console.log(`page: ${(html.length / 1024).toFixed(1)} KB via ${via}`);

  // ---- the shipped rules ---------------------------------------------
  const pure = await loadTs(PURE_SRC);
  const catalog = await loadTs(CATALOG_SRC);
  // The SHARED fold, from the file every matching surface in this codebase
  // uses. A private `toLowerCase()` here would report "Καλαμπακα" as
  // unprotected against a brief saying "Καλαμπάκα" — the exact bug the
  // pure module's own comment records having shipped for one draft.
  const { foldForMatch: fold } = await loadTs("src/lib/text/unicode-patterns.ts");
  const checkerSrc = readFileSync(CHECKER_SRC, "utf8");
  const override = args.get("model");
  const shipped = shippedModel(checkerSrc, catalog);
  const model = override ? catalog.catalogModel(override) : shipped;
  if (!model) throw new Error(`--model ${override} is not in ${CATALOG_SRC}.`);
  const system = systemPromptFromSource(checkerSrc);


  // WHAT WAS HELD BACK, AND WHY — one line per reason.
  //
  // The owner's two questions are "does it not ask about words I wrote?"
  // and "are the inflected forms protected?", and those are two DIFFERENT
  // mechanisms: an exact fold against the brief, and a stem. A list of
  // what survived cannot tell them apart, and cannot distinguish either
  // from "that word was never on the page".
  const { onPage, asked: words, stems, held } = auditWords(pure, fold, html, brief);

  const line = (label, list) =>
    console.log(`  ${String(list.length).padStart(3)}  ${label}\n       ${list.join(", ") || "(none)"}`);

  console.log(`\n== what goes to the model ==`);
  console.log(`  ${onPage.length} distinct Greek words on the page; ${words.length} asked about (cap ${pure.SPELLING_WORD_CAP})`);
  console.log(`  own-name stems from the brief: ${stems.join(", ") || "(none)"}\n`);
  console.log(`  HELD BACK, by the rule that held them:`);
  line("all-caps — a wordmark is a design choice, and capitals lose the accents", held.allCaps);
  line("THE OWNER TYPED THIS WORD IN THE BRIEF", held.ownWord);
  line("AN INFLECTION OF A NAME IN THE BRIEF (the stem rule)", held.ownName);
  line("already asked about in another form", held.duplicate);
  line(`beyond the ${pure.SPELLING_WORD_CAP}-word cap — NOT CHECKED AT ALL`, held.overCap);
  console.log(`\n  the list: ${JSON.stringify(words)}`);

  console.log(`\n== the call ==`);
  console.log(`  model:  ${model.id}  (${model.inputPerMTok}/${model.outputPerMTok} per MTok)`);
  console.log(
    `          ${override ? `--model override; ${CHECKER_SRC} ships ${shipped.id}` : `read from ${CHECKER_SRC}`}` +
      `; complete.ts's unnamed default for this purpose would be ${unnamedDefaultModel(catalog)?.id}`
  );
  console.log(`  system: ${system}`);

  if (words.length === 0) {
    console.log(`\nNOTHING TO ASK. The page has no Greek word this checker would put to a model.`);
    console.log(`Cost: $0.0000`);
    return;
  }

  const maxCost = Number(args.get("max-cost") ?? "3");
  const worst = worstCaseCost(model, words, system);
  console.log(`  worst case: $${worst.toFixed(4)} (ceiling --max-cost $${maxCost.toFixed(2)})`);
  if (worst > maxCost) {
    console.log(`\nREFUSED: the worst case exceeds the ceiling. Nothing was sent, $0.00 spent.`);
    process.exit(3);
  }

  if (dryRun) {
    console.log(`\nDRY RUN — nothing was sent. Cost: $0.0000`);
    return;
  }

  const answer = await callAnthropic({ apiKey, model, system, words });
  const parsed = pure.parseWordList(answer.text ?? "");
  const kept = pure.keepOnlyAsked(parsed, words);
  const raw = Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  const invented = raw.filter((w) => !kept.some((k) => k.toLowerCase() === String(w).toLowerCase()));
  const cost = costOf(model, answer.usage);

  console.log(`\n== the answer ==`);
  console.log(`  raw:      ${answer.text.trim().slice(0, 500)}`);
  console.log(`  kept:     ${JSON.stringify(kept)}   <- what the owner would be shown`);
  console.log(`  dropped:  ${JSON.stringify(invented)}   <- returned but not on the page, never shown`);
  console.log(`  served by: ${answer.model}`);

  console.log(`\n== the cost ==`);
  console.log(`  in  ${answer.usage.input_tokens ?? 0} tokens  $${cost.input.toFixed(6)}`);
  console.log(`  out ${answer.usage.output_tokens ?? 0} tokens  $${cost.output.toFixed(6)}`);
  console.log(`  TOTAL $${cost.total.toFixed(4)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\nFAILED: ${err.message}`);
    process.exit(1);
  });
}
