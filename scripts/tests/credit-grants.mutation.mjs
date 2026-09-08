#!/usr/bin/env node
/*
 * EIGHT THOUSAND FREE CREDITS PER REPLAY, PUT BACK.
 *
 * Stripe delivers at-least-once. The old grantCredits read a balance in
 * TypeScript, added to it, and wrote it back, with no record of which
 * checkout it had already handled — so a redelivery granted the whole
 * pack again, and two overlapping grants both read the same balance and
 * the second write discarded the first. Neither raised anything.
 *
 * The fix is one SQL function claiming an idempotency key with ON
 * CONFLICT DO NOTHING, callable only by service_role. Every part of that
 * sentence is a line somebody can quietly change while every screen keeps
 * working — the key, the grant, the revoke, the early return on a replay
 * — so each is a mutation here.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal, so a
 * mutation written that way is "caught" by the marker gate without any
 * behavioural check having looked at it.
 *
 * Run: node scripts/tests/credit-grants.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/credit-grants.test.mjs";
const SQL = "supabase/migrations/20260805_idempotent_credit_grants.sql";
const CREDITS = "src/lib/billing/credits.ts";
const WEBHOOK = "src/app/api/webhooks/stripe/route.ts";
const SIGNUP = "src/app/api/signup/route.ts";
const CALLBACK = "src/app/auth/callback/route.ts";
const TARGETS = [...new Set([SQL, CREDITS, WEBHOOK, SIGNUP, CALLBACK])];

const MUTANTS = [
  {
    // 1. THE FUNCTION BECOMES CALLABLE BY A SIGNED-IN BROWSER. It is
    // SECURITY DEFINER: whoever can call it can grant themselves credits.
    name: "grant_credits_idempotent stops being revoked from authenticated",
    file: SQL,
    from: ") from authenticated;",
    to: ") from nobody_in_particular;",
    expect: "execute is revoked from authenticated",
  },
  {
    // 2. THE SEARCH PATH IS UNPINNED, so a SECURITY DEFINER function can
    // be pointed at a different schema by whoever calls it.
    name: "the security definer function loses its pinned search_path",
    file: SQL,
    from: "security definer\nset search_path = public",
    to: "security definer",
    expect: "it is a security definer function with a pinned search_path",
  },
  {
    // 3. THE CHECKOUT KEY STOPS BEING THE CHECKOUT. Any key that is not
    // derived from the session makes every redelivery a fresh grant.
    name: "the credit-pack grant stops keying on the checkout session",
    file: WEBHOOK,
    from: "stripe_checkout:${session.id}",
    to: "stripe_checkout:${Date.now()}",
    expect: "a credit-pack purchase passes an idempotency key",
  },
  {
    // 4. THE TWO SIGNUP PATHS DRIFT APART. Password signup and the OAuth
    // callback both grant the starting balance; different namespaces mean
    // an account created through one and finished through the other gets
    // it twice.
    name: "the OAuth callback uses a different key namespace from password signup",
    file: CALLBACK,
    from: "`signup_grant:${user.id}`",
    to: "`oauth_signup_grant:${user.id}`",
    expect: "both signup paths share one key namespace",
  },
  {
    // 5. THE READ-THEN-WRITE COMES BACK, in TypeScript, where two
    // concurrent grants overwrite each other silently.
    name: "grantCredits reads and writes the balance in TypeScript again",
    file: CREDITS,
    from: 'rpc("grant_credits_idempotent"',
    to: 'rpc("grant_credits_legacy"',
    expect: "grantCredits goes through the RPC",
  },
  {
    // 6. A FAILED GRANT IS SWALLOWED. The customer paid and the balance
    // never moves, and nothing anywhere says so.
    name: "a failed grant stops being surfaced",
    file: CREDITS,
    from: "throw new Error(`Could not grant credits",
    to: "console.warn(`Could not grant credits",
    expect: "a failed grant is surfaced, not swallowed",
  },
  {
    // 7. THE CALLER CAN NO LONGER TELL A GRANT FROM A REPLAY, so the
    // webhook does the rest of its work — emails, rate rows — every time
    // Stripe redelivers.
    name: "callers stop being told whether the grant actually happened",
    file: CREDITS,
    from: "granted: Boolean(row?.granted)",
    to: "granted: true",
    expect: "callers can tell a real grant from a replay",
  },
  {
    // 8. AND THE EARLY RETURN GOES, which is the same thing one layer up.
    // THERE ARE TWO OF THEM — the subscription grant and the pack
    // purchase — and the first draft of this mutation changed only the
    // first, which left the regex satisfied by the second. Both go.
    name: "the webhook stops returning early on a replay",
    file: WEBHOOK,
    from: "if (!granted) {",
    to: "if (granted === undefined) {",
    all: true,
    expect: "the webhook returns early on a replay",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("credit-grants mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    // `all` REPLACES EVERY OCCURRENCE. A defect that exists twice in one
    // file — the webhook returns early on a replay in two places — is not
    // re-introduced by changing the first, and the gate stays green for a
    // reason that is about the mutation rather than the code.
    const mutated = m.all
      ? originals.get(m.file).split(m.from).join(m.to)
      : originals.get(m.file).replace(m.from, m.to);
    writeFileSync(m.file, mutated);
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("A grant that can be replayed, or reached by a browser, turns this red.");
