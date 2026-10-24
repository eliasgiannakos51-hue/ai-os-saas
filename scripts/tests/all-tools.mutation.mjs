#!/usr/bin/env node
/*
 * CAN all-tools.test.mjs SEE ALL TOOLS DRIFT FROM THE DESIGN?
 *
 * Rewritten 2026-10-24 for the owner's "ALL TOOLS: ΟΛΑ ΤΑ ΤΕΤΡΑΓΩΝΑ" round:
 * 24 tiles in 6 groups (Learn carrying only small jobs), a tile that is not
 * ready still drawn with a «Σύντομα» mark instead of vanishing, its address
 * rendering the Coming Soon shell instead of the real tool, the small
 * ready-made jobs (quick-jobs.ts) each pointing at the param their target
 * actually reads, and the registry's and the i18n's own words.
 *
 * Run: node scripts/tests/all-tools.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/all-tools.test.mjs";
const GRID = "src/components/tools/tools-grid.tsx";
const GROUPS = "src/lib/nav/all-tools.ts";
const JOBS = "src/lib/nav/quick-jobs.ts";
const ALIASES = "src/lib/palette-aliases.ts";
const PAGE = "src/app/dashboard/tools/page.tsx";
const AUDIO_PAGE = "src/app/dashboard/audio/page.tsx";
const GAMES_PAGE = "src/app/dashboard/games/page.tsx";
const COMING_SOON = "src/components/tools/coming-soon-shell.tsx";
const EN = "messages/en.json";
const EL = "messages/el.json";
const DE = "messages/de.json";
const TARGETS = [GATE, GRID, GROUPS, JOBS, ALIASES, PAGE, AUDIO_PAGE, GAMES_PAGE, COMING_SOON, EN, EL, DE];

const MUTANTS = [
  {
    name: "the search stops merging big and small candidates",
    file: GRID,
    from: "return filterAndRankCandidates([...bigCandidates, ...smallCandidates].map((c) => ({ item: c, candidates: c.item.candidates })), query);",
    to: "return filterAndRankCandidates(bigCandidates.map((c) => ({ item: c, candidates: c.item.candidates })), query);",
    expect: "the grid merges big-tile and small-job candidates into one ranked list",
  },
  {
    name: "the alias table forgets Deep Research's English synonym",
    file: ALIASES,
    from: '    en: ["deep research", "investigate", "dig", "thorough"],',
    to: '    en: ["deep research", "dig", "thorough"],',
    expect: "investigate",
  },
  {
    name: "a tile falls out of the registry entirely",
    file: GROUPS,
    from: '  { name: "automations", group: "runAlone", href: "/dashboard/automation", ready: true },\n',
    to: "",
    expect: "the registry is exactly the owner's 24",
  },
  {
    name: "a tile moves to another group than the owner put it in",
    file: GROUPS,
    from: '{ name: "agents", group: "runAlone"',
    to: '{ name: "agents", group: "organise"',
    expect: "the registry is exactly the owner's 24",
  },
  {
    name: "Learn gets a big tile of its own",
    file: GROUPS,
    from: '  { name: "projects", group: "organise", href: "/dashboard/projects", ready: true },\n];',
    to: '  { name: "projects", group: "organise", href: "/dashboard/projects", ready: true },\n  { name: "coding", group: "learn", href: "/dashboard/coding", ready: true },\n];',
    expect: "carrying no big tile",
  },
  {
    name: "a hidden tool stops saying why",
    file: GROUPS,
    from: '    "the name promises forecasts; today it finds patterns in the account\'s own rows, with the sample each rests on, and forecasts nothing",',
    to: '    "",',
    expect: "every hidden tool says why",
  },
  {
    name: "a not-ready tile is declared ready though its page is still Coming Soon",
    file: GROUPS,
    from: '    name: "audio", group: "make", href: "/dashboard/audio", ready: false,',
    to: '    name: "audio", group: "make", href: "/dashboard/audio", ready: true,',
    expect: "a ready tile's page is never the Coming Soon shell",
  },
  {
    name: "a ready tool's page is swapped for the Coming Soon shell",
    file: GAMES_PAGE,
    from: "import { GamesShell, type GameRow } from \"@/components/games/games-shell\";",
    to: "import { GamesShell, type GameRow } from \"@/components/games/games-shell\";\nimport { ComingSoonShell } from \"@/components/tools/coming-soon-shell\";",
    expect: "a ready tile's page is never the Coming Soon shell",
  },
  {
    name: "Image is drawn without its Gemini key",
    file: GROUPS,
    from: "t.ready && (!t.needs || presence[t.needs])",
    to: "t.ready",
    expect: "Image is live with its Gemini key and not without it",
  },
  {
    name: "the page claims the Gemini key is always there",
    file: PAGE,
    from: "imageKey: Boolean(imageApiKey())",
    to: "imageKey: true",
    expect: "hands the grid `live`",
  },
  {
    name: "the page asks a feature switch again",
    file: PAGE,
    from: 'import { availableTools } from "@/lib/nav/all-tools";',
    to: 'import { availableTools } from "@/lib/nav/all-tools";\nimport { isFeatureOn } from "@/lib/flags/flags";',
    expect: "does not read a feature switch",
  },
  {
    name: "a tile names a switch again",
    file: GROUPS,
    from: '{ name: "myStuff", group: "record", href: "/dashboard/my-stuff", ready: true }',
    to: '{ name: "myStuff", group: "record", href: "/dashboard/my-stuff", ready: true, flag: "my-stuff" }',
    expect: "no tile of the final grid names a switch",
  },
  {
    name: "the field in the Coming Soon shell stops being disabled",
    file: "src/components/tools/coming-soon-shell.tsx",
    from: 'aria-disabled="true"',
    to: 'aria-disabled="false"',
    expect: "the field is disabled",
  },
  {
    name: "a quick job points at the wrong query parameter for its target",
    file: JOBS,
    from: '{ id: "logo", group: "make", tool: "image", href: "/dashboard/images", param: "ask" },',
    to: '{ id: "logo", group: "make", tool: "image", href: "/dashboard/images", param: "brief" },',
    expect: "every job's param matches what its target page actually reads",
  },
  {
    name: "two quick jobs share the same id",
    file: JOBS,
    from: '{ id: "poster", group: "make", tool: "image", href: "/dashboard/images", param: "ask" },',
    to: '{ id: "logo", group: "make", tool: "image", href: "/dashboard/images", param: "ask" },',
    expect: "every quick job's id is unique",
  },
  {
    name: "a quick job points at an address with no page",
    file: JOBS,
    from: '{ id: "notes", group: "organise", tool: "projects", href: "/dashboard/projects", param: "ask" },',
    to: '{ id: "notes", group: "organise", tool: "projects", href: "/dashboard/nowhere-at-all", param: "ask" },',
    expect: "every quick job's href is a real address",
  },
  {
    name: "a beta tag comes back",
    file: GRID,
    from: '<span className="min-w-0 overflow-visible whitespace-nowrap text-sm font-medium text-foreground">{name}</span>',
    to: '<span className="min-w-0 overflow-visible whitespace-nowrap text-sm font-medium text-foreground">{name}</span>\n            <span className="bg-tag">beta</span>',
    expect: "the grid draws no tag",
  },
  {
    name: "a small ready-made job is drawn on the default page again",
    file: GRID,
    from: "<ul data-testid=\"tools-big-row\" className={GRID}>\n                {group.big.map(bigTile)}\n              </ul>",
    to: "<ul data-testid=\"tools-big-row\" className={GRID}>\n                {group.big.map(bigTile)}\n              </ul>\n              <ul>{QUICK_JOBS.filter((j) => j.group === group.key).map(smallTile)}</ul>",
    expect: "the default (non-search) render draws no quick-job tile",
  },
  {
    name: "two groups share a row again, sized to fit",
    file: GRID,
    from: '<div className="mt-5 flex flex-col gap-6">',
    to: '<div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">',
    expect: "no group shares a row with another",
  },
  {
    name: "a name truncates instead of staying on one full line",
    file: GRID,
    from: '<span className="min-w-0 overflow-visible whitespace-nowrap text-sm font-medium text-foreground">{name}</span>',
    to: '<span className="min-w-0 truncate text-sm font-medium text-foreground">{name}</span>',
    expect: "a name never wraps and is never cut",
  },
  {
    name: "the tile loses its fixed minimum height, so tiles can differ",
    file: GRID,
    from: 'className="flex h-full min-h-[88px] flex-col gap-1 rounded-card border border-border bg-panel p-3 pe-8 transition-colors duration-150 hover:border-foreground focus-visible:border-foreground"',
    to: 'className="flex flex-col gap-1 rounded-card border border-border bg-panel p-3 pe-8 transition-colors duration-150 hover:border-foreground focus-visible:border-foreground"',
    expect: "every tile fills its grid cell (h-full) with the same minimum height",
  },
  {
    name: "the pin writes somewhere the sidebar does not read",
    file: GRID,
    from: '      const res = await fetch("/api/nav/recent-tools", {',
    to: '      const res = await fetch("/api/nav/pins", {',
    expect: "writing through the sidebar's own route",
  },
  {
    name: "a small ready-made job gets a pin",
    file: GRID,
    from: '      <li key={job.id}>',
    to: '      <li key={job.id} data-testid="tool-pin">',
    expect: "no pin on a small ready-made job",
  },
  {
    name: "document's line names slides again",
    file: EN,
    from: '"document": "Documents and sheets"',
    to: '"document": "Documents, slides and sheets"',
    expect: "names sheets, not slides",
  },
  {
    name: "coding's line names GitHub before it is open to everyone",
    file: EN,
    from: '"coding": "Write and fix code"',
    to: '"coding": "Code with your GitHub projects"',
    expect: "says «write and fix code», not GitHub",
  },
  {
    name: "a German line grows past the length limit",
    file: DE,
    from: '"automations": "Aufgaben, die von selbst laufen"',
    to: '"automations": "Aufgaben, die von selbst laufen, ohne dass du jedes Mal eingreifen musst, und zwar immer"',
    expect: "de: every tile has its one line",
  },
  {
    name: "a Greek heading stops being the owner's word",
    file: EL,
    from: '"record": "Κατάγραψε"',
    to: '"record": "Καταγραφή"',
    expect: "the Greek headings are the owner's own words",
  },
  {
    name: "the Learn heading goes missing in Greek",
    file: EL,
    from: '"learn": "Μάθε"',
    to: '"learnX": "Μάθε"',
    expect: "all six headings are worded",
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
