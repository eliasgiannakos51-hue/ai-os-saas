/**
 * THE TRANSCRIPT BECOMES A SUMMARY AND A LIST OF PROPOSALS.
 *
 * The rules live here and the provider call lives in
 * lib/meetings/meeting-analyse-call.ts, the same split as
 * lib/website-greek-spelling.ts: importing the Anthropic chain into this
 * file would drag it out of reach of scripts/tests, and the rules are
 * exactly the part that has to be tested.
 *
 * ---------------------------------------------------------------------
 * THE LANGUAGE IS THE MEETING'S, NOT THE INTERFACE'S
 * ---------------------------------------------------------------------
 *
 * A Greek meeting read by somebody whose interface is in English still
 * happened in Greek. Summarising it in English is a translation nobody
 * asked for, and it is worse than that for the action list: the whole
 * value of "who, what, when" is that the user can paste it back to the
 * room, and the room speaks Greek.
 *
 * So the detected language is an INSTRUCTION in the prompt, and it comes
 * from the transcription provider rather than from the locale cookie.
 *
 * ---------------------------------------------------------------------
 * WHISPER GETS NAMES WRONG, AND A WRONG NAME IS THE EXPENSIVE ERROR
 * ---------------------------------------------------------------------
 *
 * Greek names in particular: a transcript will say «Γιώργος» where the
 * room heard «Γιώργο», or turn a surname into a word. An action list that
 * confidently assigns a task to a misheard name is worse than one that
 * leaves the column empty — the user can fill a blank, and will not
 * notice a plausible mistake.
 *
 * So `who` is allowed to be absent and the prompt says so twice: once as
 * a rule, once as the reason. Nothing in the parser invents one.
 */

// FOLDED, NOT LOWER-CASED. `.toLowerCase()` into a variable that is then
// compared elsewhere is the shape scripts/tests/accent-search.test.mjs
// holds at zero, and for a good reason even here: Turkish lower-cases I
// to a dotless ı, and a language name arriving from a provider is not
// this file's to assume is ASCII. foldForMatch is what the rest of the
// tree matches with.
import { foldForMatch } from "@/lib/text/unicode-patterns";

export type ProposedAction = {
  /** The person the meeting named. Absent when the meeting named nobody. */
  who?: string;
  /** What was agreed. Required — an action with no action is not one. */
  what: string;
  /** The meeting's own words for when: «μέχρι την Παρασκευή», "next sprint". */
  when?: string;
};

export type MeetingAnalysis = {
  summary: string;
  actions: ProposedAction[];
};

/** Guards against a transcript that is mostly silence or one word. */
export const MIN_ANALYSABLE_CHARS = 40;

/** What the model is allowed to propose from one meeting. A list of
 *  forty is not a list, it is the transcript again with bullets. */
export const MAX_PROPOSED_ACTIONS = 25;

export const MAX_SUMMARY_CHARS = 2000;
export const MAX_ACTION_CHARS = 400;

export function systemPrompt(languageName: string): string {
  return [
    `You are given the transcript of a meeting held in ${languageName}.`,
    "",
    `WRITE EVERYTHING IN ${languageName.toUpperCase()}. Not in English, not in the`,
    "reader's language — in the language the meeting was held in. The summary and",
    "every action are going to be read by the people who were in the room.",
    "",
    "Reply with JSON and nothing else, in this exact shape:",
    '{"summary": "...", "actions": [{"who": "...", "what": "...", "when": "..."}]}',
    "",
    "RULES:",
    "1. `summary` is a short account of what was decided and what was discussed.",
    "   Plain sentences. No headings, no bullets, no preamble.",
    "2. `actions` is what somebody agreed to DO. Not topics, not opinions, not",
    "   things that were merely mentioned. If nothing was agreed, return [].",
    "3. `who` is only present when the transcript NAMES the person. Leave it out",
    "   otherwise. This transcript came from speech recognition, which mishears",
    "   names — an action assigned to the wrong person is worse than one assigned",
    "   to nobody, because the reader will not notice it is wrong.",
    "4. `when` is only present when the meeting said when, and it is the meeting's",
    "   own words. Do not convert them to a date and do not invent a deadline.",
    "5. Never invent an action that is not in the transcript. A short list that is",
    "   right is the product; a long list that is plausible is the failure.",
    `6. At most ${MAX_PROPOSED_ACTIONS} actions.`,
  ].join("\n");
}

/** Trim without cutting a word in half, and never return whitespace. */
function clean(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= maxChars) return flat;
  const cut = flat.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/** An optional field: present only when it says something. */
function optional(value: unknown, maxChars: number): string | undefined {
  const text = clean(value, maxChars);
  return text.length > 0 ? text : undefined;
}

/**
 * THE MODEL'S REPLY, TURNED INTO DATA OR INTO NOTHING.
 *
 * Never into a guess. A reply that does not parse, or that parses into a
 * shape this does not recognise, yields `null` and the caller shows the
 * transcript with an error code beside it — because the alternative is an
 * action list assembled out of whatever happened to be in the string,
 * presented with the same confidence as a real one.
 *
 * A fenced ```json block is unwrapped, because models emit one about a
 * third of the time whatever the instruction says, and refusing it would
 * be refusing a correct answer over its packaging.
 */
export function parseAnalysis(raw: string | null | undefined): MeetingAnalysis | null {
  if (typeof raw !== "string") return null;
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();
  // A model that prefaces the JSON with a sentence: take the outermost
  // object rather than failing, but ONLY an object — taking the first
  // `{` to the last `}` of arbitrary prose is how a parser starts
  // inventing.
  // A JSON ARRAY IS NOT A REPLY, and this used to accept one.
  //
  // The recovery below takes the outermost `{...}` out of a model that
  // prefaced its JSON with a sentence. Given `[{"summary":"x"}, ...]` it
  // did the same thing — took the FIRST object out of a list and
  // returned it as though it were the whole answer. That is the parser
  // inventing, which is the one thing the paragraph above says it must
  // not do: a list of somethings is a model that misread the shape, and
  // its first element is not a summary of the meeting.
  //
  // Found on 2026-09-23 by scripts/tests/meetings.test.mjs, which asked.
  //
  // ONE GUARD, NOT TWO. The first version had `if (text.startsWith("["))
  // return null;` above this as well, and the mutation sidecar showed it
  // was not load-bearing: removing it left the gate green, because the
  // bracket check below already refuses a bare array (the slice before
  // the first `{` is "["). The line that survives is the more general
  // one — it also refuses "Here you go: [{...}]", which the other missed.
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    // IF A BRACKET COMES BEFORE THE FIRST BRACE, this is a list, and its
    // first element is not a summary of the meeting.
    if (text.slice(0, start).includes("[")) return null;
    text = text.slice(start, end + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const obj = parsed as Record<string, unknown>;
  const summary = clean(obj.summary, MAX_SUMMARY_CHARS);
  if (summary.length === 0) return null;

  const rawActions = Array.isArray(obj.actions) ? obj.actions : [];
  const actions: ProposedAction[] = [];
  for (const entry of rawActions) {
    if (actions.length >= MAX_PROPOSED_ACTIONS) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const what = clean(row.what, MAX_ACTION_CHARS);
    // AN ACTION WITH NO `what` IS DROPPED, not filled in from `who`.
    // A row reading "Γιώργος — " in the list is the model's failure
    // rendered as though it were the meeting's.
    if (what.length === 0) continue;
    const action: ProposedAction = { what };
    const who = optional(row.who, 120);
    if (who) action.who = who;
    const when = optional(row.when, 120);
    if (when) action.when = when;
    actions.push(action);
  }

  return { summary, actions };
}

/**
 * Whether a transcript is worth spending a model call on.
 *
 * Forty characters is about one sentence. Below that the recording was
 * silence, a misfire, or somebody testing the button, and the honest
 * answer is to say so rather than to charge for a summary of nothing.
 */
export function isAnalysable(transcript: string): boolean {
  return transcript.trim().length >= MIN_ANALYSABLE_CHARS;
}

/**
 * A title for the history list, taken from the transcript rather than
 * from the filename.
 *
 * NEVER THE FILENAME. A recording is called things like
 * "Σύσκεψη με Παπαδόπουλο 14-03.m4a" — a person's name and a date, which
 * the uploader did not decide to publish to a list they might screen-share.
 */
export function titleFromTranscript(transcript: string, fallback: string): string {
  const flat = transcript.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return fallback;
  const title = clean(flat, 70);
  return title.length > 0 ? title : fallback;
}

/**
 * THE NAME OF THE LANGUAGE THE MEETING WAS IN, for the prompt.
 *
 * Whisper detects roughly a hundred languages and this product ships in
 * ten, so a lookup table keyed on our ten would answer "English" for the
 * other ninety — which is the bug this whole section exists to avoid.
 * `Intl.DisplayNames` knows all of them and is in the runtime already.
 *
 * It does NOT throw on a code it does not know; it echoes the code back
 * ("xx" -> "xx"). That is the honest failure: the prompt then says "held
 * in xx", the model reads the transcript and answers in whatever it is
 * actually in, and nothing has been asserted that is false. An empty or
 * missing code yields "root", which would be a nonsense instruction — so
 * that one case falls back to a sentence that names no language at all.
 */
export const UNKNOWN_LANGUAGE_NAME = "the language it was recorded in";

/**
 * WHISPER DOES NOT RETURN A CODE. IT RETURNS A NAME.
 *
 * `response_format=verbose_json` answers with `"language": "greek"` —
 * the English NAME, lower-cased — not `"el"`. This function took a code,
 * so a Greek meeting resolved to UNKNOWN_LANGUAGE_NAME and the prompt
 * said "held in the language it was recorded in" instead of "held in
 * GREEK", in the one feature whose entire point is the language.
 *
 * NOT VISIBLE FROM ANY UNIT TEST, because a unit test feeds it "el".
 * scripts/tests/meetings.prodtest.mjs found it on 2026-09-23 the first
 * time a real request went through a stand-in Whisper that answers the
 * way the real one does.
 *
 * So both are accepted, and the CODE is what gets stored — the screen
 * shows the language in the reader's own words, which needs a code, and
 * "greek" would have rendered as the literal word "greek" in Japanese.
 */
const COMMON_LANGUAGE_CODES = [
  "en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar",
  "nl", "pl", "ru", "tr", "uk", "sv", "no", "da", "fi", "cs",
  "sk", "hu", "ro", "bg", "sr", "hr", "he", "hi", "id", "ko",
  "th", "vi", "fa", "ca", "et", "lv", "lt", "sl", "ms", "bn",
] as const;

let nameToCode: Map<string, string> | null = null;
function reverseIndex(): Map<string, string> {
  if (nameToCode) return nameToCode;
  const map = new Map<string, string>();
  try {
    const display = new Intl.DisplayNames(["en"], { type: "language" });
    for (const code of COMMON_LANGUAGE_CODES) {
      const name = display.of(code);
      if (name) map.set(foldForMatch(name), code);
    }
  } catch {
    /* an environment without the data leaves the map empty, which is the
       same outcome as an unknown language rather than a crash */
  }
  nameToCode = map;
  return map;
}

/**
 * A BCP-47 code for whatever the provider said, or null.
 *
 * Null rather than a guess: storing "unknown" would be a value the UI
 * then has to special-case, and storing the raw word makes the column
 * sometimes a code and sometimes a sentence.
 */
export function normaliseLanguage(raw: string | null | undefined): string | null {
  const text = foldForMatch(String(raw ?? "").trim());
  if (text.length < 2) return null;
  const bare = text.split(/[-_]/)[0];
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(bare);
    // `of()` echoes the input back when it does not know it, so an echo
    // means "not a code" rather than "a code named after itself".
    if (name && name !== "root" && foldForMatch(name) !== bare) return bare;
  } catch {
    /* fall through to the name lookup */
  }
  return reverseIndex().get(text) ?? null;
}

export function languageNameFor(code: string | null | undefined): string {
  const normalised = normaliseLanguage(code);
  if (!normalised) return UNKNOWN_LANGUAGE_NAME;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(normalised);
    if (!name || name === "root" || name === normalised) return UNKNOWN_LANGUAGE_NAME;
    return name;
  } catch {
    return UNKNOWN_LANGUAGE_NAME;
  }
}
