#!/usr/bin/env node
/*
 * CAN one-primary-action.test.mjs SEE A SECOND ORANGE BUTTON?
 *
 * The brief asked for exactly this mutation by name — "add a second, it
 * must go red" — so it is the first one here. The rest break the other
 * clauses, in different dimensions, because a suite that only proves the
 * headline check works reports coverage it does not have:
 *
 *   1. a second filled button on a page already at the target
 *   2. an OVERLAY grows a second — a modal is a screen too
 *   3. the layout chrome grows
 *   4. the instrument: the scan stops seeing layouts, which is the exact
 *      omission that made the Home page look like it had one button
 *   5. the instrument: comments counted as code
 *   6. the instrument: the tag ends at the first `>`, which is the bug
 *      that hid forty-six filled controls from this census
 *   7. the instrument: a `>` inside a string attribute ends the tag
 *   8. the instrument: overlays stop being detected — everything is the
 *      page again
 *   9. the instrument: an overlay never closes, so the page after it is
 *      swallowed. Both directions, because a surface splitter that is
 *      wrong one way passes the check for the other.
 *  10. the declared replacement surface gains a second control
 *  11. ...and is drawn in a page BODY rather than returned early, which
 *      is the whole obligation the declaration carries
 *  12. a baseline outlives the button it was written for
 *  13. a glow is added
 *  14. a second piece of gradient text appears
 *
 * Run: node scripts/tests/one-primary-action.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/one-primary-action.test.mjs";
const JSX = "scripts/lib/jsx-scan.mjs";
const TEAM = "src/components/team/invite-form.tsx";
const ASKAI = "src/components/records/ask-ai-modal.tsx";
const TOPNAV = "src/components/dashboard/top-nav.tsx";
const HEALTH = "src/components/overview/health-score-card.tsx";
const UPGRADE = "src/components/billing/upgrade-required.tsx";
const BUILDMODULE = "src/components/modules/build-module-page.tsx";

// The mutants edit whichever file each names; TARGETS is what gets
// snapshotted and restored, so a suite killed mid-run cannot leave one
// behind. (It still can if the process is hard-killed — the runner's
// finally does not survive SIGKILL — which is why the workflow added in
// .github/workflows/verify.yml checks `git status` after the suites.)
const TARGETS = [GATE, JSX, TEAM, ASKAI, TOPNAV, HEALTH, UPGRADE, BUILDMODULE];

const MUTANTS = [
  {
    // THE ONE THE BRIEF ASKED FOR, on a page that keeps the rule today.
    name: "a second filled orange button appears on a page that had one",
    file: TEAM,
    from: "<div",
    to: '<button className="bg-orange-500">x</button>\n    <div',
    expect: "dashboard/team/page.tsx",
  },
  {
    // A MODAL IS A SCREEN TOO. Until redesign phase 4 an overlay's
    // controls were charged to the page, so the page was already over
    // and a second button inside the modal never showed up as its own
    // number. It has its own budget now and this is what defends it.
    name: "an overlay grows a second filled control",
    file: ASKAI,
    from: '<div className="border-t border-border p-4">',
    to: '<div className="border-t border-border p-4">\n          <button className="bg-orange-500">x</button>',
    expect: "no overlay draws more than one filled accent control",
  },
  {
    // The chrome every dashboard page pays for, pinned rather than
    // floored precisely so this is a decision.
    name: "the layout chrome grows a third filled control",
    file: TOPNAV,
    from: "<header",
    to: '<a className="bg-orange-500">x</a>\n    <header',
    expect: "the layout chrome contributes",
  },
  {
    // THE INSTRUMENT. Without the layout chain the Home page measured one
    // filled control while the screen had five — a gate that reads too
    // low is worse than no gate, because it certifies the thing it missed.
    name: "the scan stops walking the layout chain",
    file: GATE,
    from: "    const l = `${parts.slice(0, i).join(\"/\")}/layout.tsx`;",
    to: "    const l = `${parts.slice(0, i).join(\"/\")}/layoutXX.tsx`;",
    expect: "the layout walk finds both layouts",
  },
  {
    // THE INSTRUMENT, second dimension: prose about a class counted as a
    // use of it. Four other gates in this directory had this fault.
    name: "the scan counts comments as code",
    file: GATE,
    // Repointed when the reader gained an import-stripping step and
    // stripComments(src) became stripCode(src). An anchor that quotes a
    // line the file no longer has does not apply, and a mutation that
    // does not apply proves nothing — the same fault this branch found in
    // voice.mutation.mjs.
    from: "  const stripped = stripCode(src);",
    to: "  const stripped = src;",
    expect: "a button inside a // comment is not a button",
  },
  {
    // THE INSTRUMENT, THE BUG THAT ACTUALLY HAPPENED. Dropping the brace
    // depth is `[^>]*?>` again: the tag ends at the `>` of `() =>` and
    // every control whose handler precedes its class becomes invisible.
    // Forty-six did.
    name: "a tag ends at the first `>`, so an arrow function hides the class",
    file: JSX,
    from: "      else if (c === \">\" && depth === 0) {",
    to: "      else if (c === \">\") {",
    expect: "a handler written before the class does not hide the class",
  },
  {
    // ...and the other half of the same reader: a `>` inside a quoted
    // attribute is text, not the end of the tag.
    name: "quotes stop being tracked, so a `>` in a title ends the tag",
    file: JSX,
    from: "      } else if (c === '\"' || c === \"'\" || c === \"`\") quote = c;",
    to: "      } else if (false) quote = c;",
    expect: "nor does a `>` inside a string attribute",
  },
  {
    // THE SURFACE SPLIT, first direction: no overlays at all, so a modal
    // is charged to the page under it again.
    name: "overlays stop being detected",
    file: JSX,
    from: "    if (!/\\bfixed\\b/.test(t.text) || !/\\binset-0\\b/.test(t.text)) continue;",
    to: "    continue;",
    expect: "and the one inside it is not",
  },
  {
    // THE SURFACE SPLIT, the other direction, and the one a careless fix
    // would introduce: an overlay that never closes swallows the rest of
    // the file, so a page's own primary action stops being counted. A
    // splitter wrong THIS way makes every page look compliant.
    name: "an overlay never closes, so the page after it is swallowed",
    file: JSX,
    from: "    spans.push({ start: t.start, end: lineStart[close] + lines[close].length, line: open + 1 });",
    to: "    spans.push({ start: t.start, end: src.length, line: open + 1 });",
    expect: "a control after the overlay closes is on the page again",
  },
  {
    // THE DECLARED EXCEPTION, held to its own budget. A paywall is a
    // screen; a screen gets one.
    name: "the declared replacement surface gains a second filled control",
    file: UPGRADE,
    from: "      </Link>",
    to: '      </Link>\n      <button className="bg-orange-500">x</button>',
    expect: "budget 1",
  },
  {
    // THE OBLIGATION THE DECLARATION CARRIES. upgrade-required is only
    // exempt from a page's count because every caller RETURNS it instead
    // of the page. Draw it in the body as well and it is on the screen
    // beside the page's own primary action — which is the thing the
    // exemption would otherwise hide.
    name: "the replacement surface is drawn in a page body, not returned early",
    file: BUILDMODULE,
    from: '        <PageHeader icon={icon} title={title} helpKey="help.trackingModule" />\n\n        {error && (',
    to: '        <PageHeader icon={icon} title={title} helpKey="help.trackingModule" />\n        <UpgradeRequired featureName={title} planName="x" />\n\n        {error && (',
    expect: "returns it EARLY",
  },
  {
    // THE OTHER DIRECTION OF THE BASELINE. A number left high after its
    // button is gone is a licence to add a different one back in silence.
    name: "a control disappears and its baseline is left standing",
    file: TEAM,
    from: "bg-orange-500",
    to: "bg-panel",
    expect: "no baseline is higher than the page needs",
  },
  {
    name: "a glow is added",
    file: HEALTH,
    from: "<div",
    to: '<div className="shadow-[0_0_16px_rgba(249,115,22,0.35)]" />\n    <div',
    expect: "accent box-shadows",
  },
  {
    name: "a second piece of gradient text appears",
    file: HEALTH,
    from: "<p className=\"text-sm font-semibold text-foreground\">{title}</p>",
    to: "<p className=\"bg-clip-text text-sm font-semibold text-foreground\">{title}</p>",
    expect: "gradient text",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
      body: out,
    };
  }
}

console.log("one-primary-action mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    // The FAIL line, or the detail printed under it, has to mention the
    // thing the mutation broke — a gate that goes red on something else
    // has not caught this.
    const onTarget =
      result.failed.some((f) => f.includes(m.expect)) || (result.body ?? "").includes(m.expect);
    if (!onTarget) {
      missed.push({
        ...m,
        why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of one-primary-action.test.mjs is load-bearing.");
