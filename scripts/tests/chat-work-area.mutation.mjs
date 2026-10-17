#!/usr/bin/env node
/*
 * CAN chat-work-area.test.mjs SEE THE WORK AREA DRIFT FROM THE DESIGN, OR
 * SLIP OUT FROM BEHIND ITS SWITCH?
 *
 * Run: node scripts/tests/chat-work-area.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/chat-work-area.test.mjs";
const LIB = "src/lib/chat/work-area.ts";
const AREA = "src/components/chat/work-area.tsx";
const WS = "src/components/chat/chat-workspace.tsx";

const MUTANTS = [
  {
    name: "every reply opens the work area",
    file: LIB,
    from: "  if (!isCode && !isDocument) return null;",
    to: "",
    expect: "a short reply stays a reply",
  },
  {
    name: "a long flat reply counts as a document",
    file: LIB,
    from: "  const isDocument = !isCode && text.length >= MIN_DOCUMENT_CHARS && structured;",
    to: "  const isDocument = !isCode && text.length >= MIN_DOCUMENT_CHARS;",
    expect: "a long reply with no structure stays a reply",
  },
  {
    name: "the area stops being 60% on a computer",
    file: AREA,
    from: "lg:w-[60%]",
    to: "lg:w-[40%]",
    expect: "on a computer it takes about 60%",
  },
  {
    name: "a phone loses the way back to the conversation",
    file: AREA,
    from: ' data-testid="work-area-back" className={`${ACTION} lg:hidden`}',
    to: ' data-testid="work-area-back" className={`${ACTION} hidden`}',
    expect: "on a phone it is the whole screen",
  },
  {
    name: "the switch is ignored: cards for everyone",
    file: WS,
    from: "    if (!workArea) return map;\n",
    to: "",
    expect: "with the switch off, no answer has an item",
  },
  {
    name: "the area opens on its own with the switch off",
    file: WS,
    from: "        if (workArea && workItemFrom(finalContent ?? accumulatedText)) setOpenWorkId(answerId);",
    to: "        if (workItemFrom(finalContent ?? accumulatedText)) setOpenWorkId(answerId);",
    expect: "only with the switch on",
  },
];

runMutations({ name: "chat-work-area", gate: GATE, targets: [LIB, AREA, WS], mutants: MUTANTS });
