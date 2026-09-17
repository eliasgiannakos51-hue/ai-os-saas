#!/usr/bin/env node
/*
 * CAN ndjson-stream.test.mjs SEE A FOURTH COPY OF THE LOOP?
 *
 * Its list was three consumers. The tree had four, and the fourth —
 * src/components/voice/voice-conversation.tsx, on a billed path — inlined
 * the exact read loop the gate's own header describes as the defect it
 * exists to prevent, and committed the answer only after the loop
 * finished. A phone moving between cells mid-answer rejected the read,
 * jumped past setTurns, and the spoken reply the user had already paid
 * for became a generic failure toast. None of the 265 gates had an
 * opinion, because a component that never joined the list was never
 * asked. Found 2026-09-17 by deriving the population.
 *
 * Run: node scripts/tests/ndjson-stream.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/ndjson-stream.test.mjs";
const VOICE = "src/components/voice/voice-conversation.tsx";
const CHAT = "src/components/chat/chat-workspace.tsx";
const LIB = "src/lib/ndjson-stream.ts";

const MUTANTS = [
  {
    name: "a streaming component drops out of the commits table",
    file: GATE,
    from: '  "src/components/voice/voice-conversation.tsx": { varName: "answer", commit: "setTurns((current) => [...current, turn]);" },\n',
    to: "",
    expect: "every streaming component is accounted for here",
  },
  {
    name: "the voice conversation goes back to its own read loop",
    file: VOICE,
    from: "      const { interrupted } = await readNdjsonStream(chatResponse.body, (event) => {",
    to: "      const interrupted = false;\n      const onEvent = ((event: Record<string, unknown>) => {",
    expect: "uses it",
  },
  {
    name: "the voice conversation stops saying the connection dropped",
    file: VOICE,
    from: "      if (interrupted) {",
    to: "      if (false && interrupted) {",
    expect: "reads the interrupted flag",
  },
  {
    name: "a consumer discards what arrived before the interruption",
    file: CHAT,
    from: "    if (accumulatedText) {",
    to: "    if (false) {",
    expect: "the commit is reached after the stream ends",
  },
  {
    name: "the shared reader starts throwing again, which is what it exists not to do",
    file: LIB,
    from: "    interrupted = true;",
    to: "    interrupted = false;",
    expect: "interrupted",
  },
];

runMutations({
  name: "ndjson-stream",
  gate: GATE,
  targets: [GATE, VOICE, CHAT, LIB],
  mutants: MUTANTS,
});
