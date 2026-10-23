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
 * Rewritten 2026-10-23 for the final grid: the registry's order and
 * groups, a tile declared ready that is not built or is a placeholder,
 * Image drawn without its key, a switch coming back onto the page or a
 * tile, and the owner's words drifting in English or Greek.
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
const EN = "messages/en.json";
const EL = "messages/el.json";
const DE = "messages/de.json";
const TARGETS = [GATE, GRID, GROUPS, ALIASES, SETTINGS, PAGE, EN, EL, DE];

const MUTANTS = [
  {
    name: "the search stops knowing synonyms",
    file: GRID,
    from: '            candidates: [label(item), longLabel(item), item.label, ...aliasesFor(ITEM_LABEL_KEYS[item.label] ?? "", locale), hint(item), sidebarHint(item)],',
    to: "            candidates: [label(item), longLabel(item), item.label, hint(item), sidebarHint(item)],",
    expect: "the grid builds its candidates the way the palette does",
  },
  {
    // Deep Research's "investigate" alias is load-bearing both in English
    // (no literal label contains that word) and in Greek (aliasesFor's
    // own-locale-plus-English fallback is what reaches it).
    name: "the alias table forgets Deep Research's English synonyms",
    file: ALIASES,
    from: '    en: ["deep research", "investigate", "dig", "thorough"],',
    to: '    en: ["deep research", "dig", "thorough"],',
    expect: "an alias with no Greek label anywhere near it",
  },
  {
    name: "a tool falls out of the registry, so it is on no road but ⌘K",
    file: GROUPS,
    from: '  { name: "automations", group: "runAlone", href: "/dashboard/automation", ready: true },\n',
    to: "",
    expect: "the registry is exactly the owner's seventeen",
  },
  {
    name: "a tool moves to another group than the owner put it in",
    file: GROUPS,
    from: '{ name: "agents", group: "runAlone"',
    to: '{ name: "agents", group: "organise"',
    expect: "the registry is exactly the owner's seventeen",
  },
  {
    name: "a hidden tool stops saying why",
    file: GROUPS,
    from: '    "the name promises forecasts; today it finds patterns in the account\'s own rows, with the sample each rests on, and forecasts nothing",',
    to: '    "",',
    expect: "every hidden tool says why",
  },
  {
    name: "a tool that is not built is declared ready: Films has no page",
    file: GROUPS,
    from: '    name: "films", group: "make", href: "/dashboard/films", ready: false,',
    to: '    name: "films", group: "make", href: "/dashboard/films", ready: true,',
    expect: "every ready tool has its page",
  },
  {
    name: "a placeholder is declared ready: Video's page is still the empty list",
    file: GROUPS,
    from: '    name: "video", group: "make", href: "/dashboard/videos", ready: false,',
    to: '    name: "video", group: "make", href: "/dashboard/videos", ready: true,',
    expect: "no ready tool is a placeholder",
  },
  {
    name: "Image is drawn without its Gemini key",
    file: GROUPS,
    from: "t.ready && (!t.needs || presence[t.needs])",
    to: "t.ready",
    expect: "Image is drawn with its Gemini key and not without it",
  },
  {
    name: "the page claims the Gemini key is always there",
    file: PAGE,
    from: "imageKey: Boolean(imageApiKey())",
    to: "imageKey: true",
    expect: "hands the grid the tools that work",
  },
  {
    name: "the page asks a feature switch again",
    file: PAGE,
    from: 'import { availableTools } from "@/lib/nav/all-tools";',
    to: 'import { availableTools } from "@/lib/nav/all-tools";\nimport { isFeatureOn } from "@/lib/flags/flags";',
    expect: "the page does not read a feature switch",
  },
  {
    name: "a tile names a switch again",
    file: GROUPS,
    from: '{ name: "myStuff", group: "record", href: "/dashboard/my-stuff", ready: true }',
    to: '{ name: "myStuff", group: "record", href: "/dashboard/my-stuff", ready: true, flag: "my-stuff" }',
    expect: "no tile of the final grid names a switch",
  },
  {
    name: "the icon shrinks further, to 12px",
    file: GRID,
    from: '<Icon className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />',
    to: '<Icon className="h-3 w-3 shrink-0 text-foreground" aria-hidden="true" />',
    expect: "icon and name share one row",
  },
  {
    name: "the icon and name stop sharing a row",
    file: GRID,
    from: '<span className="flex min-w-0 items-center gap-2">',
    to: '<span className="flex min-w-0 flex-col gap-2">',
    expect: "icon and name share one row",
  },
  {
    name: "a long name is cut with an ellipsis",
    file: GRID,
    from: '<span className="min-w-0 break-words text-sm font-medium text-foreground">{name}</span>',
    to: '<span className="min-w-0 truncate text-sm font-medium text-foreground">{name}</span>',
    expect: "no name is cut with an ellipsis",
  },
  {
    name: "the row shrinks back to four-per-row, two-per-phone",
    file: GRID,
    from: '"grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"',
    to: '"grid grid-cols-2 gap-3 lg:grid-cols-4"',
    expect: "5-6 in a row on a computer",
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
    from: "mainRows.has(item.href) && !NEVER_RECENT.includes(item.href) && ",
    to: "mainRows.has(item.href) && ",
    expect: "have no pin",
  },
  {
    name: "a tile with no visible sidebar row gets a pin Recent tools will refuse",
    file: GRID,
    from: "mainRows.has(item.href) && !NEVER_RECENT.includes(item.href) && ",
    to: "!NEVER_RECENT.includes(item.href) && ",
    expect: "have no pin",
  },
  {
    name: "a beta tag comes back",
    file: GRID,
    from: '<span className="min-w-0 break-words text-sm font-medium text-foreground">{name}</span>',
    to: '<span className="min-w-0 break-words text-sm font-medium text-foreground">{name}</span>\n            <span className="bg-tag">beta</span>',
    expect: "the grid draws no tag",
  },
  {
    name: "the Settings block comes back onto All tools",
    file: GRID,
    from: 'import { ALL_SIDEBAR_GROUPS, MAIN_SIDEBAR_GROUPS, sidebarGroups, type SidebarItem } from "@/lib/sidebar-nav";',
    to: 'import { ALL_SIDEBAR_GROUPS, MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP, sidebarGroups, type SidebarItem } from "@/lib/sidebar-nav";',
    expect: "no Settings block",
  },
  {
    name: "the tile shows the sidebar's long name instead of the translated one",
    file: GRID,
    from: "  const label = (item: SidebarItem) => { const k = nameKey(item.href); return k ? names[k] : longLabel(item); };",
    to: "  const label = (item: SidebarItem) => longLabel(item);",
    expect: "the tile draws the translated name",
  },
  {
    name: "Settings stops linking to Integrations, so it is reached from nowhere",
    file: SETTINGS,
    from: '              { href: "/dashboard/integrations", label: tKey("sidebar.items.integrations") },\n',
    to: "",
    expect: "Settings links to each of them",
  },
  {
    name: "the tile draws the sidebar's two-sentence hint again",
    file: GRID,
    from: "  const hint = (item: SidebarItem) => { const k = nameKey(item.href); return k ? lines[k] : sidebarHint(item); };",
    to: "  const hint = (item: SidebarItem) => sidebarHint(item);",
    expect: "the tile draws its own line",
  },
  {
    name: "a German line grows past the length limit",
    file: DE,
    from: '"automations": "Aufgaben, die von selbst laufen"',
    to: '"automations": "Aufgaben, die von selbst laufen, ohne dass du jedes Mal eingreifen musst, und zwar immer"',
    expect: "de: every tile has its one line",
  },
  {
    name: "Image's line goes missing in Greek",
    file: EL,
    from: '        "image": "Εικόνες από μια περιγραφή",\n',
    to: "",
    expect: "el: every tile has its one line",
  },
  {
    name: "a Greek heading stops being the owner's word",
    file: EL,
    from: '"record": "Κατάγραψε"',
    to: '"record": "Καταγραφή"',
    expect: "the Greek headings are the owner's own words",
  },
  {
    name: "an English line drifts from the owner's",
    file: EN,
    from: '"iowork": "Works on your computer, makes your files"',
    to: '"iowork": "Works on your computer"',
    expect: "the English lines are the owner's, word for word",
  },
  {
    name: "an old heading is left behind in English",
    file: EN,
    from: '        "organise": "Organise"\n      },',
    to: '        "organise": "Organise",\n        "learn": "Learn"\n      },',
    expect: "en: the five headings are worded, and no old heading is left",
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
