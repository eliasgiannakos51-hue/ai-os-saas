// SQL AS THE DATABASE WOULD SEE IT, WITH THE COMMENTS TAKEN OUT.
//
// One definition, because two would disagree. scripts/db/pending-migrations.mjs
// re-exports this rather than keeping its own copy, and the gates that
// search migration text for a statement import it from here.
//
// THE DEFECT THIS EXISTS FOR, found 2026-09-12 in security-posture.test.mjs:
// the RLS section searched the raw concatenated schema, so
//
//     -- alter table public.chat_messages enable row level security;
//
// matched exactly as well as the live line. Commenting out RLS on the
// table holding every chat message left the section green while it printed
// "109 tables checked". A sample of five other gates with the same shape
// was settled the same day by commenting the statement out in the real
// migration and running the gate: FOUR of the five stayed green.
//
// THE ORDER OF THE TWO PASSES IS THE WHOLE THING. A `--` line may contain
// the two characters that open a block comment without opening one, and in
// these migrations it always does, as a glob in a path:
//
//     -- src/lib/chat/entity-mentions.ts, src/components/entity-links/*).
//
// Postgres reads that as text — `--` runs to end of line. A block pass
// running first does not: it starts a non-greedy match at the glob and
// ends it at the next real closer. On the concatenated schema that closer
// is 541,136 characters away, in a migration written a month later, and 58
// of the 86 RLS statements disappear between them.
//
// So: line comments first, then block comments. Measured 2026-09-12 —
// byte-identical output on all 71 migrations today, and 86 live RLS
// statements either way, which is the point: the reorder costs nothing and
// removes the trap.
//
// WHAT THIS DOES NOT HANDLE, deliberately. A block comment opened after
// code on the same line ("create table x; /* note"), and `--` inside a
// string literal, which this removes as though it were a comment. There is
// none of either in these migrations today. A parser that got both right
// would need to track dollar-quoting and string state, which is
// scripts/db/pending-migrations.mjs's countParams() and is much more code
// than the problem is worth until one of those shapes actually appears.

/** Strip -- and block comments so a sentence about a table is not a table. */
export function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
