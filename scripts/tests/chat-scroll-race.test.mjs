// THE HALF OF THE SCROLL BUG THE FIRST FIX DID NOT REACH.
//
// V4.6 #11.1. Reported again after being fixed in V3: "the AI is writing
// and it takes the screen down, I cannot scroll up to see the start".
// Rule 8 says a bug that comes back means the first fix was partial, so
// this file starts from why it survived rather than from the symptom.
//
// IT DID SHIP. hooks/use-stick-to-bottom.ts is real, chat-workspace.tsx
// uses it, and scripts/tests/chat-scroll.prodtest.mjs passes all eight of
// its assertions against a real production build. The fix is there.
//
// WHAT THAT TEST DOES NOT DO is scroll while the reply is arriving. It
// sets scrollTop = 0, waits 300ms, and only then sends — so the scroll
// event has long since been delivered and the hook's flag is correct
// before a single chunk lands. Its interception also fulfils the whole
// NDJSON body at once, so nothing ever arrives "during" anything.
//
// The user's sentence is the untested case: the AI is WRITING, and they
// scroll THEN. Scroll events are dispatched asynchronously — the browser
// moves scrollTop first and tells the page afterwards — while a streamed
// reply re-renders several times a second. So:
//
//     1. the wheel turns; the browser moves scrollTop up
//     2. a chunk lands; React re-renders; follow() runs
//     3. the flag still says "stuck", because the event has not been
//        delivered yet -> the view is yanked back down
//     4. the event arrives one frame too late to matter
//
// A RACE CANNOT BE PROVED BY READING, and reproducing it through a real
// browser would make this file a coin flip. So the decision is a pure
// function of five numbers (lib/chat/follow-decision.ts) and the race is
// four of those numbers.
//
// Run: node scripts/tests/chat-scroll-race.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
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

const { decideFollow, STICK_THRESHOLD_PX } = await loadTs("src/lib/chat/follow-decision.ts");

// A thread 5000px long in a 600px window: bottom is scrollTop 4400.
const TALL = { scrollHeight: 5000, clientHeight: 600 };
const BOTTOM = TALL.scrollHeight - TALL.clientHeight;

// ---------------------------------------------------------------------
console.log("== 1. THE RACE — a wheel turn the event has not reported yet ==");
// Everything about this state says "the reader is 3400px up". Everything
// except the flag, which is stale by one frame.
const race = {
  ...TALL,
  scrollTop: 1000,
  sticking: true, // <- the lie: the scroll event has not been delivered
  lastSetTop: BOTTOM, // <- but the hook last put it at the bottom, so a human moved it
};
check(
  `mid-stream wheel -> "${decideFollow(race)}"`,
  decideFollow(race) === "notify",
  'the reader is dragged back down — this is the reported bug, and `sticking ? "scroll"` is what produces it'
);
// The old rule, written out so the difference is on the record rather
// than in a commit message. Same five numbers, opposite answer.
const oldRule = (s) =>
  s.sticking ? "scroll" : s.scrollHeight - s.scrollTop - s.clientHeight > STICK_THRESHOLD_PX ? "notify" : "none";
check(
  `and the rule it replaced answered "${oldRule(race)}" to the same numbers`,
  oldRule(race) === "scroll",
  "the old rule no longer reproduces the bug, so this comparison proves nothing — check it still models what shipped"
);

console.log("\n== 2. ...without breaking the three cases that worked ==");
// GROWTH IS NOT MOVEMENT. Appending content raises scrollHeight and
// leaves scrollTop alone, so a reader at the bottom must keep being
// followed — if this returns anything else, every reply stops
// auto-scrolling and the fix is worse than the bug.
check(
  "content grows while the reader is at the bottom -> scroll",
  decideFollow({ ...TALL, scrollTop: BOTTOM, sticking: true, lastSetTop: BOTTOM }) === "scroll"
);
check(
  "reader is up and the event HAS been delivered -> notify",
  decideFollow({ ...TALL, scrollTop: 1000, sticking: false, lastSetTop: 1000 }) === "notify"
);
check(
  "reader scrolls back to the bottom themselves -> scroll",
  decideFollow({ ...TALL, scrollTop: BOTTOM, sticking: false, lastSetTop: 1000 }) === "scroll",
  "the old rule answered 'none' here: following did not resume until the event landed"
);
check(
  "nothing to say -> none",
  decideFollow({ ...TALL, scrollTop: BOTTOM, sticking: false, lastSetTop: BOTTOM }) === "none"
);

console.log("\n== 3. the edges of the measurement ==");
check(
  "a first call, before the hook has written any position, trusts the flag",
  decideFollow({ ...TALL, scrollTop: 1000, sticking: true, lastSetTop: null }) === "scroll",
  "lastSetTop=null means 'this hook has not moved it', so there is nothing to compare against"
);
// SUB-PIXEL DRIFT IS NOT A HUMAN. Zoom and fractional layout can shift a
// scrollTop we set by a fraction; treating that as a wheel turn would
// stop following for no reason.
// The case has to be drift AFTER the content grew past the threshold.
// Half a pixel while still AT the bottom answers "scroll" with or
// without the tolerance, so it distinguishes nothing — which its own
// mutation suite is what noticed.
check(
  "half a pixel of drift is not a reader",
  decideFollow({
    scrollHeight: 6000,
    clientHeight: 600,
    scrollTop: 4400,
    sticking: true,
    lastSetTop: 4400.5,
  }) === "scroll",
  "sub-pixel layout shift reads as movement and following stops at random"
);
check(
  "two pixels is",
  decideFollow({ ...TALL, scrollTop: BOTTOM - 200, sticking: true, lastSetTop: BOTTOM }) === "notify"
);
// WITHIN THE THRESHOLD IS STILL THE BOTTOM. A reader who nudged up 20px
// is reading the newest message, not the history.
check(
  `a nudge inside the ${STICK_THRESHOLD_PX}px threshold still follows`,
  decideFollow({ ...TALL, scrollTop: BOTTOM - 40, sticking: true, lastSetTop: BOTTOM }) === "scroll"
);

console.log("\n== 4. the hook uses it, and keeps its own record honest ==");
const hookSrc = stripComments(readFileSync("src/hooks/use-stick-to-bottom.ts", "utf8"));
check(
  "follow() asks decideFollow rather than reading the flag",
  /const decision = decideFollow\(\{/.test(hookSrc),
  "the flag is back in charge and the race is back with it"
);
check(
  "...and the old unconditional branch is gone",
  !/if \(stickRef\.current\) \{\s*el\.scrollTop = el\.scrollHeight;/.test(hookSrc),
  "the pre-fix branch is still there"
);
// EVERY WRITER MUST RECORD WHAT IT WROTE, or the next call mistakes the
// hook's own scroll for the reader's and stops following.
// SCOPED TO follow(), because resetToBottom() has the same two lines and
// an unscoped regex matched THAT one instead — so mutating follow() left
// the check green. Anchored on the decision branch, which only follow()
// has.
const followBody = hookSrc.slice(
  hookSrc.indexOf('if (decision === "scroll")'),
  hookSrc.indexOf('const jumpToBottom')
);
check(
  `the follow() branch was located (${followBody.length} chars)`,
  followBody.length > 60 && followBody.length < 900,
  "an empty or runaway slice makes the assertion below meaningless"
);
check(
  "follow() reads the clamped position back",
  /lastSetTopRef\.current = el\.scrollTop;/.test(followBody) &&
    !/lastSetTopRef\.current = el\.scrollHeight;/.test(followBody),
  "storing the unclamped scrollHeight makes every later call look like the reader moved it"
);
check(
  "resetToBottom records its write too",
  /resetToBottom[\s\S]{0,320}?lastSetTopRef\.current = el\.scrollTop;/.test(hookSrc)
);
check(
  "the resize observer records its write too",
  /ResizeObserver\([\s\S]{0,240}?lastSetTopRef\.current = el\.scrollTop;/.test(hookSrc),
  "a container resize would otherwise look like a reader scrolling"
);
check(
  "and the scroll handler records where the reader left it",
  /stickRef\.current = atBottom;\s*lastSetTopRef\.current = el\.scrollTop;/.test(hookSrc)
);

console.log("\n== 5. every surface that streams uses the hook ==");
// Three components stream a reply into a scroll view. A fourth added
// without the hook would have the original bug, with nothing to notice.
const STREAMING = [
  "src/components/chat/chat-workspace.tsx",
  "src/components/create/studio-chat.tsx",
  "src/components/records/ask-ai-modal.tsx",
];
for (const file of STREAMING) {
  const src = stripComments(readFileSync(file, "utf8"));
  check(`${file.replace("src/components/", "")} uses the hook`, /useStickToBottom\(\)/.test(src));
  check(
    `...and attaches onScroll to the container it scrolls`,
    /ref=\{(containerRef|threadRef)\}\s*\n?\s*onScroll=\{(onScroll|onThreadScroll)\}/.test(src),
    "a container with no onScroll never updates the flag, so the reader's position is never known"
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
