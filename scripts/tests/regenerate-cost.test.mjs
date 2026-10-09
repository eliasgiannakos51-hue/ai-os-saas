#!/usr/bin/env node
/*
 * A FLAGGED SITE'S REGENERATE SAYS ITS PRICE, AND DOES NOT START WITHOUT
 * THE CREDITS.
 *
 * Until 2026-10-05 the button read «Αναδημιουργία (δωρεάν)» and the worker
 * charged the run like any other (docs/BUGS.md ΛΘ-7). The owner chose
 * "really free, once" (NEEDS 24); a free run is a new free quota against
 * a combined ceiling with no room left in it (combined-ceiling.test.mjs,
 * section 1), so where its budget comes from is NEEDS 33. Until then the
 * product says the true thing: a price, before the press.
 *
 * And the other half of NEEDS 24, "Αν δεν φτάνουν τα credits, η ενέργεια
 * δεν ξεκινά και ο χρήστης το βλέπει πριν": the route asks the balance
 * BEFORE it moves the row out of 'flagged'. The worker's hold refused it
 * anyway, but only after the row had left 'flagged' — a failed site the
 * button could no longer reach.
 *
 * AND THE ROWS FLAGGED BEFORE THAT (2026-10-08, section 3). The stored
 * flag sentence was shown on the screen word for word, so a site flagged
 * before the fix still promised the free run beside the priced button —
 * in English, on a Greek screen. The screen now says it in the reader's
 * language and shows only the findings from the stored sentence
 * (src/lib/websites/flagged-notice.ts), whatever the row was written with.
 * Chat's site pane and Create Studio's progress list likewise (2026-10-09).
 *
 * Every source check runs on the file WITH ITS COMMENTS STRIPPED.
 *
 * Run: node scripts/tests/regenerate-cost.test.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

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

const ROUTE = "src/app/api/websites/[id]/regenerate/route.ts";
const WORKER = "src/app/api/websites/generate/process/route.ts";
const WORKSPACE = "src/components/website-builder/website-builder-workspace.tsx";
const route = stripComments(readFileSync(ROUTE, "utf8"));
const worker = stripComments(readFileSync(WORKER, "utf8"));
const workspace = stripComments(readFileSync(WORKSPACE, "utf8"));

console.log("== 1. no balance, no start ==");
const precheckAt = route.indexOf("hasEnoughCredits(");
const claimAt = route.indexOf(".update(");
check("the route asks the balance", precheckAt > 0);
check(
  "...BEFORE it claims the row, so a refusal leaves the site flagged",
  precheckAt > 0 && claimAt > precheckAt,
  `hasEnoughCredits at ${precheckAt}, claim at ${claimAt}`,
);
check(
  "...for every account the worker would charge: only admin and beta skip it",
  /if \(!isAdminEmail\(user\.email\) && !\(await hasActiveBetaBypass\(user\)\)\) \{/.test(route),
);
check(
  "...against the estimate of the same action the worker holds for",
  /estimateForAction\(\s*"websiteGenerate"/.test(route) && /hasEnoughCredits\(user\.id, estimate\.reserveCredits, plan\)/.test(route),
);
check(
  "...and refuses with a code the screen translates, not an English sentence",
  /code:\s*"insufficient_credits"/.test(route) && /status:\s*402/.test(route),
);

console.log("\n== 2. nothing is called free that is charged ==");
check("the claim still wins once, on a row that is still flagged", route.includes('.eq("status", "flagged")'));
const settles = worker.match(/bypassCharge:\s*(\w+)/g) ?? [];
check(
  "the worker charges a regenerate like any generation: only admin and beta skip the charge",
  settles.length >= 2 && settles.every((s) => s.endsWith("bypassCredits")),
  settles.join(", "),
);
check(
  "the button is priced, from the same estimator",
  /t\("regeneratePaid",\s*\{\s*count:\s*estimateForAction\(\s*"websiteGenerate"/.test(workspace),
);
check("...and no longer says free", !workspace.includes("regenerateFree"));
check("the stored flag message does not promise a free run", !/regenerate it once at no extra charge/i.test(worker));

const langs = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the locales scan found ${langs.length}`, langs.length >= 10);
const promisesFree = [];
const missing = [];
for (const f of langs) {
  const j = JSON.parse(readFileSync(`messages/${f}`, "utf8"));
  if (j?.dashboard?.websiteBuilder?.regenerateFree !== undefined) promisesFree.push(`${f}: websiteBuilder.regenerateFree`);
  if (f === "en.json" && /for free/i.test(j?.dashboard?.publishing?.disabledFlagged ?? "")) promisesFree.push(`${f}: publishing.disabledFlagged`);
  if (f === "el.json" && /δωρεάν/.test(j?.dashboard?.publishing?.disabledFlagged ?? "")) promisesFree.push(`${f}: publishing.disabledFlagged`);
  for (const key of ["regeneratePaid", "regenerateNoCredits"]) {
    if (!j?.dashboard?.websiteBuilder?.[key]) missing.push(`${f}: websiteBuilder.${key}`);
  }
}
check("no locale offers a free regenerate", promisesFree.length === 0, promisesFree.join(", "));
check("the price and the refusal are in every locale", missing.length === 0, missing.join(", "));
check(
  "a refused run is said in the user's language",
  /code === "insufficient_credits"[\s\S]{0,120}t\("regenerateNoCredits"/.test(workspace),
);

console.log("\n== 3. a site flagged before the fix promises nothing either ==");
{
  const NOTICE = "src/lib/websites/flagged-notice.ts";
  const SHELL = "src/components/website-builder/website-shell.tsx";
  check("the reader of a stored flag sentence exists", existsSync(NOTICE));
  const { flaggedFindings = () => undefined, flaggedMessage = () => "" } = existsSync(NOTICE) ? await loadTs(NOTICE) : {};
  const OLD_ROW =
    "This website was flagged by our safety review and can't be published as-is: an external script tag; a form posting off-site. You can regenerate it once at no extra charge.";
  const findings = flaggedFindings(OLD_ROW);
  check("a row written before 2026-10-05 gives its findings", findings === "an external script tag; a form posting off-site", String(findings));
  check("...and never its promise", findings !== null && !/charge|regenerate/i.test(findings));
  check("the sentence the worker writes today reads back the same way", flaggedFindings(flaggedMessage("x; y")) === "x; y");
  check("a stored message in a shape nobody wrote shows nothing", flaggedFindings("Anything else at all. Free!") === null && flaggedFindings(null) === null);
  check("the worker writes the flag sentence from that one definition", /error_message: isFlagged \? flaggedMessage\(flaggedSummary\) : null/.test(worker));

  // The flagged branch of the workspace, from its condition to the button.
  const at = workspace.indexOf('previewWebsite.status === "flagged" ? (');
  const branch = at >= 0 ? workspace.slice(at, workspace.indexOf("regeneratePaid", at)) : "";
  check("the workspace's flagged panel was found", branch.length > 0);
  check("...it says what happened in the reader's language", /t\("flaggedBody"\)/.test(branch));
  check("...and never puts the stored sentence on the screen", branch.length > 0 && !/previewWebsite\.error_message\}/.test(branch) && /flaggedFindings\(previewWebsite\.error_message\)/.test(branch));
  check("the flagged toast is the reader's language too", /record\.status === "flagged"\) \{\s*addToast\(`⚠ \$\{t\("flaggedTitle"\)\}`/.test(workspace));
  const shell = stripComments(readFileSync(SHELL, "utf8"));
  check(
    "the tool shell says a flagged site in the reader's language, everywhere it lists one",
    /record\.status === "flagged"\) \{\s*say\(\{ role: "tool", text: `\$\{t\("flaggedTitle"\)\}\. \$\{t\("flaggedBody"\)\}` \}\)/.test(shell) &&
      /current\.status === "flagged" \? t\("flaggedBody"\)/.test(shell) &&
      /w\.status === "flagged" \? t\("flaggedTitle"\)/.test(shell)
  );
  // Chat's site pane (src/components/chat/site-pane.tsx) reported a held
  // site with the stored sentence too: English on a Greek screen, naming a
  // button the pane does not have (found 2026-10-09).
  const pane = stripComments(readFileSync("src/components/chat/site-pane.tsx", "utf8"));
  const doneAt = pane.indexOf("onDone: (done, usage) => {");
  const onDone = doneAt >= 0 ? pane.slice(doneAt, pane.indexOf("});", doneAt)) : "";
  check(
    "Chat's site pane says a held site in the reader's language, before any stored message",
    /done\.status === "flagged"\) \{\s*failWith\(`\$\{tSite\("flaggedTitle"\)\}\. \$\{tSite\("flaggedBody"\)\}`\)/.test(onDone) &&
      // No stored message at all in the pane since package 7's check
      // (scripts/tests/chat-opens-tools.test.mjs); before one, if it returns.
      (onDone.indexOf("done.error_message") === -1 || onDone.indexOf('done.status === "flagged"') < onDone.indexOf("done.error_message")),
    onDone.slice(0, 600)
  );
  // Create Studio's progress list (src/lib/create-studio/use-create-studio.ts)
  // put the stored sentence under a failed step the same way (found
  // 2026-10-09, in the check of this branch).
  const studio = stripComments(readFileSync("src/lib/create-studio/use-create-studio.ts", "utf8"));
  const pollAt = studio.indexOf("const pollWebsite = useCallback(");
  const poll = pollAt >= 0 ? studio.slice(pollAt, studio.indexOf("[finishStep", pollAt)) : "";
  check(
    "Create Studio says a held site in the reader's language, before any stored message",
    /record\.status === "flagged"\s*\?\s*`\$\{tSite\("flaggedTitle"\)\}\. \$\{tSite\("flaggedBody"\)\}`/.test(poll) &&
      poll.indexOf('record.status === "flagged"') < poll.indexOf("record.error_message"),
    poll.slice(0, 600)
  );
  // Every locale, every key of the builder that speaks about the flag or
  // the regenerate: none offers it for nothing.
  const FREE = /\bfree\b|δωρεάν|gratis|gratuit|kostenlos|gratuito|grátis|免费|無料|مجان/i;
  const offers = [];
  const absent = [];
  for (const f of langs) {
    const wb = JSON.parse(readFileSync(`messages/${f}`, "utf8"))?.dashboard?.websiteBuilder ?? {};
    for (const [k, v] of Object.entries(wb)) if (/flagged|regenerat/i.test(k) && typeof v === "string" && FREE.test(v)) offers.push(`${f}: ${k}`);
    for (const k of ["flaggedBody", "flaggedDetails"]) if (typeof wb[k] !== "string" || wb[k].trim() === "") absent.push(`${f}: ${k}`);
  }
  check("no locale's flag or regenerate wording offers it for nothing", offers.length === 0, offers.join(", "));
  check("the flag wording is in every locale", absent.length === 0, absent.join(", "));
}

console.log(`\n  ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
