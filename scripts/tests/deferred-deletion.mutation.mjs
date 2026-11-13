#!/usr/bin/env node
/*
 * CAN deferred-deletion.test.mjs SEE ANY OF THE THREE DEFECTS COME BACK?
 *
 * A cancel link that stops only its own row, Settings counting with
 * .maybeSingle(), a second confirmation writing a second schedule or
 * moving the date, the first email's link dropped on a join, a race that
 * fails instead of joining, a folded or an old link resolved wrongly, the
 * cron claiming nothing before it deletes, keeping a claim after a
 * failure, picking up rows it should not, a failed schedule keeping the
 * confirmation link spent, and the migration losing its index, its fold
 * or its SET NULL.
 *
 * Run: node scripts/tests/deferred-deletion.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/deferred-deletion.test.mjs";
const LIB = "src/lib/account/pending-deletion.ts";
const CRON = "src/app/api/cron/execute-deletions/route.ts";
const CONFIRM = "src/app/api/delete-account/confirm/route.ts";
const STATUS = "src/app/api/delete-account/status/route.ts";
const MIGRATION = "supabase/migrations/20261112000000_pending_deletions_one_open.sql";

const MUTANTS = [
  // ---- defect 1: two schedules, one cancel ----
  {
    name: "a cancel link stops only its own row",
    file: LIB,
    from: '    .update({ cancelled_at: new Date().toISOString() })\n    .eq("user_id", ownerId)',
    to: '    .update({ cancelled_at: new Date().toISOString() })\n    .eq("cancel_token_hash", hashCancelToken(cancelToken))',
    expect: "the later email's link stops BOTH schedules",
  },
  {
    name: "Settings counts with .maybeSingle(), which errors after cancelling two",
    file: LIB,
    from: '    .select("id");\n\n  if (error) return null;\n  return data?.length ?? 0;',
    to: '    .select("id")\n    .maybeSingle();\n\n  if (error) return null;\n  return data ? 1 : 0;',
    expect: "Settings cancels every open schedule",
  },
  {
    name: "a second confirmation writes a second schedule",
    file: LIB,
    from: "    if (open) {\n      const joined",
    to: "    if (open && round < 0) {\n      const joined",
    expect: "a second confirmation succeeds and says it joined",
  },
  {
    name: "joining a schedule moves its date",
    file: LIB,
    from: "      cancel_token_hash: tokenHash,\n      previous_cancel_token_hashes: [...previous, open.cancel_token_hash],",
    to: "      cancel_token_hash: tokenHash,\n      delete_after: new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString(),\n      previous_cancel_token_hashes: [...previous, open.cancel_token_hash],",
    expect: "keeping the EARLIER date",
  },
  {
    name: "joining a schedule drops the first email's link",
    file: LIB,
    from: "      previous_cancel_token_hashes: [...previous, open.cancel_token_hash],",
    to: "      previous_cancel_token_hashes: previous,",
    expect: "the FIRST email's link still cancels",
  },
  {
    name: "two confirmations racing: the loser fails instead of joining",
    file: LIB,
    from: "    if (error?.code === UNIQUE_VIOLATION) continue;\n",
    to: "",
    expect: "two confirmations racing both succeed",
  },
  {
    name: "a link folded into the kept row is never looked for",
    file: LIB,
    from: "  if (joinedError) return null;\n  return (joined?.user_id as string | undefined) ?? null;",
    to: "  void joined;\n  void joinedError;\n  return null;",
    expect: "folded into the kept row by the migration cancels it",
  },
  {
    name: "the link of a cancelled schedule stops the next one",
    file: LIB,
    from: '    .eq("cancel_token_hash", tokenHash)\n    .is("cancelled_at", null)\n    .is("executed_at", null)',
    to: '    .eq("cancel_token_hash", tokenHash)\n    .is("executed_at", null)',
    expect: "which the link from the cancelled one cannot stop",
  },
  {
    name: "Settings calls a failed write «not found»",
    file: STATUS,
    from: "    if (cancelled === null) {\n",
    to: "    if (cancelled === undefined) {\n",
    expect: "a failed write is a 500",
  },
  // ---- defect 2: the record, and the cron's order ----
  {
    name: "the cron claims nothing before it deletes",
    file: CRON,
    from: "      const claim = await claimExecution(admin, row.id);",
    to: '      const claim: string = "claimed";\n      void claimExecution;',
    expect: "the cron claims each row",
  },
  {
    name: "a failed deleteUser keeps the claim",
    file: CRON,
    from: '        errors.push({ id: row.id, userId: row.user_id, stage: "deleteUser", message: String(deleteError.message) });\n        await giveBack(admin, row);',
    to: '        errors.push({ id: row.id, userId: row.user_id, stage: "deleteUser", message: String(deleteError.message) });',
    expect: "deleteUser: gives the claim back",
  },
  {
    name: "a failed Stripe cancellation keeps the claim",
    file: CRON,
    from: '          errors.push({ id: row.id, userId: row.user_id, stage: "cancel_subscription", message: String(err) });\n          await giveBack(admin, row);',
    to: '          errors.push({ id: row.id, userId: row.user_id, stage: "cancel_subscription", message: String(err) });',
    expect: "cancel_subscription: gives the claim back",
  },
  {
    name: "the cron picks up rows whose account is already gone",
    file: LIB,
    from: '    .is("cancelled_at", null)\n    .not("user_id", "is", null)\n    .lt("delete_after", new Date().toISOString())',
    to: '    .is("cancelled_at", null)\n    .lt("delete_after", new Date().toISOString())',
    expect: "the cron never picks up a row with no account",
  },
  {
    name: "a run that stopped half-way is never finished",
    file: LIB,
    from: '    .is("cancelled_at", null)\n    .not("user_id", "is", null)\n    .lt("delete_after", new Date().toISOString())',
    to: '    .is("cancelled_at", null)\n    .is("executed_at", null)\n    .not("user_id", "is", null)\n    .lt("delete_after", new Date().toISOString())',
    expect: "picked up again (a run that stopped half-way)",
  },
  {
    name: "a release reopens a row whose account is gone",
    file: LIB,
    from: '    .update({ executed_at: null })\n    .eq("id", id)\n    .not("user_id", "is", null);',
    to: '    .update({ executed_at: null })\n    .eq("id", id);',
    expect: "leaves the row saying it ran",
  },
  {
    name: "the claim ignores a cancel made during the run",
    file: LIB,
    from: '    .update({ executed_at: new Date().toISOString() })\n    .eq("id", id)\n    .is("cancelled_at", null)',
    to: '    .update({ executed_at: new Date().toISOString() })\n    .eq("id", id)',
    expect: "cancelled while the run was under way is not claimed",
  },
  // ---- defect 3: a failed schedule gives the link back ----
  {
    name: "a schedule that did not land keeps the confirmation link spent",
    file: CONFIRM,
    from: '.update({ used_at: null })\n          .eq("token_hash", tokenHash);\n        if (giveBackError) {\n          logApiError("/api/delete-account/confirm", giveBackError, {\n            stage: "release_deletion_token",\n            hint: "nothing was scheduled',
    to: '.update({ used_at: new Date().toISOString() })\n          .eq("token_hash", tokenHash);\n        if (giveBackError) {\n          logApiError("/api/delete-account/confirm", giveBackError, {\n            stage: "release_deletion_token",\n            hint: "nothing was scheduled',
    expect: "used_at goes back to null",
  },
  {
    name: "a throw from scheduleDeletion spends the link",
    file: CONFIRM,
    from: '      try {\n        result = await scheduleDeletion(admin, claimed.user_id);\n      } catch (scheduleErr) {\n        logApiError("/api/delete-account/confirm", scheduleErr, { stage: "schedule_deferred" });\n      }',
    to: "      result = await scheduleDeletion(admin, claimed.user_id);",
    expect: "a throw from scheduleDeletion is caught",
  },
  // ---- the migration ----
  {
    name: "the one-open index is not unique",
    file: MIGRATION,
    from: "create unique index if not exists pending_deletions_one_open_per_user",
    to: "create index if not exists pending_deletions_one_open_per_user",
    expect: "one open row per account",
  },
  {
    name: "the fold deletes the duplicates",
    file: MIGRATION,
    from: "update public.pending_deletions p\n   set cancelled_at = now()\n  from ranked\n where p.id = ranked.id\n   and ranked.rn > 1;",
    to: "delete from public.pending_deletions p\n using ranked\n where p.id = ranked.id\n   and ranked.rn > 1;",
    expect: "and nothing deleted",
  },
  {
    name: "the fold keeps the latest date open",
    file: MIGRATION,
    from: "order by delete_after asc, created_at asc, id asc",
    to: "order by delete_after desc, created_at asc, id asc",
    expect: "keeping the earliest delete_after open",
  },
  {
    name: "the foreign key still cascades",
    file: MIGRATION,
    from: "foreign key (user_id) references auth.users(id) on delete set null;",
    to: "foreign key (user_id) references auth.users(id) on delete cascade;",
    expect: "detaches the row instead of removing it",
  },
];

runMutations({ name: "deferred-deletion", gate: GATE, targets: [LIB, CRON, CONFIRM, STATUS, MIGRATION], mutants: MUTANTS });
