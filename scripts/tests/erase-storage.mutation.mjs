#!/usr/bin/env node
/*
 * CAN erase-storage.test.mjs SEE A DELETION THAT LEAVES FILES BEHIND?
 *
 * Folders not followed, a second page never asked for, a removal nobody
 * checks, any folder accepted as a user's, the files removed after the
 * account, a failure that deletes the account anyway, a failure that
 * keeps the link spent, and the page showing the route's English.
 *
 * Run: node scripts/tests/erase-storage.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/erase-storage.test.mjs";
const LIB = "src/lib/account/erase-storage.ts";
const ROUTE = "src/app/api/delete-account/confirm/route.ts";
const FORM = "src/app/delete-account/confirm/confirm-delete-account-form.tsx";

const MUTANTS = [
  {
    name: "folders are not followed",
    file: LIB,
    from: "        await listAll(bucket, bucketName, path, depth + 1, out);",
    to: "        void depth;",
    expect: "three folders down",
  },
  {
    name: "only the first page of a folder is read",
    file: LIB,
    from: "    if (entries.length < PAGE) return;",
    to: "    return;",
    expect: "past the first two pages",
  },
  {
    name: "a file left behind after removal counts as done",
    file: LIB,
    from: "    if (left.length > 0) throw failure",
    to: "    if (left.length < 0) throw failure",
    expect: "still there after removal is a failure",
  },
  {
    name: "a refused removal is ignored",
    file: LIB,
    from: '      if (error) throw failure("remove", name, error);',
    to: "      void error;",
    expect: "a refused removal throws, naming the bucket and what the Storage API said",
  },
  {
    name: "any folder is taken for a user's",
    file: LIB,
    from: '  if (!UUID.test(userId)) throw new Error("erase-storage: not a user id");',
    to: "",
    expect: "only a user id is accepted",
  },
  {
    name: "the files are removed after the account is deleted",
    file: ROUTE,
    from: "    try {\n      await eraseUserStorage(admin.storage, claimed.user_id);\n    } catch (objectsError) {",
    to: "    await Promise.resolve();\n    try {\n      void 0;\n    } catch (objectsError) {",
    expect: "removes the files through the Storage API",
  },
  {
    name: "a failure to remove the files keeps the link spent",
    file: ROUTE,
    from: "        .update({ used_at: null })\n        .eq(\"token_hash\", tokenHash);\n      if (giveBackError) {\n        logApiError(\"/api/delete-account/confirm\", giveBackError, { stage: \"release_deletion_token\" });",
    to: "        .update({ used_at: new Date().toISOString() })\n        .eq(\"token_hash\", tokenHash);\n      if (giveBackError) {\n        logApiError(\"/api/delete-account/confirm\", giveBackError, { stage: \"release_deletion_token\" });",
    expect: "gives the link back",
  },
  {
    name: "the page shows the route's English sentence",
    file: FORM,
    from: "setError(deletionError(data.code));",
    to: 'setError(getErrorMessage(data.error, "Could not delete the account."));',
    expect: "its own words for a code",
  },
];

runMutations({ name: "erase-storage", gate: GATE, targets: [LIB, ROUTE, FORM], mutants: MUTANTS });
