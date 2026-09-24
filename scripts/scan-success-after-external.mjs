#!/usr/bin/env node
/*
 * WHICH ROUTES ANSWER "IT WORKED" AFTER A CALL THAT CAN FAIL SILENTLY?
 *
 * THE DEFECT THAT ASKED IT, 2026-09-24. api/team/invite wrote the invite
 * row, called sendTeamInviteEmail — which returned `void` and swallowed
 * every outcome — and answered `{ ok: true }`. The screen said "Invite
 * sent to alice@example.com" on a deployment with no RESEND_API_KEY at
 * all. Nothing had been sent and nothing could be.
 *
 * That is worse than silence. Silence leaves a person wondering; this
 * tells them the thing happened.
 *
 * scripts/tests/email-outcome-reported.test.mjs now holds the rule for
 * EMAIL. The owner's question was the general one: how many other routes
 * report success after an external call that can fail without throwing?
 *
 * ------------------------------------------------------------------
 * WHAT COUNTS AS AN EXTERNAL CALL, AND WHAT COUNTS AS SWALLOWING
 * ------------------------------------------------------------------
 *
 * External: a provider the deployment does not control — email, push,
 * Telegram, Stripe, an AI provider, a bare fetch. A Supabase write is
 * NOT in this list: its error is returned inline and every route in this
 * tree already reads it, so including it would bury the finding under
 * two hundred correct call sites.
 *
 * Swallowing: the call's result does not reach a name. `await send(x)`
 * on its own line, or `void send(x)`, which is worse — the response goes
 * back before the send resolves and a serverless runtime can freeze the
 * function mid-flight.
 *
 * A ROUTE IS ONLY A FINDING IF IT THEN SAYS IT WORKED. A route that
 * swallows and answers nothing, or answers an error, is not lying to
 * anybody.
 *
 * ------------------------------------------------------------------
 * WHAT IT CANNOT TELL YOU
 * ------------------------------------------------------------------
 *
 * Whether the user NEEDED to know. A welcome email that does not arrive
 * is a lost pleasantry; an invitation that does not arrive is a person
 * waiting for a reply that cannot come. That judgement is per route and
 * this cannot make it — so the output is a list to read, with the call
 * and the success line quoted, and never a verdict.
 *
 * ------------------------------------------------------------------
 * WHAT WAS SETTLED BY HAND, 2026-09-24 — 6 flagged, 2 real
 * ------------------------------------------------------------------
 *
 * REAL, and fixed in the same commit:
 *
 *   cron/scheduled-runs    eleven `void send...(...)` calls. The same
 *                          shape api/websites/[id]/submit-form was fixed
 *                          for, in a comment that describes it in the
 *                          past tense — applied to the one route
 *                          somebody was looking at and to none of these.
 *                          Worse in a cron: the invocation ends when the
 *                          handler returns, so an unawaited promise is
 *                          racing the end of the process.
 *   cron/scheduled-runs    the push result discarded.
 *                          sendPushToUser answers `skipped:
 *                          "unconfigured"` with no VAPID key, which is a
 *                          deployment where no mission reminder has ever
 *                          been delivered and nothing says so.
 *
 * NOT REAL, and why:
 *
 *   billing/addons, checkout    `await stripe.x(...)` with the result
 *                          unread. The Stripe SDK THROWS on a failed
 *                          call, so the outcome is not swallowed — it
 *                          propagates to the route's catch. An unread
 *                          result is only a finding where failure is
 *                          returned rather than thrown, and this scan
 *                          cannot tell those apart.
 *   websites/[id]/submit-form   createNotification returns the new row
 *                          id or null, and the route already writes the
 *                          EMAIL outcome to the submission row, which is
 *                          the delivery the visitor's message depends
 *                          on. The bell is secondary and the owner sees
 *                          the submission either way.
 *
 * Two of six, and the two were the same file.
 *
 * Run: node scripts/scan-success-after-external.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./check-mutation-markers.mjs";

const API = "src/app/api";

function routes(dir = API, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) routes(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

/**
 * THE PROVIDERS, BY THE SHAPE OF THE CALL rather than by a list of
 * function names — a name list goes stale the first time somebody writes
 * a new sender. Each entry is what the call site looks like when it
 * reaches something outside this deployment.
 */
const EXTERNAL = [
  { what: "email", re: /\bsend[A-Z][A-Za-z]*Email\s*\(/ },
  { what: "push", re: /\b(sendPush[A-Za-z]*|webpush\.sendNotification)\s*\(/ },
  { what: "telegram", re: /\b(sendTelegram[A-Za-z]*|postToTelegram)\s*\(/ },
  { what: "notification", re: /\bcreateNotification\s*\(/ },
  { what: "stripe", re: /\bstripe\.[a-zA-Z.]+\s*\(/ },
  { what: "http", re: /(?<![.\w])fetch\s*\(/ },
];

/** The call's result reaches a name, or is returned. */
function bound(src, index) {
  const before = src.slice(Math.max(0, index - 300), index);
  return (
    /(?:const|let|var)\s+(?:\{[^{}]*\}|[A-Za-z_$][\w$]*)\s*=[^;]*$/.test(before) ||
    /\breturn\b[^;]*$/.test(before) ||
    // `if (await send(...))` and `x ? await send(...) : y` both consume it.
    /\bif\s*\([^;]*$/.test(before) ||
    /\?[^;]*$/.test(before)
  );
}

/**
 * A CALLEE THAT RETURNS NOTHING CANNOT HAVE ITS RESULT READ, and calling
 * that a finding is the difference between a list worth reading and
 * noise. `sendScheduledRunCompleteEmail` is declared `Promise<void>`: an
 * unread result there is not a swallowed outcome, it is the absence of
 * one — the honest complaint about that function is that it has no
 * outcome to give, which is a different sentence and a different fix.
 *
 * FIRE-AND-FORGET IS STILL A FINDING whatever it returns. `void send(x)`
 * does not wait, and on a serverless runtime the invocation can end
 * before the call does.
 *
 * Resolved by reading the declaration out of src, once per name.
 */
const returnTypes = new Map();
function returnsVoid(name) {
  if (returnTypes.has(name)) return returnTypes.get(name);
  let answer = false;
  const stack = ["src/lib"];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (/\.tsx?$/.test(e.name)) {
        const src = readFileSync(p, "utf8");
        const m = new RegExp(
          `function\\s+${name}\\s*\\(([\\s\\S]{0,1200}?)\\)\\s*:\\s*(Promise<[^>]*>|void)`
        ).exec(src);
        if (m) {
          answer = /Promise<void>|:\s*void/.test(m[2]);
          stack.length = 0;
          break;
        }
      }
    }
  }
  returnTypes.set(name, answer);
  return answer;
}

const rows = [];
for (const file of routes()) {
  const raw = readFileSync(file, "utf8");
  const src = stripComments(raw);
  const id = file.slice(API.length + 1, -"/route.ts".length);
  // DOES IT EVER SAY IT WORKED? Without this, a route that swallows and
  // reports nothing is reported as a lie, and it is not one.
  const claimsSuccess = /ok:\s*true/.test(src);
  const swallowed = [];
  for (const { what, re } of EXTERNAL) {
    const g = new RegExp(re.source, "g");
    for (const m of src.matchAll(g)) {
      const fired = /\bvoid\s+$/.test(src.slice(Math.max(0, m.index - 6), m.index));
      const callee = /^[A-Za-z_$][\w$]*/.exec(m[0])?.[0] ?? "";
      // An ignored result is only a finding when there IS a result.
      if (fired || (!bound(src, m.index) && !returnsVoid(callee))) {
        swallowed.push({
          what,
          fired,
          line: src.slice(0, m.index).split("\n").length,
          text: src.split("\n")[src.slice(0, m.index).split("\n").length - 1]?.trim().slice(0, 100) ?? "",
        });
      }
    }
  }
  if (swallowed.length) rows.push({ id, claimsSuccess, swallowed });
}

const lying = rows.filter((r) => r.claimsSuccess);
const quiet = rows.filter((r) => !r.claimsSuccess);

console.log("SUCCESS REPORTED AFTER A CALL THAT CAN FAIL SILENTLY\n");
console.log(`  ${routes().length} routes read`);
console.log(`  ${rows.length} swallow at least one external call`);
console.log(`  ${lying.length} of those also answer ok:true — the shape api/team/invite had\n`);

console.log(`== answers ok:true AND swallows (${lying.length}) ==\n`);
for (const r of lying.sort((a, b) => b.swallowed.length - a.swallowed.length)) {
  console.log(`  ${r.id}`);
  for (const s of r.swallowed) {
    console.log(`    :${String(s.line).padStart(4)}  ${s.fired ? "FIRE-AND-FORGET" : "unread result "} ${s.what.padEnd(12)} ${s.text}`);
  }
}
if (lying.length === 0) console.log("  none.");

console.log(`\n== swallows, but never claims success (${quiet.length}) ==`);
console.log("   not a lie to anybody — listed so the count above has a denominator\n");
for (const r of quiet) console.log(`  ${r.id}  (${r.swallowed.map((s) => s.what).join(", ")})`);

console.log(
  "\n  READ, DO NOT ACT ON THE COUNT. Whether the user needed to know is a\n" +
    "  per-route judgement: a welcome email that never arrives is a lost\n" +
    "  pleasantry, an invitation that never arrives is somebody waiting for\n" +
    "  a reply that cannot come. The email half of this is already a gate —\n" +
    "  scripts/tests/email-outcome-reported.test.mjs."
);
