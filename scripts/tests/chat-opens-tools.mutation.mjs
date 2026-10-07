#!/usr/bin/env node
/*
 * CAN chat-opens-tools.test.mjs SEE CHAT OPEN THE WRONG THING, OR NOTHING?
 *
 * A remark that opens a tool, an unaccented request that does not, a
 * question that opens one, a second worker for one site, questions taken
 * for a site, a failed read that ends the watch, a watch that outlives its
 * screen, a part sent with every change, a request that still reaches the
 * model, the next message answered in words, the switch ignored, the
 * answers to the questions sent back for more questions, a preview given
 * scripts, and a language losing its button.
 *
 * Run: node scripts/tests/chat-opens-tools.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/chat-opens-tools.test.mjs";
const RUN = "scripts/tests/chat-opens-tools.itest.mjs";
const OPEN = "src/lib/chat/open-tool.ts";
const INTENT = "src/lib/create-studio/intent-signals.ts";
const REQ = "src/lib/website-builder/site-requests.ts";
const CHAT = "src/components/chat/chat-workspace.tsx";
const PAGE = "src/app/dashboard/chat/page.tsx";
const PANE = "src/components/chat/site-pane.tsx";
const EL = "messages/el.json";

const MUTANTS = [
  {
    name: "a remark about a site opens it",
    file: OPEN,
    from: 'return match.kind === "one" && match.producer === "website" && opensWithInstruction(text, locale);',
    to: 'return match.kind === "one" && match.producer === "website";',
    expect: "stays in the conversation: «μου αρέσει το site της Apple»",
  },
  {
    name: "an instruction typed without accents is not one",
    file: INTENT,
    from: "  const opens = (map: Record<string, string[]>) => allPhrases(map, locale).some((p) => startsWithWord(text, foldForMatch(p)));",
    to: "  const opens = (map: Record<string, string[]>) => allPhrases(map, locale).some((p) => startsWithWord(text, p));",
    expect: "opens: «φτιαξε μου site για το camping»",
  },
  {
    name: "a want that is a question opens it",
    file: INTENT,
    from: "  return !allPhrases(INTERROGATIVES, locale).some((p) => containsWord(text, foldForMatch(p))) && !QUESTION_MARKS.test(raw.trim());",
    to: "  return true;",
    expect: "stays in the conversation: «θέλω να μάθω πώς φτιάχνεται ένα site»",
  },
  {
    name: "a second worker for a suppressed duplicate",
    gate: RUN,
    file: REQ,
    from: "  if (!data.duplicateSuppressed) {",
    to: "  if (true) {",
    expect: "a duplicate the server suppressed starts no second worker",
  },
  {
    name: "questions are taken for a site",
    gate: RUN,
    file: REQ,
    from: '  if (data.needsClarification) return { kind: "questions", questions: (data.questions as string[]) ?? [] };\n',
    to: "",
    expect: "questions come back as questions",
  },
  {
    name: "a failed read ends the watch",
    gate: RUN,
    file: REQ,
    from: "      if (!res.ok || !data.ok) {\n        if (handlers.alive()) setTimeout(tick, SITE_POLL_INTERVAL_MS);\n        return;\n      }",
    to: "      if (!res.ok || !data.ok) {\n        return;\n      }",
    expect: "a failed read is retried",
  },
  {
    name: "the watch outlives its screen",
    gate: RUN,
    file: REQ,
    from: "    if (!handlers.alive()) return;\n    let record",
    to: "    let record",
    expect: "a screen that is gone stops the watch before it asks",
  },
  {
    name: "every change is sent with a part",
    gate: RUN,
    file: REQ,
    from: "      ...(input.section === null || input.section === undefined ? {} : { section: input.section }),",
    to: "      section: input.section ?? 0,",
    expect: "goes without a part unless one was chosen",
  },
  {
    name: "a request for a site still reaches the model",
    file: CHAT,
    from: "      setSiteHidden(false);\n      setSiteBrief(text);\n      return;\n    }",
    to: "      setSiteHidden(false);\n      setSiteBrief(text);\n    }",
    expect: "a request for a site opens it and returns",
  },
  {
    name: "the next message is answered in words, not by the open site",
    file: CHAT,
    from: "    if (siteBrief !== null && sitePaneRef.current?.take(text)) {",
    to: "    if (false) {",
    expect: "what is said next goes to the open site first",
  },
  {
    name: "the switch is ignored",
    file: PAGE,
    from: 'opensTools={await isFeatureOn("chat-opens-tools", user)}',
    to: "opensTools={true}",
    expect: "the Chat page reads it",
  },
  {
    name: "the answers are sent back for more questions",
    file: PANE,
    from: "        void make(enriched, true);",
    to: "        void make(enriched, false);",
    expect: "the questions: answered in the Chat field, or skipped",
  },
  {
    name: "the preview runs scripts",
    file: PANE,
    from: 'srcDoc={html} sandbox="" ',
    to: 'srcDoc={html} sandbox="allow-scripts" ',
    expect: "the preview is sandboxed",
  },
  {
    name: "Greek loses the button",
    file: EL,
    from: '"make": "Φτιάξ’ το",',
    to: '"make": "",',
    expect: "el.json: the pane's words",
  },
];

runMutations({
  name: "chat-opens-tools",
  gate: GATE,
  targets: [OPEN, INTENT, REQ, CHAT, PAGE, PANE, EL],
  mutants: MUTANTS,
});
