#!/usr/bin/env node
/*
 * CAN home-design.test.mjs SEE HOME DRIFT FROM THE DESIGN?
 *
 * The greeting naming nobody, a quick action landing in the wrong mode, a
 * mode read raw from the request, a mode placed inside the cached prefix,
 * a card creeping back onto Home, a card lost on the way to Activity, and
 * Activity hidden from All tools.
 *
 * Run: node scripts/tests/home-design.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/home-design.test.mjs";
const MODES = "src/lib/chat/work-modes.ts";
const GREETING = "src/components/overview/greeting-header.tsx";
const QUICK = "src/components/home/quick-actions.tsx";
const HOME = "src/app/dashboard/overview/page.tsx";
const ACTIVITY = "src/app/dashboard/activity/page.tsx";
const WS = "src/components/chat/chat-workspace.tsx";
const ROUTE = "src/app/api/chat/route.ts";
const NAV = "src/lib/sidebar-nav.ts";
const TARGETS = [GATE, MODES, GREETING, QUICK, HOME, ACTIVITY, WS, ROUTE, NAV, "src/app/dashboard/chat/page.tsx"];

const MUTANTS = [
  {
    name: "the greeting greets an empty name",
    file: GREETING,
    from: '        {name ? `, ${name}` : ""}',
    to: "        {`, ${name}`}",
    expect: "the name is written only when there is one",
  },
  {
    name: "two quick actions open the same mode",
    file: MODES,
    from: 'export const WORK_MODES = ["research", "create", "run", "analyze"] as const;',
    to: 'export const WORK_MODES = ["research", "create", "run", "research"] as const;',
    expect: "the four are the design's",
  },
  {
    name: "a quick action opens the chat with no mode",
    file: MODES,
    from: "  return `/dashboard/chat?mode=${mode}`;",
    to: "  return `/dashboard/chat`;",
    expect: "each opens the chat with its mode",
  },
  {
    name: "any string is taken as a mode",
    file: MODES,
    from: '  return typeof value === "string" && (WORK_MODES as readonly string[]).includes(value) ? (value as WorkMode) : null;',
    to: '  return typeof value === "string" && value ? (value as WorkMode) : null;',
    expect: "a mode is one of the four or none",
  },
  {
    // The first version swapped one heading word, which leaves four
    // different paragraphs — and the gate was right to stay green. The
    // defect is every mode carrying the same instruction.
    name: "every mode says the same thing",
    file: MODES,
    from: "  return mode ? `\\n\\n${INSTRUCTIONS[mode]}` : \"\";",
    to: "  return mode ? `\\n\\n${INSTRUCTIONS.research}` : \"\";",
    expect: "something different",
  },
  {
    name: "the chat page ignores the mode in the URL",
    file: "src/app/dashboard/chat/page.tsx",
    from: "        initialWorkMode={readWorkMode(searchParams.mode) ?? undefined}",
    to: "        initialWorkMode={undefined}",
    expect: "the chat page reads the mode from the URL",
  },
  {
    name: "the workspace forgets to send the mode",
    file: WS,
    from: "          ...(workMode ? { workMode } : {}),",
    to: "",
    expect: "sends it with every message",
  },
  {
    name: "the route trusts the request body's mode",
    file: ROUTE,
    from: "      workMode = readWorkMode(body?.workMode);",
    to: "      workMode = body?.workMode ?? null;",
    expect: "the route reads the mode through readWorkMode",
  },
  {
    name: "the mode moves into the cached prefix",
    file: ROUTE,
    from: "      : buildSystemPrompt(personaName);",
    to: "      : buildSystemPrompt(personaName) + workModeInstruction(workMode);",
    expect: "adds it at the END of the prompt",
  },
  {
    name: "a card creeps back onto Home",
    file: HOME,
    from: 'import { QuickActions } from "@/components/home/quick-actions";',
    to: 'import { QuickActions } from "@/components/home/quick-actions";\nimport { HomeStatCard } from "@/components/overview/home-stat-card";',
    expect: "Home draws the greeting, the field, the quick actions",
  },
  {
    name: "Home starts reading numbers again",
    file: HOME,
    from: "  const tErr = await getTranslations(\"errors\");",
    to: "  const tErr = await getTranslations(\"errors\");\n  await supabase.from(\"ai_missions\").select(\"id\");",
    expect: "no card, no number, no list is read for it",
  },
  {
    name: "a card is lost on the way to Activity",
    file: ACTIVITY,
    from: "          <RecentEntriesCard entries={recentEntries} />",
    to: "",
    expect: "are rendered there",
  },
  {
    name: "Activity is hidden from All tools",
    file: NAV,
    from: '      { href: "/dashboard/activity", label: "Activity", icon: ACTIVITY_ICON, hintKey: "activity" },',
    to: '      { href: "/dashboard/activity", label: "Activity", icon: ACTIVITY_ICON, hintKey: "activity", hidden: true },',
    expect: "Activity is a row in All tools",
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

console.log("home-design mutations\n");

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
