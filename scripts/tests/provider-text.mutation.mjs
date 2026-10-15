#!/usr/bin/env node
/*
 * CAN provider-text.test.mjs SEE THE PROVIDER'S OWN WORDS GO BACK ON
 * THE PAGE?
 *
 * Three mutants: the sign-in answering with Supabase's sentence again,
 * a cron route answering with Postgres's, and the exception list
 * keeping an entry it no longer needs — because an allowlist that
 * cannot go stale is the half of this gate that nobody would notice
 * rotting.
 *
 * Run: node scripts/tests/provider-text.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/provider-text.test.mjs";
const LOGIN = "src/app/api/auth/login/route.ts";
const CRON = "src/app/api/cron/scheduled-runs/route.ts";

const MUTANTS = [
  {
    name: "the sign-in hands back whatever the auth provider said",
    file: LOGIN,
    from: 'return NextResponse.json({ ok: false, code: "sign_in_failed" }, { status: 401 });',
    to: "return NextResponse.json({ ok: false, error: signInError.message }, { status: 401 });",
    expect: "a failed sign-in answers with a code, not a sentence",
  },
  {
    name: "a provider failure nobody expected stops being recorded",
    file: LOGIN,
    from: '        logApiError("/api/auth/login", signInError, { stage: "sign_in" });',
    to: '        void signInError;',
    expect: "while an unusual provider failure is still recorded",
  },
  {
    name: "a cron route answers with the database's own text again",
    file: CRON,
    from: 'return NextResponse.json({ ok: false, error: "Could not load the runs that are due." }, { status: 500 });',
    to: "return NextResponse.json({ ok: false, error: dueError.message }, { status: 500 });",
    expect: "no route returns the provider's or the database's own words",
  },
];

runMutations({ name: "provider-text", gate: GATE, targets: [LOGIN, CRON], mutants: MUTANTS });
