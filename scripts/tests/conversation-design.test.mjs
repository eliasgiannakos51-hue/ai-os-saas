// THE CONVERSATION IS THE DESIGN'S: THE EARTH BESIDE EVERY ANSWER, AND
// THE SAME FIELD AS HOME'S.
//
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN — «ΣΥΝΟΜΙΛΙΑ» and «Η ΓΗ»: the answer
// on the left with no frame and the small earth beside it, turning
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

console.log("== 1. the earth beside every answer ==");
check("the answer's mark is the small earth", /return <Earth variant="small" px=\{32\} working=\{working\} still=\{still\}/.test(ws));
const avatars = ws.match(/<AssistantAvatar\b[^>]*\/>/g) ?? [];
check(`every answer-shaped turn carries it (${avatars.length})`, avatars.length >= 3);
check("the answer being written turns faster", /<AssistantAvatar working \/>/.test(ws));
check("the latest finished answer keeps turning, calmly; older ones are drawn still", /<AssistantAvatar still=\{sending \|\| msg\.id !== lastAnswerId\} \/>/.test(ws) && /const lastAnswerId = \[\.\.\.messages\]\.reverse\(\)\.find\(\(m\) => m\.role === "assistant"\)\?\.id;/.test(ws));
check("no other icon stands in for it", !/MessageCircle/.test(ws));
check("the empty conversation opens with the earth too", /<Earth variant="small" px=\{64\} \/>/.test(ws));

console.log("\n== 2. the same field as Home's ==");
check("voice bottom-left, as on Home", /absolute bottom-2 start-2/.test(composer) && /absolute bottom-3 start-14/.test(home));
check("send bottom-right, white with a dark arrow, as on Home", /absolute bottom-2 end-2 [^"]*bg-button text-button-ink/.test(composer) && /absolute bottom-3 end-3 [^"]*bg-button text-button-ink/.test(home));
check("the text never runs under the controls: they have a row of their own", /\bpb-14\b/.test(composer) && /\bpb-16\b/.test(home) && !/\bpe-\[/.test(composer + home));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
