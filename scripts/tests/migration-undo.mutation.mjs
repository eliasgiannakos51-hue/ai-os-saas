#!/usr/bin/env node
/*
 * CAN migration-undo.test.mjs SEE A MIGRATION THAT DOES NOT SAY HOW TO
 * UNDO IT?
 *
 * Run: node scripts/tests/migration-undo.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/migration-undo.test.mjs";
const FLAGS = "supabase/migrations/20261017000000_feature_flags.sql";
const RATING = "supabase/migrations/20261016000000_chat_message_rating.sql";

const MUTANTS = [
  {
    name: "the switches' migration loses its undo note",
    file: FLAGS,
    from: "-- How to undo: drop table public.feature_flags;",
    to: "-- (no note)",
    expect: "20261017000000_feature_flags.sql",
  },
  {
    name: "the rating's undo note says nothing",
    file: RATING,
    from: "-- How to undo: alter table public.chat_messages drop column rating;",
    to: "-- How to undo: n/a",
    expect: "20261016000000_chat_message_rating.sql",
  },
];

runMutations({ name: "migration-undo", gate: GATE, targets: [FLAGS, RATING], mutants: MUTANTS });
