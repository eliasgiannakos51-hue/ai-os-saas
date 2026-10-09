#!/usr/bin/env node
/*
 * CAN chat-attachments.test.mjs SEE CHAT READ THE WRONG THING, OR SHOW
 * WHAT IT SHOULD NOT?
 *
 * Somebody else's image read because the path said so, a stored row
 * trusted on the way back, attachments taken with the switch off, a PDF
 * answered for free, the marker streamed to the screen, kept in the row,
 * or out of range, a bracket that was not a marker lost, a refused
 * message's images left behind, send not waiting on a file being read,
 * a document's pages unmarked, a cut document passed off as whole, and a
 * 30 MB PDF uploaded before it is refused. And the four found in the
 * browser on 2026-10-08 (scripts/tests/chat-attachments-edges.prodtest.mjs):
 * a question about a file answered by a help article, or met with a
 * clarifying question that never saw the file; out of credits said in
 * English; a refused PDF's reason in the route's English; a chip's
 * «remove» or «From memory» back under a 44px touch target. And one found
 * on 2026-10-09 checking that round: a follow-up about the conversation's
 * files answered by a help article.
 *
 * Run: node scripts/tests/chat-attachments.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/chat-attachments.test.mjs";
const RUN = "scripts/tests/chat-attachments.itest.mjs";
const TYPES = "src/lib/chat/attachment-types.ts";
const CITE = "src/lib/chat/memory-citations.ts";
const ADMIT = "src/lib/chat/attach-admit.ts";
const CONTENT = "src/lib/chat/attachments.ts";
const ROUTE = "src/app/api/chat/route.ts";
const CHAT = "src/components/chat/chat-workspace.tsx";
const COMPOSER = "src/components/chat/chat-composer.tsx";
const CLIENT = "src/lib/chat/attach-client.ts";
const UI = "src/components/chat/chat-attachments.tsx";

const MUTANTS = [
  {
    name: "an image path in somebody else's folder is taken",
    file: TYPES,
    from: '      if (!a.path.startsWith(`${userId}/`) || a.path.includes("..")) return { ok: false, reason: "notYours" };',
    to: '      if (a.path.includes("..")) return { ok: false, reason: "notYours" };',
    expect: "an image in somebody else's folder is refused",
  },
  {
    name: "a stored row is trusted when it is read back for the model",
    file: TYPES,
    from: '      if (ownerId !== undefined && (!a.path.startsWith(`${ownerId}/`) || a.path.includes(".."))) continue;',
    to: "      void ownerId;",
    expect: "...and read back for the model, an image outside the owner's folder is dropped too",
  },
  {
    name: "attachments are taken with the switch off",
    file: ROUTE,
    from: "    if (!readAttachments.ok || (!attachmentsOn && readAttachments.list.length > 0)) {",
    to: "    if (!readAttachments.ok) {",
    expect: "with it off, attachments in a request are refused (400)",
  },
  {
    name: "a forty-page PDF is answered as a free message",
    file: ROUTE,
    from: "      !bypassCredits && withinFreeSize && withinFreeCost && currentAttachments.length === 0",
    to: "      !bypassCredits && withinFreeSize && withinFreeCost",
    expect: "a message with attachments is never a free one",
  },
  {
    name: "the marker is streamed to the screen",
    file: ROUTE,
    from: "              const shown = memoryHoldback ? memoryHoldback.push(delta) : delta;",
    to: "              const shown = delta;",
    expect: "the stream holds the marker back",
  },
  {
    name: "the marker is kept in the saved answer",
    file: ROUTE,
    from: "          assistantText = takeMemoryMarker(assistantText, memories.length).text;\n",
    to: "",
    expect: "...taking it off the answer that is kept",
  },
  {
    name: "the holdback forwards the marker it should hold",
    file: CITE,
    from: "    return delta.slice(0, at);",
    to: "    return delta;",
    expect: "streamed: everything before the marker is shown as it arrives",
  },
  {
    name: "a number past the remembered facts names one",
    file: CITE,
    from: "        .filter((n) => Number.isInteger(n) && n >= 1 && n <= count)",
    to: "        .filter((n) => Number.isInteger(n) && n >= 1)",
    expect: "a number out of range names nothing",
  },
  {
    name: "a bracket that was not a marker is swallowed",
    file: CITE,
    from: "    return { release: this.held, cited: [] };",
    to: '    return { release: "", cited: [] };',
    expect: "a bracket that is not a marker is held, then shown whole",
  },
  {
    name: "a refused message's images are left in storage",
    file: CHAT,
    from: "        if (carried) void discardChatImages(carried.imagePaths);\n",
    to: "",
    expect: "a refused message's images are removed, and the refusal said",
  },
  {
    name: "send does not wait on a file being read",
    file: COMPOSER,
    from: "    if (!text || holdSend) return;",
    to: "    if (!text) return;",
    expect: "send waits while a file is being read",
  },
  {
    name: "a 30 MB PDF is uploaded before it is refused",
    file: ADMIT,
    from: '    else if (kind === "pdf" && file.size > MAX_FILE_BYTES) refused.push({ name: file.name, why: "pdfTooLarge" });\n',
    to: "",
    expect: "a PDF over 20 MB and an image over 5 MB are refused before uploading",
  },
  {
    name: "the document reaches the model without its pages marked",
    file: CONTENT,
    from: "      .map((page) => `--- ${page.label} ---\\n${page.text}`)",
    to: "      .map((page) => page.text)",
    gate: RUN,
    expect: "...with its pages marked, so «on which page?» has an answer",
  },
  {
    name: "a document cut short is passed off as whole",
    file: CONTENT,
    from: "    const note = cut ? `\\n[Το έγγραφο κόπηκε εδώ: δόθηκαν οι πρώτοι ${share} από ${body.length} χαρακτήρες.]` : \"\";",
    to: '    const note = "";',
    gate: RUN,
    expect: "...and a document cut short says so inside it",
  },
  {
    name: "a question about a picture is answered with a help article",
    file: ROUTE,
    from: "      : carriesFiles\n        ? null\n        : matchCannedAnswer(",
    to: "      : false\n        ? null\n        : matchCannedAnswer(",
    expect: "a message that carries a file is never answered by a help article",
  },
  {
    name: "a follow-up about the conversation's files is answered with a help article",
    file: ROUTE,
    from: "      (await conversationCarriesFiles(supabase, conversationId))\n        ? null\n        : articleMatch;",
    to: "      false\n        ? null\n        : articleMatch;",
    expect: "...nor a follow-up in a conversation whose earlier questions carried one",
  },
  {
    name: "a conversation's files are looked for in the wrong place",
    file: CONTENT,
    from: '    .not("attachments", "is", null)\n',
    to: '    .not("provenance", "is", null)\n',
    expect: "...nor a follow-up in a conversation whose earlier questions carried one",
  },
  {
    name: "«From memory» is 18px tall again",
    file: UI,
    from: '<summary className="flex min-h-[44px] cursor-pointer',
    to: '<summary className="flex cursor-pointer',
    expect: "«remove» on a chip and «From memory» are 44px targets",
  },
  {
    name: "the hourly upload limit is said in the route's English",
    file: CLIENT,
    from: "        ? words.uploadLimit\n",
    to: "        ? outcome.error\n",
    expect: "a PDF Files refused says why in the reader's words: the plan's limit, the hourly limit, or ours",
  },
  {
    name: "the opening question is checked for clarity without its file",
    file: ROUTE,
    from: "!skipClarification && currentAttachments.length === 0) {",
    to: "!skipClarification) {",
    expect: "...and its opening question is not checked for clarity without the file",
  },
  {
    name: "the route stops saying it was credits",
    file: ROUTE,
    from: "          outOfCredits: true,\n",
    to: "",
    expect: "out of credits, the route says so in a flag the screen reads",
  },
  {
    name: "out of credits is said in the route's English again",
    file: CHAT,
    from: "          setError(describeStatus(data.outOfCredits === true ? 402 : 429).text);",
    to: "          setError(data.message);",
    expect: "out of credits, or held back, the Chat says so in its own language",
  },
  {
    name: "a hold refused mid-answer reads as our failure",
    file: CHAT,
    from: "streamError = describeStatus(event.outOfCredits === true ? 402 : 500).text;",
    to: "streamError = describeStatus(500).text;",
    expect: "...and a hold refused once the answer started is not called our failure",
  },
  {
    name: "a scanned PDF's English reason reaches the chip",
    file: CLIENT,
    from: '  if (outcome.file.processing_status !== "ready") return { ok: false, error: words.unreadable };',
    to: '  if (outcome.file.processing_status !== "ready") return { ok: false, error: outcome.file.error ?? words.unreadable };',
    expect: "...and is said in the reader's words, never the route's",
  },
  {
    name: "the plan's file limit is said in the route's English",
    file: CLIENT,
    from: "      ? words.fileLimit\n",
    to: "      ? outcome.error\n",
    expect: "a PDF Files refused says why in the reader's words: the plan's limit, the hourly limit, or ours",
  },
  {
    name: "«remove» on a chip is 32px again",
    file: UI,
    from: '              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"',
    to: '              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground"',
    expect: "«remove» on a chip and «From memory» are 44px targets",
  },
];

runMutations({
  name: "chat-attachments",
  gate: GATE,
  targets: [TYPES, CITE, ADMIT, CONTENT, ROUTE, CHAT, COMPOSER, CLIENT, UI],
  mutants: MUTANTS,
});
