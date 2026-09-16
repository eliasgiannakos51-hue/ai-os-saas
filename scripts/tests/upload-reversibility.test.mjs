// THE BYTES GO FIRST AND THE ROW GOES SECOND, SO WHAT UNDOES THE BYTES?
//
// Every upload in this product is two steps: the object into the bucket,
// then the thing that points at it — a user_files row, a deck, a
// generation request. Between them is a window, and everything that can
// go wrong in that window leaves an object nothing refers to.
//
// AN ORPHAN IS NOT MERELY UNTIDY HERE, and lib/files/ingest.ts says why
// in its own words: "an invisible, uncountable, undeletable file sitting
// in the bucket ... Remove it." Invisible because the quota is summed
// from user_files.size_bytes (lib/files/store.ts) and an object with no
// row contributes nothing to it. Undeletable because the delete button
// works from the row.
//
// WHAT THIS GATE EXISTS FOR. ingest.ts gets it right. It is the FALLBACK
// path — the one used when the browser cannot reach storage directly.
// The primary path, uploadDirect() in components/files/files-workspace.tsx,
// uploaded and then called /api/files/register and did nothing at all when
// that call failed. Two paths through one feature, one reversible; the
// convention existed and was followed by the half that wrote it down.
// Measured 2026-09-16, along with the same gap in the Create and
// Presentations attachment flows.
//
// THE RULE. A file that uploads either undoes it — a .remove() somewhere
// in the same file — or is DECLARED below with the sweeper that collects
// its orphans instead, and the sweeper has to exist and name that bucket.
//
// Run: node scripts/tests/upload-reversibility.test.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0,
  fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
})("src");

// Comments stripped before matching, because this file's whole subject is
// a `.remove(` that is TALKED about rather than called — the header above
// quotes one, and a scan that counted it would excuse the very file it is
// quoting.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const UPLOADS = /\.upload\s*\(/;
// A STORAGE remove, and one that comes AFTER the upload. Both halves were
// bought with a mutant that the first version of this file let through.
//
//   `.remove(` alone matched `link.remove()` — a DOM call on an anchor
//   element in files-workspace.tsx, 200 lines below the upload and about
//   a download — so deleting the real compensating delete left the gate
//   green. A line-level match standing in for a structural property, in
//   the gate written for exactly that shape.
//
//   Position matters because lib/files/ingest.ts removes twice: once at
//   line 105, BEFORE the upload, to clear the object a re-upload is
//   replacing, and once after, when the row could not be written. Only
//   the second is an undo. Without the ordering, the first excused the
//   absence of the second.
const STORAGE_REMOVE = /\.from\s*\([^)]*\)\s*\n?\s*\.remove\s*\(/g;
function undoesItsUpload(text) {
  const lastUpload = text.lastIndexOf(".upload(");
  if (lastUpload === -1) return false;
  for (const m of text.matchAll(STORAGE_REMOVE)) {
    if (m.index > lastUpload) return true;
  }
  return false;
}

const source = new Map(files.map((f) => [f, strip(readFileSync(f, "utf8"))]));
const uploaders = files.filter((f) => UPLOADS.test(source.get(f)));

check(`the tree was read (${files.length} files)`, files.length >= 300, "the walk found almost nothing");
check(`files that upload (${uploaders.length})`, uploaders.length >= 5, "the upload detector matched nothing, so every check below is vacuous");

// ---------------------------------------------------------------------
// The ones that do NOT undo their own upload, and what collects them.
// ---------------------------------------------------------------------
const SWEPT = {
  "src/components/website-builder/website-builder-workspace.tsx": {
    bucket: "website-references",
    sweeper: "src/app/api/cron/website-storage-cleanup/route.ts",
    why: "reference images are uploaded before generate and are meant to outlive it; the daily sweep removes any that no site or website_reference_images row points at",
  },
  "src/lib/website-reference-image-server.ts": {
    bucket: "website-references",
    sweeper: "src/app/api/cron/website-storage-cleanup/route.ts",
    why: "writes a webp derivative beside the original, best-effort; an unreferenced derivative is exactly what the sweep is looking for",
  },
};

const unhandled = uploaders.filter((f) => !undoesItsUpload(source.get(f)) && !SWEPT[f]);
check(
  "every upload is undone in its own file, or swept by a named cron",
  unhandled.length === 0,
  unhandled.length
    ? `no .remove() and no sweeper: ${unhandled.join(", ")}\n        ` +
      "Undo it where it was acquired, or add it to SWEPT with the cron that collects it."
    : ""
);

// A declared sweeper is checked, not believed.
const brokenSweepers = [];
for (const [file, entry] of Object.entries(SWEPT)) {
  if (!uploaders.includes(file)) {
    brokenSweepers.push(`${file}: declared here but no longer uploads anything`);
    continue;
  }
  if (undoesItsUpload(source.get(file))) {
    brokenSweepers.push(`${file}: undoes its own upload now — drop the entry`);
  }
  if (!existsSync(entry.sweeper)) {
    brokenSweepers.push(`${file}: its sweeper ${entry.sweeper} does not exist`);
    continue;
  }
  const sweeper = strip(readFileSync(entry.sweeper, "utf8"));
  if (!/\.remove\s*\(/.test(sweeper)) {
    brokenSweepers.push(`${file}: ${entry.sweeper} never calls .remove() — it sweeps nothing`);
  }
  // The bucket is named through a constant, so the constant's own file
  // has to be the one that spells the literal.
  const names = files.some(
    (f) => source.get(f).includes(`"${entry.bucket}"`) && sweeper.includes(path.basename(f, path.extname(f)))
  );
  const direct = sweeper.includes(`"${entry.bucket}"`);
  if (!names && !direct) {
    brokenSweepers.push(`${file}: ${entry.sweeper} does not reach the bucket ${entry.bucket}`);
  }
  if (!entry.why || entry.why.length < 40) {
    brokenSweepers.push(`${file}: the reason is too short to be an argument`);
  }
}
check("every declared sweeper exists, removes, and covers that bucket", brokenSweepers.length === 0, brokenSweepers.join("\n        "));

// ---------------------------------------------------------------------
// CONTROLS. They drive the same two regexes the scan runs on, over files
// chosen for what they contain, rather than restating what those regexes
// would say.
// ---------------------------------------------------------------------
const INGEST = "src/lib/files/ingest.ts";
check(
  "control: the fallback ingest path is seen to upload AND to remove",
  uploaders.includes(INGEST) && undoesItsUpload(source.get(INGEST)),
  "the detectors no longer see the one path that has always got this right"
);
const DIRECT = "src/components/files/files-workspace.tsx";
check(
  "control: the browser fast path is seen to upload AND to remove",
  uploaders.includes(DIRECT) && undoesItsUpload(source.get(DIRECT)),
  "uploadDirect() is the primary upload path; it went a year without the compensating delete"
);
check(
  "control: comment-only mentions do not count as a remove",
  !undoesItsUpload(strip('x.upload(p);\n// then calls bucket.from(B).remove([p]) when the row is not written\n')),
  "the comment stripper is not running, so a file that only TALKS about removing would pass"
);
check(
  "control: a DOM .remove() is not a storage remove",
  !undoesItsUpload('s.from(B).upload(path, f);\nlink.remove();\n'),
  "link.remove() satisfied the first version of this gate and hid the defect it was written for"
);
check(
  "control: a remove BEFORE the upload does not undo it",
  !undoesItsUpload('s.from(B).remove([old]);\ns.from(B).upload(path, f);\n'),
  "ingest.ts clears the previous object before uploading; that is not the undo"
);
check(
  "control: ...and one after it does",
  undoesItsUpload('s.from(B).upload(path, f);\nif (bad) s.from(B).remove([path]);\n'),
  "the ordering rule has been tightened into something no real file satisfies"
);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
