// THE CONVERSATION IS THE DESIGN'S: THE EARTH UNDER EVERY ANSWER, IN ITS
// ROW, AND THE SAME FIELD AS HOME'S.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN — «ΣΥΝΟΜΙΛΙΑ» and «Η ΓΗ»: the answer
// on the left with no frame and the small earth under it, turning
// faster while it works and calming when it is done; the field at the
// bottom, the same as Home's. The person's message on the panel surface
// is held by chat-measure.test.mjs, section 4.
//
// Read with comments stripped: none of this runs without a browser, and
// the site audit (docs/QUEUE.md D.11) is where it is watched.
//
// Run: node scripts/tests/conversation-design.test.mjs
import { readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
const ws = stripComments(readFileSync("src/components/chat/chat-workspace.tsx", "utf8"));
const composer = stripComments(readFileSync("src/components/chat/chat-composer.tsx", "utf8"));
const home = stripComments(readFileSync("src/components/create/create-chat.tsx", "utf8"));

console.log("== 1. the earth under every answer, and the row it sits in ==");
// ΣΥΣΤΗΜΑ DESIGN §2 and §5 (2026-10-05): 26px, UNDER each answer, in one
// row with copy, thumbs up and down, and again. It turns while the answer
// is written and calms when it is done; older answers are drawn still.
const actions = stripComments(readFileSync("src/components/chat/answer-actions.tsx", "utf8"));
check("the answer's mark is the small earth at 26px", /<Earth variant="small" px=\{26\} working=\{working\} still=\{still\}/.test(actions));
check("...in the row with copy, thumbs up and down, and again",
  /<CopyButton\b/.test(actions) && /data-testid="answer-good"/.test(actions) && /data-testid="answer-bad"/.test(actions) && /data-testid="answer-retry"/.test(actions));
check("...every target in it is 44px", /const BUTTON =\s*"inline-flex h-11 w-11 /.test(actions) && /className=\{BUTTON\}/.test(actions));
const rows = ws.match(/<AnswerActions\b/g) ?? [];
check(`the finished answer and the one being written both carry it (${rows.length})`, rows.length >= 2);
check("the answer being written turns faster, and offers nothing to press yet",
  /<AnswerActions messageId="streaming" text=\{streamingText\} persisted=\{false\} working \/>/.test(ws) && /\{!working && \(/.test(actions));
check("the latest finished answer keeps turning, calmly; older ones are drawn still",
  /still=\{sending \|\| msg\.id !== lastAnswerId\}/.test(ws) && /const lastAnswerId = \[\.\.\.messages\]\.reverse\(\)\.find\(\(m\) => m\.role === "assistant"\)\?\.id;/.test(ws));
check("again is offered only under the latest answer, and not while one is written",
  /onRetry=\{!sending && msg\.id === lastAnswerId && retryText \? \(\) => void handleSend\(retryText\) : undefined\}/.test(ws));
check("the thumbs exist only on an answer the server has a row for",
  /\{persisted && \(/.test(actions) && /persisted=\{PERSISTED_ID\.test\(msg\.id\)\}/.test(ws));
check("...and write through the rating route, putting the thumb back if it fails",
  /fetch\(`\/api\/chat\/messages\/\$\{encodeURIComponent\(messageId\)\}\/rating`/.test(actions) && /setCurrent\(before\)/.test(actions));
check("nothing sits BESIDE an answer any more", !/AssistantAvatar/.test(ws) && !/flex items-start gap-2\.5/.test(ws));
check("no other icon stands in for it", !/MessageCircle/.test(ws));

console.log("\n== 1b. Chat with no message: the earth, the greeting, the field (MASTER 14.2) ==");
// «Όταν το Chat είναι άδειο: στο κέντρο η γη του Ionexa με τον χαιρετισμό,
// και από κάτω το πεδίο. Όχι άλλο εικονίδιο, όχι κάρτες, όχι λίστες.»
const emptyAt = ws.indexOf(") : isEmpty ? (");
const emptyBlock = emptyAt < 0 ? "" : ws.slice(emptyAt, ws.indexOf(") : (", emptyAt + 1));
check("the empty screen was located", emptyBlock.length > 100 && /const isEmpty = !loadingMessages && messages\.length === 0 && !sending;/.test(ws));
check("the empty conversation opens with the earth", /<Earth variant="small" px=\{96\} \/>/.test(emptyBlock));
check("...and the hour's greeting, with the name Home uses",
  /\{tPromise\(`greeting\.\$\{dayPart\}`\)\}\s*\{greeting \? `, \$\{greeting\}` : ""\}/.test(emptyBlock));
// COUNTED, NOT LISTED: every element the empty screen draws, by tag. A
// card, a list, a paragraph, an icon or a chip is a tag that is not one
// of these three, whatever it is called.
const tags = [...new Set([...emptyBlock.matchAll(/<([A-Za-z][A-Za-z0-9.]*)/g)].map((m) => m[1]))].sort();
check(`...and nothing else: no other icon, no card, no list (${tags.join(", ")})`, tags.join(",") === "Earth,div,h1", tags.join(", "));
// CENTRED WITHOUT BEING CUT. h-full with justify-center centres a block
// taller than the pane by pushing its top above the scroll origin, where
// no scroll reaches: on a 390px phone the earth and the title were
// simply gone (D.11 screenshots). min-h-full lets it grow and scroll.
check(
  "the empty conversation grows and scrolls rather than losing its top on a phone",
  /<div data-testid="chat-empty" className="mx-auto flex min-h-full max-w-md flex-col items-center justify-end[^"]*">\s*<Earth variant="small"/.test(ws)
);
check("the field follows right under it: no rule over the field, and a spacer under it while empty",
  /className=\{`p-4 sm:p-6 \$\{isEmpty \? "" : "border-t border-border"\}`\}/.test(ws) &&
    /\{isEmpty && <div className="min-h-0 flex-1" aria-hidden="true" \/>\}/.test(ws));
check("the row over the field waits for a conversation, or for a mode already on",
  /\{\(!isEmpty \|\| workMode \|\| mentorMode\) && \(\s*<div className="mb-2 flex flex-wrap justify-end gap-2">/.test(ws));
// THE LINE UNDER THE FIELD: found on 2026-10-08 on every account, paid and
// Free — «107 δωρεάν μηνύματα απομένουν» with its icon, under the field of
// the empty Chat (scripts/tests/all-tools-empty-chat-edges.prodtest.mjs,
// which looks at the whole column in a browser). It waits for a
// conversation; used up is the one case said before typing.
check("the free-message count waits for a conversation, unless the free messages are used up",
  /\{freeRemaining !== null && \(!isEmpty \|\| freeRemaining === 0\) && \(/.test(ws) &&
    (ws.match(/\{freeRemaining !== null &&/g) ?? []).length === 1);
const chatPage = stripComments(readFileSync("src/app/dashboard/chat/page.tsx", "utf8"));
check("the page hands it the name Home greets with", /greeting=\{greetingName\(user\.user_metadata\)\}/.test(chatPage));

console.log("\n== 2. the same field as Home's ==");
check("voice bottom-left, as on Home", /absolute bottom-2 start-2/.test(composer) && /absolute bottom-3 start-16/.test(home));
check("send bottom-right, white with a dark arrow, as on Home", /absolute bottom-2 end-2 [^"]*bg-button text-button-ink/.test(composer) && /absolute bottom-3 end-3 [^"]*bg-button text-button-ink/.test(home));
check("the grid that opens All tools sits beside the microphone",
  /<Link\s+href="\/dashboard\/tools"[\s\S]{0,200}?data-testid="composer-all-tools"/.test(composer) && /h-11 w-11/.test(composer));
check("the text never runs under the controls: they have a row of their own", /\bpb-14\b/.test(composer) && /\bpb-16\b/.test(home) && !/\bpe-\[/.test(composer + home));

console.log("\n== 3. the first message, refused or failed, in the reader's language ==");
// Found 2026-10-08 in a browser, on a Greek screen, through the real
// /api/chat (all-tools-empty-chat-edges.prodtest.mjs): out of credits read
// «Not enough credits (you have: 0, need: 30). Upgrade your plan…», a
// platform at its daily limit read «Service temporarily at capacity…», and
// a provider that failed read «something broke on our side, we can't
// confirm whether you were charged» while the route had said nothing was
// charged — and the free message it gave back stayed counted as spent.
const route = stripComments(readFileSync("src/app/api/chat/route.ts", "utf8"));
const breaker = stripComments(readFileSync("src/lib/ai-circuit-breaker.ts", "utf8"));
check("a refusal is said from its code, in the reader's language, not from the route's prose",
  /setError\(isErrorCode\(data\.code\) \? describe\(new ApiError\(429, \{ code: data\.code \}\)\)\.text : data\.message\);/.test(ws));
check("...the route names the credit refusal by its code",
  /rateLimited: true,\s*code: "insufficientCredits",\s*message: insufficientCreditsMessage\(/.test(route));
check("...and the circuit breaker's, every one of its refusals carrying a code",
  /rateLimited: true, code: breakerCheck\.code, message: breakerCheck\.reason/.test(route) &&
    (breaker.match(/allowed: false,/g) ?? []).length >= 3 &&
    (breaker.match(/allowed: false,/g) ?? []).length === (breaker.match(/\bcode: "(upstreamUnavailable|rateLimited)",/g) ?? []).length);
const modelFailures = (route.match(/type: "error",\s*error: [^\n]*No credits were charged — please try again\.[^\n]*\n\s*code: "upstreamUnavailable",\s*creditsRefunded: true,\s*freeRemaining: isFreeMessage && freeGrant\?\.granted \? freeGrant\.remaining \+ 1 : undefined,/g) ?? []).length;
check(`a model that fails is said as the AI service, with nothing kept and the free message back (${modelFailures} of 2 places)`,
  modelFailures === 2);
check("...and the screen reads those values, not the prose",
  /if \(typeof event\.freeRemaining === "number"\) setFreeRemaining\(event\.freeRemaining\);/.test(ws) &&
    /event\.outOfCredits === true\s*\? describeStatus\(402\)\.text\s*: event\.code === "upstreamUnavailable"\s*\? describeStatus\(503, event\.creditsRefunded === true\)\.text\s*: describeStatus\(500\)\.text;/.test(ws));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
