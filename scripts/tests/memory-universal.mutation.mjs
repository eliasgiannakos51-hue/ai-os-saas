#!/usr/bin/env node
/*
 * CAN THE GATE SEE THE MEMORY LEAK, OR THE CACHE BREAK?
 *
 * The one the owner asked for by name is first: a feature reading another
 * person's memory must go red. The rest are the ways the four guarantees
 * could be undone without anyone meaning to — the user filter dropped on
 * the one path where RLS is not in force, the fold lookup removed so
 * every repetition becomes a row, the block moved in front of the static
 * prefix so nothing caches, the switch defaulting to off.
 *
 * Run: node scripts/tests/memory-universal.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/memory-universal.test.mjs";
const STORE = "src/lib/memory/store.ts";
const POLICY = "src/lib/memory/memory-policy.ts";
const SURFACES = "src/lib/memory/surfaces.ts";
const SQL = "supabase/migrations/20261007000000_universal_memory.sql";
const BUILDER = "src/lib/website-builder.ts";
const POSTS = "src/lib/posts/generate.ts";
const ROUTE = "src/app/api/memory/surfaces/route.ts";
const AGENT = "src/lib/agents/execute-agent.ts";

const TARGETS = [GATE, STORE, POLICY, SURFACES, SQL, BUILDER, POSTS, ROUTE, AGENT];

const MUTANTS = [
  {
    // 🔴 THE ONE ASKED FOR. The loader stops scoping to the caller, so
    // every feature reads whatever the newest rows in the table are —
    // and on the agent path, where the client is service-role and RLS
    // does not apply, that is somebody else's memory in a prompt.
    name: "a feature reads memory that is not the caller's",
    file: STORE,
    from: '.eq("user_id", userId)',
    to: '.neq("user_id", "00000000-0000-0000-0000-000000000000")',
    expect: "the shared loader filters by user_id",
  },
  {
    // THE SAME LEAK, ONE LAYER UP: the agent path hands the loader the
    // wrong identity. RLS cannot catch this one either.
    name: "the agent run loads memory under the wrong id",
    file: AGENT,
    from: "await memoryPromptFor(admin, userId,",
    to: "await memoryPromptFor(admin, agent.user_id ?? userId,",
    expect: "passes the authenticated id",
  },
  {
    // THE WRITE BECOMES FORGEABLE. An insert from the client needs a
    // user_id column, which is a write-anything primitive.
    name: "the write stops going through the SECURITY DEFINER function",
    file: STORE,
    from: 'await supabase.rpc("memory_record", {',
    to: 'await supabase.from("chat_memory").insert({',
    expect: "the write goes through the SECURITY DEFINER function",
  },
  {
    // THE FUNCTION TAKES A USER ID. Same defect, in SQL.
    name: "memory_record accepts a user id argument",
    file: SQL,
    from: "  p_conversation_id uuid\n)\nreturns uuid\nlanguage plpgsql",
    to: "  p_conversation_id uuid,\n  p_user_id uuid\n)\nreturns uuid\nlanguage plpgsql",
    expect: "takes its user from auth.uid()",
  },
  {
    // EVERY REPETITION BECOMES A NEW ROW, which is the defect
    // 20261003000000 was written to fix, returning through the new
    // function.
    name: "the fold lookup is removed, so a repeated fact is a new row",
    file: SQL,
    from: "     and memory_fold = p_memory_fold",
    to: "     and memory_fold is not null",
    expect: "looks the fact up by its FOLD",
  },
  {
    // THE COUNTER STOPS MOVING, so "prefers X" can never be told from
    // "did X once" again.
    name: "times_seen stops incrementing",
    file: SQL,
    from: "     set times_seen   = times_seen + 1,",
    to: "     set times_seen   = times_seen,",
    expect: "bumps times_seen when it finds one",
  },
  {
    // THE DEDUP KEY GAINS THE SURFACE, which splits one fact's counter
    // five ways — every fact reads as "mentioned once" for ever.
    name: "the dedup key is widened to include the surface",
    file: SQL,
    from: "create index if not exists chat_memory_user_surface_last_seen_idx",
    to: "create unique index if not exists chat_memory_user_surface_fold_idx\n  on public.chat_memory (user_id, surface, memory_fold);\ncreate index if not exists chat_memory_user_surface_last_seen_idx",
    expect: "NOT (user_id, surface, fold)",
  },
  {
    // AN UNKNOWN SURFACE COERCED TO 'chat' — invisible in the
    // per-feature list, impossible to switch off, and the setting looks
    // ignored.
    name: "an unknown surface is defaulted instead of refused",
    file: SQL,
    from: "    raise exception 'memory_record: unknown surface %', p_surface using errcode = '22023';",
    to: "    p_surface := 'chat';",
    expect: "refuses an unknown surface",
  },
  {
    // THE CACHE BREAKS. The memory goes in front of the 8,150-token
    // system prompt, so the prefix differs per user and the expensive
    // half stops hitting.
    name: "the memory block moves in front of the website system prompt",
    file: BUILDER,
    from: "    { type: \"text\", text: SYSTEM_PROMPT, cache_control: { type: \"ephemeral\" } },",
    to: "    ...(memoryBlock ? [{ type: \"text\" as const, text: memoryBlock }] : []),\n    { type: \"text\", text: SYSTEM_PROMPT, cache_control: { type: \"ephemeral\" } },",
    expect: "SYSTEM_PROMPT first and the memory after it",
  },
  {
    // THE SAME BREAK, in a generator that had it right.
    name: "posts concatenates the memory into its static prefix",
    file: POSTS,
    from: "          staticPrefix: buildPostsSystemPrompt(),\n          perUserBlock: params.memoryBlock ?? \"\",",
    to: "          staticPrefix: buildPostsSystemPrompt() + (params.memoryBlock ?? \"\"),",
    expect: "passes it as perUserBlock",
  },
  {
    // DEFAULT-OFF. Every surface added later is dead for every existing
    // account, and "no entry" is indistinguishable from "switched off".
    name: "an unset switch is read as off",
    file: POLICY,
    from: "  return !disabledSurfaces(user).includes(surface);",
    to: "  return disabledSurfaces(user).includes(surface);",
    expect: "an unset switch means ON",
  },
  {
    // THE GLOBAL SWITCH STOPS GOVERNING. Somebody who turned memory off
    // in Settings did not mean "except in the deck writer".
    name: "the global switch no longer turns every feature off",
    file: POLICY,
    from: '  if (user?.user_metadata?.chat_memory_enabled === false) return false;',
    to: '  if (false) return false;',
    expect: "the global switch turns every feature off",
  },
  {
    // READ AND WRITE DISAGREE AGAIN. A plan with no allowance reads
    // nothing and writes anyway — the exact defect lib/chat/memory-policy
    // records, which charged a second model call per message for rows
    // nothing would read.
    name: "a plan with no allowance is treated as active",
    file: POLICY,
    from: "  if (planLimit <= 0) return false;",
    to: "  if (planLimit < 0) return false;",
    expect: "a plan with no memory allowance is off",
  },
  {
    // THE SWITCH LIES. The route echoes the request instead of what it
    // stored, so a failed write reads as a working switch.
    name: "the settings route echoes the request instead of what it stored",
    file: ROUTE,
    from: "disabled: disabledSurfaces(data.user)",
    to: "disabled",
    expect: "answers with what was stored",
  },
  {
    // THE TWO LISTS DRIFT. A surface the database refuses is a feature
    // whose every write throws.
    name: "the code knows a surface the database does not",
    file: SURFACES,
    from: '  { id: "agent", labelKey: "agent", href: "/dashboard/agents" },',
    to: '  { id: "agent", labelKey: "agent", href: "/dashboard/agents" },\n  { id: "telepathy", labelKey: "agent", href: "/dashboard/agents" },',
    expect: "the code lists the same ones",
  },
  {
    // THE POPULATION EMPTIED. A derived reader list that comes back
    // empty proves nothing and reads as clean.
    name: "the reader scan finds nothing",
    file: GATE,
    from: '})("src");',
    to: '})("src/lib/memory");',
    expect: "files that read the table were found",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]) };
  }
}

console.log("memory-universal mutations\n");

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
    console.log(`\nBASELINE IS RED — nothing below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const mutated = originals.get(m.file).replace(m.from, () => m.to);
    if (mutated === originals.get(m.file)) {
      missed.push({ ...m, why: "the mutation left the file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, mutated);
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
      missed.push({ ...m, why: `red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`);
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
console.log("Every clause of the gate is load-bearing.");
