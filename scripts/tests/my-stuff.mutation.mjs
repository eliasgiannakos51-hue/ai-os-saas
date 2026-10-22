#!/usr/bin/env node
/*
 * CAN my-stuff.test.mjs SEE A QUESTION THAT NARROWS TO NOTHING, A
 * CITATION THAT POINTS AT A RECORD NEVER SHOWN, A PROMPT THAT GROWS
 * WITHOUT BOUND, A READ THAT STOPPED PINNING THE CALLER, OR A HOLD THAT
 * NEVER GETS RELEASED?
 *
 * «ΤΑ ΔΙΚΑ ΜΟΥ» answers from a bounded, cited slice of the account's own
 * rows; every mutant below is one way that promise breaks quietly —
 * narrower than the owner asked, a citation that lies about its source,
 * an unbounded prompt, a row read for the wrong account, or money spent
 * with the hold never returned.
 *
 * Run: node scripts/tests/my-stuff.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/my-stuff.test.mjs";
const CLASSIFY = "src/lib/my-stuff/classify.ts";
const CONTEXT = "src/lib/my-stuff/ask-context.ts";
const STORE = "src/lib/my-stuff/ask-store.ts";
const ROUTE = "src/app/api/my-stuff/ask/route.ts";
const SOURCES = "src/lib/my-stuff/sources.ts";

const MUTANTS = [
  {
    name: "a question that matches nothing narrows to an empty read instead of failing open",
    file: CLASSIFY,
    from: "  return hit.length > 0 ? hit : [...MY_STUFF_KINDS];",
    to: "  return hit;",
    expect: "fails open, never closed",
  },
  {
    name: "the bound on how many kinds are read is dropped",
    file: CLASSIFY,
    from: "export function kindsToRead(question: string): MyStuffKind[] {\n  return classifyMyStuffQuestion(question).slice(0, MAX_KINDS_READ);\n}",
    to: "export function kindsToRead(question: string): MyStuffKind[] {\n  return classifyMyStuffQuestion(question);\n}",
    expect: "bounds even the fail-open case",
  },
  {
    name: "a citation can point at a number the model was never shown",
    file: CONTEXT,
    from: "    if (n >= 1 && n <= candidateCount && !seen.has(n)) {",
    to: "    if (!seen.has(n)) {",
    expect: "never a citation",
  },
  {
    name: "the prompt's character bound is bypassed",
    file: CONTEXT,
    from: '    if (used + line.length + 1 > MY_STUFF_MAX_CONTEXT_CHARS) break;',
    to: "    if (false) break;",
    expect: "cannot blow up the prompt",
  },
  {
    name: "a blank question is no longer refused",
    file: CONTEXT,
    from: '  if (!trimmed) return { ok: false, reason: "empty" };\n',
    to: "",
    expect: "refused, by name",
  },
  {
    name: "an over-long question is no longer refused",
    file: CONTEXT,
    from: '  if (trimmed.length > MY_STUFF_MAX_QUESTION_CHARS) return { ok: false, reason: "too_long" };\n',
    to: "",
    expect: "refused, by name",
  },
  {
    name: "the chat read stops pinning the caller's own account",
    file: STORE,
    from: '    .select("id, conversation_id, role, content, created_at")\n    .eq("user_id", userId)\n',
    to: '    .select("id, conversation_id, role, content, created_at")\n',
    expect: "scoped to the caller explicitly",
  },
  {
    name: "a Stop or a provider failure no longer releases the credit hold",
    file: ROUTE,
    from: "    if (!outcome.ok && outcome.kind === \"aborted\") {\n      await releaseReservation(user.id, reservationId);\n      return NextResponse.json({ error: \"stopped\" }, { status: 499 });\n    }",
    to: "    if (!outcome.ok && outcome.kind === \"aborted\") {\n      return NextResponse.json({ error: \"stopped\" }, { status: 499 });\n    }",
    expect: "releases the hold on both the Stop path",
  },
  {
    name: "Finance quietly starts reading a different table",
    file: SOURCES,
    from: '  table: "finance_entries",\n  columns: "id, description, type, amount, created_at",',
    to: '  table: "finance_entries_v2",\n  columns: "id, description, type, amount, created_at",',
    expect: "finance_entries",
  },
];

runMutations({
  name: "my-stuff",
  gate: GATE,
  targets: [CLASSIFY, CONTEXT, STORE, ROUTE, SOURCES],
  mutants: MUTANTS,
});
