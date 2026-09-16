#!/usr/bin/env node
/*
 * CAN upload-reversibility.test.mjs SEE AN ORPHAN COME BACK?
 *
 * Each mutant removes one compensating delete — which is not a
 * hypothetical defect here: three of the four upload paths in this product
 * were written without one, and the fourth (lib/files/ingest.ts) is the
 * only reason the rule was ever stated.
 *
 *   1-3. the undo goes from each of the three paths fixed on 2026-09-16
 *   4.   the undo in ingest.ts goes, which is the one that has always
 *        been there and whose comment is where the rule is written down
 *   5.   the sweeper a declared entry names stops removing anything, so
 *        the excuse "a cron collects it" stops being true
 *
 * Run: node scripts/tests/upload-reversibility.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/upload-reversibility.test.mjs";
const FILES_UI = "src/components/files/files-workspace.tsx";
const CREATE_UI = "src/components/create/create-chat.tsx";
const DECK_UI = "src/components/presentations/presentations-workspace.tsx";
const INGEST = "src/lib/files/ingest.ts";
const SWEEPER = "src/app/api/cron/website-storage-cleanup/route.ts";

const MUTANTS = [
  {
    name: "the browser fast path stops deleting an object it could not register",
    file: FILES_UI,
    from: "        await createBrowserSupabase().storage.from(FILE_BUCKET).remove([path]);",
    to: "        void path;",
    expect: "every upload is undone",
  },
  {
    name: "a failed Create request leaves its photographs behind",
    file: CREATE_UI,
    from: "        await supabase.storage.from(CREATE_ATTACHMENT_BUCKET).remove(imagePaths);",
    to: "        void imagePaths;",
    expect: "every upload is undone",
  },
  {
    name: "a refused deck leaves its photographs behind",
    file: DECK_UI,
    from: "        await supabase.storage.from(CREATE_ATTACHMENT_BUCKET).remove(paths);",
    to: "        void paths;",
    expect: "every upload is undone",
  },
  {
    name: "the ingest path stops removing the object whose row failed",
    file: INGEST,
    from: "    await supabase.storage.from(FILE_BUCKET).remove([storagePath]);",
    to: "    void storagePath;",
    expect: "every upload is undone",
  },
  {
    name: "the sweeper that excuses two uploaders stops removing anything",
    file: SWEEPER,
    from: "          .remove(",
    to: "          .list(",
    expect: "declared sweeper exists, removes",
  },
];

runMutations({
  name: "upload-reversibility",
  gate: GATE,
  targets: [FILES_UI, CREATE_UI, DECK_UI, INGEST, SWEEPER],
  mutants: MUTANTS,
});
