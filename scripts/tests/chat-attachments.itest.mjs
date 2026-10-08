/*
 * WHAT A CHAT MESSAGE CARRIES, RUN (package 9): the content loader the
 * route reads attachments through (src/lib/chat/attachments.ts), against a
 * fake database and real images, so what each case turns into is held, not
 * read off the source. Which chosen files the browser takes is run in
 * scripts/tests/chat-attachments.test.mjs (lib/chat/attach-admit.ts is pure).
 *
 * Run: node scripts/tests/chat-attachments.itest.mjs
 */
import sharp from "sharp";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}

// WITH ITS DEPENDENCIES: the loader imports the Files store and the image
// downloader (sharp).
const { loadTsWithDeps } = await import("./load-ts.mjs");
const content = await loadTsWithDeps("src/lib/chat/attachments.ts");

console.log("chat-attachments (run)");

const ME = "11111111-1111-4111-8111-111111111111";
const F1 = "33333333-3333-4333-8333-333333333331";
const F2 = "33333333-3333-4333-8333-333333333332";
const THEIRS = "33333333-3333-4333-8333-333333333339";
const READING = "33333333-3333-4333-8333-333333333338";
const rows = [
  { id: F1, user_id: ME, filename: "menu.pdf", processing_status: "ready", extracted_text: "[[PAGE 1|Σελίδα 1]]\nΚαλωσόρισμα\n[[PAGE 2|Σελίδα 2]]\nΜουσακάς 12 ευρώ" },
  { id: F2, user_id: ME, filename: "big.pdf", processing_status: "ready", extracted_text: "[[PAGE 1|Σελίδα 1]]\n" + "α".repeat(200_000) },
  { id: THEIRS, user_id: "someone-else", filename: "theirs.pdf", processing_status: "ready", extracted_text: "[[PAGE 1|Σελίδα 1]]\nμυστικό" },
  { id: READING, user_id: ME, filename: "slow.pdf", processing_status: "processing", extracted_text: null },
];
const png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: { r: 200, g: 50, b: 50 } } }).png().toBuffer();
const objects = new Map([
  [`${ME}/1-photo.png`, new Blob([png], { type: "image/png" })],
  [`${ME}/2-notes.txt`, new Blob(["x"], { type: "text/plain" })],
]);
const downloads = [];
function fakeSupabase() {
  return {
    from(table) {
      const filters = [];
      const q = {
        select: () => q,
        eq: (col, val) => (filters.push((r) => r[col] === val), q),
        in: (col, vals) => (filters.push((r) => vals.includes(r[col])), q),
        then: (resolve) => resolve({ data: table === "user_files" ? rows.filter((r) => filters.every((f) => f(r))) : [], error: null }),
      };
      return q;
    },
    storage: {
      from: (bucket) => ({
        download: async (path) => {
          downloads.push({ bucket, path });
          const blob = objects.get(path);
          return blob ? { data: blob, error: null } : { data: null, error: { message: "Object not found" } };
        },
      }),
    },
  };
}

// ---------------------------------------------------------------------
console.log("\n== the content loader ==");
// ---------------------------------------------------------------------
let out = await content.loadAttachmentContent(fakeSupabase(), ME, [{ kind: "pdf", fileId: F1, name: "menu.pdf" }], "itest");
const doc = out.blocks[0]?.text ?? "";
check("a PDF goes as its text, named", out.blocks.length === 1 && doc.startsWith('<document name="menu.pdf">') && doc.endsWith("</document>"));
check("...with its pages marked, so «on which page?» has an answer", /--- Σελίδα 2 ---\nΜουσακάς 12 ευρώ/.test(doc) && !doc.includes("[[PAGE"));
check("...and its size counted for the hold", out.textChars === doc.length && content.attachmentInputChars(out) === doc.length);

out = await content.loadAttachmentContent(fakeSupabase(), ME, [{ kind: "pdf", fileId: F2, name: "big.pdf" }, { kind: "pdf", fileId: F1, name: "menu.pdf" }], "itest");
const big = out.blocks[0]?.text ?? "";
check("one budget for all the text, shared evenly", big.length < content.CHAT_ATTACHMENT_TEXT_CHARS / 2 + 400 && out.blocks.length === 2);
check("...and a document cut short says so inside it", /Το έγγραφο κόπηκε εδώ/.test(big) && !/κόπηκε/.test(out.blocks[1].text));

out = await content.loadAttachmentContent(fakeSupabase(), ME, [{ kind: "pdf", fileId: THEIRS, name: "theirs.pdf" }], "itest");
check("somebody else's file is not read — it is named as missing", out.blocks.length === 0 && out.missing.join() === "theirs.pdf");
out = await content.loadAttachmentContent(fakeSupabase(), ME, [{ kind: "pdf", fileId: READING, name: "slow.pdf" }], "itest");
check("a file still being read is named as missing", out.blocks.length === 0 && out.missing.join() === "slow.pdf");

downloads.length = 0;
out = await content.loadAttachmentContent(fakeSupabase(), ME, [{ kind: "image", path: `${ME}/1-photo.png`, name: "photo.png" }], "itest");
const image = out.blocks[0];
check("an image goes as an image, from the attachments bucket", image?.type === "image" && image.source.media_type === "image/png" && downloads[0]?.bucket === "create-attachments");
const meta = image ? await sharp(Buffer.from(image.source.data, "base64")).metadata() : null;
check("...resized to what the model reads (1568px at most)", meta !== null && meta.width === 1568 && meta.height === 784, meta && `${meta.width}x${meta.height}`);
check("...and weighed in the hold", out.imageCount === 1 && content.attachmentInputChars(out) === content.IMAGE_INPUT_CHARS);
out = await content.loadAttachmentContent(fakeSupabase(), ME, [{ kind: "image", path: `${ME}/9-gone.png`, name: "gone.png" }, { kind: "image", path: `${ME}/2-notes.txt`, name: "notes.txt" }], "itest");
check("an image that is gone, or is not an image, is named as missing", out.blocks.length === 0 && out.missing.join() === "gone.png,notes.txt");

check("a missing column is recognised in each shape the database says it",
  content.isMissingColumn({ code: "42703" }) && content.isMissingColumn({ code: "PGRST204" }) &&
  content.isMissingColumn({ message: "Could not find the 'attachments' column of 'chat_messages' in the schema cache" }) &&
  !content.isMissingColumn({ code: "23505", message: "duplicate key" }) && !content.isMissingColumn(null));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
