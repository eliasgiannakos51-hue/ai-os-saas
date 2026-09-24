#!/usr/bin/env node
/*
 * THE THREE PROMISES V6 #1 MAKES, HELD IN CODE RATHER THAN IN PROSE.
 *
 *   1. THE AUDIO IS NOT KEPT. Not "deleted promptly" — there is nowhere
 *      to put it. No column, no bucket, no storage path. A promise that
 *      is a `finally` block is a promise a function killed at its
 *      ceiling does not keep; a schema with no place to write it is a
 *      fact about the tree.
 *
 *   2. NO ACTION IS EVER CREATED AUTOMATICALLY. The model's reading goes
 *      into a jsonb column on the meeting row, where it is data about a
 *      meeting and an entity nowhere. `meeting_actions` has exactly one
 *      writer in the whole of src/app/api, and it needs indexes the user
 *      chose.
 *
 *   3. IT IS REFUSED, NEVER TRUNCATED, and the refusal carries both
 *      numbers. Half a meeting transcribed reads as a whole one.
 *
 * ...and the two that are about the ARRANGEMENT rather than the product:
 *
 *   4. The limits are computed on the SERVER and handed down.
 *      `process.env.MAX_FUNCTION_DURATION` is undefined in a browser, so
 *      a client deriving its own ceiling offers the 800s default on a 60s
 *      deployment and the server refuses what the screen invited.
 *
 *   5. The summary is in the MEETING'S language, not the reader's. That
 *      is a property of the prompt and of the absent language hint, and
 *      both are checkable without a model.
 *
 * WHERE IT LOOKS. §1-§5 read code. §6 runs the parser over real replies,
 * including the ones that should yield nothing. Nothing here needs a
 * provider, a database or a browser — which is also the limit of it, and
 * §7 says what that leaves unproven rather than implying it is covered.
 *
 * Run: node scripts/tests/meetings.test.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
};

const MIGRATION = "supabase/migrations/20261006000000_meetings.sql";
const TRANSCRIBE = "src/app/api/meetings/transcribe/route.ts";
const ANALYSE = "src/app/api/meetings/[id]/analyse/route.ts";
const ACTIONS = "src/app/api/meetings/[id]/actions/route.ts";
const WORKSPACE = "src/components/meetings/meetings-workspace.tsx";
const PAGE = "src/app/dashboard/meetings/page.tsx";
const LIMITS = "src/lib/meetings/meeting-limits.ts";
const ANALYSIS = "src/lib/meetings/meeting-analysis.ts";

const read = (f) => readFileSync(f, "utf8");
// COMMENTS ARE NOT CODE. Every file below is written with the reasoning
// in prose, and a check that matched the prose would pass on a tree
// where the code had been removed and the paragraph left behind.
const code = (f) => stripComments(read(f));

// ---------------------------------------------------------------------
console.log("== 1. there is nowhere to put the audio ==");
// ---------------------------------------------------------------------
{
  const sql = code(MIGRATION).toLowerCase();
  check("the migration exists to be read", sql.length > 500, `${sql.length} chars`);
  const AUDIO_SHAPES = ["audio", "recording", "blob", "storage_path", "bucket", "file_path", "media"];
  const found = AUDIO_SHAPES.filter((word) => new RegExp(`\\b\\w*${word}\\w*\\b\\s+(text|bytea|uuid|jsonb)`).test(sql));
  check("no column in the schema could hold a recording", found.length === 0, found.join(", "));
  check("...and the schema creates no bucket", !/storage\.buckets|storage\.objects/.test(sql));

  // THE ROUTE SIDE. A Blob that reaches `supabase.storage` or a global
  // is a Blob that outlives the invocation.
  const t = code(TRANSCRIBE);
  check("the route never puts the upload in storage", !/storage\s*\.\s*from\(/.test(t), TRANSCRIBE);
  check("...and never writes the blob to a table", !/audio\s*:/.test(t.replace(/form\.get\("audio"\)/g, "")));
  check(
    "the blob is read out of the form and goes straight to the provider",
    /transcribeAudio\(\{\s*\n?\s*audio,/.test(t),
    "if this stops being the same variable, something is holding a copy"
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2. no action is created automatically ==");
// ---------------------------------------------------------------------
{
  // THE POPULATION, not the two files this was written about: every
  // route in the tree, now and later. A fifth route that inserts into
  // meeting_actions fails here rather than shipping.
  const routes = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") routes.push(p);
    }
  };
  walk("src/app/api");
  check(`api routes were found (${routes.length})`, routes.length >= 100, "an empty walk proves nothing");

  const writers = routes.filter((f) => /from\("meeting_actions"\)[\s\S]{0,200}\.insert\(/.test(code(f)));
  check(
    `exactly one route inserts into meeting_actions (${writers.length})`,
    writers.length === 1 && writers[0] === ACTIONS,
    writers.join(", ") || "none — the keep button writes nothing"
  );

  const a = code(ANALYSE);
  check("the analysis route does not touch meeting_actions", !/meeting_actions/.test(a));
  check(
    "...it writes the model's reading into the jsonb column instead",
    /proposed_actions:\s*outcome\.analysis\.actions/.test(a)
  );

  const k = code(ACTIONS);
  check("the keep route requires chosen indexes", /body as \{ keep\?: unknown \}/.test(k));
  check(
    "...and refuses an empty choice rather than keeping everything",
    /chosen\.length === 0[\s\S]{0,200}nothing_chosen/.test(k)
  );
  // THE ONE THAT MATTERS MOST. If the route took the TEXT from the
  // request it would be a way to write any sentence into an action list
  // and have it look as though a meeting produced it.
  check(
    "the text is re-read from the row, never taken from the request",
    /what:\s*entry\.proposal\.what\.trim\(\)/.test(k) && /proposals\[index\]/.test(k),
    "the sentence must come out of the meeting row"
  );
  // ...AND THE REQUEST IS READ FOR EXACTLY ONE THING. The check above
  // says where `what` comes from; this one says nothing else can arrive.
  // THREE mentions is the whole of it: the declaration, the parse, and
  // the ONE property read off it. A fourth is a field this route was not
  // supposed to accept.
  check(
    `the request body is read for the index list and nothing else (${(k.match(/\bbody\b/g) ?? []).length} mentions)`,
    (k.match(/\bbody\b/g) ?? []).length === 3 && /body as \{ keep\?: unknown \}/.test(k),
    "the request carries indexes only"
  );
}

// ---------------------------------------------------------------------
console.log("\n== 3. refused, never truncated, and with both numbers ==");
// ---------------------------------------------------------------------
{
  const lim = await loadTs(LIMITS);
  const limits = { maxBytes: 4 * 1024 * 1024, maxSeconds: 1800 };

  const big = lim.checkMeetingUpload({ bytes: limits.maxBytes + 1, seconds: 60 }, limits);
  check("an oversized file is refused", big.ok === false && big.reason === "too_large");
  check(
    "...and the refusal carries what it is AND what is allowed",
    big.actualBytes === limits.maxBytes + 1 && big.allowedBytes === limits.maxBytes,
    JSON.stringify(big)
  );

  const long = lim.checkMeetingUpload({ bytes: 1000, seconds: limits.maxSeconds + 1 }, limits);
  check("an over-long recording is refused", long.ok === false && long.reason === "too_long");
  check(
    "...with both numbers again",
    long.actualSeconds === limits.maxSeconds + 1 && long.allowedSeconds === limits.maxSeconds
  );

  check("an empty file is refused", lim.checkMeetingUpload({ bytes: 0, seconds: 10 }, limits).ok === false);
  check("a file inside both limits is accepted", lim.checkMeetingUpload({ bytes: 1000, seconds: 60 }, limits).ok === true);
  // A DURATION THE BROWSER COULD NOT READ IS NOT A REFUSAL. The bytes
  // already bound the work, and refusing here would reject a valid file
  // because of a header some recorders do not write.
  check(
    "a duration of zero passes, because the bytes already bound it",
    lim.checkMeetingUpload({ bytes: 1000, seconds: 0 }, limits).ok === true
  );

  // NOTHING ANYWHERE SLICES THE AUDIO. Truncation is the alternative to
  // refusing and it is the one that cannot be seen on the screen.
  const t = code(TRANSCRIBE);
  check(
    "the route never slices the upload",
    !/audio\.slice\(|\.slice\(0,\s*MAX/.test(t),
    "a sliced upload produces a summary that reads complete"
  );
  check("the route runs the same check the browser ran", /checkMeetingUpload\(/.test(t));
  check("...and the browser runs it too", /checkMeetingUpload\(/.test(code(WORKSPACE)));
}

// ---------------------------------------------------------------------
console.log("\n== 4. the ceiling is computed on the server ==");
// ---------------------------------------------------------------------
{
  const lim = await loadTs(LIMITS);
  // THE RULE, FED REAL BUDGETS. A 60s deployment must not be told it can
  // take what an 800s one can.
  const small = lim.maxMeetingSeconds(60);
  const large = lim.maxMeetingSeconds(800);
  check(`a 60s budget yields a smaller ceiling than an 800s one (${small} < ${large})`, small < large);
  check(`...and neither is unbounded (${large} <= ${lim.MEETING_SECONDS_HARD_CAP})`, large <= lim.MEETING_SECONDS_HARD_CAP);
  check("...and neither is zero", small >= 60);

  const w = code(WORKSPACE);
  check(
    "the browser is handed the limits and does not derive them",
    !/maxMeetingSeconds|MAX_FUNCTION_DURATION|meetingLimits\(/.test(w),
    "process.env is undefined in a browser; a client deriving this offers what the server refuses"
  );
  check("...they arrive as a prop", /limits:\s*MeetingLimits/.test(w));
  check("the page computes them", /meetingLimits\(\)/.test(code(PAGE)));
}

// ---------------------------------------------------------------------
console.log("\n== 5. the summary is in the meeting's language ==");
// ---------------------------------------------------------------------
{
  const an = await loadTs(ANALYSIS);
  const greek = an.systemPrompt(an.languageNameFor("el"));
  check("the prompt names the language the meeting was in", /Greek/.test(greek), greek.slice(0, 120));
  check("...in capitals, as the instruction rather than as context", /GREEK/.test(greek));
  check(
    "an unknown language code does not become English",
    an.languageNameFor("xx") === an.UNKNOWN_LANGUAGE_NAME && an.languageNameFor(null) === an.UNKNOWN_LANGUAGE_NAME,
    `${an.languageNameFor("xx")} / ${an.languageNameFor(null)}`
  );
  check("a real one does", an.languageNameFor("ja") === "Japanese" && an.languageNameFor("ar") === "Arabic");

  // THE HINT IS ABSENT ON PURPOSE, and it is the opposite of what
  // api/voice/transcribe does. A hint biases detection towards the
  // INTERFACE locale, which is the one thing this feature must not do.
  const t = code(TRANSCRIBE);
  check(
    "the transcription is not hinted with the interface locale",
    !/languageHint/.test(t),
    "a Greek interface must not bias an English meeting"
  );
  check("...while the voice route still is, which is why this is worth checking",
    /languageHint/.test(code("src/app/api/voice/transcribe/route.ts")),
    "if voice stopped hinting too, the check above stops meaning anything");
  check(
    "the prompt forbids inventing a name",
    /mishears names|NAMES the person/.test(greek),
    "speech recognition mishears names; a wrong assignee is worse than none"
  );
}

// ---------------------------------------------------------------------
console.log("\n== 6. the parser turns a bad reply into nothing, never a guess ==");
// ---------------------------------------------------------------------
{
  const an = await loadTs(ANALYSIS);
  check("a well-formed reply parses", Boolean(an.parseAnalysis('{"summary":"We talked.","actions":[]}')));
  check("a fenced one parses too", Boolean(an.parseAnalysis('```json\n{"summary":"We talked.","actions":[]}\n```')));
  check("prose is not a reply", an.parseAnalysis("Sorry, I cannot do that.") === null);
  check("an empty summary is not a reply", an.parseAnalysis('{"summary":"  ","actions":[]}') === null);
  check("an array is not a reply", an.parseAnalysis('[{"summary":"x"}]') === null);
  check("null is not a reply", an.parseAnalysis(null) === null);

  const mixed = an.parseAnalysis(
    '{"summary":"Σύσκεψη.","actions":[{"who":"Γιώργος","what":"Στέλνει την προσφορά","when":"Παρασκευή"},{"who":"Μαρία","what":"   "},{"what":"Χωρίς όνομα"}]}'
  );
  check("an action with no `what` is dropped, not filled in from `who`", mixed.actions.length === 2, JSON.stringify(mixed));
  check("...and the one with no `who` keeps its text and loses the field", mixed.actions[1].what.length > 0 && mixed.actions[1].who === undefined);
  check("a named one keeps the name", mixed.actions[0].who === "Γιώργος");

  const many = an.parseAnalysis(
    JSON.stringify({ summary: "x".repeat(50), actions: Array.from({ length: 80 }, (_, i) => ({ what: `a${i}` })) })
  );
  check(`the list is bounded (${many.actions.length} <= ${an.MAX_PROPOSED_ACTIONS})`, many.actions.length <= an.MAX_PROPOSED_ACTIONS);

  check("a transcript of silence is not worth a model call", an.isAnalysable("ναι") === false);
  check("...and a real one is", an.isAnalysable("Λοιπόν, ξεκινάμε τη σύσκεψη για τον προϋπολογισμό του Μαρτίου.") === true);

  // THE TITLE IS NOT THE FILENAME, and the reason is that a recording is
  // called things like "Σύσκεψη με Παπαδόπουλο 14-03.m4a".
  check(
    "the title comes from the transcript",
    an.titleFromTranscript("Καλημέρα σε όλους, ξεκινάμε.", "fallback").startsWith("Καλημέρα")
  );
  check("...and falls back only when there is no transcript", an.titleFromTranscript("   ", "fallback") === "fallback");
  check(
    "no route reads the uploaded file's name",
    !/\.name\b/.test(code(TRANSCRIBE).replace(/filename:/g, "")),
    "a filename is often a person's name and a date"
  );
}

// ---------------------------------------------------------------------
console.log("\n== 7. what this file does NOT prove ==");
// ---------------------------------------------------------------------
// STATED, NOT IMPLIED. Everything above reads code and runs pure
// functions. None of it starts a browser, reaches Whisper or touches a
// database, so none of it can tell you that a real meeting comes back
// with a usable summary — or that the Greek names in it are right, which
// is the failure the prompt is written around and the one only a real
// recording can show.
{
  // NOT MEASURED BY LENGTH, and the first version of this was — `length
  // > 30`, which the Chinese notice fails at 29 characters while saying
  // everything the 86-character English one says. That is the third time
  // in one session that a rule about ten languages was written as a
  // number of characters (see lib/ui-text.mjs's floor and docs/shapes.md).
  //
  // DISTINCTNESS IS THE PROPERTY THAT ACTUALLY MATTERS and it is
  // script-neutral: ten notices that are all different are ten
  // translations; two that match are one translation and one oversight.
  const notices = readdirSync("messages")
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f, JSON.parse(readFileSync(`messages/${f}`, "utf8"))?.dashboard?.meetings?.audioNotice]);
  check(`the notice exists in every locale shipped (${notices.length})`,
    notices.length >= 10 && notices.every(([, n]) => typeof n === "string" && n.trim().length > 0),
    notices.filter(([, n]) => !n).map(([f]) => f).join(", ") || "the sentence the people in the recording depend on");
  check("...and no two locales share a sentence, so none is a copy of another",
    new Set(notices.map(([, n]) => n)).size === notices.length,
    "a duplicate is a language that was never translated");
  check(
    "the notice is rendered ABOVE the file picker, not after the upload",
    (() => {
      const w = code(WORKSPACE);
      return w.indexOf('audioNotice') < w.indexOf('inputRef.current?.click()');
    })(),
    "a sentence read after uploading is a sentence about something that already happened"
  );
  // THE PRODTEST EXISTS NOW, and it was written the same day. It drives
  // the three routes in a real production build against stand-in
  // providers, and it found two things this file could not: Whisper
  // returns a language NAME ("greek") where every unit test fed a code
  // ("el"), so the prompt was saying "held in the language it was
  // recorded in" for every meeting; and a JSON body reaching the keep
  // route with its own `what` — the injection §2 forbids — had never
  // actually been sent at one.
  //
  // This check is here so the pair cannot quietly become one file again.
  check(
    "the prodtest that proves the wiring exists",
    existsSync("scripts/tests/meetings.prodtest.mjs"),
    "node scripts/tests/meetings.prodtest.mjs — needs a build, not a browser"
  );
  check(
    "...and it reaches the providers by their own documented variables",
    (() => {
      const pt = read("scripts/tests/meetings.prodtest.mjs");
      return /OPENAI_BASE_URL/.test(pt) && /ANTHROPIC_BASE_URL/.test(pt);
    })(),
    "a stand-in reached any other way is a hook that exists only for tests"
  );
}

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`
);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
