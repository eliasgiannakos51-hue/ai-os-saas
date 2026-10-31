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
 *   a new reminder stops clearing the old one
 *   a reminder update loses its ownership check
 *   the reminder cron re-sends to a row it never claimed
 *   a merged line's seek time drifts to the wrong segment
 *   the per-line seek times stop coming from the real provider reply
 *   a click target stops checking it is the open meeting's own player
 *   an empty question about a meeting is answered instead of refused
 *   the "never invent" rule disappears from the ask prompt
 *   a summary stops reaching the ask prompt as its own section
 *   a transcript too short to analyse is asked about anyway
 *   a long question stops being bounded before it reaches the model
 *   a follow-up question settles under a different feature than its meeting's own analysis
 *   the answer is written through the user's own session instead of the service role
 *   a half-typed question follows the reader to a different meeting
 *   past questions stop being filtered to the open meeting
 *   the database stops refusing an insert from a signed-in user
 *   ...and the two floors, because a gate that ranges over nothing passes.
 *
 * Run: node scripts/tests/meetings.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/meetings.test.mjs";
const MIGRATION = "supabase/migrations/20261006000000_meetings.sql";
const QUESTIONS_MIGRATION = "supabase/migrations/20261104000000_meeting_questions.sql";
const TRANSCRIBE = "src/app/api/meetings/transcribe/route.ts";
const ANALYSE = "src/app/api/meetings/[id]/analyse/route.ts";
const ACTIONS = "src/app/api/meetings/[id]/actions/route.ts";
const REMIND = "src/app/api/meetings/[id]/actions/[actionId]/remind/route.ts";
const REMIND_CRON = "src/app/api/cron/meeting-action-reminders/route.ts";
const ASK = "src/app/api/meetings/[id]/ask/route.ts";
const ASK_LIB = "src/lib/meetings/meeting-ask.ts";
const WORKSPACE = "src/components/meetings/meetings-workspace.tsx";
const LIMITS = "src/lib/meetings/meeting-limits.ts";
const ANALYSIS = "src/lib/meetings/meeting-analysis.ts";
const EL = "messages/el.json";

const TARGETS = [
  GATE,
  MIGRATION,
  QUESTIONS_MIGRATION,
  TRANSCRIBE,
  ANALYSE,
  ACTIONS,
  REMIND,
  REMIND_CRON,
  ASK,
  ASK_LIB,
  WORKSPACE,
  LIMITS,
  ANALYSIS,
  EL,
];

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
    from: "      diarize: true,\n    });",
    to: "      diarize: true,\n      languageHint: String(form.get(\"locale\") ?? \"\"),\n    });",
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
    // Κομμάτι 3. Consecutive segments from the same speaker stop
    // merging, so every short diarized chunk becomes its own line — the
    // defect "A: Hello\nA: how are you" instead of one line.
    name: "speaker turns stop merging, every segment gets its own line",
    file: ANALYSIS,
    from: "    if (segment.speaker !== currentRaw) {\n      flush();\n      currentRaw = segment.speaker;\n      currentStart = segment.start;\n    }",
    to: "    flush();\n    currentRaw = segment.speaker;\n    currentStart = segment.start;",
    expect: "consecutive turns from the SAME speaker merge into one line",
  },
  {
    // Κομμάτι 3. The Greek word for speaker leaks into every language,
    // which is the new-English-sentence-shaped defect in reverse: a
    // Greek word asserted onto a transcript that was never in Greek.
    name: "the Greek speaker word is used for every language, not only Greek",
    file: ANALYSIS,
    from: '  const prefix = language === "el" ? "Ομιλητής" : null;',
    to: '  const prefix = "Ομιλητής";',
    expect: "a non-Greek meeting gets the bare letter",
  },
  {
    // Κομμάτι 3. The title starts reading the speaker-labelled text, so
    // every meeting's title in the list begins "A: " or "Ομιλητής A: ".
    name: "the title is derived from the speaker-labelled transcript",
    file: TRANSCRIBE,
    from: "title: titleFromTranscript(result.text, fallbackTitle),",
    to: "title: titleFromTranscript(transcriptText, fallbackTitle),",
    expect: "the TITLE is still derived from the plain text",
  },
  {
    // Κομμάτι 3. transcribeAudio is called without diarize, so Meetings
    // quietly goes back to whisper-1 with no speakers at all —
    // Κομμάτι 1's screen with Κομμάτι 1's own transcript, nothing new.
    name: "the meetings route stops asking for diarization",
    file: TRANSCRIBE,
    from: "      diarize: true,\n    });",
    to: "    });",
    expect: "the transcribe route asks for diarization",
  },
  {
    // Κομμάτι 4. A new remind_at is saved but the old reminded_at stays
    // set, so a reminder moved to a new day never fires — the cron's
    // `.is("reminded_at", null)` filter skips it forever.
    name: "a new reminder no longer clears the old reminded_at",
    file: REMIND,
    from: '      .update({ remind_at: reminder.at, reminded_at: null })',
    to: '      .update({ remind_at: reminder.at })',
    expect: "setting a new remind_at clears reminded_at",
  },
  {
    // Κομμάτι 4. Ownership drops off the update, so one account's PATCH
    // could move a reminder on another account's kept action.
    name: "the remind route stops checking who owns the action",
    file: REMIND,
    from: '      .eq("user_id", user.id)\n      .select("id, remind_at, reminded_at")',
    to: '      .select("id, remind_at, reminded_at")',
    expect: "the update is scoped to the caller's own id AND their action",
  },
  {
    // Κομμάτι 4. The cron stops skipping a row it did not just claim, so
    // every due action is pushed again on every 15-minute tick forever.
    name: "the cron pushes to a row it never actually claimed",
    file: REMIND_CRON,
    from: "      if (!claimed) continue;",
    to: "      void claimed;",
    expect: "a row already claimed by a concurrent run is skipped",
  },
  {
    // Κομμάτι 5. A merged line's start creeps forward to the LAST
    // original segment it swallowed instead of staying at the first —
    // clicking it would seek past however much the speaker already said.
    name: "a merged line's start drifts to the last segment, not the first",
    file: ANALYSIS,
    from: "    if (segment.speaker !== currentRaw) {\n      flush();\n      currentRaw = segment.speaker;\n      currentStart = segment.start;\n    }\n    currentWords.push(text);",
    to: "    if (segment.speaker !== currentRaw) {\n      flush();\n      currentRaw = segment.speaker;\n    }\n    currentStart = segment.start;\n    currentWords.push(text);",
    expect: "keeps the EARLIER segment's start",
  },
  {
    // Κομμάτι 5. The per-line times stop being computed from the
    // provider's own segments, so every click would seek to nothing.
    name: "the route stops computing per-line seek times from the real segments",
    file: TRANSCRIBE,
    from: "const transcriptLines = diarizedTranscriptLines(result.segments ?? [], detectedLanguageCode);",
    to: "const transcriptLines = [];",
    expect: "computed from the provider's own reply",
  },
  {
    // Κομμάτι 5. The unsaved-fallback response stops carrying the lines,
    // so a meeting that failed to write still cannot be seeked in THIS
    // same tab even though the clip is still sitting right there.
    name: "the unsaved-fallback response drops the per-line seek times",
    file: TRANSCRIBE,
    from: "        lines: transcriptLines,",
    to: "",
    expect: "returned on BOTH outcomes",
  },
  {
    // Κομμάτι 5. The click target stops checking it is THIS meeting's
    // own player, so stale lines from a previous clip could render as
    // clickable over a meeting that has nothing in this tab to seek.
    name: "a transcript line's click target drops the open-meeting check",
    file: WORKSPACE,
    from: "{playerLines && playerMeetingId === open.id && playerLines.length > 0 ? (",
    to: "{playerLines && playerLines.length > 0 ? (",
    expect: "the SAME condition the player element itself is",
  },
  {
    // Κομμάτι 5. Deleting the open meeting stops clearing its lines, so
    // a stale line list could outlive the player it was seeking for.
    name: "deleting the open meeting stops clearing its transcript lines",
    file: WORKSPACE,
    from: "      setPlayerMeetingId(null);\n      setPlayerLines(null);\n    }",
    to: "      setPlayerMeetingId(null);\n    }",
    expect: "resets playerLines alongside it",
  },
  {
    // Κομμάτι 6. An empty (whitespace-only) question stops being refused,
    // so a blank press of the field would be sent to the model and
    // charged for.
    name: "an empty question stops being refused before the call",
    file: ASK_LIB,
    from: '  if (!trimmed) return { ok: false, reason: "empty" };',
    to: "",
    expect: "an empty question is refused",
  },
  {
    // Κομμάτι 6. The "never invent" rule disappears from the system
    // prompt, so a model with nothing to go on could answer anyway
    // rather than say the meeting does not address the question.
    name: "the ask prompt stops forbidding an invented answer",
    file: ASK_LIB,
    from: "Never invent a name, a date or a decision that is not there. If the meeting does not address the question, say so plainly rather than guessing. ",
    to: "",
    expect: "the rule against inventing an answer is in the SYSTEM prompt",
  },
  {
    // Κομμάτι 6. The summary stops reaching the prompt as its own
    // section, so a question the SUMMARY would answer (but the raw
    // transcript's wording would not) loses that context.
    name: "the ask prompt stops adding the meeting's own summary",
    file: ASK_LIB,
    from: 'if (summary && summary.trim()) parts.push(`SUMMARY:\\n${summary.trim()}`);',
    to: "",
    expect: "added as its own section",
  },
  {
    // Κομμάτι 6. The route stops refusing a transcript too short to
    // analyse, so a model call could be made and charged for over a
    // handful of words with nothing to answer from.
    name: "the ask route stops refusing a transcript too short to answer from",
    file: ASK,
    from: "    if (!isAnalysable(transcript)) {",
    to: "    if (false) {",
    expect: "too short to ask about",
  },
  {
    // Κομμάτι 6. The question stops being bounded before it is sized and
    // sent, so a message far longer than this feature is for could be
    // charged and sent as though it were a short question.
    name: "the ask route stops bounding the question's length",
    file: ASK,
    from: ".trim().slice(0, MEETING_ASK_MAX_QUESTION_CHARS) : \"\";",
    to: '.trim() : "";',
    expect: "bounded by slicing",
  },
  {
    // Κομμάτι 6. A follow-up question settles under its own feature key
    // instead of the meeting's own — the margin and the owner's own
    // per-feature numbers would then be read against the wrong bucket.
    name: "the ask route settles under a different feature than its meeting's own analysis",
    file: ASK,
    from: 'feature: "meeting_analyse",\n      costs,\n      plan,\n      bypassCharge: bypass,\n      metadata: { meetingId, kind: "question" },',
    to: 'feature: "meeting_ask",\n      costs,\n      plan,\n      bypassCharge: bypass,\n      metadata: { meetingId, kind: "question" },',
    expect: "the SAME feature the meeting's own analysis settles under",
  },
  {
    // Κομμάτι 6. The answer is written through the caller's OWN session
    // client instead of the service role — the same mistake
    // data_analysis_questions' own grant exists to make impossible in
    // the database, now made possible again in the route that writes it.
    name: "the ask route writes the answer through the user's own session instead of the service role",
    file: ASK,
    from: "    const admin = createAdminClient();",
    to: "    const admin = supabase;",
    expect: "written by the SERVICE-ROLE client",
  },
  {
    // Κομμάτι 6. Switching meetings stops clearing the half-typed
    // question, so a draft about one meeting could be pressed into a
    // different one after a reader clicks another row.
    name: "switching meetings stops clearing the half-typed question",
    file: WORKSPACE,
    from: 'setOpenId(m.id);\n                setTicked(new Set());\n                setAskDraft("");\n                setAskError(null);',
    to: "setOpenId(m.id);\n                setTicked(new Set());",
    expect: "clears the draft and any error",
  },
  {
    // Κομμάτι 6. Past questions stop being filtered to the open meeting,
    // so every meeting's history would render under whichever one is
    // currently open.
    name: "past questions stop being filtered to the open meeting",
    file: WORKSPACE,
    from: "const askedForOpen = asked.filter((q) => q.meeting_id === open?.id);",
    to: "const askedForOpen = asked;",
    expect: "filtered to the open meeting",
  },
  {
    // THE DATABASE ITSELF. If this grant is ever restored, a signed-in
    // user could insert their own row into meeting_questions — a free
    // answer in the product's own voice, or a real one marked as
    // costing nothing.
    name: "the database stops refusing an insert from a signed-in user",
    file: QUESTIONS_MIGRATION,
    from: "revoke insert, update on public.meeting_questions from authenticated;",
    to: "",
    expect: "insert is revoked from authenticated",
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
