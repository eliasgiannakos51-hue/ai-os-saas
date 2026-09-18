#!/usr/bin/env node
/*
 * CAN publishing.test.mjs SEE THE TWO DEFECTS OF 2026-09-18 COME BACK?
 *
 * Both were found by reading api/websites/[id]/publish/route.ts whole
 * rather than by any gate, and both survived every existing check because
 * each check reads one clause:
 *
 *   1. THE CEILING ASKED ONCE. `if (!isAdmin && !existing)` ran the plan
 *      check on first publish only, and nothing in this tree unpublishes
 *      anything when a subscription ends — so a paid account that moved
 *      to Free kept its sites live and kept pushing new content to them.
 *      plan-enforcement.test.mjs stayed green throughout: the capability
 *      IS read and DOES refuse, on the path it looks at.
 *   2. THE SAME CLASH, TWO ANSWERS. Renaming a site to an address someone
 *      else owns returned 500 from the update path and 409 from the
 *      insert path.
 *
 * And 3-4, the ways a fix for (1) goes wrong in the other direction.
 *
 * Run: node scripts/tests/publishing.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/publishing.test.mjs";
const PUBLISH = "src/app/api/websites/[id]/publish/route.ts";

const MUTANTS = [
  {
    name: "the plan ceiling goes back to being asked only on first publish",
    file: PUBLISH,
    from: "    if (!isAdmin) {\n      if (cap <= 0) {",
    to: "    if (!isAdmin && !existing) {\n      if (cap <= 0) {",
    expect: "asked on every publish",
  },
  {
    // The refusal that names the reason. A 403 with no upgradeRequired
    // leaves the dialog unable to offer the one thing that fixes it.
    name: "the free-plan refusal stops saying an upgrade is what is needed",
    file: PUBLISH,
    from: "{ ok: false, upgradeRequired: true, error: \"Publishing is available on paid plans.\" }",
    to: "{ ok: false, error: \"Publishing is available on paid plans.\" }",
    expect: "upgradeRequired",
  },
  {
    // THE FIX GOING WRONG THE OTHER WAY. Count the site being republished
    // against the ceiling and an account sitting exactly at its cap can
    // never edit anything it already has — a worse bug than the one the
    // ceiling closes, and one a person would introduce while "tidying".
    name: "the live count stops excluding the site being republished",
    file: PUBLISH,
    from: '        if (existing) countQuery = countQuery.neq("id", existing.id);',
    to: "",
    expect: "excludes the site being republished",
  },
  {
    name: "the update path stops reading the unique index, so a clash is a 500 again",
    file: PUBLISH,
    from: '        if (/duplicate key|unique/i.test(updateError.message)) {',
    to: "        if (false) {",
    expect: "409, not a 500",
  },
  {
    // AND THE OTHER PATH, so the pair cannot be half-checked.
    name: "the insert path stops reading it instead",
    file: PUBLISH,
    from: "        if (insertError && /duplicate key|unique/i.test(insertError.message)) {",
    to: "        if (false) {",
    expect: "each write path reads the unique index for itself",
  },
  {
    // THE GATE'S OWN STRIPPER. This route's comments quote every shape
    // section 7 looks for — including the sentence naming `!existing` as
    // the gap — so a scan of the raw text finds the fix inside the note
    // explaining the fix.
    name: "the comment stripper stops running, so the note about the fix reads as the fix",
    file: GATE,
    from: 'const stripSrc = (text) => text.replace(/\\/\\*[\\s\\S]*?\\*\\//g, "").replace(/^\\s*\\/\\/.*$/gm, "");',
    to: "const stripSrc = (text) => text;",
    expect: "still conditions the ceiling on the site already existing",
  },
];

runMutations({ name: "publishing", gate: GATE, targets: [GATE, PUBLISH], mutants: MUTANTS });
