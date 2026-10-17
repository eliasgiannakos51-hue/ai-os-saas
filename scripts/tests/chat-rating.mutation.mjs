#!/usr/bin/env node
/*
 * CAN chat-rating.test.mjs SEE A RATING THAT STORES THE WRONG THING, OR
 * IN THE WRONG PLACE?
 *
 * Each mutant puts back one way the thumbs under an answer could go wrong:
 * any number accepted, the lit thumb not taking the rating back, the
 * person's own message rated, another account's row reachable, a missed
 * row reported as success, the answer's id never reaching the page.
 *
 * Run: node scripts/tests/chat-rating.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/chat-rating.test.mjs";
const RULE = "src/lib/chat/answer-rating.ts";
const ROUTE = "src/app/api/chat/messages/[id]/rating/route.ts";
const CHAT = "src/app/api/chat/route.ts";

const MUTANTS = [
  {
    name: "any number is accepted as a rating",
    file: RULE,
    from: "  if (value === 1 || value === -1) return { ok: true, rating: value };",
    to: "  if (typeof value === \"number\") return { ok: true, rating: value as 1 };",
    expect: "nothing else is",
  },
  {
    name: "pressing the lit thumb no longer takes the rating back",
    file: RULE,
    from: "  return current === pressed ? null : pressed;",
    to: "  return pressed;",
    expect: "pressing the lit thumb takes the rating back",
  },
  {
    name: "the person's own message can be rated",
    file: ROUTE,
    from: '      .eq("role", "assistant")\n',
    to: "",
    expect: "scoped to this answer of this account",
  },
  {
    name: "the update is no longer scoped to the account",
    file: ROUTE,
    from: '      .eq("user_id", user.id)\n',
    to: "",
    expect: "scoped to this answer of this account",
  },
  {
    name: "a row that was not there is reported as saved",
    file: ROUTE,
    from: '    if (!data || data.length === 0) return fail("not_found", 404);\n',
    to: "",
    expect: "a row it did not touch is a 404",
  },
  {
    name: "the saved answer's id never reaches the page",
    file: CHAT,
    from: "            messageId: assistantRow?.id ?? undefined,\n",
    to: "",
    expect: "the chat route sends the saved answer's id on done",
  },
];

runMutations({ name: "chat-rating", gate: GATE, targets: [RULE, ROUTE, CHAT], mutants: MUTANTS });
