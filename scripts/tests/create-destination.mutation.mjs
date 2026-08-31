#!/usr/bin/env node
/*
 * CAN create-destination.test.mjs SEE THE CONFIRMATION GO SILENT AGAIN?
 *
 * The gate asserts a chain, not a line: the server names the module, the
 * outcome type carries the name, the hook puts it on the result, the UI
 * reads it. A chain is exactly the shape that fails quietly — break any
 * link and the label falls back to "Open it", which is what the user
 * reported in the first place. So every link gets its own mutation.
 *
 *   1. one type's result loses its name  (the five-of-six version)
 *   2. ...or its href, so the name has nowhere to go
 *   3. a name invented here instead of the sidebar's own key
 *   4. a sidebar key that no longer resolves in ten languages
 *   5. the module entry hardcodes one module's name for all of them
 *   6. the handler stops sending the module's title key
 *   7. the outcome stops reading it off the job result
 *   8. the label reverts to the generic string
 *   9. one locale drops the {where} placeholder
 *  10. a result mislabels its type, so a type has no confirmation
 *  11. the component takes the root namespace again
 *  12. the UI branches on the raw key instead of the split one
 *  13. the helper points at a different namespace
 *  14. the prefix test loses its separator
 *  15. the empty remainder is returned as a key
 *  16. the confirmation link loses the handle the browser gate reads
 *
 * And two on the gate itself, because a scan that finds nothing agrees
 * with everything:
 *
 *  17. the setResult scan matches no blocks
 *  18. the destinationKey scan matches no keys
 *
 * Run: node scripts/tests/create-destination.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/create-destination.test.mjs";
const HOOK = "src/lib/create-studio/use-create-studio.ts";
const OUTCOME = "src/lib/create-studio/create-via-job.ts";
const HANDLER = "src/lib/jobs/handlers/create.ts";
const UI = "src/components/create/create-studio.tsx";
const HELPER = "src/lib/create-studio/destination.ts";
const EL = "messages/el.json";
const TARGETS = [GATE, HOOK, OUTCOME, HANDLER, UI, HELPER, EL];

const MUTANTS = [
  {
    name: "the automation result loses its destination name",
    file: HOOK,
    from: '              destinationKey: "sidebar.items.automation",\n',
    to: "",
    expect: "every result carries a destinationKey",
  },
  {
    // A name with nowhere to go is a sentence, not a link.
    // RE-ANCHORED. The automation href stopped being a bare literal when
    // it learned to deep-link to the row it just created
    // (`?automation=<id>`), so this mutation applied to nothing.
    name: "the automation result loses its href",
    file: HOOK,
    // ASSEMBLED, not written out: the line contains a template literal,
    // so a template literal here would interpolate it away.
    from: [
      '              href: data.automation?.id',
      '                ? ' + "`" + '/dashboard/automation?automation=${encodeURIComponent(String(data.automation.id))}' + "`",
      '                : "/dashboard/automation",',
    ].join("\n"),
    to: "              href: null,",
    expect: "and an href",
  },
  {
    // The nav calls it one thing; a receipt that calls it another is the
    // same confusion in a different place.
    name: "a name invented for the receipt instead of the sidebar's",
    file: HOOK,
    from: 'destinationKey: "sidebar.items.websiteBuilder",',
    to: 'destinationKey: "createStudio.result.website",',
    expect: "every one is a sidebar item key",
  },
  {
    name: "a sidebar key that does not resolve",
    file: HOOK,
    from: 'destinationKey: "sidebar.items.documents",',
    to: 'destinationKey: "sidebar.items.docs",',
    expect: "resolves in all 10 locales",
  },
  {
    // Which module a free-text entry routed to is only known at run time.
    // A literal here is right for one module and wrong for the rest.
    name: "the module entry hardcodes one module's name",
    file: HOOK,
    from: "destinationKey: data.moduleTitleKey ?? null,",
    to: 'destinationKey: "sidebar.items.finance",',
    expect: "takes its destination from the routing result",
  },
  {
    name: "the handler stops sending the module's title key",
    file: HANDLER,
    from: "      moduleTitleKey: moduleConfig.titleKey,\n",
    to: "",
    expect: "returns the module's title key",
  },
  {
    name: "the outcome stops reading it off the job result",
    file: OUTCOME,
    from: "    moduleTitleKey: r.moduleTitleKey == null ? undefined : String(r.moduleTitleKey),\n",
    to: "",
    expect: "reads it off the job result",
  },
  {
    // The pre-fix label, put back.
    name: 'the label reverts to the generic "Open it"',
    file: UI,
    from:
      '                  ? t("madeItHere", {\n' +
      "                      where: tDestination(destinationLabelKey(studio.result.destinationKey)!),\n" +
      "                    })",
    to: '                  ? t("openCreated")',
    expect: "the link label uses the destination",
  },
  {
    // The whole point of the split. An unbounded translator here is not a
    // visible bug -- the label still reads correctly -- it just stops the
    // dashboard from ever being message-sliced again.
    name: "the component takes the root namespace again",
    file: UI,
    from: "useTranslations(DESTINATION_NAMESPACE)",
    to: "useTranslations()",
    expect: "declares the namespace instead of taking the root",
  },
  {
    // Branching on the raw key sends a destination this namespace cannot
    // name down the naming path, and the label renders a key at a user.
    name: "the UI branches on the raw key instead of the split one",
    file: UI,
    from: "                {destinationLabelKey(studio.result.destinationKey)\n",
    to: "                {studio.result.destinationKey\n",
    expect: "the choice is made on the split key",
  },
  {
    // Removing it does not change a pixel; it changes which element the
    // browser gate reads, and the nav has a link to the same place.
    name: "the confirmation link loses its handle",
    file: UI,
    from: '\n                data-testid="studio-destination-link"',
    to: "",
    expect: "the handle the browser gate reads",
  },
  {
    name: "the helper points at a different namespace",
    file: HELPER,
    from: 'export const DESTINATION_NAMESPACE = "sidebar";',
    to: 'export const DESTINATION_NAMESPACE = "dashboard";',
    expect: "the namespace is the sidebar's",
  },
  {
    // Without the dot, "sidebarItems.x" passes the prefix test and is
    // sliced at the wrong offset.
    name: "the prefix test loses its separator",
    file: HELPER,
    from: "  if (!destinationKey.startsWith(prefix)) return null;",
    to: "  if (!destinationKey.startsWith(DESTINATION_NAMESPACE)) return null;",
    expect: "a lookalike namespace is refused",
  },
  {
    name: "the empty remainder is returned as a key",
    file: HELPER,
    from: "  return rest.length > 0 ? rest : null;",
    to: "  return rest;",
    expect: "the bare namespace is refused",
  },
  {
    // Without {where} the sentence is "I made it here", full stop —
    // grammatical, translated, and useless.
    name: "the Greek string drops the placeholder",
    file: EL,
    from: '"madeItHere": "Το έφτιαξα εδώ → {where}"',
    to: '"madeItHere": "Το έφτιαξα εδώ"',
    expect: "el: madeItHere names a place",
  },
  {
    // Not a missing field — a present field on the wrong type. "Every
    // result has a name" stays true while one type has no result at all.
    name: "the document result reports itself as a website",
    file: HOOK,
    from: 'type: "document",',
    to: 'type: "website",',
    expect: "types produce a result",
  },
  {
    name: "GATE: the setResult scan matches no blocks",
    file: GATE,
    from: "/setResult\\(\\{([\\s\\S]*?)\\}\\);/g",
    to: "/setResultNothing\\(\\{([\\s\\S]*?)\\}\\);/g",
    expect: "the scan found result blocks",
  },
  {
    name: "GATE: the destinationKey scan matches no keys",
    file: GATE,
    from: '/destinationKey: "([^"]+)"/g',
    to: '/destinationKeyNothing: "([^"]+)"/g',
    expect: "literal destination keys found",
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

console.log("create-destination mutations\n");

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
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    // ONE occurrence, or the mutation is not the change it says it is.
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      missed.push({ ...m, why: `the anchor appears ${occurrences} times in ${m.file}` });
      console.log(`  AMBIG   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, original.replace(m.from, m.to));
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
console.log("Every clause of create-destination.test.mjs is load-bearing.");
