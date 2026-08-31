#!/usr/bin/env node
/*
 * CAN help-tips.test.mjs TELL A REAL "?" FROM A CLAIMED ONE?
 *
 * This gate got two new powers in the batch that took the "?" from 15
 * pages to 28, and both are the kind that pass quietly when they are
 * broken:
 *
 *   1. `alsoIn` — one tip, several files. businessModule is rendered by
 *      app/dashboard/[module]/page.tsx AND app/dashboard/page.tsx, with no
 *      shared component between them, so a check that reads `file` alone
 *      would confirm twelve modules and never notice Ideas losing its "?".
 *
 *   2. The coverage walk — "every dashboard page with a header carries a
 *      tip". A walk that finds nothing satisfies that sentence perfectly.
 *
 * So the mutations are both halves: the SOURCE going wrong (a page losing
 * its key, a page gaining a header nobody wrote a tip for, a claim in the
 * copy stopping being true of the code) and the GATE going blind (the walk
 * finding no files, the covered set going empty).
 *
 * Run: node scripts/tests/help-tips.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/help-tips.test.mjs";
const IDEAS = "src/app/dashboard/page.tsx";
const CHAT = "src/app/dashboard/chat/page.tsx";
const REGISTRY = "src/lib/help-tips.ts";
const CSV = "src/lib/data-analysis/csv.ts";
const AFFILIATE = "src/lib/affiliate/rules.ts";
const ROUTING = "src/app/dashboard/routing/page.tsx";
const WORKFLOW = "src/app/dashboard/trading-workflow/page.tsx";
const MESSAGES = ["en", "el", "zh", "ar"].map((l) => `messages/${l}.json`);
const CHAT_WORKSPACE = "src/components/chat/chat-workspace.tsx";

const TARGETS = [
  GATE,
  IDEAS,
  CHAT,
  REGISTRY,
  CSV,
  AFFILIATE,
  ROUTING,
  WORKFLOW,
  CHAT_WORKSPACE,
  ...MESSAGES,
];

// Editing a locale file as TEXT rather than as parsed JSON, so the mutation
// cannot accidentally reformat 2,600 keys and produce a diff nobody can read.
const localeEdit = (locale, from, to) => ({
  file: `messages/${locale}.json`,
  from,
  to,
});

const MUTANTS = [
  // ---- the second file of a shared tip ------------------------------
  {
    // THE BUG alsoIn EXISTS FOR. Ideas loses its "?" and the twelve
    // business modules keep theirs, so every count based on `file` is
    // still perfect.
    name: "Ideas loses the helpKey the business modules keep",
    file: IDEAS,
    from: '          helpKey="help.businessModule"\n',
    to: "",
    expect: "businessModule: src/app/dashboard/page.tsx passes helpKey",
  },
  {
    name: "the registry stops naming Ideas as a second file",
    file: REGISTRY,
    from: '    alsoIn: ["src/app/dashboard/page.tsx"],\n',
    to: "",
    expect: "every page with a header carries a tip",
  },

  // ---- the three that mount the tip themselves ----------------------
  {
    // The direct-mount branch. "On all of its headers" reads 0 === 0 on a
    // component with no PageHeader, so a deleted <HelpTip> would have
    // passed; this is the clause that replaced it.
    //
    // THIS ANCHOR WENT STALE ONCE, and the suite was right to stop rather
    // than report a pass. V4.6 #12 rebuilt the chat workspace and added
    // scopeKey to this element; the mutation's `from` still named the
    // one-attribute version, so it matched nothing and never ran. Reported
    // as STALE, exit 1 — which is the whole reason a missed anchor is kept
    // apart from a survivor: a suite that silently skips a mutation
    // reports the same "all caught" as one that ran it.
    name: "Chat loses the tip it mounts itself",
    file: CHAT_WORKSPACE,
    from: '          <HelpTip helpKey="help.chat" scopeKey="dashboard.chat.dataScope" />\n',
    to: "",
    expect: "chat: src/components/chat/chat-workspace.tsx passes helpKey",
  },
  {
    name: "a page with no header stops being answered anywhere",
    file: REGISTRY,
    from: '    route: "src/app/dashboard/create/page.tsx",\n',
    to: "",
    expect: "every page without a header is answered too",
  },

  // ---- a page appears that nobody wrote a tip for --------------------
  {
    // The real event this guards: somebody adds a dashboard page with a
    // title next year. Chat is the honest stand-in — it renders no
    // PageHeader today, by design.
    name: "a new page gains a header and no tip",
    file: CHAT,
    from: "export default async function ChatPage",
    to: "// <PageHeader title=\"x\" />\nexport default async function ChatPage",
    expect: "every page with a header carries a tip",
  },

  // ---- the gate going blind -----------------------------------------
  {
    name: "the coverage walk finds no pages at all",
    file: GATE,
    from: '    else if (entry.name === "page.tsx") dashboardPages.push(full);',
    to: "    else if (false) dashboardPages.push(full);",
    expect: "the scan found the dashboard pages",
  },
  {
    name: "the covered set forgets every file",
    file: GATE,
    from: "const covered = new Set(HELP_TIPS.flatMap((t) => [t.file, ...(t.alsoIn ?? [])]));",
    to: "const covered = new Set(HELP_TIPS.flatMap(() => []));",
    expect: "every page with a header carries a tip",
  },

  // ---- a claim in the copy stops being true of the code --------------
  {
    name: "the row cap moves and the tip still says 50,000",
    file: CSV,
    from: "export const MAX_ROWS = 50_000;",
    to: "export const MAX_ROWS = 20_000;",
    expect: "dataAnalysis: the row cap really is 50,000",
  },
  {
    name: "commission stops running twelve months",
    file: AFFILIATE,
    from: "export const COMMISSION_MONTHS = 12;",
    to: "export const COMMISSION_MONTHS = 6;",
    expect: "affiliate: commission really runs twelve months",
  },
  {
    name: "an owner-only page stops refusing",
    file: ROUTING,
    from: "  if (!isAdminEmail(user.email)) notFound();",
    to: "  void isAdminEmail;",
    expect: "routing: really is owner-only",
  },
  {
    // The tip says "the same rows as the Trading module". Point the page
    // at a table of its own and that sentence is a lie the compiler is
    // perfectly happy with.
    name: "the workflow page reads a table of its own",
    file: WORKFLOW,
    from: '.from("trades")',
    to: '.from("trading_workflow_rows")',
    expect: "tradingWorkflow: really reads the trading module's own rows",
  },

  // ---- the copy itself ----------------------------------------------
  {
    name: "an English doesNot stops stating a limit",
    ...localeEdit(
      "en",
      '"doesNot": "This is not the Files page.',
      '"doesNot": "Files is the other page.',
    ),
    expect: "en: every doesNot states a limit",
  },
  {
    name: "a Chinese tip repeats itself across two of its three parts",
    ...localeEdit(
      "zh",
      '"doesNot": "它没有代码仓库。',
      '"doesNot": "五件事：写一段代码、解释代码、找出缺陷并指明触发它的输入、在语言之间转换、编写测试。它没有代码仓库。',
    ),
    expect: 'zh: no tip repeats one string across its three parts',
  },
  {
    name: "two Greek pages end up with the same first line",
    ...localeEdit(
      "el",
      '"is": "Όλα τα σχετικά με το trading σε μία οθόνη.",',
      '"is": "Όλα για τα προϊόντα σου σε μία οθόνη.",',
    ),
    expect: 'el: no two pages share the same "is"',
  },
  {
    name: "an Arabic tip loses one of its three parts",
    ...localeEdit(
      "ar",
      '"doesNot": "لا يعرض رقمًا لا يستطيع تبريره.',
      '"doesNotX": "لا يعرض رقمًا لا يستطيع تبريره.',
    ),
    expect: "ar: every part resolves",
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
      // help-tips.test.mjs prints "  FAIL  <name>" and no summary list, so
      // this reads the line the gate actually writes rather than a list it
      // does not have. A parser that matched nothing would report every
      // mutation as WRONG, which is at least loud.
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("help-tips mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(
    `baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`,
  );
  if (!base.green) {
    console.log(
      `\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`,
    );
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const stale = edits.filter((e) => !originals.get(e.file).includes(e.from));
    if (stale.length > 0) {
      missed.push({
        ...m,
        why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}`,
      });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const byFile = new Map();
    for (const e of edits) {
      const current = byFile.get(e.file) ?? originals.get(e.file);
      byFile.set(e.file, current.replace(e.from, e.to));
    }
    if (
      [...byFile.entries()].every(([file, text]) => text === originals.get(file))
    ) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({
        ...m,
        why: "the gate stayed green — nothing here is load-bearing",
      });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({
        ...m,
        why: `the gate went red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(
        `  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`,
      );
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
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.",
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
