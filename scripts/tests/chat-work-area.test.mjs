// THE WORK AREA BESIDE THE CONVERSATION (ΣΥΣΤΗΜΑ DESIGN §5, «ΠΕΡΙΟΧΗ
// ΔΟΥΛΕΙΑΣ», Δ.2), BEHIND ITS SWITCH (MASTER Μέρος 13 Β).
//
// The rule that decides what opens there (src/lib/chat/work-area.ts) is
// RUN on real shapes: code, a long structured document, a short reply. The
// component (src/components/chat/work-area.tsx) and its wiring in
// chat-workspace.tsx are read with comments stripped: 40/60 on a computer
// on the workspace surface, the whole screen with a way back on a phone,
// at most two tabs, copy and download, a card that reopens it — and none
// of it unless the page read the switch as on.
//
// Run: node scripts/tests/chat-work-area.test.mjs
import { readFileSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

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

console.log("== 1. what opens beside the conversation, run ==");
const w = await loadTs("src/lib/chat/work-area.ts");
const code = "Here is the script:\n\n```python\n" + Array.from({ length: 10 }, (_, i) => `print(${i})`).join("\n") + "\n```\n";
const doc = "# Πλάνο εβδομάδας\n\n" + Array.from({ length: 30 }, (_, i) => `- Βήμα ${i + 1}: κάτι που πρέπει να γίνει σήμερα.`).join("\n");
const short = "Ναι, αυτό ισχύει. Η Αθήνα είναι η πρωτεύουσα.";
const longFlat = "Λέξη ".repeat(400);
const smallCode = "Try `x = 1` or:\n\n```js\nconst a = 1;\n```";
const ci = w.workItemFrom(code);
check("code of eight lines or more opens there, as code", ci?.kind === "code" && ci.blocks.length === 1 && ci.blocks[0].language === "python");
check("...and downloads as the file it is", ci?.fileName.endsWith(".py") && ci.fileBody === ci.blocks[0].code, ci?.fileName);
const di = w.workItemFrom(doc);
check("a long document with headings or lists opens there, as a document", di?.kind === "document" && di.title === "Πλάνο εβδομάδας", di?.title);
check("...and downloads as the whole answer in Markdown", di?.fileName.endsWith(".md") && di.fileBody === doc.trim());
check("a short reply stays a reply", w.workItemFrom(short) === null);
check("a long reply with no structure stays a reply", w.workItemFrom(longFlat) === null);
check("a few lines of code stay in the reply", w.workItemFrom(smallCode) === null);
check("the file name survives Greek", /^[\p{L}\p{N}-]+\.md$/u.test(di?.fileName ?? ""), di?.fileName);

console.log("\n== 2. the area: 40/60, the workspace surface, the whole screen on a phone ==");
const area = stripComments(readFileSync("src/components/chat/work-area.tsx", "utf8"));
check("on a computer it takes about 60% beside the conversation, on the workspace surface",
  /className="fixed inset-0 z-\[60\] flex flex-col bg-workspace lg:static lg:z-auto lg:w-\[60%\] lg:shrink-0 lg:border-s lg:border-border"/.test(area));
check("on a phone it is the whole screen, with a button back to the conversation",
  /onClick=\{onClose\} aria-label=\{t\("back"\)\} data-testid="work-area-back" className=\{`\$\{ACTION\} lg:hidden`\}/.test(area));
check("one row on top: the name, at most two tabs, copy and download",
  /\(\["text", "code"\] as const\)\.map/.test(area) && /data-testid="work-area-copy"/.test(area) && /data-testid="work-area-download"/.test(area));
check("...and the tabs only when there is code to show", /\{hasCode && \(/.test(area));
check("the download is the item's own file, and the object URL is released", /a\.download = item\.fileName;/.test(area) && /URL\.revokeObjectURL\(url\);/.test(area));
check("every control in the row is 44px", /const ACTION =\s*"inline-flex h-11 w-11 /.test(area) && /min-h-\[44px\] rounded-item px-3/.test(area));
check("the card that reopens it is in the conversation, and says whether it is open", /data-testid="result-card"/.test(area) && /aria-pressed=\{open\}/.test(area));

console.log("\n== 3. none of it without the switch ==");
const ws = stripComments(readFileSync("src/components/chat/chat-workspace.tsx", "utf8"));
const page = stripComments(readFileSync("src/app/dashboard/chat/page.tsx", "utf8"));
check("the page reads the switch for this account", /workArea=\{await isFeatureOn\("chat-work-area", user\)\}/.test(page));
check("with the switch off, no answer has an item, so no card is drawn", /if \(!workArea\) return map;/.test(ws) && /\{workItems\.get\(msg\.id\) && \(/.test(ws));
check("an answer that produced something opens the area at once, only with the switch on",
  /if \(workArea && workItemFrom\(finalContent \?\? accumulatedText\)\) setOpenWorkId\(answerId\);/.test(ws));
check("the area is drawn beside the conversation column", /\{openWorkItem && <WorkArea item=\{openWorkItem\} onClose=\{\(\) => setOpenWorkId\(null\)\} \/>\}/.test(ws));
check("...and closes when the conversation changes", /useEffect\(\(\) => setOpenWorkId\(null\), \[activeId\]\);/.test(ws));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
