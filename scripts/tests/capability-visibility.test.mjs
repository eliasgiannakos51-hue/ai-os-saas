// A FEATURE THAT DOES NOT WORK AND DOES NOT SAY SO.
//
// V4.6. lib/env-check.ts has always known which capabilities are off: it
// carries a level and a what-goes-silent sentence for every variable the
// code reads, including the good ones — "nothing is sent and nothing
// errors: welcome emails, agent results, form-submission notifications,
// the weekly digest, and the cost and error alerts addressed to the
// operator all stop silently".
//
// It printed all of it to the SERVER LOG, once, at boot, through
// instrumentation.ts, and nowhere else. lib/ai/providers/registry.ts is
// the same: providerStatuses() computes `disabledReason: "GOOGLE_API_KEY
// is not set"` and hands it to the failover chain, which uses it to pick
// the next provider and never says a word.
//
// So a running deployment could not tell an operator the difference
// between a feature that was never built and one whose key is missing.
// Both look like nothing happening.
//
// This gate holds three things: the screen exists and is admin-only; it
// is built from ENV_REQUIREMENTS rather than a second hand-kept list; and
// no VALUE ever crosses to the browser.
//
// Run: node scripts/tests/capability-visibility.test.mjs
import { readFileSync } from "node:fs";
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
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const PAGE = "src/app/dashboard/system-health/page.tsx";
const COMPONENT = "src/components/system-health/capability-status.tsx";
const page = stripComments(readFileSync(PAGE, "utf8"));
const component = stripComments(readFileSync(COMPONENT, "utf8"));

// ---------------------------------------------------------------------
console.log("== 1. the screen exists, and only an owner sees it ==");
check("the capability section is rendered", /<CapabilityStatus\s/.test(page), "");
check(
  "the page is admin-only",
  /isAdminEmail\(user\.email\)/.test(page) && /notFound\(\)/.test(page),
  "a page listing which keys are absent is a map of the deployment's gaps"
);

// ---------------------------------------------------------------------
console.log("\n== 2. it is built from the list the boot check reads ==");
// NOT A SECOND LIST. env-documented.test.mjs already records what happens
// to hand-kept lists here: "it was being kept by hand, and by hand it had
// drifted by fifty-nine variables". A capability screen with its own
// array would drift the same way and would look authoritative while
// doing it.
// THE IMPORT, NOT THE EXACT LINE. The first version of this pinned the
// whole statement — `import { ENV_REQUIREMENTS } from "@/lib/env-check"`
// — and went red the day a SECOND thing was imported from the same
// module beside it. The claim is that the page gets its list from
// env-check, and adding `environmentWarnings` to the same braces does not
// weaken it.
check(
  "the page imports ENV_REQUIREMENTS from env-check",
  /import \{[^}]*\bENV_REQUIREMENTS\b[^}]*\} from "@\/lib\/env-check"/.test(page),
  page.match(/import \{[^}]*\} from "@\/lib\/env-check";/)?.[0]
);
check(
  "...and maps over it rather than declaring its own list",
  /ENV_REQUIREMENTS\.map\(/.test(page),
  ""
);
const { ENV_REQUIREMENTS } = await loadTs("src/lib/env-check.ts");
check(
  `there are requirements to render (${ENV_REQUIREMENTS.length})`,
  ENV_REQUIREMENTS.length >= 40,
  `${ENV_REQUIREMENTS.length} — a screen over a short list would say little`
);
// EVERY ONE CARRIES THE SENTENCE THE SCREEN SHOWS. A requirement with an
// empty `what` renders a name and nothing else, which is the silence
// this file exists to end, moved one step later.
const wordless = ENV_REQUIREMENTS.filter((r) => !r.what || r.what.trim().length < 10);
check(
  `every requirement says what it enables (${ENV_REQUIREMENTS.length - wordless.length}/${ENV_REQUIREMENTS.length})`,
  wordless.length === 0,
  wordless.map((r) => r.name).join(", ")
);
// AND EVERY ONE HAS A LEVEL THE SCREEN CAN GROUP BY. A level outside the
// three renders in no group at all — present in the data, absent from
// the page, which is the worst of both.
const LEVELS = ["required", "recommended", "optional"];
const ungrouped = ENV_REQUIREMENTS.filter((r) => !LEVELS.includes(r.level));
check(
  "every requirement has a level the screen groups by",
  ungrouped.length === 0,
  ungrouped.map((r) => `${r.name}: ${r.level}`).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 3. NO VALUE crosses to the browser ==");
// THE ONE RULE THIS PAGE MUST NOT BREAK. A screen that exists to say
// "your key is missing" must never be the screen that shows a key that
// is present.
check(
  "the server reduces each variable to a boolean",
  /set: \(process\.env\[req\.name\] \?\? ""\)\.trim\(\) !== ""/.test(page),
  "the page is passing something other than a boolean for whether a variable is set"
);
check(
  "the component's row type has no value field",
  !/\bvalue\b\s*:/.test(component.slice(component.indexOf("export type CapabilityRow"), component.indexOf("export function CapabilityStatus"))),
  "CapabilityRow carries a value, so a render could put a secret on screen"
);
check(
  "the component never reads process.env itself",
  !/process\.env/.test(component),
  "a client component reading process.env would inline whatever the bundler could see"
);
check(
  "...and renders only the name, the level and the sentence",
  /\{row\.name\}/.test(component) && /\{row\.what\}/.test(component) && !/\{row\.value/.test(component),
  ""
);
// AND THE PAGE ITSELF DOES NOT HAND THE VALUE ANYWHERE. `process.env[...]`
// appearing in a comparison is fine; appearing in something passed to a
// component is not.
const passesValue = /set: process\.env\[|value: process\.env\[|what: process\.env\[/.test(page);
check("the page passes no raw environment value to a component", !passesValue, "");

// ---------------------------------------------------------------------
console.log("\n== 4. the two silences this closes, named ==");
// env-check reported to the log and nothing else; the provider registry
// computed a reason and told only the failover chain. Both are asserted
// by name so that a refactor which removes the screen has to face them.
const envCheck = stripComments(readFileSync("src/lib/env-check.ts", "utf8"));
check(
  "env-check still computes a level and a sentence per variable",
  /level: "required"/.test(envCheck) && /what:/.test(envCheck),
  ""
);
const registry = stripComments(readFileSync("src/lib/ai/providers/registry.ts", "utf8"));
check(
  "the provider registry still computes a disabledReason naming the variable",
  /disabledReason: `\$\{PROVIDER_KEY_ENV_VARS\[provider\]\} is not set`/.test(registry),
  "the reason a provider is skipped no longer names the variable that would enable it"
);
// THE PROVIDER KEYS ARE IN ENV_REQUIREMENTS, so the screen covers them
// too. Without this the four AI providers would be the one group of
// capabilities the capability screen could not see.
const names = new Set(ENV_REQUIREMENTS.map((r) => r.name));
const { PROVIDER_KEY_ENV_VARS } = await loadTs("src/lib/ai/providers/registry.ts");
const missingFromScreen = Object.values(PROVIDER_KEY_ENV_VARS).filter((v) => !names.has(v));
check(
  `every AI provider's key is on the screen (${Object.keys(PROVIDER_KEY_ENV_VARS).length} providers)`,
  missingFromScreen.length === 0,
  `${missingFromScreen.join(", ")} — a provider whose key is not in ENV_REQUIREMENTS is invisible to the capability screen`
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
