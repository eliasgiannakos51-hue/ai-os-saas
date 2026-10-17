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
check("the empty conversation opens with the earth too", /<Earth variant="small" px=\{64\} \/>/.test(ws));
// CENTRED WITHOUT BEING CUT. h-full with justify-center centres a block
// taller than the pane by pushing its top above the scroll origin, where
// no scroll reaches: on a 390px phone the earth and the title were
// simply gone (D.11 screenshots). min-h-full lets it grow and scroll.
check(
  "the empty conversation grows and scrolls rather than losing its top on a phone",
  /<div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center[^"]*">\s*<Earth variant="small" px=\{64\} \/>/.test(ws)
);

console.log("\n== 2. the same field as Home's ==");
check("voice bottom-left, as on Home", /absolute bottom-2 start-2/.test(composer) && /absolute bottom-3 start-16/.test(home));
check("send bottom-right, white with a dark arrow, as on Home", /absolute bottom-2 end-2 [^"]*bg-button text-button-ink/.test(composer) && /absolute bottom-3 end-3 [^"]*bg-button text-button-ink/.test(home));
check("the grid that opens All tools sits beside the microphone",
  /<Link\s+href="\/dashboard\/tools"[\s\S]{0,200}?data-testid="composer-all-tools"/.test(composer) && /h-11 w-11/.test(composer));
check("the text never runs under the controls: they have a row of their own", /\bpb-14\b/.test(composer) && /\bpb-16\b/.test(home) && !/\bpe-\[/.test(composer + home));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
