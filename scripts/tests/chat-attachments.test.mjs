/*
 * CHAT READS WHAT YOU GIVE IT (MASTER 16, package 9): «ανεβάζω PDF και
 * εικόνα, ρωτάω για αυτά, και βλέπω ποια στοιχεία μνήμης χρησιμοποίησε».
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. WHAT A REQUEST MAY CARRY: PDFs by id, images inside the sender's
 *      own folder only, within the caps — and a stored row is checked
 *      again when it is read back for the model.
 *   2. WHICH MEMORIES AN ANSWER USED: the facts are numbered, the answer
 *      names them in one marker at its end, the marker never reaches the
 *      screen or the row, and a bracket that is not a marker loses nothing.
 *   3. THE ROUTE, behind the switch "chat-attachments": refused when off,
 *      read before anything is held, never free, in the hold, on the turn,
 *      kept on the row, said on `done`.
 *   4. THE SCREEN: the «+», paste and drop; send waits on a file being
 *      read; a refused message's images are removed; a deleted
 *      conversation's images go with it; a reload shows what the stream
 *      showed.
 *   5. The migration, its canaries, and the words in ten languages.
 *
 * The content loader and the browser half run in
 * scripts/tests/chat-attachments.itest.mjs (they import Supabase); the
 * same in a browser: scripts/tests/chat-attachments.prodtest.mjs.
 *
 * Run: node scripts/tests/chat-attachments.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
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
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
const code = (p) => stripComments(readFileSync(p, "utf8"));

const types = await loadTs("src/lib/chat/attachment-types.ts");
const cite = await loadTs("src/lib/chat/memory-citations.ts");
const prompt = await loadTs("src/lib/chat/memory-prompt.ts");
const admit = await loadTs("src/lib/chat/attach-admit.ts");

console.log("chat-attachments");

// ---------------------------------------------------------------------
console.log("\n== 1. what a request may carry ==");
// ---------------------------------------------------------------------
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
let r = types.readChatAttachments(undefined, ME);
check("nothing attached is an empty list", r.ok && r.list.length === 0);
r = types.readChatAttachments(
  [
    { kind: "pdf", fileId: FILE, name: "menu.pdf" },
    { kind: "image", path: `${ME}/1-photo.png`, name: "photo.png" },
  ],
  ME
);
check("a PDF by id and an image in the sender's folder are taken", r.ok && r.list.length === 2 && r.list[0].fileId === FILE && r.list[1].path === `${ME}/1-photo.png`);
r = types.readChatAttachments([{ kind: "image", path: `${OTHER}/1-photo.png`, name: "x.png" }], ME);
check("an image in somebody else's folder is refused", !r.ok && r.reason === "notYours");
r = types.readChatAttachments([{ kind: "image", path: `${ME}/../${OTHER}/1.png`, name: "x.png" }], ME);
check("...and a path that climbs out of the folder", !r.ok && r.reason === "notYours");
r = types.readChatAttachments([{ kind: "pdf", fileId: "not-a-uuid", name: "a.pdf" }], ME);
check("a file id that is not an id is refused", !r.ok && r.reason === "shape");
r = types.readChatAttachments([{ kind: "pdf", fileId: FILE }], ME);
check("...and an attachment with no name", !r.ok && r.reason === "shape");
r = types.readChatAttachments("menu.pdf", ME);
check("...and anything that is not a list", !r.ok && r.reason === "shape");
const pdf = (n) => ({ kind: "pdf", fileId: `33333333-3333-4333-8333-33333333333${n}`, name: `${n}.pdf` });
r = types.readChatAttachments([pdf(1), pdf(2), pdf(3), pdf(4)], ME);
check(`more than ${types.MAX_CHAT_FILES} PDFs in one message is refused`, !r.ok && r.reason === "tooMany" && types.MAX_CHAT_FILES === 3);
const img = (n) => ({ kind: "image", path: `${ME}/${n}.png`, name: `${n}.png` });
r = types.readChatAttachments([img(1), img(2), img(3), img(4)], ME);
check(`more than ${types.MAX_ATTACHMENT_IMAGES} images too`, !r.ok && r.reason === "tooMany");

const stored = [pdf(1), img(1), { kind: "image", path: `${OTHER}/9.png`, name: "theirs.png" }, { kind: "video", name: "v" }, null];
check("a stored row is read defensively: what is malformed is dropped", types.parseStoredAttachments(stored).length === 3 && types.parseStoredAttachments("x").length === 0);
check("...and read back for the model, an image outside the owner's folder is dropped too",
  types.parseStoredAttachments(stored, ME).length === 2 && !types.parseStoredAttachments(stored, ME).some((a) => a.path?.startsWith(OTHER)));

const earlier = [[pdf(1)], [pdf(2), img(1)], [pdf(1)]];
const current = [pdf(3), img(2)];
let all = types.conversationAttachments(earlier, current);
check("what the conversation carried is counted once each", all.filter((a) => a.fileId?.endsWith("1")).length === 1 && all.length === 5);
all = types.conversationAttachments([[pdf(1)], [pdf(2)], [pdf(4)]], [pdf(3)]);
check("beyond the cap the newest win, and this message's own are always kept",
  all.length === 3 && all.some((a) => a.fileId?.endsWith("3")) && !all.some((a) => a.fileId?.endsWith("1")), all.map((a) => a.name).join(","));

// ---------------------------------------------------------------------
console.log("\n== 1b. which chosen files the browser takes ==");
// ---------------------------------------------------------------------
const f = (name, type, size) => ({ name, type, size });
let a = admit.admitFiles([f("a.pdf", "application/pdf", 1000), f("b.png", "image/png", 1000), f("c.jpg", "image/jpeg", 1000)], { pdfs: 0, images: 0 });
check("PDFs, PNGs and JPGs are taken", a.taken.map((t) => t.kind).join() === "pdf,image,image" && a.refused.length === 0);
a = admit.admitFiles([f("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 10), f("b.gif", "image/gif", 10)], { pdfs: 0, images: 0 });
check("anything else is refused, and each one said", a.taken.length === 0 && a.refused.map((r) => r.why).join() === "type,type");
a = admit.admitFiles([f("a.pdf", "application/pdf", 21 * 1024 * 1024), f("b.png", "image/png", 6 * 1024 * 1024)], { pdfs: 0, images: 0 });
check("a PDF over 20 MB and an image over 5 MB are refused before uploading", a.refused.map((r) => r.why).join() === "pdfTooLarge,imageTooLarge");
a = admit.admitFiles([f("a.pdf", "application/pdf", 10), f("b.pdf", "application/pdf", 10)], { pdfs: 2, images: 3 });
check("the caps count what the message already carries", a.taken.map((t) => t.file.name).join() === "a.pdf" && a.refused[0]?.why === "tooManyPdfs");
a = admit.admitFiles([f("x.png", "image/png", 10)], { pdfs: 0, images: 3 });
check("...images too", a.refused[0]?.why === "tooManyImages");
check("a PDF with no type, by its name", admit.attachKindOf({ name: "scan.PDF", type: "" }) === "pdf");
check("the file picker offers exactly these", admit.CHAT_ACCEPT === "application/pdf,image/jpeg,image/png");

// ---------------------------------------------------------------------
console.log("\n== 2. which memories an answer used ==");
// ---------------------------------------------------------------------
const facts = [
  { id: "m1", text: "Η επιχείρηση λέγεται Αύρα", timesSeen: 3, lastSeenAt: new Date().toISOString() },
  { id: "m2", text: "Προτιμά σύντομες απαντήσεις", timesSeen: 1, lastSeenAt: new Date().toISOString() },
  { id: "m3", text: "Μένει στη Νάξο", timesSeen: 2, lastSeenAt: new Date().toISOString() },
];
const numbered = prompt.buildMemoryPromptAddition(facts, { numbered: true });
check("numbered, the facts carry the numbers the answer names", /\n\[1\] Η επιχείρηση/.test(numbered) && /\n\[3\] Μένει/.test(numbered));
check("...and unnumbered they are the bullets they always were", /\n- Η επιχείρηση/.test(prompt.buildMemoryPromptAddition(facts)) && !/\[1\]/.test(prompt.buildMemoryPromptAddition(facts)));
const instruction = cite.memoryCitationInstruction(3);
check("the instruction says the range and the one marker", /από 1 ως 3/.test(instruction) && instruction.includes("⟦μνήμη: 1, 3⟧"));
check("...and there is none with nothing remembered", cite.memoryCitationInstruction(0) === "");

let taken = cite.takeMemoryMarker("Η Αύρα στη Νάξο.\n⟦μνήμη: 3, 1, 1⟧", 3);
check("the marker is taken off the answer", taken.text === "Η Αύρα στη Νάξο.");
check("...and read: in order, once each", taken.cited.join(",") === "1,3");
taken = cite.takeMemoryMarker("Απάντηση.\n⟦μνήμη: 2, 7, 0⟧", 3);
check("a number out of range names nothing", taken.cited.join(",") === "2");
taken = cite.takeMemoryMarker("Το ⟦σύμβολο⟧ είναι αγκύλη.", 3);
check("an answer without a marker is left whole", taken.text === "Το ⟦σύμβολο⟧ είναι αγκύλη." && taken.cited.length === 0);
const used = cite.citedMemories(facts, [1, 3]);
check("the numbers become the facts, with their rows", used.length === 2 && used[0].id === "m1" && used[1].text === "Μένει στη Νάξο");

function stream(deltas, count = 3) {
  const h = new cite.MemoryMarkerHoldback();
  let shown = "";
  for (const d of deltas) shown += h.push(d);
  const end = h.finish(count);
  return { shown, release: end.release, cited: end.cited };
}
let s = stream(["Η Αύρα ", "είναι στη Νάξο.", "\n", "⟦μνή", "μη: 1, 3", "⟧"]);
check("streamed: everything before the marker is shown as it arrives", s.shown === "Η Αύρα είναι στη Νάξο.\n");
check("...the marker, split over three pieces, is never shown", s.release === "" && s.cited.join(",") === "1,3");
s = stream(["Γράψε ", "⟦έτσι⟧", " με αγκύλες."]);
check("a bracket that is not a marker is held, then shown whole", s.shown + s.release === "Γράψε ⟦έτσι⟧ με αγκύλες." && s.cited.length === 0);
s = stream(["Τίποτα από τη μνήμη."]);
check("an answer that used nothing streams untouched", s.shown === "Τίποτα από τη μνήμη." && s.release === "" && s.cited.length === 0);

const basis = cite.readAnswerBasis({ modules: { entryCount: 2, moduleCount: 1, sources: [] }, memories: [{ id: "m1", text: "Αύρα" }, { text: 5 }, "x"] });
check("a stored answer gives back what it stood on", basis.modules?.entryCount === 2 && basis.memories.length === 1 && basis.memories[0].id === "m1");
check("...and a row without it, nothing", cite.readAnswerBasis(null).modules === null && cite.readAnswerBasis({ modules: "x" }).memories.length === 0);

// ---------------------------------------------------------------------
console.log("\n== 3. the route ==");
// ---------------------------------------------------------------------
const route = code("src/app/api/chat/route.ts");
check('"chat-attachments" is declared as a switch', /\n  "chat-attachments": "/.test(code("src/lib/flags/flags.ts")));
check("the route reads it", /const attachmentsOn = await isFeatureOn\("chat-attachments", user\);/.test(route));
check("with it off, attachments in a request are refused (400)",
  /if \(!readAttachments\.ok \|\| \(!attachmentsOn && readAttachments\.list\.length > 0\)\) \{\s*return NextResponse\.json\(\s*\{ ok: false, reason: "bad_attachments"[\s\S]{0,80}\{ status: 400 \}/.test(route));
const notReady = route.indexOf('reason: "attachment_not_ready"');
check("an attachment that cannot be read is said (409) before anything is held or free-counted",
  notReady > 0 && notReady < route.indexOf("consumeFreeChatMessage(") && notReady < route.indexOf("await reserveCredits(") &&
  /if \(currentAttachmentContent && currentAttachmentContent\.missing\.length > 0\) \{\s*return NextResponse\.json\(\s*\{ ok: false, reason: "attachment_not_ready"[\s\S]{0,120}\{ status: 409 \}/.test(route));
check("a message with attachments is never a free one", /withinFreeCost && currentAttachments\.length === 0\s*\? await consumeFreeChatMessage/.test(route));
check("the price check counts them", /inputChars: message\.length \+ systemPrompt\.length \+ \(currentAttachmentContent \? attachmentInputChars\(currentAttachmentContent\) : 0\)/.test(route));
check("...and so does the hold, earlier ones included", /inputChars: message\.length \+ historyChars \+ systemPrompt\.length \+ attachmentChars,/.test(route));
check("they ride on this turn, before the question", /content: \[\s*\.\.\.attachmentBlocks,[\s\S]{0,400}\{ type: "text", text: message \},\s*\],/.test(route));
check("what earlier messages carried is read back, checked against the owner", /parseStoredAttachments\(m\.attachments, user\.id\)/.test(route));
check("the memories are numbered only with the switch on, and the answer asked to name them",
  /const citeMemories = attachmentsOn && memories\.length > 0;/.test(route) &&
  /buildMemoryPromptAddition\(memories, \{ numbered: citeMemories \}\) \+\s*\(citeMemories \? memoryCitationInstruction\(memories\.length\) : ""\)/.test(route));
check("the stream holds the marker back", /const shown = memoryHoldback \? memoryHoldback\.push\(delta\) : delta;\s*if \(shown\) safeEnqueue\(controller, ndjsonLine\(\{ type: "delta", text: shown \}\)\);/.test(route));
const finish = route.indexOf("memoryHoldback.finish(memories.length)");
check("...and reads it before the answer is remembered, settled or saved",
  finish > 0 && finish < route.indexOf("await extractAndStoreMemory(") && finish < route.indexOf("const settlement = await settleReservation(") && finish < route.indexOf("attachWebSources(assistantText"));
check("...taking it off the answer that is kept", /assistantText = takeMemoryMarker\(assistantText, memories\.length\)\.text;\s*memoriesUsed = citedMemories\(memories, finished\.cited\);/.test(route));
check("...releasing a held tail that was not a marker", /if \(finished\.release\) safeEnqueue\(controller, ndjsonLine\(\{ type: "delta", text: finished\.release \}\)\);/.test(route));
check("a stopped answer is kept without a half-written marker", /assistantText: memoryHoldback \? assistantText\.split\(MEMORY_MARK_OPEN\)\[0\]\.trimEnd\(\) : assistantText,/.test(route));
check("the user's row keeps what it carried", /\.insert\(currentAttachments\.length > 0 \? \{ \.\.\.userRow, attachments: currentAttachments \} : userRow\)/.test(route));
check("the answer's row keeps what it stood on", /attachmentsOn \? \{ \.\.\.assistantInsert, provenance: \{ modules: hasProvenance\(provenance\) \? provenance : null, memories: memoriesUsed \} \} : assistantInsert/.test(route));
check("a database without the columns still saves both messages (and reads history)",
  (route.match(/isMissingColumn\(/g) ?? []).length === 3);
check("`done` says which memories were used", /memoriesUsed: memoriesUsed\.length > 0 \? memoriesUsed : undefined,/.test(route));
// FOUND IN THE BROWSER ON 2026-10-08 (scripts/tests/chat-attachments-edges.prodtest.mjs
// walks each one through the real routes): a message that carries a file
// is about the file.
check("a message that carries a file is never answered by a help article",
  /const carriesFiles = Array\.isArray\(rawAttachments\) && rawAttachments\.length > 0;/.test(route) &&
  /: carriesFiles\s*\?\s*null\s*:\s*matchCannedAnswer\(/.test(route));
// A follow-up with nothing new attached, in a conversation whose earlier
// questions carried a file (found 2026-10-09 by the check of the report
// above): its files go to the model with it, so it is about them too.
check("...nor a follow-up in a conversation whose earlier questions carried one",
  /articleMatch &&\s*conversationId &&\s*\(await isFeatureOn\("chat-attachments", user\)\) &&\s*\(await conversationCarriesFiles\(supabase, conversationId\)\)\s*\?\s*null\s*:\s*articleMatch;/.test(route) &&
  /\.eq\("conversation_id", conversationId\)\s*\.eq\("role", "user"\)\s*\.not\("attachments", "is", null\)\s*\.limit\(1\);\s*if \(error\) return false;\s*return \(data \?\? \[\]\)\.length > 0;/.test(code("src/lib/chat/attachments.ts")));
check("...and its opening question is not checked for clarity without the file",
  /history\.length === 0 && !isFreeMessage && !skipClarification && currentAttachments\.length === 0\)/.test(route));
check("out of credits, the route says so in a flag the screen reads",
  /rateLimited: true,\s*outOfCredits: true,\s*message: insufficientCreditsMessage\(/.test(route));

// ---------------------------------------------------------------------
console.log("\n== 4. the screen ==");
// ---------------------------------------------------------------------
check("the Chat page reads the switch", /attachments=\{await isFeatureOn\("chat-attachments", user\)\}/.test(code("src/app/dashboard/chat/page.tsx")));
const composer = code("src/components/chat/chat-composer.tsx");
check("the «+» is drawn only when the screen passes `attach`", /\{attach && \(\s*<>\s*<button[\s\S]{0,300}data-testid="composer-attach"/.test(composer));
check("...a chosen, pasted or dropped file goes the same way", /onPaste=\{attach \? handlePaste : undefined\}/.test(composer) && /onDrop=\{attach \? handleDrop : undefined\}/.test(composer) && (composer.match(/takeFiles\(/g) ?? []).length === 4);
check("send waits while a file is being read", /if \(!text \|\| holdSend\) return;/.test(composer) && /disabled=\{sending \|\| holdSend \|\| !input\.trim\(\)\}/.test(composer));
const ws = code("src/components/chat/chat-workspace.tsx");
check("the workspace gives the composer the «+», the tray and the wait, behind the switch",
  /attach=\{attachments \? \{ accept: CHAT_ACCEPT, label: t\("attach\.label"\), onFiles: attach\.add \} : undefined\}/.test(ws) && /holdSend=\{attachments && attach\.hold\}/.test(ws));
check("the images go up at send, and a failure sends nothing", /const prepared = await attach\.prepare\(\);\s*if \(!prepared\.ok\) \{\s*setSending\(false\);\s*setError\(prepared\.error\);/.test(ws));
check("the request carries them", /\.\.\.\(carried \? \{ attachments: carried\.attachments \} : \{\}\),\s*\}\),/.test(ws));
check("a refused message's images are removed, and the refusal said",
  /if \(carried\) void discardChatImages\(carried\.imagePaths\);\s*if \(data\?\.reason === "attachment_not_ready"\) \{\s*setError\(t\("attach\.notReady"/.test(ws) && /data\?\.reason === "bad_attachments"\) \{\s*setError\(t\("attach\.refused"\)\)/.test(ws));
check("...and once the message is saved the tray empties", /if \(carried\) attach\.clear\(\);/.test(ws));
check("a deleted conversation's images go with it, only after the delete succeeded",
  /if \(deleteError\) \{[\s\S]{0,160}return;\s*\}\s*const imagePaths = [\s\S]{0,200}void discardChatImages\(imagePaths\);/.test(ws));
check("a reload shows what the stream showed", /const basis = readAnswerBasis\(stored\);[\s\S]{0,200}attachments: parseStoredAttachments\(storedAttachments\),\s*provenance: basis\.modules \?\? undefined,\s*memoriesUsed: basis\.memories,/.test(ws));
check("the memories used arrive on `done` and are drawn under the answer", /memoriesUsed = readMemoriesUsed\(event\.memoriesUsed\);/.test(ws) && /<MemoriesUsed memories=\{msg\.memoriesUsed\} \/>/.test(ws));
check("the message shows what it carried", /<SentAttachments attachments=\{msg\.attachments\} previews=\{msg\.previews\} \/>/.test(ws));
const ui = code("src/components/chat/chat-attachments.tsx");
check("a PDF is read by Files as soon as it is chosen", /attachPdf\(file, \{/.test(ui));
check("...send waits while one is being read, or a failed one is still there", /hold: reading \|\| failed,/.test(ui));
check("every refusal is said", /if \(refused\.length > 0\) onRefused\(/.test(ui));
check("«From memory» links to what Ionexa remembers", /href="\/dashboard\/ai-memory"/.test(ui));
check("a sent PDF opens in Files", /\/dashboard\/files\?record=\$\{encodeURIComponent\(a\.fileId\)\}/.test(ui));
// 44px touch targets (docs/CONTEXT.md); measured in a browser by
// scripts/tests/chat-attachments-edges.prodtest.mjs, held here between runs.
check("«remove» on a chip and «From memory» are 44px targets",
  /className="flex h-11 w-11 shrink-0[^"]*"\s*>\s*<X /.test(ui) && /<summary className="flex min-h-\[44px\]/.test(ui));
const client = code("src/lib/chat/attach-client.ts");
check("images are all or nothing: a partial upload is removed", /if \(failed\) \{\s*await discardChatImages\(results\.filter\(\(r\) => !r\.error\)\.map\(\(r\) => r\.path\)\);/.test(client));
check("a PDF Files could not read is not attached", /if \(outcome\.file\.processing_status !== "ready"\) return \{ ok: false/.test(client));
// IN THE READER'S LANGUAGE: the Files routes and the chat route answer in
// English, and those sentences reached a Greek screen as they came.
check("...and is said in the reader's words, never the route's",
  /if \(outcome\.file\.processing_status !== "ready"\) return \{ ok: false, error: words\.unreadable \};/.test(client));
check("a PDF Files refused says why in the reader's words: the plan's limit, the hourly limit, or ours",
  /outcome\.limitReached\s*\?\s*words\.fileLimit\s*:\s*outcome\.status === 429\s*\?\s*words\.uploadLimit\s*:\s*ours\.includes\(outcome\.error\)\s*\?\s*outcome\.error\s*:\s*words\.error/.test(client) &&
  (code("src/lib/files/upload-file.ts").match(/status: response\.status,?\s*limitReached: data\?\.limitReached === true/g) ?? []).length === 2 &&
  /fileLimit: t\("fileLimit", \{ name: file\.name \}\),\s*uploadLimit: t\("uploadLimit"\),/.test(ui));
check("out of credits, or held back, the Chat says so in its own language",
  /setError\(describeStatus\(data\.outOfCredits === true \? 402 : 429\)\.text\);/.test(ws) && !/setError\(data\.message\)/.test(ws));
check("...and a hold refused once the answer started is not called our failure",
  /streamError = describeStatus\(event\.outOfCredits === true \? 402 : 500\)\.text;/.test(ws));

// ---------------------------------------------------------------------
console.log("\n== 5. the migration and the words ==");
// ---------------------------------------------------------------------
const mig = readFileSync("supabase/migrations/20261018000000_chat_message_attachments.sql", "utf8");
check("the migration adds both columns, idempotently", /add column if not exists attachments jsonb;/.test(mig) && /add column if not exists provenance jsonb;/.test(mig));
const canaries = code("src/lib/health/schema-canaries.ts");
check("/api/health names both if they are missing",
  /table: "chat_messages",\s*column: "attachments",\s*migration: "20261018000000_chat_message_attachments\.sql"/.test(canaries) &&
  /table: "chat_messages",\s*column: "provenance",\s*migration: "20261018000000_chat_message_attachments\.sql"/.test(canaries));
const KEYS = ["label", "reading", "pages", "readyPdf", "readyImage", "remove", "unreadable", "offline", "type", "pdfTooLarge", "imageTooLarge",
  "tooManyPdfs", "tooManyImages", "holdReading", "holdFailed", "imageUpload", "notReady", "refused", "openInFiles", "memoryUsed", "manageMemory",
  "fileLimit", "uploadLimit"];
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the ten languages (${LOCALES.length})`, LOCALES.length === 10);
check(`the words to look for (${KEYS.length})`, KEYS.length >= 23);
for (const file of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.chat?.attach ?? {};
  const empty = KEYS.filter((k) => typeof m[k] !== "string" || !m[k].trim());
  check(`${file}: the words (${KEYS.length})`, empty.length === 0, empty.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
