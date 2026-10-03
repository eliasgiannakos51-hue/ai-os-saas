#!/usr/bin/env node
/*
 * CAN key-inventory.test.mjs SEE AN INVENTORY THAT LIES, OR A CHECK THAT LEAKS?
 *
 * The inventory's `readBy` is a claim about the code, and the check is a
 * promise about a secret. Each mutation breaks one of them the way it
 * would really break: a stale path, a reader left off, a key that starts
 * being read without the entry noticing, a status mapped wrong, the key
 * in the result, a check that never times out, the owner gate gone.
 *
 * Run: node scripts/tests/key-inventory.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/key-inventory.test.mjs";
const INVENTORY = "src/lib/ai/providers/key-inventory.ts";
const ROUTE = "src/app/api/system-health/keys/route.ts";
const PAGE = "src/app/dashboard/system-health/page.tsx";
const EXAMPLE = ".env.local.example";
const PANEL = "src/components/system-health/key-checks.tsx";
const TARGETS = [GATE, INVENTORY, ROUTE, PAGE, EXAMPLE, PANEL];

const MUTANTS = [
  {
    name: "a readBy path goes stale (the file moved)",
    file: INVENTORY,
    from: 'readBy: ["src/lib/push/web-push.ts"],',
    // Built in pieces so the moved path is not itself a path in this file:
    // gate-import-paths requires every repository path in a gate to exist.
    to: 'readBy: ["src/lib/push/' + "moved-away" + '.ts"],',
    expect: "moved-away" + ".ts reads",
  },
  {
    name: "a real reader is left off readBy",
    file: INVENTORY,
    from: 'readBy: ["src/lib/ai/providers/registry.ts", "src/lib/voice/voice-providers.ts"],',
    to: 'readBy: ["src/lib/ai/providers/registry.ts"],',
    expect: "openai: no reader is left off readBy",
  },
  {
    name: "a key that IS read is listed as read by nothing",
    file: INVENTORY,
    from: '    readBy: ["src/lib/voice/voice-providers.ts"],\n    missing: null,',
    to: '    readBy: [],\n    missing: null,',
    expect: "elevenlabs: read by nothing, as it says",
  },
  {
    name: "a 401 is no longer reported as an invalid key",
    file: INVENTORY,
    from: 'if (status === 401) return "invalid";',
    to: 'if (status === 4010) return "invalid";',
    expect: "HTTP 401 -> invalid",
  },
  {
    name: "an unset key is sent to the provider anyway",
    file: INVENTORY,
    from: '  if (!envVar) return { id: entry.id, envVar: null, status: "not-set", httpStatus: null };\n',
    to: "",
    expect: "an unset key is not-set",
  },
  {
    name: "the key is returned in the result",
    file: INVENTORY,
    from: "return { id: entry.id, envVar, status: statusFromHttp(res.status), httpStatus: res.status };",
    to: "return { id: entry.id, envVar, key, status: statusFromHttp(res.status), httpStatus: res.status };",
    expect: "the result does not carry the key",
  },
  {
    name: "the check stops timing out",
    file: INVENTORY,
    from: "const timer = setTimeout(() => controller.abort(), timeoutMs);",
    to: "const timer = setTimeout(() => {}, timeoutMs);",
    expect: "a hanging provider times out as unreachable",
  },
  {
    name: "the check becomes a POST",
    file: INVENTORY,
    from: 'method: "GET",',
    to: 'method: "POST",',
    expect: "the check is a GET",
  },
  {
    name: "the route stops checking for the owner",
    file: ROUTE,
    from: "  if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false }, { status: 404 });\n",
    to: "",
    expect: "the route answers the owner alone",
  },
  {
    name: "the page claims every key is set",
    file: PAGE,
    from: "set: keyVarFor(entry, process.env) !== null,",
    to: "set: true,",
    expect: "the page passes whether a key is set",
  },
  {
    name: "the inventory gains a status the panel does not know",
    file: INVENTORY,
    from: '  "no-check",\n] as const;',
    to: '  "no-check",\n  "expired",\n] as const;',
    expect: "the panel's statuses are the inventory's",
  },
  {
    name: "the panel loses the words for a status",
    file: PANEL,
    from: '  "no-check": { text: "set — this provider has no free call to test it", tone: "text-muted" },\n',
    to: "",
    expect: "every status has words on the panel",
  },
  {
    name: "an inventoried key is dropped from the setup file",
    file: EXAMPLE,
    from: "DEEPGRAM_API_KEY=\n",
    to: "",
    expect: "DEEPGRAM_API_KEY is in .env.local.example",
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

console.log("key-inventory mutations\n");

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
