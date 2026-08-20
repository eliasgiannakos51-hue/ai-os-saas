// The i18n gap that scripts/check-i18n.js could not see.
//
// check-i18n.js reads messages/*.json and nothing else. It answers exactly
// one question — "does every English key exist, translated, in the other
// nine locales?" — and it answers it well. But its own header claims it
// also catches:
//
//     "2. A UI string never added to messages/*.json at all — a literal in
//      JSX. Nothing can translate what it never sees."
//
// It cannot. It never opens a source file. So the app shipped 46 hardcoded
// English strings across 26 components — every toast and inline error in
// Settings, Modules CRUD, Team, Mission, Entity Links, Billing, Website
// Builder and signup:
//
//     addToast("✓ created")
//     setError("Network error — please try again.")
//     addToast("✗ could not update password", "error")
//
// A Greek or Japanese user completing any of those flows got English. Both
// halves of the app's i18n guard passed the whole time.
//
// This file closes that gap from the SOURCE side, and adds the mirror
// check: a t("key") call whose key does not exist. next-intl does not fail
// the build for that — it logs IntlError: MISSING_MESSAGE to the browser
// console and renders the raw key path to the user. The only reason the
// five sidebar hint keys were caught earlier this project was that someone
// happened to be reading the console.
//
// Run: node scripts/tests/i18n-coverage.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { execFileSync } from "node:child_process";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const lookup = (obj, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const sources = walk("src");

console.log("== 1. no user-facing string is hardcoded in a component ==");
// The three calls that put a string straight in front of the user. A
// literal here is, by construction, untranslatable.
const USER_FACING_CALLS = ["addToast", "setError", "setMessage"];
// Literals that are NOT user-facing prose: a lone symbol, a formatting
// token, an empty reset. Requiring three consecutive letters is what
// separates "✓ created" from "" or "—".
const PROSE = /[A-Za-z]{3,}/;

// Comments must be stripped first. Several files in this repo document the
// bug they fixed by quoting the OLD code — lib/ndjson-stream.ts's header
// literally contains `setError("Network error")` as an illustration. A
// scanner that flags its own documentation is a scanner people switch off.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// TEMPLATE LITERALS COUNT, and until now they did not.
//
// This scanner matched `addToast("...")` only. `addToast(`...`)` is the
// same string reaching the same user, and it is the form people reach for
// the moment a message has a symbol or a value in it — which is most of
// them. So `addToast(`✓ saved`)` shipped English past a check whose entire
// job is to stop that, and the SECURITY.md line describing this gate ("a
// user-facing string is hardcoded in a component fails the build") was
// true of half the ways to write one.
//
// Interpolated segments are NOT prose: in `` `✗ ${failure.what}` `` the
// words come from a translated variable and the literal parts are a symbol
// and a space. So only the literal chunks between the interpolations are
// tested, which is what separates that from `` `✗ could not save` ``.
/**
 * Is this string a SENTENCE somebody reads, or an identifier?
 *
 * The plain `[A-Za-z]{3,}` test above is right for the anchored forms —
 * the first argument of addToast is prose by construction. It is wrong the
 * moment the scan widens to "any literal near a ternary", because that
 * sweeps up every `t("buildError")` key, every `?? "untitled"` sentinel and
 * every Tailwind class list. The first version of this widening reported
 * 124 items of which about a dozen were real, and a check with that ratio
 * gets its baseline set to 124, which is the same as deleting it.
 *
 * So: prose has a space in it (`buildError`, `untitled`, `slack_error`,
 * `/dashboard/overview` do not), is not a class list, and is not so long
 * that it can only be markup.
 */
const TAILWIND = /(^|\s)(flex|grid|inline|text-|bg-|border|rounded|hover:|focus|min-h|max-w|h-\d|w-\d|px-|py-|mt-|absolute|relative|shrink)/;
function isEnglishProse(text) {
  if (!PROSE.test(text)) return false;
  if (!text.includes(" ")) return false;
  if (text.length > 120) return false;
  if (TAILWIND.test(text)) return false;
  return true;
}

// Brace-BALANCED, because `${[^}]*}` is not good enough here: a real
// interpolation in this codebase looks like
//   ${describe(new ApiError(500, { error: e.message })).what}
// and a non-greedy scan stops at the object literal's first `}`, leaving
// `})).what` behind as "literal text" — which contains letters, so the
// check flags its own fix. Walking the braces is the only version that
// tells an interpolation from the prose around it.
function literalChunksOf(template) {
  const chunks = [];
  let buf = "";
  for (let i = 0; i < template.length; i++) {
    if (template[i] === "$" && template[i + 1] === "{") {
      chunks.push(buf);
      buf = "";
      let depth = 1;
      i += 2;
      while (i < template.length && depth > 0) {
        if (template[i] === "{") depth++;
        else if (template[i] === "}") depth--;
        if (depth > 0) i++;
      }
      continue;
    }
    buf += template[i];
  }
  chunks.push(buf);
  return chunks;
}

const hardcoded = [];
for (const file of sources) {
  const src = stripComments(readFileSync(file, "utf8"));
  for (const fn of USER_FACING_CALLS) {
    for (const m of src.matchAll(new RegExp(`\\b${fn}\\(\\s*"([^"]*)"`, "g"))) {
      if (PROSE.test(m[1])) hardcoded.push(`${file}: ${fn}("${m[1]}")`);
    }
    for (const m of src.matchAll(new RegExp(`\\b${fn}\\(\\s*\`([^\`]*)\``, "g"))) {
      if (literalChunksOf(m[1]).some((chunk) => PROSE.test(chunk))) {
        hardcoded.push(`${file}: ${fn}(\`${m[1]}\`)`);
      }
    }
    // A TERNARY IS TWO STRINGS, and the anchored patterns above see
    // neither: `addToast(next ? "enabled" : "disabled")` does not start
    // with a quote after the paren, so it matched nothing. Found by the
    // audit immediately after this check was widened to template
    // literals — the same defect, one syntax over, which is the argument
    // for scanning the ARGUMENT rather than guessing its shape.
    for (const m of src.matchAll(new RegExp(`\\b${fn}\\(([^;]{0,200}?)\\)[,;]`, "g"))) {
      if (!m[1].includes("?")) continue;
      for (const lit of m[1].matchAll(/"([^"]*)"|`([^`]*)`/g)) {
        // A backtick branch gets the same interpolation-stripping as the
        // anchored case: in `` `✗ ${message}` `` the words are in a
        // variable, and the literal part is a symbol and a space.
        const parts = lit[1] !== undefined ? [lit[1]] : literalChunksOf(lit[2] ?? "");
        const text = parts.find(isEnglishProse);
        if (text) hardcoded.push(`${file}: ${fn}(... ? "${text}" ...)`);
      }
    }
  }

  // `data.error ?? "Could not start checkout."` — the English is the
  // FALLBACK for a server message, so it reads as a safety net and is
  // exactly as user-facing as everything above. Counted by neither
  // baseline: getErrorMessage's fallback ratchet only matches
  // `getErrorMessage(x, "...")`, and this form does not call it.
  for (const m of src.matchAll(/\?\?\s*"([^"]{8,})"/g)) {
    if (isEnglishProse(m[1])) hardcoded.push(`${file}: ?? "${m[1]}"`);
  }
}
// TWO CHECKS, because the two forms are at different stages.
//
// The ANCHORED forms — a quoted or templated first argument — are at zero
// and stay at zero. That is the check this file has always made, widened
// to backticks, and everything it found has been fixed.
//
// The INDIRECT forms — a ternary branch, or `?? "English"` — were found by
// the audit and have never been enforced, so they are at 38 and ratcheted.
// Splitting them is deliberate: rolling 38 known items into the same check
// would take the zero-tolerance one off zero, and a check that is allowed
// to be non-zero stops being read as "this must not happen".
const anchoredOnly = hardcoded.filter((h) => !/\(\.\.\. \? |: \?\? /.test(h));
const indirect = hardcoded.filter((h) => /\(\.\.\. \? |: \?\? /.test(h));

check(
  `no hardcoded prose in a ${USER_FACING_CALLS.join("/")} argument, quoted OR templated (${sources.length} files scanned)`,
  anchoredOnly,
  []
);

// 38 English sentences reached through a ternary branch or a `??`
// fallback. Every one is real — "Could not start checkout.", "Could not
// generate a reflection.", "✓ chat memory enabled" — and every one is
// read by a Greek user in English. They are recorded rather than fixed in
// this pass because closing them is 38 keys across ten locales, which is
// a translation job, not a sweep; recording them is what stops a 39th.
const INDIRECT_ENGLISH_BASELINE = 38;
checkTrue(
  `English reached through a ternary or ?? has not grown (${indirect.length} <= ${INDIRECT_ENGLISH_BASELINE})`,
  indirect.length <= INDIRECT_ENGLISH_BASELINE,
  indirect.join("\n        ")
);

// ---------------------------------------------------------------------
// 1a. THE SAME CALLS, WRITTEN WITH BACKTICKS.
//
//     addToast(`✗ could not save persona name`, "error")
//     addToast(`✗ error: ${err.message}`, "error")
//     addToast(`✓ added ${n} example ${n === 1 ? "entry" : "entries"}`)
//     window.confirm(`Delete "${title}"? This can't be undone.`)
//
// The regex above requires a double quote straight after the paren, so
// every one of those was invisible to it — and the third is an English
// plural rule baked into a ternary, which no language outside English
// shares. Four of them shipped.
//
// PARSED, not pattern-matched: only the STATIC chunks count. `✗ ${msg}`
// contributes "✗ " and is not prose; the interpolation is somebody else's
// already-translated string.
const RENDER_CALL_NAMES = new Set([...USER_FACING_CALLS, "setStatus", "alert", "confirm"]);
function staticChunksOf(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((sp) => sp.literal.text)];
  }
  return null;
}
const templateProse = [];
for (const file of sources) {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.ES2022,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText().split(".").pop();
      if (RENDER_CALL_NAMES.has(callee)) {
        for (const arg of node.arguments) {
          const chunks = staticChunksOf(arg);
          if (!chunks) continue;
          const prose = chunks.filter((c) => PROSE.test(c));
          if (prose.length) {
            const { line } = sf.getLineAndCharacterOfPosition(arg.getStart());
            templateProse.push(`${file}:${line + 1} ${callee}(\`…${prose.join("…")}…\`)`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
check("no rendered template literal has English in its static text", templateProse, []);

// It has to be able to fail, on the exact four shapes that shipped.
{
  const SHIPPED = [
    "function R({ addToast, err, n, title }) {",
    "  addToast(`\\u2717 could not save persona name`, 'error');",
    "  addToast(`\\u2717 error: ${err.message}`, 'error');",
    "  addToast(`\\u2713 added ${n} example ${n === 1 ? 'entry' : 'entries'}`);",
    "  window.confirm(`Delete \\\"${title}\\\"? This can't be undone.`);",
    "  addToast(`\\u2717 ${err.message}`, 'error');",
    "}",
  ].join("\n");
  const sf = ts.createSourceFile("toasts.ts", SHIPPED, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const caught = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText().split(".").pop();
      if (RENDER_CALL_NAMES.has(callee)) {
        for (const arg of node.arguments) {
          const chunks = staticChunksOf(arg);
          if (chunks && chunks.some((c) => PROSE.test(c))) caught.push(callee);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // Four flagged. The fifth — `\u2717 ${err.message}` — is left alone: its
  // only static text is a symbol, and the message it wraps is the
  // server-side prose already counted as a known gap below.
  check("the template walk catches the four shapes that shipped", caught, [
    "addToast",
    "addToast",
    "addToast",
    "confirm",
  ]);
}

// ---------------------------------------------------------------------
// 1b. THE PATTERN NO REGEX GATE COULD SEE: a conditional whose branches
//     are English literals, rendered straight into the UI.
//
//         {plan.teamSeatsIncluded
//           ? "Unlimited team seats included — no per-member charge"
//           : `+ €20/month per team member — ...`}
//
// Section 1 above scans `addToast("`, `setError("`, `setMessage("` — a
// literal as the FIRST thing after the paren. `addToast(next ? "..." )`
// does not match it. check-i18n.js never opens a source file at all. So
// this shape shipped in nine components, in the two pages a non-English
// visitor is most likely to see first, and every i18n check in the repo
// was green the whole time.
//
// PARSED, NOT PATTERN-MATCHED. A regex cannot tell `? "A" : "B"` from
// `reason: cond ? "A" : "B"` inside sendMarginAlertEmail({...}) — an
// operator alert that is English by design, exactly like the server-side
// error prose recorded as a known gap below. It also cannot tell prose
// from `expanded ? "rotate-180" : "rotate-0"`. Walking the real AST
// answers both by construction: a className attribute is not a text
// attribute, and an object property is not a render.
const TEXT_ATTRS = new Set([
  "title",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "placeholder",
  "alt",
  "label",
]);
const RENDER_CALLS = new Set([...USER_FACING_CALLS, "setStatus", "alert", "confirm"]);
// Two words is prose. One word is a class name, an enum value, or a
// formatting token — and the single-word cases that ARE user-facing
// (an aria-label of "Close") are caught by section 3's key coverage
// instead, since they have to come from somewhere.
const TERNARY_PROSE = /[A-Za-z]{3,}[ ,'\u2019][A-Za-z]{2,}/;

function staticTextOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    // Only the literal chunks: `${count} days` contributes " days".
    return node.head.text + node.templateSpans.map((sp) => sp.literal.text).join(" ");
  }
  return null;
}

/**
 * Walks up from a conditional to decide whether its value is RENDERED.
 * Returns the sink's name, or null when the value is data rather than UI.
 */
function renderSinkFor(node) {
  let cur = node.parent;
  for (let depth = 0; cur && depth < 6; depth++) {
    // An object property or a variable is data for whoever consumes it,
    // not something the user is being shown. This is what keeps
    // sendMarginAlertEmail({ reason: ... }) out of the results.
    if (ts.isPropertyAssignment(cur) || ts.isVariableDeclaration(cur)) return null;
    if (ts.isJsxExpression(cur)) {
      const parent = cur.parent;
      if (ts.isJsxAttribute(parent)) {
        const name = parent.name.getText();
        return TEXT_ATTRS.has(name) ? `${name}=` : null;
      }
      return "JSX text";
    }
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression.getText().split(".").pop();
      return RENDER_CALLS.has(callee) ? `${callee}()` : null;
    }
    cur = cur.parent;
  }
  return null;
}

const ternaryLiterals = [];
for (const file of sources) {
  if (!file.endsWith(".tsx")) continue;
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX
  );
  const visit = (node) => {
    if (ts.isConditionalExpression(node)) {
      for (const branch of [node.whenTrue, node.whenFalse]) {
        const text = staticTextOf(branch);
        if (!text || !TERNARY_PROSE.test(text)) continue;
        const sink = renderSinkFor(node);
        if (!sink) continue;
        const { line } = sf.getLineAndCharacterOfPosition(branch.getStart());
        ternaryLiterals.push(`${file}:${line + 1} [${sink}] ${text.trim().slice(0, 60)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
check(`no rendered ternary branch is an English literal`, ternaryLiterals, []);

// The check must be able to FAIL. Both shapes that shipped are parsed
// here, so an edit that narrows the AST walk into uselessness fails
// immediately instead of silently going quiet.
{
  const SHIPPED = `
    export function Regression({ a, b, c }) {
      const cls = a ? "rotate-180" : "rotate-0";
      void cls;
      send({ reason: c ? "30-day charged average is low" : "30-day projected average is low" });
      if (b) addToast(b ? "\u2713 chat memory enabled" : "\u2713 chat memory disabled");
      return (
        <p title={a ? "Owner access — unlimited credits" : "Credits remaining — buy more"}>
          {b ? "Unlimited team seats included — no per-member charge" : "\u002b €20/month per team member"}
        </p>
      );
    }`;
  const sf = ts.createSourceFile("regression.tsx", SHIPPED, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const caught = [];
  const visit = (node) => {
    if (ts.isConditionalExpression(node)) {
      for (const branch of [node.whenTrue, node.whenFalse]) {
        const text = staticTextOf(branch);
        if (text && TERNARY_PROSE.test(text) && renderSinkFor(node)) caught.push(text.trim());
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // Six flagged: two JSX text, two title=, two addToast.
  check("the AST walk catches every shape that shipped", caught.length, 6);
  // And leaves alone the two it must: a className toggle and an operator
  // alert's payload.
  check(
    "…without flagging class names or operator-alert payloads",
    caught.filter((c) => /rotate-|30-day/.test(c)),
    []
  );
}

// KNOWN GAP, recorded rather than silently tolerated.
//
// Error text that originates on the SERVER is English everywhere: API
// routes return `{ error: "Could not create that entry." }` as prose, and
// the client renders it verbatim through getErrorMessage(err, "English
// fallback"). Translating it properly means routes returning stable error
// CODES that the client looks up, or server-side translation against the
// request's locale cookie — a real refactor, not a string sweep, and out
// of scope for the audit that found it.
//
// The count is asserted so the number cannot quietly GROW. If a change
// adds server-side English prose, this fails and the decision gets made
// deliberately instead of by accident.
const serverErrorProse = sources
  .filter((f) => f.startsWith("src/app/api/"))
  .flatMap((f) => [...stripComments(readFileSync(f, "utf8")).matchAll(/error: "[A-Z][^"]{8,}"/g)]);
const clientFallbacks = sources.flatMap((f) => [
  ...stripComments(readFileSync(f, "utf8")).matchAll(/getErrorMessage\([^,]+,\s*"[^"]{6,}"/g),
]);
// 235 -> 236: api/websites/generate gained "Could not attach the reference
// images. Please try again." when the reference-image scoping fix made that
// insert fail-closed instead of best-effort. Same already-documented class
// (server-side English prose), raised deliberately rather than silently —
// which is the entire point of pinning the number.
// 236 -> 282: V3 Task 1 (Autonomous Agents) added five API routes —
// api/agents, api/agents/[id], api/agents/[id]/run, api/agents/build and
// api/cron/agent-runs — and every validation failure, ownership miss,
// plan-cap rejection and rate-limit response in them returns English
// prose, exactly like the 236 that came before. Raised deliberately, with
// the same decision recorded: translating these means routes returning
// stable error CODES the client looks up, which is a refactor of all 45+
// routes at once and not something to start halfway through in one
// feature. The USER-FACING strings for this feature — every label,
// status, toast and confirmation on /dashboard/agents — are fully
// translated in all ten locales; what is English here is the fallback
// text shown only when a request fails in a way the client has no
// specific message for.
// 282 -> 314: V3 Task 2 (Website Hosting) added api/websites/[id]/publish
// and api/published/[id]/rollback, whose validation, ownership,
// plan-cap, address-clash and security-block responses are English prose
// like the 282 before them. Same recorded decision as above: the fix is
// stable error CODES across all 45+ routes, not a string sweep inside one
// feature. Everything the user READS on /dashboard/published and on the
// publish control is fully translated in all ten locales.
// 314 -> 333: V3 Task 3 (Universal Integrations) added
// api/integrations/[provider]/connect, .../callback and the disconnect
// route, plus the Slack delivery branches in api/agents. Their
// not-authenticated, unknown-provider, plan-cap, rate-limit and
// not-configured responses are English prose like the 314 before them.
// Same recorded decision: stable error CODES across all routes is the fix,
// and it is a refactor of the whole API surface rather than something to
// start inside one feature. Everything the user READS on
// /dashboard/integrations is translated in all ten locales.
// 333 -> 441: V3 Task 4 (File Workspace + Deep Research) added the
// largest single block of API surface so far — upload, list, delete,
// signed download, ask, four collection endpoints, and the three research
// routes. Their not-authenticated, size, type, plan-cap, storage-cap,
// rate-limit, insufficient-credit and not-found responses are English
// prose like the 333 before them, and several are inside `extract.ts`,
// whose messages ("this PDF is password-protected", "no readable text was
// found") are written to be read by a person rather than parsed.
//
// Same recorded decision as the four increments above, and it is worth
// restating because the number has now tripled: the fix is stable error
// CODES across all 60+ routes with the translation happening client-side,
// which is a refactor of the entire API surface and not something to start
// inside one feature. What the user READS on /dashboard/files and
// /dashboard/research is fully translated in all ten locales.
// 441 -> 488: V3 Task 16 (Instant Value) added the import and insight
// routes — CSV analyse/apply, paste, insights generate/dismiss and the
// onboarding progress endpoint. Their not-authenticated, size, parse,
// mapping, rate-limit and insufficient-credit responses are English
// prose like the 441 before them.
//
// Same recorded decision as the five increments above: the fix is stable
// error CODES across the whole API surface with the translation done
// client-side, which is a refactor of every route and not something to
// start inside one feature. What the user READS in the onboarding flow
// and on the insight cards is fully translated in all ten locales.
//
// ONE HONEST EXCEPTION, recorded rather than glossed over: the insight
// SENTENCES are written by the narrator in the user's language, but when
// the narration is unavailable or rejected (lib/insights/narrate.ts
// discards any wording that invents a number) the detector's own English
// statement is shown instead. A true sentence in the wrong language beats
// a fabricated one in the right language, so that is the deliberate
// trade — but it is a degradation, not a translated path, and it is
// counted here so nobody later mistakes it for one.
// Raised from 488 to 504 by api/push/subscribe (16 strings): a new
// server route following the same documented convention as every other
// one here. The number is a RATCHET against unnoticed growth, not a cap
// — it is raised deliberately, with the reason recorded, or not at all.
//
// Raised again to 507 by api/account/export (3 strings: not-authenticated,
// the build-failure message, and the in-file explanation of why OAuth
// tokens are shown as [redacted]). Same convention: a server route's
// error replies are surfaced by the calling component, which translates
// them; the third string is documentation written INTO the export file,
// which is a JSON artefact the user downloads rather than UI chrome.
// Raised again to 517 by the background-jobs infrastructure (10 strings):
// api/jobs, api/jobs/[id], api/jobs/[id]/continue and lib/jobs/*. Same
// documented convention — a server route's error replies are surfaced by
// the calling component, which translates them.
//
// The ONE string a user was actually going to read in English is gone
// rather than counted: the reaper used to write "This job stopped
// unexpectedly. No credits were charged." straight onto the row, and the
// client printed it. It now writes the code "stalled" and the client
// renders dashboard.agents.buildStalled in the user's own language. A
// baseline raised over a string the user genuinely sees would be this
// check being talked around instead of answered.
// 518 -> 521 for api/billing/cancel and api/billing/resume: the
// not-authenticated reply, the no-subscription reply and the failure
// reply, in the same documented convention as the 518 before them — the
// calling component surfaces them and translates what it can. The three
// sentences the user actually READS while cancelling (what happens to
// access, credits, data, and that it is reversible) are in
// settings.billing.cancel.* in all ten locales; these are the fallbacks
// shown only when the request itself fails.
// 532 -> 540 once BOTH branches' routes are in one tree. The eight are
// api/delivery-channels' and api/notifications' remaining replies plus
// api/conversations/[id]'s — the last of which is worth naming, because it
// is the one route here that deliberately returns CODES rather than prose
// ("pin_limit", "title_too_long") and the eight counted below it are its
// neighbours, not its own strings.
// 540 -> 541 for the delivery-channel TEST endpoint (api/delivery-channels
// PUT and lib/agents/delivery-store's testDeliveryChannel): "that channel
// cannot be tested here", "that channel is not connected yet", the
// per-hour limit reply, and the ingest refusal that now says nothing was
// stored and to retry. Same documented convention as every increment
// above — the calling component surfaces and translates what it can.
//
// The honest caveat for these particular ones: when a test FAILS, the
// most useful half of the message is the platform's own words ("chat not
// found", "bot was blocked by the user"), which arrive from Telegram or
// Discord in English and cannot be translated by us at all. The sentences
// we own around them are in dashboard.agents.delivery.* in all ten
// locales (sendTest, testSentTelegram, testSentDiscord, testFailed); what
// is counted here is the server's reply when the request itself fails.
const SERVER_PROSE_BASELINE = 541;
// 520 -> 532 for the delivery-channel routes (api/delivery-channels,
// api/notifications) and the ownership refusals they surface. Same
// documented convention as every increment below — a route's error
// replies are English and the calling component supplies the translated
// wording — with ONE deliberate difference worth recording: the refusals
// that say WHY a destination was rejected ("an agent can only post to a
// channel in your own connected Slack workspace") are shown verbatim.
// They are security answers, and a paraphrase that drifted from what the
// server actually enforces would be worse than an untranslated sentence
// that is exactly true. What the user READS on the delivery picker —
// every label, every help line, every validation message they can hit by
// typing — is translated in all ten locales.
// 518 -> 520 for api/jobs/[id]/consume, the endpoint that records a
// finished result as having been SEEN so the user is not made to pay for
// it a second time. Its two counted strings are "Not authenticated." and
// "Job not found." — the standard pair every other route here returns,
// and neither is prose a user reads: the caller is a component that
// renders nothing on failure, because a mark that did not land means only
// that the result is offered once more, which is the safe direction.
// 517 -> 518 for the "Not authenticated." reply added to
// api/jobs/[id]/continue. That string is the standard one every other
// route in the app already returns, and it appeared because
// security-posture.test.mjs was right: the route was answering an
// unauthenticated caller with 404 alongside the wrong-owner case, which
// conflated "sign in" with "no such job".
// Measured by the regex above, not by an outside grep: a line-based grep
// misses the calls whose arguments span lines, and a baseline taken with a
// different instrument than the check is just a slow-motion false alarm.
// 38 -> 31. A ratchet is only worth having if it is TIGHTENED when the
// number falls, so lowering it is part of the same change that lowered
// the count — otherwise the seven slots stay available and the next
// English fallback slips in under a green check.
//
// What closed: the eighteen call sites that passed no fallback at all and
// silently got "Something went wrong. Please try again.", plus the five AI
// surfaces, which now build their message from the response status
// (lib/errors/use-error-text.ts) rather than carrying an English one.
//
// WHAT THE REMAINING 31 ARE, honestly: specific, useful sentences —
// "Could not rename conversation.", "Could not upload the reference
// images." — that are specific and useful IN ENGLISH. They are better
// than a generic message and worse than a translated one, and closing
// them means 31 new keys across ten locales rather than a mechanical
// sweep. Recorded rather than quietly tolerated.
const CLIENT_FALLBACK_BASELINE = 31;
checkTrue(
  `server-side English error prose has not grown (${serverErrorProse.length} <= ${SERVER_PROSE_BASELINE})`,
  serverErrorProse.length <= SERVER_PROSE_BASELINE
);
checkTrue(
  `client English fallbacks have not grown (${clientFallbacks.length} <= ${CLIENT_FALLBACK_BASELINE})`,
  clientFallbacks.length <= CLIENT_FALLBACK_BASELINE
);

// ---------------------------------------------------------------------
// 1c. BARE ENGLISH RENDERED STRAIGHT INTO JSX.
//
//     <span>We use cookies for essential functionality…</span>
//     <button>Accept</button>
//     <p title="Owner access — unlimited credits">
//
// The sibling of 1b. That catches `{cond ? "A" : "B"}`; this catches the
// literal that is simply there. Both walk the AST for the same reason —
// a regex cannot tell a text node from a className, or a sentence from an
// import specifier.
//
// MEASURED BEFORE IT WAS TRUSTED. The full report
// (`node scripts/jsx-text-report.mjs`) was read hit by hit and checked
// against a real browser on a Greek production build: 162 hits, of which
// the only category that was not genuinely untranslated user-facing
// English was the Next.js image-generation routes, whose PNG is fetched by
// social crawlers that send no locale cookie — excluded by convention, not
// by name. False-positive rate 0%.
//
// A RATCHET, NOT A ZERO.
//
// 86 of these still ship — 162 when this landed, minus the 22 aria-label
// attributes paid off in batch A1 (now held at zero by 1d above), the 25
// in the Ideas module paid off in A2, the 19 in Chat, Memory and Create
// paid off in A3, the two `title=` attributes that came with the eight
// template-literal strings 1a and 1d turned up, and the seven across
// not-found, error-message and the two Quick Start components that a
// second branch had already translated — four entries deleted outright
// rather than lowered, which is what the stale-baseline half of this
// check exists to force — and one more on the upgrade wall, which stopped
// naming the feature in English once the module heading became a key.
// Failing the build on all of them would mean
// this check could not land at all, and a check that cannot land protects
// nothing. So the baseline below is per FILE: no file may get worse, and
// the total may only go down. That is the same mechanism this file already
// uses for server-side error prose a few sections down — the number is
// asserted so it cannot quietly GROW, and the decision to pay the debt
// stays a decision instead of an accident.
//
// Fixing a file? Lower its number here, or delete the entry when it hits
// zero. The check fails if a baseline is HIGHER than reality too, so a
// stale entry cannot hide a regression somewhere else.
const BARE_TEXT_BASELINE = {
    "src/app/cookies/page.tsx": 19,
    "src/app/dashboard/error.tsx": 1,
    "src/app/dashboard/system-health/page.tsx": 5,
    "src/app/offline/page.tsx": 3,
    "src/app/privacy/page.tsx": 17,
    "src/app/terms/page.tsx": 10,
    "src/components/auth/generate-password-button.tsx": 1,
    "src/components/billing/upgrade-required.tsx": 3,
    "src/components/dashboard/command-palette.tsx": 3,
    "src/components/entity-links/link-to-modal.tsx": 1,
    "src/components/landing/deleted-account-banner.tsx": 1,
    "src/components/legal/legal-layout.tsx": 3,
    "src/components/overview/beta-expiry-banner.tsx": 2,
    "src/components/pagination-controls.tsx": 3,
    "src/components/pwa/pwa-provider.tsx": 4,
    "src/components/settings/buy-credits.tsx": 2,
    "src/components/settings/danger-zone.tsx": 1,
    "src/components/settings/password-change-form.tsx": 1,
    "src/components/system-health/error-list.tsx": 2,
    // Owner-only diagnostics, English on purpose like the rest of the
    // system-health page it lives on.
    "src/components/system-health/storage-diagnostics.tsx": 3,
    "src/components/text-actions/text-actions-textarea.tsx": 2,
    "src/components/ui/widget-boundary.tsx": 2,
  };
// Derived, not typed. The printed total used to be a hand-written 162 in a
// template string, which is a second number that can disagree with the
// first — and did, the moment the per-file entries came down.
const BASELINE_TOTAL = Object.values(BARE_TEXT_BASELINE).reduce((a, b) => a + b, 0);

{
  const report = JSON.parse(
    execFileSync("node", ["scripts/jsx-text-report.mjs", "--json"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
  );
  const counts = new Map();
  for (const hit of report.hits) {
    const rel = hit.file.slice(hit.file.indexOf("/src/") + 1);
    counts.set(rel, (counts.get(rel) ?? 0) + 1);
  }

  const worse = [];
  const stale = [];
  for (const [file, allowed] of Object.entries(BARE_TEXT_BASELINE)) {
    const actual = counts.get(file) ?? 0;
    if (actual > allowed) worse.push(`${file}: ${actual} (baseline ${allowed})`);
    if (actual < allowed) stale.push(`${file}: ${actual} (baseline ${allowed} — lower it)`);
  }
  for (const [file, actual] of counts) {
    if (!(file in BARE_TEXT_BASELINE)) worse.push(`${file}: ${actual} (NEW — no baseline)`);
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  console.log(`        ${total} bare-English hits across ${counts.size} files (baseline total ${BASELINE_TOTAL})`);
  check("no file renders MORE bare English than its baseline", worse, []);
  if (worse.length) {
    console.log("        Translate it, or — if it is genuinely not translatable —");
    console.log("        say why in scripts/jsx-text-report.mjs rather than raising the baseline.");
  }
  check("no baseline is stale (a fixed file must lower its number)", stale, []);
}

// ---------------------------------------------------------------------
// 1d. AN ARIA LABEL IS THE ONLY TEXT SOME USERS GET. NO LITERALS, AT ALL.
//
//     <button aria-label="Send">      <ArrowUp />      </button>
//     <button aria-label="Close">     <X />            </button>
//     <div role="dialog" aria-label="Command palette"> …
//
// Every one of those buttons is an ICON. There is no visible word to fall
// back on: for someone using a screen reader the aria-label IS the button,
// and 22 of them were English on a Greek, Japanese or Arabic page — while
// the label beside them, the heading above them and the toast after them
// were all translated. That is worse than an untranslated page, because it
// is invisible to everyone who could have reported it. Nothing in this
// file caught them: 1b only looks at conditionals, and 1c's ratchet let a
// file keep whatever it already had.
//
// SO THIS ONE IS A ZERO, NOT A RATCHET. A ratchet is the right instrument
// for a debt that is expensive to pay; this debt is 22 attributes and it
// is paid. Holding it at zero is what stops the next icon button from
// arriving with `aria-label="Retry"` — and there is nowhere for such a
// string to hide, because an aria-label has no legitimate non-prose form
// the way className or an id does.
//
// PARSED, NOT GREPPED, for the reason the two sections above give: the
// point is to allow `aria-label={t("send")}` and reject `aria-label="Send"`,
// and only the AST distinguishes an attribute's initializer kind.
const ARIA_TEXT_ATTRS = new Set([
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
]);
// The ONE literal that is allowed, and only as the whole value: the
// product's own name. "Ionexa AI" is the same nine characters in all ten
// locales, so a key for it would be ten copies of a string that can never
// differ — and check-i18n.js would then flag nine of them as untranslated.
const BRAND_ARIA_LITERALS = new Set(["ionexa", "ionexa ai"]);

/**
 * The hardcoded text in an aria attribute's value, or null when the value
 * comes from somewhere translatable.
 *
 * A TEMPLATE LITERAL IS A LITERAL. The first version of this check only
 * looked at `aria-label="..."`, so four attributes went on shipping
 * English: `aria-label={`Unlink ${headline}`}`, `` `Remove ${label}` ``,
 * `` `${message} — press Enter to dismiss` `` and `` `${label} (hex)` ``.
 * The interpolation is the translatable part; the words around it are not.
 *
 * Its static chunks are joined so the technical-token test below sees the
 * whole phrase: "(hex)" beside an interpolated label is a format hint, not
 * prose, and flagging it would be a false report.
 */
function ariaLiteralText(init) {
  if (!init) return null;
  const node = ts.isJsxExpression(init) ? init.expression : init;
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    const words = [node.head.text, ...node.templateSpans.map((sp) => sp.literal.text)]
      .join(" ")
      .trim();
    // Only the words matter. `${a} — ${b}` is punctuation glue; "(hex)" is
    // a format hint. Two or more real letters in a row, at least once, is
    // the line between the two.
    return /[A-Za-z]{3,}/.test(words.replace(/\(hex\)/gi, "")) ? words : null;
  }
  return null;
}

const literalAria = [];
for (const file of sources) {
  if (!file.endsWith(".tsx")) continue;
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX
  );
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && ARIA_TEXT_ATTRS.has(node.name.getText())) {
      const text = ariaLiteralText(node.initializer);
      if (text !== null && !BRAND_ARIA_LITERALS.has(text.trim().toLowerCase())) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        literalAria.push(`${file}:${line + 1} ${node.name.getText()}=${JSON.stringify(text)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
check("no aria-* text attribute is a hardcoded string", literalAria, []);

// The check must be able to FAIL, and must fail on the shapes that
// actually shipped — including the one that is not English. A hardcoded
// Greek aria-label is the same defect seen from the other side: a Japanese
// user reads Greek, and no English-prose filter would ever notice.
{
  const SHIPPED = `
    export function Regression({ t, onClose }) {
      return (
        <div role="dialog" aria-label="Command palette">
          <button aria-label="Send" />
          <button aria-label={"Close"} />
          <nav aria-label="Κατηγορίες" />
          <button aria-label={\`Unlink \${name}\`} />
          <button aria-label={t("cancel")} onClick={onClose} />
          <input aria-label={\`\${name} (hex)\`} />
          <svg aria-label="Ionexa AI" />
        </div>
      );
    }`;
  const sf = ts.createSourceFile("aria.tsx", SHIPPED, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const caught = [];
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && ARIA_TEXT_ATTRS.has(node.name.getText())) {
      const text = ariaLiteralText(node.initializer);
      if (text !== null && !BRAND_ARIA_LITERALS.has(text.trim().toLowerCase())) caught.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // Five: the plain literal, the braced literal, the Greek one, the dialog
  // label and the template with English around the interpolation. NOT the
  // t() call, NOT the brand name, and NOT `${name} (hex)`, whose only
  // static text is a format hint.
  check("the aria walk catches every literal shape, including a non-English one", caught, [
    "Command palette",
    "Send",
    "Close",
    "Κατηγορίες",
    "Unlink",
  ]);
}
console.log("\n== 1e. the sentence that says nothing is gone from the client ==");
// "Something went wrong. Please try again." was the DEFAULT second
// argument of getErrorMessage, so it was reachable from eighteen call
// sites that simply omitted it — and omitting an optional argument is not
// a decision, it is what happens when the parameter is optional. It is
// English in a Greek UI, and it answers neither "what do I do now" nor
// the question people actually have after a failed AI action, which is
// whether it cost them anything.
//
// The fallback is now REQUIRED (lib/get-error-message.ts) so the omission
// cannot recur silently, and the AI surfaces build their message from the
// response status instead (lib/errors/use-error-text.ts). This asserts the
// string itself does not come back into anything the browser renders.
//
// SERVER ROUTES ARE NOT IN SCOPE HERE. They still return English prose —
// that is the 518-string convention counted above, and the client no
// longer shows it at the converted call sites.
const clientFiles = sources.filter((f) => !f.startsWith("src/app/api/") && !f.startsWith("src/lib/"));
const banned = [];
for (const file of clientFiles) {
  const src = stripComments(readFileSync(file, "utf8"));
  for (const m of src.matchAll(/"([^"]*Something went wrong[^"]*)"/g)) {
    banned.push(`${file}: "${m[1]}"`);
  }
}
check(`no client component renders "Something went wrong" (${clientFiles.length} files)`, banned, []);

// And the door it came through is shut: a required parameter cannot be
// forgotten the way an optional one with a default can.
const getErr = readFileSync("src/lib/get-error-message.ts", "utf8");
checkTrue(
  "getErrorMessage's fallback is required, not defaulted",
  /export function getErrorMessage\(error: unknown, fallback: string\)/.test(getErr)
);

console.log("\n== 2. every t() call resolves to a real key ==");
// next-intl renders the raw key path and logs to the console when a key is
// missing. Nothing fails a build. This is the only thing standing between
// a typo'd key and a user seeing "dashboard.chat.streamInterrupted" in the
// UI.
let callSites = 0;
const unresolved = [];
const usedKeys = new Set();

for (const file of sources) {
  // Comments stripped, for the same reason section 1 strips them and with
  // the same failure to point at: a file that documents the shape it was
  // fixed for — `<span>{t("oldKey")}</span>` quoted inside a JSX comment —
  // was reported as calling a key that does not exist. Section 1 got this
  // right from the start; this section read the raw file.
  const src = stripComments(readFileSync(file, "utf8"));
  // ident -> namespace, for both the client hook and the server helper.
  const hooks = {};
  for (const m of src.matchAll(/const (\w+) = (?:await )?(?:useTranslations|getTranslations)\(\s*"([^"]+)"\s*\)/g)) {
    hooks[m[1]] = m[2];
  }
  for (const [ident, ns] of Object.entries(hooks)) {
    // Only a direct call: `t("key")`. A computed key (`t(someVar)`) cannot
    // be resolved statically and is deliberately not flagged.
    const re = new RegExp(`\\b${ident}\\(\\s*"([^"]+)"`, "g");
    for (const m of src.matchAll(re)) {
      callSites++;
      const full = `${ns}.${m[1]}`;
      usedKeys.add(full);
      if (typeof lookup(messages.en, full) !== "string") {
        unresolved.push(`${file}: ${ident}("${m[1]}") -> ${full}`);
      }
    }
  }
}
checkTrue(`t() call sites found (${callSites})`, callSites > 400);
check("every t() key exists in en.json", unresolved, []);

console.log("\n== 3. every key the code uses exists in all 10 locales ==");
// check-i18n.js covers en -> the other nine for keys that EXIST in en.json.
// This narrows to the keys the code actually calls, so a key added to
// en.json and to the code but forgotten elsewhere is caught as the runtime
// break it is, in the locale it breaks in.
const perLocaleMissing = {};
for (const loc of LOCALES) {
  const missing = [...usedKeys].filter((k) => typeof lookup(messages[loc], k) !== "string");
  if (missing.length) perLocaleMissing[loc] = missing.slice(0, 10);
}
check(`all ${usedKeys.size} code-referenced keys present in every locale`, perLocaleMissing, {});

console.log("\n== 4. the strings extracted in this pass are really there ==");
// Spot-check the specific keys that replaced the 46 literals, in every
// locale — including that the translation is not just the English copied
// across, which is how this class of bug hides.
const EXTRACTED = [
  "common.networkError",
  "common.notAuthenticated",
  "common.created",
  "common.updated",
  "common.linked",
  "dashboard.team.memberRemoved",
  "dashboard.team.couldNotRemoveMember",
  "settings.chatMemory.memoryCleared",
  "settings.changePassword.passwordUpdated",
  "settings.changePassword.passwordsDoNotMatch",
  "settings.aiPersona.personaUpdated",
  "settings.exportData.exportDownloaded",
  "settings.loginActivity.deviceRemoved",
  "settings.dangerZone.emailDoesNotMatch",
  "dashboard.mission.updatedElsewhere",
  "auth.signup.mustAgreeToTerms",
  "auth.resetPassword.passwordsDoNotMatch",
];
for (const key of EXTRACTED) {
  const values = LOCALES.map((l) => lookup(messages[l], key));
  checkTrue(`${key}: present in all 10 locales`, values.every((v) => typeof v === "string" && v.length > 0));
  // Greek, Japanese and Arabic share no alphabet with English, so an
  // identical value in ANY of them means the string was never translated.
  // (Latin-script locales legitimately coincide sometimes — that is what
  // check-i18n.js's allowlist is for; these three never do.)
  const en = lookup(messages.en, key);
  const untranslated = ["el", "ja", "ar"].filter((l) => lookup(messages[l], key) === en);
  check(`${key}: actually translated into el/ja/ar`, untranslated, []);
}

console.log("\n== 6. every key a DATA file names resolves, in all ten locales ==");
// THE HALF THE TYPE CANNOT CHECK.
//
// lib/modules.ts and lib/build-modules.ts describe twenty modules — the
// name, ~90 field labels, 26 select options, 5 placeholders — and every
// one of those is now a KEY rather than text. `ModuleMessageKey` makes
// `labelKey: "Company"` a compile error, which stops English getting IN.
// It cannot check that "moduleData.fields.compayn" exists: any string with
// the right prefix satisfies the type, and next-intl renders a missing key
// as its own dotted path without failing anything. Section 2 above only
// walks t("literal") call sites, and these keys never appear as literals
// at a call site — they are read off a config object.
//
// So the pair is: the TYPE stops text getting in, and this stops a typo
// getting out.
//
// Read from the SOURCE, not from an import of the module: the point is to
// catch a key that was typed into the data file, and importing the file
// would resolve `optionLabelKey("in progress")` into whatever the helper
// produces rather than telling us what a human wrote.
{
  const DATA_FILES = ["src/lib/modules.ts", "src/lib/build-modules.ts", "src/lib/classifier-modules.ts"];
  const seen = new Map(); // key -> where
  for (const file of DATA_FILES) {
    const src = stripComments(readFileSync(file, "utf8"));
    // newKey is a leaf like labelKey — the whole "New competitor"
    // sentence, per module, because "New " + the plural page title was
    // ungrammatical in every language that inflects.
    for (const m of src.matchAll(/(?:labelKey|titleKey|placeholderKey|newKey):\s*"([^"]+)"/g)) {
      if (!seen.has(m[1])) seen.set(m[1], file);
    }
    // emptyKey names a GROUP, not a leaf: the empty screen is three
    // strings (title, why, example) and the component reads all three off
    // the one key through emptyStateKey(). Expanded here for the same
    // reason optionLabelKey() is expanded below — the parts are built in
    // code, so a check that only looked at what a human typed would prove
    // the existence of a key nothing ever renders and miss the three that
    // are.
    for (const m of src.matchAll(/emptyKey:\s*"([^"]+)"/g)) {
      for (const part of ["title", "why", "example"]) {
        const key = `${m[1]}.${part}`;
        if (!seen.has(key)) seen.set(key, `${file} (emptyKey "${m[1]}")`);
      }
    }
    // Stored option values become display keys through optionLabelKey().
    for (const m of src.matchAll(/options:\s*\[([^\]]+)\]/g)) {
      for (const v of m[1].matchAll(/"([^"]+)"/g)) {
        const camel = v[1]
          .toLowerCase()
          .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
          .replace(/[^A-Za-z0-9]/g, "");
        const key = `moduleData.options.${camel}`;
        if (!seen.has(key)) seen.set(key, `${file} (option "${v[1]}")`);
      }
    }
    // And every module needs a delete confirmation, built the same way.
    for (const m of src.matchAll(/slug:\s*"([^"]+)"/g)) {
      const key = `moduleData.deleteConfirm.${m[1]}`;
      // Ideas has its own, from batch A2.
      if (m[1] === "ideas") continue;
      if (!seen.has(key)) seen.set(key, `${file} (slug "${m[1]}")`);
    }
  }
  checkTrue(`keys found in the data files (${seen.size})`, seen.size > 130);

  for (const loc of LOCALES) {
    const missing = [...seen].filter(([k]) => typeof lookup(messages[loc], k) !== "string");
    check(
      `${loc}: every data-file key resolves`,
      missing.map(([k, where]) => `${k} (${where})`),
      []
    );
  }

  // The other direction: a key nobody names is dead weight in ten files.
  const declared = new Set();
  const walkKeys = (node, prefix) => {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string") declared.add(`${prefix}${k}`);
      else walkKeys(v, `${prefix}${k}.`);
    }
  };
  walkKeys(messages.en.moduleData, "moduleData.");
  const unused = [...declared].filter((k) => !seen.has(k));
  check("no moduleData key is declared and never named", unused, []);

  // And the type really does refuse text. Asserted on the SOURCE of the
  // type rather than trusted from memory: a later edit that widens
  // ModuleMessageKey to `string` would silently reopen the whole hole.
  const modulesSrc = readFileSync("src/lib/modules.ts", "utf8");
  checkTrue(
    "ModuleMessageKey is a prefixed template type, not a bare string",
    /export type ModuleMessageKey = `moduleData\.\$\{string\}`/.test(modulesSrc)
  );
  checkTrue(
    "ModuleTitleKey is a prefixed template type, not a bare string",
    /export type ModuleTitleKey = `sidebar\.items\.\$\{string\}`/.test(modulesSrc)
  );
  checkTrue(
    "FieldConfig carries labelKey, and no `label`",
    /labelKey: ModuleMessageKey;/.test(modulesSrc) && !/^\s+label: string;$/m.test(modulesSrc)
  );
  checkTrue(
    "ModuleConfig carries titleKey, and no `title`",
    /titleKey: ModuleTitleKey;/.test(modulesSrc) && !/^\s+title: string;$/m.test(modulesSrc)
  );
  // emptyKey was `emptyKey?: string` — optional, and therefore the empty
  // screen twenty modules got was the generic one. Both halves matter:
  // REQUIRED is what makes the twenty-first module answer the question
  // too, and the KEY TYPE is what stops the answer being English prose
  // typed into the registry, exactly as with labelKey above.
  // Stripped, because the field's own doc comment quotes the shape it
  // used to have — and a check that reads comments would be failed by the
  // sentence explaining why it passes.
  const modulesCode = stripComments(modulesSrc);
  checkTrue(
    "ModuleConfig carries a REQUIRED emptyKey, typed as a key",
    /emptyKey: ModuleMessageKey;/.test(modulesCode) && !/emptyKey\?/.test(modulesCode)
  );
}

console.log("\n== 5. check-i18n.js no longer claims to do this ==");
// The stale claim is what made the gap invisible: anyone reading that
// header would reasonably conclude JSX literals were already covered.
const guard = readFileSync("scripts/check-i18n.js", "utf8");
checkTrue(
  "check-i18n.js points at this file for the source-side check",
  guard.includes("i18n-coverage.test.mjs")
);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
