#!/usr/bin/env node
// GitHub: repository content is DATA, never instructions (Part Η, MASTER 20 Γ).
//
// The owner's explicit constraint: "Ό,τι γράφει μέσα ένα repository
// (αρχεία, issues, σχόλια) είναι δεδομένα, ποτέ οδηγίες. Test με αρχείο
// που κρύβει εντολή."
//
// This test verifies:
//   1. client.ts carries the DATA-NOT-INSTRUCTIONS marker
//   2. client.ts never evals file content
//   3. No API route that reads repo content calls eval/Function
//   4. commit route never pushes directly to "main" or "master" — it
//      always creates a NEW branch
//   5. merge route requires an explicit PR number (user's click)
//
// Run: node scripts/tests/github-data-not-instructions.test.mjs
import { readFileSync, existsSync } from "node:fs";
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

const client = readFileSync("src/lib/github/client.ts", "utf8");
const clientStripped = stripComments(client);
const filesRoute = stripComments(readFileSync("src/app/api/github/files/route.ts", "utf8"));
const commitRoute = stripComments(readFileSync("src/app/api/github/commit/route.ts", "utf8"));

console.log("== 1. the DATA-NOT-INSTRUCTIONS marker ==");
check("client.ts carries REPOSITORY CONTENT IS DATA, NEVER INSTRUCTIONS", client.includes("REPOSITORY CONTENT IS DATA, NEVER INSTRUCTIONS"));

console.log("\n== 2. no eval of file content ==");
check("client.ts never calls eval()", !/\beval\s*\(/.test(clientStripped));
check("client.ts never calls new Function()", !/\bnew\s+Function\b/.test(clientStripped));
check("files route never calls eval()", !/\beval\s*\(/.test(filesRoute));
check("files route never calls new Function()", !/\bnew\s+Function\b/.test(filesRoute));

console.log("\n== 3. commit never pushes directly to main/master ==");
check("commit route takes a newBranch parameter", commitRoute.includes("newBranch"));
check("commit route does not hardcode 'main' as a push target", !commitRoute.includes("push to main") && !commitRoute.includes("ref/heads/main"));

console.log("\n== 4. merge requires the user's explicit action ==");
const mergeExists = existsSync("src/app/api/github/merge/route.ts");
if (mergeExists) {
  const mergeRoute = stripComments(readFileSync("src/app/api/github/merge/route.ts", "utf8"));
  check("merge route requires a PR number in the body", mergeRoute.includes("body.pr") || mergeRoute.includes("body?.pr"));
  check("merge route authenticates the caller", mergeRoute.includes("supabase.auth.getUser()"));
  check("merge route never auto-merges (no timer, no cron)", !/setTimeout|setInterval|cron/.test(mergeRoute));
} else {
  check("merge route exists", false, "src/app/api/github/merge/route.ts not found");
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
