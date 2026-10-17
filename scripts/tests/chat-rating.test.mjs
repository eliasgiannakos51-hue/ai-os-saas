// THUMBS UP AND DOWN UNDER A CHAT ANSWER STORE SOMETHING, AND ONLY WHAT
// THEY SHOULD (Δ.2, 2026-10-05).
//
// The rule (lib/chat/answer-rating.ts) is RUN: the three values, and that
// pressing the lit thumb takes the rating back. The route
// (src/app/api/chat/messages/[id]/rating/route.ts) is read with comments
// stripped: signed-in session, rate-limited, and the update scoped to this
// account's own ANSWER — never the person's own message. The column it
// writes is the one supabase/migrations/20261016000000_chat_message_rating.sql
// adds, with the same three values in its check.
//
// Run: node scripts/tests/chat-rating.test.mjs
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

console.log("== 1. the rule, run ==");
const { parseRating, nextRating } = await loadTs("src/lib/chat/answer-rating.ts");
check("up, down and none are accepted", [1, -1, null].every((v) => parseRating(v).ok && parseRating(v).rating === v));
const refused = [0, 2, -2, "1", true, undefined, 0.5, {}];
check("nothing else is", refused.every((v) => !parseRating(v).ok), refused.filter((v) => parseRating(v).ok).map(String).join(", "));
check("pressing up on nothing rates it up", nextRating(null, 1) === 1);
check("pressing down on up changes it to down", nextRating(1, -1) === -1);
check("pressing the lit thumb takes the rating back", nextRating(1, 1) === null && nextRating(-1, -1) === null);

console.log("\n== 2. the route ==");
const route = stripComments(readFileSync("src/app/api/chat/messages/[id]/rating/route.ts", "utf8"));
check("signed-in session, refused without one", /const supabase = await createClient\(\);/.test(route) && /if \(!user\) return fail\("not_authenticated", 401\);/.test(route));
check("rate-limited per account", /checkRateLimit\(\{ scope: "chat_rating", identifier: user\.id/.test(route) && /if \(!limited\.allowed\) return fail\("rate_limited", 429\);/.test(route));
check("the value goes through the rule, not straight into the row", /const parsed = parseRating\(body\?\.rating\);/.test(route) && /if \(!parsed\.ok\) return fail\("bad_rating", 400\);/.test(route) && /\.update\(\{ rating: parsed\.rating \}\)/.test(route));
check("scoped to this answer of this account: id, user, and role assistant",
  /\.eq\("id", id\)\s*\.eq\("user_id", user\.id\)\s*\.eq\("role", "assistant"\)/.test(route));
check("a row it did not touch is a 404, not a silent success", /if \(!data \|\| data\.length === 0\) return fail\("not_found", 404\);/.test(route));
check("no service-role client: the policy on chat_messages stays in force", !/createAdminClient/.test(route));

console.log("\n== 3. the column, and the id the answer carries ==");
const mig = readFileSync("supabase/migrations/20261016000000_chat_message_rating.sql", "utf8").replace(/--.*$/gm, "");
check("the column is added", /alter table public\.chat_messages add column if not exists rating smallint;/.test(mig));
check("...with the same three values in its check", /check \(rating is null or rating in \(-1, 1\)\)/.test(mig));
const chatRoute = stripComments(readFileSync("src/app/api/chat/route.ts", "utf8"));
check("the chat route sends the saved answer's id on done", /\.select\("id"\)\s*\.single\(\);/.test(chatRoute) && /messageId: assistantRow\?\.id \?\? undefined,/.test(chatRoute));
const ws = stripComments(readFileSync("src/components/chat/chat-workspace.tsx", "utf8"));
check("...and the page keeps it, so the new answer can be rated at once",
  /if \(typeof event\.messageId === "string" && PERSISTED_ID\.test\(event\.messageId\)\) savedId = event\.messageId;/.test(ws) && /id: savedId \?\? nextLocalId\("assistant"\),/.test(ws));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
