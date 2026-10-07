#!/usr/bin/env node
/*
 * CAN recent-tools.test.mjs SEE THE SIDEBAR DRIFT FROM THE DESIGN?
 *
 * One use enough to appear, a reload counted as a second use, the window
 * stretched past 30 days, a sixth tool, Chat let into the list, a pin
 * that does not hold, a removal that forgets, the list moved back into
 * the browser, a heading drawn over an empty list, another person's
 * history read, and a pin stored for a tool the person cannot see.
 *
 * Run: node scripts/tests/recent-tools.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/recent-tools.test.mjs";
const LIB = "src/lib/nav/recent-tools.ts";
const RAIL = "src/lib/nav/rail.ts";
const SIDEBAR = "src/components/dashboard/sidebar.tsx";
const LAYOUT = "src/app/dashboard/layout.tsx";
const ROUTE = "src/app/api/nav/recent-tools/route.ts";
const TARGETS = [GATE, LIB, RAIL, SIDEBAR, LAYOUT, ROUTE];

const MUTANTS = [
  {
    // RE-ANCHORED 2026-10-05: the rule became 3 finished uses on 2 days.
    name: "two finished uses are enough to appear",
    file: LIB,
    from: "export const USES_TO_APPEAR = 3;",
    to: "export const USES_TO_APPEAR = 2;",
    expect: "two tasks on two days are not enough",
  },
  {
    // RE-ANCHORED 2026-10-05: the same-session merge is gone with page
    // opens; what can break now is the two-days half of the rule.
    name: "three uses on one day are enough",
    file: LIB,
    from: "export const DAYS_TO_APPEAR = 2;",
    to: "export const DAYS_TO_APPEAR = 1;",
    expect: "three finished tasks on the same day: not yet",
  },
  {
    name: "the window is no longer thirty days",
    file: LIB,
    from: "export const RECENT_WINDOW_DAYS = 30;",
    to: "export const RECENT_WINDOW_DAYS = 60;",
    expect: "30 days without a use: it goes",
  },
  {
    name: "a sixth tool fits",
    file: LIB,
    from: "export const RECENT_TOOLS_MAX = 5;",
    to: "export const RECENT_TOOLS_MAX = 6;",
    expect: "six candidates give five",
  },
  {
    name: "Chat is let into the list",
    file: LIB,
    from: 'export const NEVER_RECENT: readonly string[] = ["/dashboard/chat", "/dashboard/coding"];',
    to: 'export const NEVER_RECENT: readonly string[] = ["/dashboard/coding"];',
    expect: "Chat and Coding never appear",
  },
  {
    name: "the oldest is kept and the newest goes",
    file: LIB,
    from: "    .sort((a, b) => (lastUsed(b) ?? 0) - (lastUsed(a) ?? 0))",
    to: "    .sort((a, b) => (lastUsed(a) ?? 0) - (lastUsed(b) ?? 0))",
    expect: "the one unused for longest is the one that goes",
  },
  {
    name: "a removal forgets the tool's past only until the next load",
    file: LIB,
    from: "    if (removedAt && at <= Date.parse(removedAt)) continue;",
    to: "",
    expect: "removing a tool takes it out",
  },
  {
    name: "a pinned tool is listed a second time among the used ones",
    file: LIB,
    from: "    .filter(([href, times]) => !pinned.includes(href) && qualifies(times))",
    to: "    .filter(([href, times]) => qualifies(times))",
    expect: "a pinned tool that is also the most used is listed once",
  },
  {
    name: "a sixth pin is accepted",
    file: LIB,
    from: "    if (prefs.pinned.length >= RECENT_TOOLS_MAX && !prefs.pinned.includes(href)) return prefs;",
    to: "",
    expect: "no sixth pin",
  },
  {
    name: "a tool's page lights All tools though it is in Recent",
    file: RAIL,
    from: "  if (recent) return { recent };",
    to: "",
    expect: "a recent tool is its own row",
  },
  {
    name: "the list moves back into the browser",
    file: SIDEBAR,
    from: "  recent = [],",
    to: '  recent = JSON.parse(globalThis.localStorage?.getItem("ionexa.recentTools") ?? "[]"),',
    expect: "the list is the server's, not the browser's",
  },
  {
    name: "the Recent tools heading is drawn for a new person",
    file: SIDEBAR,
    from: "          {list.length > 0 && (",
    to: "          {list && (",
    expect: "Recent tools, and its heading, only when there is something in it",
  },
  {
    name: "the layout reads everybody's history",
    file: LAYOUT,
    from: '      .eq("user_id", user.id)',
    to: "",
    expect: "the layout reads the person's own last 30 days of settled work",
  },
  {
    // THE BUG OF 2026-10-05: a click from All tools put the tool in the
    // sidebar, because a use was an opened page.
    name: "page opens are fed to the rule again",
    file: LAYOUT,
    from: "    const events = [...completionEvents(settled.data ?? []), ...savedEvents(saved.data ?? [])];",
    to: '    const opens = await supabase.from("nav_events").select("path, created_at").eq("user_id", user.id);\n    const events = [...(opens.data ?? []), ...completionEvents(settled.data ?? []), ...savedEvents(saved.data ?? [])];',
    expect: "ten opens with nothing done",
  },
  {
    name: "a refunded task is credited to its tool",
    file: LIB,
    from: "    const href = COMPLETION_TOOLS[r.feature];",
    to: '    const href = COMPLETION_TOOLS[r.feature.replace(/_(refunded|stopped|cannot_complete)$/, "")];',
    expect: "a failed, cancelled or refunded task does not count",
  },
  {
    name: "a pin is stored for a tool the person cannot see",
    file: ROUTE,
    from: "    if (!tools.includes(href)) return NextResponse.json({ ok: false }, { status: 400 });",
    to: "",
    expect: "only a tool this person can see may be stored",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 60_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("recent-tools mutations\n");

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
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
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
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.",
);
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
