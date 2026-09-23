#!/usr/bin/env node
/*
 * CAN THE MEETINGS GATE SEE ITS THREE PROMISES BREAK?
 *
 * Each mutation is the feature going wrong in the way it would actually
 * go wrong, not a syntax error:
 *
 *   the audio gets somewhere to live
 *   an action is created without anybody choosing it
 *   the text comes from the request instead of the row
 *   a long recording is truncated instead of refused
 *   the browser derives its own ceiling
 *   the transcription is hinted with the interface locale
 *   the parser fills in a missing `what`
 *   ...and the two floors, because a gate that ranges over nothing passes.
 *
 * Run: node scripts/tests/meetings.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/meetings.test.mjs";
const MIGRATION = "supabase/migrations/20261006000000_meetings.sql";
const TRANSCRIBE = "src/app/api/meetings/transcribe/route.ts";
const ANALYSE = "src/app/api/meetings/[id]/analyse/route.ts";
const ACTIONS = "src/app/api/meetings/[id]/actions/route.ts";
const WORKSPACE = "src/components/meetings/meetings-workspace.tsx";
const LIMITS = "src/lib/meetings/meeting-limits.ts";
const ANALYSIS = "src/lib/meetings/meeting-analysis.ts";
const EL = "messages/el.json";

const TARGETS = [GATE, MIGRATION, TRANSCRIBE, ANALYSE, ACTIONS, WORKSPACE, LIMITS, ANALYSIS, EL];

const MUTANTS = [
  {
    // PROMISE 1. The audio gets a column, which is all it takes: a route
    // that has somewhere to put it eventually does.
    name: "the schema grows somewhere to keep the audio",
    file: MIGRATION,
    from: "  transcript text not null default '',",
    to: "  audio_path text,\n  transcript text not null default '',",
    expect: "no column in the schema could hold a recording",
  },
  {
    // ...and the other half: the blob reaches storage.
    name: "the upload is written to a bucket first",
    file: TRANSCRIBE,
    from: "    const result = await transcribeAudio({",
    to: "    await supabase.storage.from(\"user-files\").upload(`m/${user.id}`, audio);\n    const result = await transcribeAudio({",
    expect: "the route never puts the upload in storage",
  },
  {
    // PROMISE 2, and the way it would really happen: the analysis route
    // helpfully files what it found.
    name: "the analysis route files the actions it found",
    file: ANALYSE,
    from: "    const { data: row, error: writeError } = await supabase\n      .from(\"meetings\")",
    to: "    await supabase.from(\"meeting_actions\").insert(outcome.analysis.actions.map((a) => ({ user_id: user.id, meeting_id: meetingId, what: a.what })));\n    const { data: row, error: writeError } = await supabase\n      .from(\"meetings\")",
    expect: "exactly one route inserts into meeting_actions",
  },
  {
    // THE INJECTION. The route takes the sentence from the request, so
    // anything can be written into an action list and look as though a
    // meeting produced it.
    name: "the kept action's text comes from the request",
    file: ACTIONS,
    from: "        what: entry.proposal.what.trim(),",
    to: "        what: String((body as { what?: string }).what ?? entry.proposal.what).trim(),",
    expect: "the text is re-read from the row",
  },
  {
    // PROMISE 3. Truncation instead of refusal — the failure that cannot
    // be seen on the screen.
    name: "an over-long recording is cut down instead of refused",
    file: LIMITS,
    from: "  if (seconds > limits.maxSeconds) {",
    to: "  if (false) {",
    expect: "an over-long recording is refused",
  },
  {
    name: "the refusal stops carrying what is allowed",
    file: LIMITS,
    from: "      allowedBytes: limits.maxBytes,",
    to: "      allowedBytes: 0,",
    expect: "the refusal carries what it is AND what is allowed",
  },
  {
    // THE CLIENT/SERVER SPLIT. A browser reading process.env gets the
    // 800s default and offers a ceiling a 60s deployment refuses.
    name: "the browser derives its own ceiling",
    file: WORKSPACE,
    from: "  const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;",
    to: "  const derived = meetingLimits();\n  void derived;\n  const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;",
    expect: "the browser is handed the limits and does not derive them",
  },
  {
    // THE LANGUAGE. A hint biases detection towards the INTERFACE
    // locale, which is the one thing this feature must not do.
    name: "the transcription is hinted with the interface locale",
    file: TRANSCRIBE,
    from: "      durationSeconds: seconds,\n    });",
    to: "      durationSeconds: seconds,\n      languageHint: String(form.get(\"locale\") ?? \"\"),\n    });",
    expect: "the transcription is not hinted with the interface locale",
  },
  {
    // THE PARSER INVENTING. An action row with no `what` gets one made
    // out of `who`, and the list shows a commitment nobody made.
    name: "a missing action text is filled in from the name",
    file: ANALYSIS,
    from: "    if (what.length === 0) continue;\n    const action: ProposedAction = { what };",
    to: "    const action: ProposedAction = { what: what || clean(row.who, MAX_ACTION_CHARS) || \"(unnamed)\" };",
    expect: "an action with no `what` is dropped",
  },
  {
    // THE ARRAY. This one is not hypothetical — the parser accepted a
    // JSON array and returned its first element as the whole answer,
    // until this gate asked on 2026-09-23.
    name: "a JSON array is read as its first object again",
    file: ANALYSIS,
    // RE-ANCHORED on the guard that survived: the first version of the
    // parser had two, and this sidecar is what showed one of them was
    // doing nothing. The one that is left is the general one.
    from: '    if (text.slice(0, start).includes("[")) return null;',
    to: "    if (false) return null;",
    expect: "an array is not a reply",
  },
  {
    // THE TEN LANGUAGES. One locale copies another's sentence, which is
    // what an untranslated string actually looks like in this tree.
    name: "a locale's notice is the English one copied across",
    file: EL,
    from: '"audioNotice": "Ο ήχος διαγράφεται μόλις απομαγνητοφωνηθεί. Βεβαιώσου ότι όσοι μιλούν το γνωρίζουν."',
    to: '"audioNotice": "The audio is deleted the moment it is transcribed. Make sure the people speaking know."',
    expect: "no two locales share a sentence",
  },
  {
    // THE FLOOR UNDER THE POPULATION. A walk that finds no routes makes
    // "exactly one route inserts" pass over an empty list.
    name: "the route walk finds nothing",
    file: GATE,
    from: '      else if (e.name === "route.ts") routes.push(p);',
    to: '      else if (e.name === "route-nowhere.ts") routes.push(p);',
    expect: "api routes were found",
  },
  {
    // AND THE FLOOR UNDER THE SCHEMA READ. An unreadable migration makes
    // "no column could hold a recording" true of nothing.
    name: "the migration is read as empty",
    file: GATE,
    from: "  const sql = code(MIGRATION).toLowerCase();",
    to: '  const sql = "";',
    expect: "the migration exists to be read",
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

console.log("meetings mutations\n");

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
      missed.push({
        ...m,
        why: `red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"`,
      });
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
