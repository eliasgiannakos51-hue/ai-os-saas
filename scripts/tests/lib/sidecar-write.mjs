// A RESTORE THAT ONLY EXISTS INSIDE THE RUNNING PROCESS IS A RESTORE THAT
// A KILL DELETES.
//
// Every mutation suite in this directory edits real source files and puts
// them back. Fifty-eight of the sixty did it in a `finally`, which does
// not run when the process is killed — and this repository has lost that
// bet THREE times. Once the leftover mutant was a privilege escalation
// (a `revoke` turned into a `grant`) sitting in the working tree, one
// `git add -A` away from a commit.
//
// The fix existed. It had been applied to five suites: the ones where the
// accident happened. Fifty-five others had the same shape and no sidecar,
// which is what "safe by coincidence" looks like when the coincidence is
// "nobody killed that particular suite yet".
//
// ------------------------------------------------------------------
// WHY THIS IS A DROP-IN FOR writeFileSync
// ------------------------------------------------------------------
//
// Because the alternative was editing fifty-five heterogeneous files at
// every call site, and a mechanical change with fifty-five chances to be
// subtly wrong is not obviously better than the bug. This has the same
// name and the same signature, so a suite adopts it by changing ONE line:
//
//     import { readFileSync, writeFileSync } from "node:fs";
//  -> import { readFileSync } from "node:fs";
//     import { writeFileSync } from "./lib/sidecar-write.mjs";
//
// Nothing else in the suite changes, and the `finally` it already has
// keeps working — this is the second line of defence, not a replacement
// for the first.
//
// ------------------------------------------------------------------
// WHAT IT DOES
// ------------------------------------------------------------------
//
//   1. ON IMPORT, before the suite has run a single line, it restores
//      anything a previous killed run left behind. That is the whole
//      point: the healing has to happen in the NEXT process, because the
//      one that was killed is gone.
//   2. The first time a file is written, its ORIGINAL text goes to disk
//      first — not to a variable — so the window between "recorded" and
//      "mutated" is one fsync, not one process lifetime.
//   3. When a file is written back to its original text, its entry is
//      dropped. A suite that finishes cleanly leaves no sidecar, so the
//      presence of one always means something went wrong.
import { readFileSync, writeFileSync as fsWriteFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ANCHORED TO THIS FILE, NOT TO process.cwd(). A suite is normally run
// from the repository root, and "normally" is the word that makes a
// safety net conditional: run one from anywhere else and a cwd-relative
// sidecar would be written somewhere the next run never looks — which is
// the same failure as having no sidecar, arriving silently.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
//
// OVERRIDABLE ONLY FOR THE TEST THAT KILLS A PROCESS ON PURPOSE.
// mutation-sidecar.test.mjs spawns a victim, SIGKILLs it, and spawns a
// second process to watch the heal. Both must use a sidecar of their own:
// with the shared one they would heal whatever the OUTER mutation harness
// had mutated a moment earlier, and mutation-sidecar.mutation.mjs
// reported four survivors for exactly that reason — the gate was undoing
// the mutations being tested on it.
//
// It is not a way to switch the net off. Unset, it is the anchored path,
// and the gate asserts that default.
const SIDECAR =
  process.env.MUTATION_SIDECAR_PATH || path.join(HERE, "..", ".mutation-sidecar.json");

/** path -> the file's text before this process first touched it. */
let recorded = null;

function load() {
  if (recorded) return recorded;
  try {
    recorded = JSON.parse(readFileSync(SIDECAR, "utf8"));
  } catch {
    recorded = {};
  }
  return recorded;
}

function persist() {
  const entries = Object.keys(recorded ?? {});
  if (entries.length === 0) {
    if (existsSync(SIDECAR)) unlinkSync(SIDECAR);
    return;
  }
  fsWriteFileSync(SIDECAR, JSON.stringify(recorded));
}

/**
 * Put back whatever a killed run left mutated.
 *
 * RUNS AT IMPORT TIME, which is the only moment that is guaranteed to be
 * before the suite touches anything. It is deliberately loud: a silent
 * heal would hide the fact that a previous run died holding a mutant.
 */
export function healFromSidecar() {
  const saved = load();
  const files = Object.keys(saved);
  if (files.length === 0) return [];
  for (const [file, text] of Object.entries(saved)) {
    if (typeof text === "string") fsWriteFileSync(file, text);
  }
  recorded = {};
  persist();
  console.log(
    `sidecar: healed ${files.length} file(s) a killed run left mutated:\n  ${files.join("\n  ")}\n`
  );
  return files;
}

/**
 * writeFileSync, with the original recorded to disk first.
 *
 * TEMPORARY FILES ARE NOT RECORDED. A suite that builds a fixture under
 * os.tmpdir() is not mutating the repository, and a sidecar entry for a
 * path that will not exist next run is a heal that throws.
 */
export function writeFileSync(file, data, options) {
  const target = String(file);
  // RECORDED UNDER AN ABSOLUTE PATH, so a suite run from a different
  // working directory heals the same file the next run does.
  const abs = path.resolve(target);
  // INSIDE THE REPOSITORY IS THE ONLY TEST THERE NEEDS TO BE.
  //
  // There was an isTemp check here as well, and it could not fire. Every
  // fixture any suite builds goes under os.tmpdir(), which is outside the
  // repository and already excluded by the line above — so isTemp was a
  // guard with no reachable case, and the check written for it could not
  // go red. Removing it is safe because of a property of the suites, not
  // because it looked unused: mutation-sidecar.test.mjs asserts that
  // property directly, so the day a suite builds a fixture inside the
  // tree, that check goes red rather than this one silently mattering
  // again.
  const inRepo = abs.startsWith(REPO + path.sep);

  // A SIDECAR IS NOT A SOURCE FILE. Five suites still keep their own, and
  // recording one here would make this file track its own bookkeeping.
  const isSidecar = /sidecar.*\.json$/.test(abs) || abs.includes(".guard-sidecar");

  if (inRepo && !isSidecar) {
    const saved = load();
    if (!(abs in saved) && existsSync(abs)) {
      saved[abs] = readFileSync(abs, "utf8");
    }
    // AND THE EQUALITY CHECK RUNS ON THE SAME PASS, which the first
    // version got wrong: it only compared on writes AFTER the first one,
    // so a suite whose restoreAll() rewrites every target — including the
    // ones it never mutated — recorded each of them and dropped none. A
    // clean run then left a sidecar behind, and a sidecar that is present
    // after a healthy run means the signal "something went wrong" is
    // worth nothing.
    if (abs in saved && saved[abs] === data) delete saved[abs];
    // BEFORE the mutation reaches disk, not after.
    persist();
  }
  return fsWriteFileSync(file, data, options);
}

// The heal is the first thing that happens in any process that imports
// this — see the comment on healFromSidecar.
healFromSidecar();
