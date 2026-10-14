#!/usr/bin/env node
/*
 * CAN mobile-tabs.test.mjs SEE THE PHONE'S BAR DRIFT?
 *
 * A tab dropped, a page lighting the wrong tab, the bar shown on a
 * desktop, a target under 44px, the current tab unannounced, and the
 * conversation's field sliding under the bar. And (2026-10-14) the
 * balance beside «You»: gone from the tab, fetched on its own, a low
 * balance not warned, an empty one called low, the 20% line moved, a
 * row that could not be read shown as empty, an admin's stored number
 * shown, the top bar's notice deciding by another rule, the number laid
 * over the icons, the word squeezed to make room, and a language
 * without the words.
 *
 * Run: node scripts/tests/mobile-tabs.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/mobile-tabs.test.mjs";
const TABS = "src/lib/nav/tabs.ts";
const BAR = "src/components/dashboard/mobile-tab-bar.tsx";
const LAYOUT = "src/app/dashboard/layout.tsx";
const CHAT = "src/app/dashboard/chat/page.tsx";
const LEVEL = "src/lib/billing/credit-level.ts";
const BANNER = "src/components/credits/low-credits-banner.tsx";
const AR = "messages/ar.json";
const TARGETS = [GATE, TABS, BAR, LAYOUT, CHAT, LEVEL, BANNER, AR];

const MUTANTS = [
  {
    name: "the You tab is dropped",
    file: TABS,
    from: '  { key: "you", href: "/dashboard/settings" },\n',
    to: "",
    expect: "Home, Chat, Tools, You",
  },
  {
    name: "the account's pages light Tools",
    file: TABS,
    from: '    if (rail.key === "settings") return "you";\n',
    to: "",
    expect: "every page lights the right tab",
  },
  {
    name: "the bar shows on a desktop too",
    file: BAR,
    from: " md:hidden",
    to: "",
    expect: "on a phone only",
  },
  {
    name: "a tab shrinks under 44px",
    file: BAR,
    from: "min-h-[56px]",
    to: "min-h-[36px]",
    expect: "every target is at least 44px",
  },
  {
    name: "the current tab is not announced",
    file: BAR,
    from: '                aria-current={isActive ? "page" : undefined}\n',
    to: "",
    expect: "the current tab says so",
  },
  {
    name: "the page body ends under the bar",
    file: LAYOUT,
    from: '<main id="main-content" className="flex-1 pb-16 md:pb-0">',
    to: '<main id="main-content" className="flex-1">',
    expect: "leaves its height free below md",
  },
  {
    name: "the conversation's field slides under the bar",
    file: CHAT,
    from: '<div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">',
    to: '<div className="h-[calc(100vh-4rem)]">',
    expect: "keeps its field above the bar",
  },
  {
    name: "the balance leaves the You tab",
    file: BAR,
    from: '                  {tab.key === "you" && <TabBalance />}\n',
    to: "",
    expect: "the You tab carries the balance",
  },
  {
    name: "the bar asks the server for its own balance",
    file: BAR,
    from: "  const { credits, total, isAdmin } = useCredits();\n",
    to: '  const { credits, total, isAdmin } = useCredits();\n  void fetch("/api/credits/balance");\n',
    expect: "no request of its own",
  },
  {
    name: "a low balance is as quiet as a healthy one",
    file: BAR,
    from: '  low: "text-warning",',
    to: '  low: "text-muted",',
    expect: "a warning when low",
  },
  {
    name: "the number is laid over the tab instead of in its line",
    file: BAR,
    from: "className={`inline-flex shrink-0 items-center gap-0.5",
    to: "className={`absolute -top-1 end-2 inline-flex shrink-0 items-center gap-0.5",
    expect: "it covers nothing",
  },
  {
    name: "the word is squeezed to make room for the number",
    file: BAR,
    from: '<span className="break-words">{t(tab.key)}</span>',
    to: '<span className="min-w-0 break-words">{t(tab.key)}</span>',
    expect: "rather than squeezing it",
  },
  {
    name: "the icons are centred again, and a wrapped tab's icon rises",
    file: BAR,
    from: "flex-col items-center justify-start gap-1 pt-2 ",
    to: "flex-col items-center justify-center gap-1 ",
    expect: "the four icons hang from one line",
  },
  {
    name: "the label line loses its tight leading, and a wrapped tab outgrows the page's room",
    file: BAR,
    from: "gap-x-1 px-1 leading-tight",
    to: "gap-x-1 px-1",
    expect: "rather than squeezing it",
  },
  {
    name: "an unread balance is drawn",
    file: BAR,
    from: '  if (level === "unknown") return null;\n',
    to: "",
    expect: "says nothing while the balance is unknown",
  },
  {
    name: "nothing left reads as low",
    file: LEVEL,
    from: '  if (credits <= 0) return "empty";\n',
    to: "",
    expect: "nothing left of a known allowance is empty",
  },
  {
    name: "the 20% line moves",
    file: LEVEL,
    from: "credits / total <= LOW_CREDITS_THRESHOLD",
    to: "credits / total < LOW_CREDITS_THRESHOLD",
    expect: "at 20% exactly it is low",
  },
  {
    name: "a row that could not be read shows as empty",
    file: LEVEL,
    from: 'return credits > 0 ? "ok" : "unknown";',
    to: 'return credits > 0 ? "ok" : "empty";',
    expect: "the layout's fallback",
  },
  {
    name: "an admin's stored number is shown as a balance",
    file: LEVEL,
    from: '  if (isAdmin) return "unlimited";\n',
    to: "",
    expect: "an admin-listed account is unlimited",
  },
  {
    name: "the top bar's notice stops showing for a low balance",
    file: BANNER,
    from: '(level !== "low" && level !== "empty")',
    to: '(level !== "empty")',
    expect: "decides «low» by the same rule",
  },
  {
    name: "Arabic loses the words for a low balance",
    file: AR,
    from: '"balanceLow": "رصيد منخفض: {amount}",',
    to: "",
    expect: "ar: the balance's words",
  },
  {
    name: "the balance stays on past 640px, so it is said twice over and under the page",
    file: BAR,
    from: "whitespace-nowrap text-[10px] font-medium tabular-nums sm:hidden",
    to: "whitespace-nowrap text-[10px] font-medium tabular-nums",
    expect: "the balance stops at 640px",
  },
  {
    // `-` IS NOT A WORD CHARACTER, so the pair this replaced
    // (/\bsm:inline-flex\b/ && /\bhidden\b/) was satisfied by the
    // `aria-hidden="true"` on the dot inside the same component: the
    // notice could lose `hidden` from its own class list, come back on a
    // phone beside the balance this round just stopped duplicating, and
    // the clause stayed green. Found by review, 2026-10-14.
    name: "the top bar's notice loses `hidden` and returns to the phone",
    file: BANNER,
    from: '"hidden items-center gap-1.5 rounded-full',
    to: '"items-center gap-1.5 rounded-full',
    expect: "the top bar's notice really begins there",
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

console.log("mobile-tabs mutations\n");

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
