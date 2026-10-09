#!/usr/bin/env node
/*
 * CAN conversation-design.test.mjs SEE THE CONVERSATION DRIFT?
 *
 * The old icon back beside the answer, the writing answer not speeding
 * up, every old answer animating, the earth gone from the empty state,
 * and the field's controls moving back over the text. Since 2026-10-08:
 * the free-message count back under the empty field, the used-up line's
 * icon back on the empty Chat, and the first
 * message's refusal or failure back in the route's English prose. Since
 * 2026-10-09: an English word back in the Greek out-of-credits line.
 *
 * Run: node scripts/tests/conversation-design.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/conversation-design.test.mjs";
const WS = "src/components/chat/chat-workspace.tsx";
const COMPOSER = "src/components/chat/chat-composer.tsx";
const ACTIONS = "src/components/chat/answer-actions.tsx";
const ROUTE = "src/app/api/chat/route.ts";
const BREAKER = "src/lib/ai-circuit-breaker.ts";
const EL = "messages/el.json";
const TARGETS = [GATE, WS, COMPOSER, ACTIONS, ROUTE, BREAKER, EL];

const MUTANTS = [
  // 2026-10-09
  {
    name: "the Greek out-of-credits line says «pack» again",
    file: EL,
    from: "Αγόρασε ένα πακέτο credits ή αναβάθμισε το πλάνο σου για να συνεχίσεις.\",\n      \"detailWithNumbers\"",
    to: "Αγόρασε ένα pack ή αναβάθμισε το πλάνο σου για να συνεχίσεις.\",\n      \"detailWithNumbers\"",
    expect: "on a Greek screen the out-of-credits words are Greek",
  },
  // 2026-10-08
  {
    name: "the free-message count comes back under the empty field",
    file: WS,
    from: "{freeRemaining !== null && (!isEmpty || freeRemaining === 0) && (",
    to: "{freeRemaining !== null && (",
    expect: "the free-message count waits for a conversation",
  },
  {
    name: "the used-up line keeps its gift icon on the empty Chat",
    file: WS,
    from: '{!isEmpty && <Gift className="h-3 w-3 text-success/80" aria-hidden="true" />}',
    to: '<Gift className="h-3 w-3 text-success/80" aria-hidden="true" />',
    expect: "that one line has no icon",
  },
  {
    name: "a refusal shows the route's English prose again",
    file: WS,
    from: "              : isErrorCode(data.code)\n                ? describe(new ApiError(429, { code: data.code })).text\n                : describeStatus(429).text",
    to: "              : describeStatus(429).text",
    expect: "a refusal is said from its code",
  },
  {
    name: "the credit refusal loses its code",
    file: ROUTE,
    from: '          code: "insufficientCredits",\n',
    to: "",
    expect: "the route names the credit refusal by its code",
  },
  {
    name: "one circuit-breaker refusal loses its code",
    file: BREAKER,
    from: '        reason: "You\'ve made a lot of AI requests in the last hour — please wait a bit and try again.",\n        code: "rateLimited",\n',
    to: '        reason: "You\'ve made a lot of AI requests in the last hour — please wait a bit and try again.",\n',
    expect: "every one of its refusals carrying a code",
  },
  {
    name: "the route stops passing the breaker's code",
    file: ROUTE,
    from: "rateLimited: true, code: breakerCheck.code, message: breakerCheck.reason",
    to: "rateLimited: true, message: breakerCheck.reason",
    expect: "every one of its refusals carrying a code",
  },
  {
    name: "a failed model stops saying the free message is back",
    file: ROUTE,
    from: "              freeRemaining: isFreeMessage && freeGrant?.granted ? freeGrant.remaining + 1 : undefined,\n            })\n          );\n          controller.close();\n          return;\n        }\n\n        // The held tail",
    to: "            })\n          );\n          controller.close();\n          return;\n        }\n\n        // The held tail",
    expect: "a model that fails is said as the AI service",
  },
  {
    name: "the screen says «something broke on our side» for a failed model again",
    file: WS,
    from: '              : event.code === "upstreamUnavailable"\n                ? describeStatus(503, event.creditsRefunded === true).text\n                : describeStatus(500).text;',
    to: "              : describeStatus(500).text;",
    expect: "the screen reads those values",
  },
  {
    name: "the screen keeps the given-back free message counted as spent",
    file: WS,
    from: '          if (typeof event.freeRemaining === "number") setFreeRemaining(event.freeRemaining);\n          streamError =',
    to: "          streamError =",
    expect: "the screen reads those values",
  },
  {
    name: "the empty conversation is clipped at the top on a phone again",
    file: WS,
    from: '<div data-testid="chat-empty" className="mx-auto flex min-h-full max-w-md flex-col items-center justify-end pb-2 text-center">',
    to: '<div data-testid="chat-empty" className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">',
    expect: "rather than losing its top",
  },
  {
    // RE-ANCHORED 2026-10-05 (Δ.2): the earth is 26px in the row UNDER
    // the answer (components/chat/answer-actions.tsx), not 32px beside it.
    name: "the answer's mark goes back to a plain square",
    file: ACTIONS,
    from: '      <Earth variant="small" px={26} working={working} still={still} className="me-1.5 shrink-0" />',
    to: '      <span className="h-6 w-6" />',
    expect: "the answer's mark is the small earth at 26px",
  },
  {
    name: "the answer being written does not speed up",
    file: WS,
    from: '<AnswerActions messageId="streaming" text={streamingText} persisted={false} working />',
    to: '<AnswerActions messageId="streaming" text={streamingText} persisted={false} />',
    expect: "the answer being written turns faster",
  },
  {
    name: "every old answer animates",
    file: WS,
    from: "                        still={sending || msg.id !== lastAnswerId}\n",
    to: "",
    expect: "older ones are drawn still",
  },
  {
    name: "again is offered under every answer",
    file: WS,
    from: "onRetry={!sending && msg.id === lastAnswerId && retryText ? () => void handleSend(retryText) : undefined}",
    to: "onRetry={retryText ? () => void handleSend(retryText) : undefined}",
    expect: "again is offered only under the latest answer",
  },
  {
    name: "thumbs on an answer the server has no row for, saving nothing",
    file: ACTIONS,
    from: "          {persisted && (",
    to: "          {(persisted || true) && (",
    expect: "the thumbs exist only on an answer the server has a row for",
  },
  {
    name: "a failed rating leaves the thumb lit",
    file: ACTIONS,
    from: "      setCurrent(before);\n",
    to: "",
    expect: "putting the thumb back if it fails",
  },
  {
    name: "the row's buttons shrink below 44px",
    file: ACTIONS,
    from: '"inline-flex h-11 w-11 shrink-0',
    to: '"inline-flex h-8 w-8 shrink-0',
    expect: "every target in it is 44px",
  },
  {
    name: "the grid that opens All tools leaves the field",
    file: COMPOSER,
    from: '            href="/dashboard/tools"',
    to: '            href="/dashboard/overview"',
    expect: "the grid that opens All tools sits beside the microphone",
  },
  {
    name: "the empty conversation loses its earth",
    file: WS,
    from: '              <Earth variant="small" px={96} />',
    to: "",
    expect: "the empty conversation opens with the earth",
  },
  // MASTER 14.2 (2026-10-07).
  {
    name: "a card comes back onto the empty Chat",
    file: WS,
    from: '                {greeting ? `, ${greeting}` : ""}\n              </h1>\n',
    to: '                {greeting ? `, ${greeting}` : ""}\n              </h1>\n              <p className="mt-2 text-sm text-muted">{t("emptyHint")}</p>\n',
    expect: "and nothing else",
  },
  {
    name: "the empty Chat greets nobody by name",
    file: WS,
    from: '                {greeting ? `, ${greeting}` : ""}\n',
    to: "",
    expect: "the hour's greeting, with the name Home uses",
  },
  {
    name: "the mentor chip is drawn over the empty field again",
    file: WS,
    from: "            {(!isEmpty || workMode || mentorMode) && (",
    to: "            {(true || workMode || mentorMode) && (",
    expect: "the row over the field waits",
  },
  {
    name: "the empty field sinks back to the bottom",
    file: WS,
    from: '        {isEmpty && <div className="min-h-0 flex-1" aria-hidden="true" />}\n',
    to: "",
    expect: "the field follows right under it",
  },
  {
    name: "the microphone moves back to the right, over the text",
    file: COMPOSER,
    from: '        <div className="absolute bottom-2 start-2 flex items-center gap-1">',
    to: '        <div className="absolute bottom-2 end-14 flex items-center gap-1">',
    expect: "voice bottom-left",
  },
  {
    name: "the controls lose their own row",
    file: COMPOSER,
    from: " pb-14 pt-3.5 ",
    to: " py-3.5 pe-[7.5rem] ",
    expect: "the text never runs under the controls",
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

console.log("conversation-design mutations\n");

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
