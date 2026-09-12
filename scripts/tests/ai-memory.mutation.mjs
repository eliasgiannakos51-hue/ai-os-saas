#!/usr/bin/env node
/*
 * TWO PAGES CALLED "MEMORY", FIVE ROWS FOR ONE FACT, AND A HELP ARTICLE
 * THAT WAS HALF TRUE IN TEN LANGUAGES.
 *
 * The feature had three holes and they were not the same kind of hole. One
 * was a missing screen: the article promised you could see and delete what
 * the chat had kept, and there was a count and a "delete everything"
 * button. One was arithmetic: a bare `.insert()` meant saying your name in
 * twenty conversations filled the whole twenty-row prompt window with your
 * name. And one was a NAME — /dashboard/memory searched your own records
 * while its sidebar hint said "What the AI remembers about you."
 *
 * That third one is why this suite drives the unit gate hardest in the
 * BACKWARD direction. A gate checking only that the article's link resolves
 * would have passed on the day the bug was reported: the link worked, and
 * went somewhere else.
 *
 * TWO GATES. ai-memory.test.mjs reads the tree; chat-memory-store.itest.mjs
 * applies the migration to a real PostgreSQL and asks it whether A can see
 * B's memory and whether a duplicate writes a row. Each mutant names which
 * one has to notice.
 *
 * Run: node scripts/tests/ai-memory.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const UNIT = "scripts/tests/ai-memory.test.mjs";
const ITEST = "scripts/tests/chat-memory-store.itest.mjs";
const MEMORY = "src/lib/chat/memory.ts";
const PROMPT = "src/lib/chat/memory-prompt.ts";
const LIST = "src/components/memory/ai-memory-list.tsx";
const SEARCH_PAGE = "src/app/dashboard/search/page.tsx";
const OLD_ROUTE = "src/app/dashboard/memory/page.tsx";
const ARTICLE = "scripts/help-articles/en.mjs";
const MESSAGES_EN = "messages/en.json";
const MESSAGES_EL = "messages/el.json";
const CANARIES = "src/lib/health/schema-canaries.ts";
const MIG = "supabase/migrations/20261003000000_chat_memory_dedup_and_retention.sql";

const MUTANTS = [
  {
    // THE DEFECT ITSELF. A bare insert is what put five identical rows in
    // the table for one fact — and twenty of them fill the entire window
    // the prompt reads, pushing out everything else the chat knew.
    name: "the extractor goes back to a bare .insert()",
    gate: UNIT,
    file: MEMORY,
    from: 'const { error } = await supabase.rpc("chat_memory_record", {\n      p_memory_text: extracted,\n      p_memory_fold: memoryFold(extracted),\n      p_conversation_id: conversationId,\n    });',
    to: 'const { error } = await supabase.from("chat_memory").insert({\n      user_id: userId,\n      memory_text: extracted,\n      source_conversation_id: conversationId,\n    });',
    expect: "no longer does a bare .insert()",
  },
  {
    // THE READ ORDER. created_at is when a fact was FIRST learned; a fact
    // repeated every week for a year sorts behind a one-off from Tuesday
    // and falls out of the window it earned.
    name: "the read orders by created_at again, so repeated facts fall out of the window",
    gate: UNIT,
    file: MEMORY,
    from: '.order("last_seen_at", { ascending: false })',
    to: '.order("created_at", { ascending: false })',
    expect: "orders by last_seen_at",
  },
  {
    // "PREFERS X" AND "DID X ONCE", FLATTENED BACK INTO ONE SENTENCE. The
    // model is handed both with the same confidence, which is how a
    // passing remark becomes a standing preference.
    name: "the prompt stops saying whether a fact was repeated",
    gate: UNIT,
    file: PROMPT,
    from: "      return `- ${m.text} (${weight}${age})`;",
    to: "      return `- ${m.text}`;",
    expect: "presented as repeated",
  },
  {
    // THE ARTICLE POINTS BACK AT THE WRONG PAGE — the state this was
    // reported in, restored in one string.
    name: "the help article links to the record search again",
    gate: UNIT,
    file: ARTICLE,
    from: 'slug: "chat-memory", href: "/dashboard/ai-memory"',
    to: 'slug: "chat-memory", href: "/dashboard/memory"',
    expect: "its link is",
  },
  {
    // THE BACKWARD DIRECTION, AND THE ONE A LINK CHECK CANNOT SEE. The
    // article's link still resolves; a second page starts doing the thing
    // the article is about, and neither page is now the answer.
    name: "the record search starts reading chat_memory too",
    gate: UNIT,
    file: SEARCH_PAGE,
    from: "export default async function",
    to: 'const ALSO_READS = "chat_memory";\n\nexport default async function',
    expect: "does NOT touch chat_memory",
  },
  {
    // THE SENTENCE THAT WAS THE LIE, in the place it lived: the record
    // search's own hint, describing the other page.
    name: "the record search is described as what the AI remembers again",
    gate: UNIT,
    file: MESSAGES_EN,
    from: '"memory": "Search across everything you have saved."',
    to: '"memory": "What the AI remembers about you."',
    expect: "no longer described as what the AI remembers",
  },
  {
    // ONE NAME FOR TWO PAGES, IN ONE LANGUAGE. This is exactly how the
    // original confusion would come back: a translator, or a rename,
    // making them equal in Greek only — where nobody reading English
    // would ever see it.
    name: "the two pages get the same name in Greek",
    gate: UNIT,
    file: MESSAGES_EL,
    from: '"aiMemory": "Τι θυμάται"',
    to: '"aiMemory": "Αναζήτηση"',
    expect: "labels differ in all",
  },
  {
    // A BOOKMARK GETS A 404. The address was in the sidebar from the day
    // the page shipped.
    name: "the old address stops redirecting",
    gate: UNIT,
    file: OLD_ROUTE,
    from: 'permanentRedirect("/dashboard/search")',
    to: 'permanentRedirect("/dashboard/nowhere")',
    expect: "permanent redirect to the search page",
  },
  {
    // THE ✕ DELETES EVERYTHING. `.eq("user_id", …)` is the clear-all
    // filter; on the per-row button it removes the whole memory and the
    // toast still says one line was forgotten.
    name: "deleting one line deletes the whole memory",
    gate: UNIT,
    file: LIST,
    from: 'const { error } = await supabase.from("chat_memory").delete().eq("id", id);',
    to: 'const { error } = await supabase.from("chat_memory").delete().neq("id", "");',
    expect: "removes ONE row by id",
  },
  {
    // CORRECTION THAT CAN LOSE THE LINE. Delete first, and a failed insert
    // leaves the person with neither the old text nor the new.
    name: "correcting deletes the old line before writing the new one",
    gate: UNIT,
    file: LIST,
    from: "    setBusyId(row.id);\n    // DELETE FIRST",
    to: '    setBusyId(row.id);\n    await supabase.from("chat_memory").delete().eq("id", row.id);\n    // DELETE FIRST',
    expect: "writes the new line before removing the old",
  },
  {
    // A HAND-APPLIED MIGRATION WITH NO PROBE. This project's migrations
    // are pasted by a person; without a canary the first sign that one was
    // not pasted is a screen going dark.
    name: "the new objects lose their health canary",
    gate: UNIT,
    file: CANARIES,
    from: '    column: "times_seen",',
    to: '    column: "times_seen_renamed_away",',
    expect: "probes the new column",
  },
  {
    // THE FUNCTION STOPS BUMPING AND STARTS INSERTING — the same defect as
    // the bare insert, one level down, where the unique index turns it
    // into an error instead of a duplicate. Either way the fact is lost.
    name: "chat_memory_record inserts without looking for an existing row",
    gate: ITEST,
    file: MIG,
    from: "  update public.chat_memory\n     set times_seen   = times_seen + 1,",
    to: "  update public.chat_memory\n     set times_seen   = times_seen,",
    expect: "counter went up",
  },
  {
    // THE MERGE KEEPS THE WRONG ROW. Surviving with the NEWEST created_at
    // makes "learned {date}" on the page a lie about when the chat first
    // knew this — and the retention rule reads dates.
    name: "the backfill keeps the newest duplicate instead of the oldest",
    gate: ITEST,
    file: MIG,
    from: "             order by m.created_at, m.id\n             limit 1) as keep_id",
    to: "             order by m.created_at desc, m.id\n             limit 1) as keep_id",
    expect: "OLDEST created_at",
  },
  {
    // RETENTION EATS STABLE KNOWLEDGE. Dropping `times_seen = 1` turns the
    // rule into "old", which is the rule the brief specifically refused:
    // chat_memory holds properties, and a property does not expire because
    // time passed.
    name: "the retention rule stops protecting repeated facts",
    gate: ITEST,
    file: MIG,
    from: "   where r.times_seen = 1\n     and r.confirmed_at is null",
    to: "   where r.confirmed_at is null",
    expect: "only the said-once, old, unconfirmed row is prunable",
  },
  {
    // A READ-ANYTHING PRIMITIVE. SECURITY DEFINER on the prunable list
    // bypasses RLS, so it would return every account's rows to whoever
    // asked — and the page renders them.
    name: "the prunable list becomes SECURITY DEFINER",
    gate: ITEST,
    file: MIG,
    from: "returns table (id uuid, memory_text text, last_seen_at timestamptz, reason text)\nlanguage sql\nstable\nsecurity invoker",
    to: "returns table (id uuid, memory_text text, last_seen_at timestamptz, reason text)\nlanguage sql\nstable\nsecurity definer",
    expect: "prunable is NOT",
  },
  {
    // THE DEDUP KEY'S BACKSTOP. Without the unique index the ON CONFLICT
    // in chat_memory_record has nothing to infer against, so the recorder
    // raises — which is also what two extractions landing at once would
    // do to each other if it were merely absent. The first version of this
    // mutant took the whole itest down with it: the await rejected and the
    // runner could only say "exited non-zero with no FAIL line". The
    // recorder calls are guarded now, so the failure has a name.
    name: "the unique index on the fold is never created",
    gate: ITEST,
    file: MIG,
    from: "create unique index if not exists chat_memory_user_fold_uidx",
    to: "create index if not exists chat_memory_user_fold_uidx",
    expect: "nor a brand-new one",
  },
];

function runGate(gate) {
  try {
    execFileSync(process.execPath, [gate], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("ai-memory mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

let caught = 0;
const missed = [];
try {
  for (const gate of [UNIT, ITEST]) {
    const base = runGate(gate);
    console.log(`baseline: ${gate.replace("scripts/tests/", "")} is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
    if (!base.green) {
      console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
      process.exit(1);
    }
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, m.all ? original.split(m.from).join(m.to) : original.replace(m.from, m.to));
    let result;
    try { result = runGate(m.gate); } finally { restoreAll(); }
    if (result.green) {
      missed.push({ ...m, why: `${m.gate} stayed green — nothing here is load-bearing` });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = [UNIT, ITEST].map(runGate);
console.log(after.every((r) => r.green) ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.every((r) => r.green)) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("Neither the wrong page, nor a duplicate row, nor a deleted line taking others with it can happen without one of these two going red.");
