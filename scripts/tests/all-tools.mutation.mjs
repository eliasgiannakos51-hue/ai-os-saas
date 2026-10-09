#!/usr/bin/env node
/*
 * CAN all-tools.test.mjs SEE ALL TOOLS DRIFT FROM THE DESIGN?
 *
 * The search losing its synonyms, a tool falling out of every group or
 * sitting in two, a stale entry, a hidden tool with no reason, the square
 * losing its 28px icon or its shape, a name cut with an ellipsis, the pin
 * writing somewhere else or appearing on Chat, and a beta tag coming back.
 * Since MASTER 14.1 (2026-10-07): the Settings block coming back, the
 * long name replacing the one word, a square losing its name, and Settings
 * no longer linking to what left All tools. Since 2026-10-08: the square
 * drawing the sidebar's long hint again, a line missing or grown past one
 * line, and a new tool's square drawn without its switch, named after a
 * switch that does not exist, given a pin Recent tools refuses, or named
 * outside 14.1's list.
 *
 * Run: node scripts/tests/all-tools.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/all-tools.test.mjs";
const GRID = "src/components/tools/tools-grid.tsx";
const GROUPS = "src/lib/nav/all-tools.ts";
const ALIASES = "src/lib/palette-aliases.ts";
const SETTINGS = "src/app/dashboard/settings/page.tsx";
const PAGE = "src/app/dashboard/tools/page.tsx";
const INTEGRATIONS = "src/app/dashboard/integrations/page.tsx";
const EN = "messages/en.json";
const EL = "messages/el.json";
const DE = "messages/de.json";
const TARGETS = [GATE, GRID, GROUPS, ALIASES, SETTINGS, PAGE, INTEGRATIONS, EN, EL, DE];

const MUTANTS = [
  {
    name: "the search stops knowing synonyms",
    file: GRID,
    from: '            candidates: [label(item), longLabel(item), item.label, ...aliasesFor(ITEM_LABEL_KEYS[item.label] ?? "", locale), hint(item), sidebarHint(item)],',
    to: "            candidates: [label(item), longLabel(item), item.label, hint(item), sidebarHint(item)],",
    expect: "the grid builds its candidates the way the palette does",
  },
  {
    name: "the alias table forgets slides",
    file: ALIASES,
    from: '    en: ["presentations", "slides", "deck", "powerpoint"],',
    to: '    en: ["presentations", "deck", "powerpoint"],',
    // Red on the GREEK check, not the English one, and rightly: the
    // English description of Presentations has the word "slides" in it,
    // and the description is a candidate. In Greek only the alias reaches.
    expect: "where the English synonyms still count",
  },
  {
    name: "a tool falls out of every group, so it is on no road but ⌘K",
    file: GROUPS,
    from: '      "/dashboard/meetings",\n',
    to: "",
    expect: "every tool the grid can draw is in a group or hidden on purpose",
  },
  {
    name: "a group names a screen the grid cannot draw",
    file: GROUPS,
    from: '      "/dashboard/meetings",\n',
    to: '      "/dashboard/meetings",\n      "/dashboard/films",\n',
    expect: "every href in all-tools.ts is a tool the grid can draw",
  },
  {
    name: "a tool sits in two groups",
    file: GROUPS,
    from: '    hrefs: ["/dashboard/finance",',
    to: '    hrefs: ["/dashboard/chat", "/dashboard/finance",',
    expect: "in exactly one place",
  },
  {
    name: "a hidden tool stops saying why",
    file: GROUPS,
    from: '    "the name promises forecasts; today it finds patterns in the account\'s own rows, with the sample each rests on, and forecasts nothing",',
    to: '    "",',
    expect: "every hidden tool says why",
  },
  {
    name: "the icon shrinks back to 16px",
    file: GRID,
    from: '<Icon className="h-7 w-7 text-foreground" aria-hidden="true" />',
    to: '<Icon className="h-4 w-4 text-foreground" aria-hidden="true" />',
    expect: "with a 28px icon",
  },
  {
    name: "the square stops being square",
    file: GRID,
    from: "flex aspect-square flex-col",
    to: "flex min-h-[44px] flex-col",
    expect: "1:1, on the card radius",
  },
  {
    name: "a long name is cut with an ellipsis",
    file: GRID,
    from: '<span className="block break-words text-sm font-medium text-foreground">{name}</span>',
    to: '<span className="block truncate text-sm font-medium text-foreground">{name}</span>',
    expect: "no name is cut with an ellipsis",
  },
  {
    name: "three to a row on a computer",
    file: GRID,
    from: '"grid grid-cols-2 gap-3 lg:grid-cols-4"',
    to: '"grid grid-cols-2 gap-3 lg:grid-cols-3"',
    expect: "four in a row on a computer",
  },
  {
    name: "the pin writes somewhere the sidebar does not read",
    file: GRID,
    from: '      const res = await fetch("/api/nav/recent-tools", {',
    to: '      const res = await fetch("/api/nav/pins", {',
    expect: "writing through the sidebar's own route",
  },
  {
    name: "Chat and Coding get a pin, though they are never in Recent tools",
    file: GRID,
    from: "      !NEVER_RECENT.includes(item.href) && !item.href.startsWith",
    to: "      !item.href.startsWith",
    expect: "have no pin",
  },
  {
    name: "a beta tag comes back",
    file: GRID,
    from: '            <span className="block break-words text-sm font-medium text-foreground">{name}</span>',
    to: '            <span className="block break-words text-sm font-medium text-foreground">{name}</span>\n            <span className="bg-tag">beta</span>',
    expect: "the grid draws no tag",
  },
  // MASTER 14.1 (2026-10-07).
  {
    name: "the Settings block comes back onto All tools",
    file: GRID,
    from: 'import { ALL_SIDEBAR_GROUPS, MAIN_SIDEBAR_GROUPS, sidebarGroups, type SidebarItem } from "@/lib/sidebar-nav";',
    to: 'import { ALL_SIDEBAR_GROUPS, MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP, sidebarGroups, type SidebarItem } from "@/lib/sidebar-nav";',
    expect: "no Settings block",
  },
  {
    name: "the square shows the sidebar's long name instead of the one word",
    file: GRID,
    from: "  const label = (item: SidebarItem) => { const k = nameKey(item.href); return k ? names[k] : longLabel(item); };",
    to: "  const label = (item: SidebarItem) => longLabel(item);",
    expect: "the square draws the one-word name",
  },
  {
    name: "a square loses its one-word name",
    file: GROUPS,
    from: '  "/dashboard/timeline": "library",\n',
    to: "",
    expect: "every grouped tool has a one-word name",
  },
  {
    name: "Settings stops linking to Integrations, so it is reached from nowhere",
    file: SETTINGS,
    from: '              { href: "/dashboard/integrations", label: tKey("sidebar.items.integrations") },\n',
    to: "",
    expect: "Settings links to each of them",
  },
  // 2026-10-08: one line per square, and the new tools behind their switches.
  {
    name: "the square draws the sidebar's two-sentence hint again",
    file: GRID,
    from: "  const hint = (item: SidebarItem) => { const k = nameKey(item.href); return k ? lines[k] : sidebarHint(item); };",
    to: "  const hint = (item: SidebarItem) => sidebarHint(item);",
    expect: "the square draws its own line",
  },
  {
    name: "a German line grows into two sentences",
    file: DE,
    from: '"meetings": "Zusammenfassung und Aufgaben aus einer Aufnahme."',
    to: '"meetings": "Macht aus einer Aufnahme ein Transkript, eine Zusammenfassung und Aufgaben, aus denen du wählst."',
    expect: "de: every square has its one line",
  },
  {
    name: "Image's line goes missing in Greek",
    file: EL,
    from: '        "image": "Τέσσερις εικόνες από μία περιγραφή.",\n',
    to: "",
    expect: "el: every square has its one line",
  },
  {
    name: "a new tool's square is drawn for everyone, switch or not",
    file: GRID,
    from: "SWITCHED_SQUARES.filter((s) => s.group === g.key && switchedOn.includes(s.href))",
    to: "SWITCHED_SQUARES.filter((s) => s.group === g.key)",
    expect: "only when its switch is on",
  },
  {
    name: "the page stops asking the switch for this person",
    file: PAGE,
    from: "if (isFlagKey(square.flag) && (await isFeatureOn(square.flag, user))) switchedOn.push(square.href);",
    to: "if (isFlagKey(square.flag)) switchedOn.push(square.href);",
    expect: "asks each square's switch for THIS person",
  },
  {
    name: "a new tool names a switch that does not exist",
    file: GROUPS,
    from: 'flag: "image-studio", name: "image"',
    to: 'flag: "images", name: "image"',
    expect: "names a switch that exists",
  },
  {
    name: "a new tool's page stops reading its switch, so the square and the page disagree",
    file: INTEGRATIONS,
    from: 'connectButton={await isFeatureOn("connections", user)}',
    to: "connectButton={true}",
    expect: "its page reads that same switch",
  },
  {
    name: "a new tool's square gets a pin Recent tools will refuse",
    file: GRID,
    from: " &&\n      !SWITCHED_SQUARES.some((s) => s.href === item.href);",
    to: ";",
    expect: "with no pin, because Recent tools",
  },
  {
    name: "a new tool is named outside 14.1's list",
    file: EN,
    from: '"image": "Image",\n        "connections": "Connections"',
    to: '"image": "Pictures",\n        "connections": "Connections"',
    expect: "named as 14.1 names it",
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

console.log("all-tools mutations\n");

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
