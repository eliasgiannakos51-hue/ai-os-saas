#!/usr/bin/env node
/*
 * CAN THE NOTIFICATIONS GATE GO RED?
 *
 * Every defect below is silent in the worst way a notification defect can
 * be: the product keeps working, nobody sees an error, and the failure is
 * a message that did not arrive or one that should not have.
 *
 *   A NOTIFICATION WITHOUT VALUE. The predicate that says no is one
 *   `return { worth: true }` away from being decoration. A product that
 *   mails "your agent ran" every morning has trained the user to ignore
 *   the one that matters by Thursday.
 *
 *   QUIET HOURS THAT DROP. Deferring and discarding look identical from
 *   the outside until the morning somebody does not find out their card
 *   was declined. So does a window that stops wrapping midnight — which
 *   silently turns 22:00–08:00 into "never quiet", the exact setting
 *   almost every user picks.
 *
 *   A GROUP THAT SWALLOWS. The 80% and 100% credit warnings merged into
 *   one loses the second, which is the one that means the agents have
 *   stopped.
 *
 *   CRITICAL AS A MASTER KEY. One extra exemption and a user who
 *   deliberately turned off payment email gets it anyway.
 *
 *   AN INVENTED NUMBER. An email "open rate" computed from a tracking
 *   pixel is mostly Apple's prefetcher. Printing it is fabricating data,
 *   and it is one line of arithmetic away.
 *
 *   A DIGEST OF ZEROES, or one that claims spending is up 100% against a
 *   baseline that does not exist.
 *
 * Run: node scripts/tests/notifications.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/notifications.test.mjs";

const TYPES = "src/lib/notify/types.ts";
const QUIET = "src/lib/notify/quiet-hours.ts";
const WORTH = "src/lib/notify/worth-sending.ts";
const GROUPING = "src/lib/notify/grouping.ts";
const ENGAGEMENT = "src/lib/notify/engagement.ts";
const DIGEST = "src/lib/notify/digest.ts";
const DISPATCH = "src/lib/notify/dispatch.ts";
const SQL = "supabase/migrations/20260901000000_notifications.sql";

const MUTANTS = [
  // ------------------------------------------------------------------
  // RULE 1 — never a notification without value.
  // ------------------------------------------------------------------
  {
    name: "an agent that produced nothing becomes worth sending",
    file: WORTH,
    from: '      if (!hasOutput) return { worth: false, reason: "the agent produced no result" };',
    to: "      if (!hasOutput) return { worth: true };",
  },
  {
    name: "'nothing new to report' counts as a finding",
    file: WORTH,
    from: "      if (facts.foundSomething === false) {",
    to: "      if (false) {",
  },
  {
    name: "the credit warning fires below its own threshold",
    file: WORTH,
    from: "      if (percent < 80) return { worth: false, reason: `only ${Math.round(percent)}% used` };",
    to: "",
  },
  {
    name: "a notification with no title at all is allowed through",
    file: WORTH,
    from: '  if (!payload.title.trim()) return { worth: false, reason: "no title" };',
    to: "",
  },

  // ------------------------------------------------------------------
  // RULE 3 — quiet hours defer, never drop, and the window wraps.
  // ------------------------------------------------------------------
  {
    name: "the quiet window stops wrapping midnight, so 22:00–08:00 silences nothing",
    file: QUIET,
    from: "  if (start < end) return minute >= start && minute < end;\n  return minute >= start || minute < end;",
    to: "  return minute >= start && minute < end;",
  },
  {
    name: "start === end becomes a 24-hour blackout instead of no window",
    file: QUIET,
    from: "  if (start === null || end === null || start === end) return false;",
    to: "  if (start === null || end === null) return false;",
  },
  {
    name: "a critical type is deferred like everything else",
    file: QUIET,
    from: "  if (NOTIFICATION_SPECS[type].critical) return at;",
    to: "",
  },
  {
    name: "the local minute goes negative west of UTC, so every comparison after it is wrong",
    file: QUIET,
    from: "  return ((total % 1440) + 1440) % 1440;",
    to: "  return total % 1440;",
  },

  // ------------------------------------------------------------------
  // RULE 2 — grouping.
  // ------------------------------------------------------------------
  {
    name: "a zero window groups anyway, merging the 80% and 100% credit warnings",
    file: TYPES,
    from: `  credits_low: {
    // CRITICAL, and this is the one people argue about. It is not an
    // upsell: an account that hits zero has its scheduled agents paused,
    // and the user finds out days later that the thing they built stopped.
    // The 80% warning is what makes that avoidable.
    type: "credits_low",
    critical: true,
    defaultChannels: ["in_app", "email"],
    // NEVER GROUPED. 80% and 100% are different facts and merging them
    // loses the one that came second.
    groupWindowMinutes: 0,`,
    to: `  credits_low: {
    type: "credits_low",
    critical: true,
    defaultChannels: ["in_app", "email"],
    groupWindowMinutes: 60,`,
  },
  {
    name: "the group is named after the LAST arrival, not the one the user would have seen",
    file: GROUPING,
    from: "      existing.count += 1;\n      existing.members.push(item);",
    to: "      existing.count += 1;\n      existing.members.push(item);\n      existing.title = item.title;",
  },
  {
    name: "the window slides with each arrival, so a steady trickle groups forever",
    file: GROUPING,
    from: "item.at.getTime() - existing.at.getTime()",
    to: "item.at.getTime() - existing.members[existing.members.length - 1].at.getTime()",
  },

  // ------------------------------------------------------------------
  // RULE 4 — opt-out, and the limits of "critical".
  // ------------------------------------------------------------------
  {
    name: "critical overrides the user's per-channel choice",
    file: TYPES,
    from: "  const resolved = chosen.filter((c) => available.includes(c));",
    to: "  const resolved = spec.critical ? [...NOTIFICATION_CHANNELS] : chosen.filter((c) => available.includes(c));",
  },
  {
    name: "switching a type off still sends it",
    file: TYPES,
    from: '    return spec.critical ? ["in_app"] : [];',
    to: "    return [...spec.defaultChannels];",
  },
  {
    name: "a critical type switched off loses even its in-app record",
    file: TYPES,
    from: '    return spec.critical ? ["in_app"] : [];',
    to: "    return [];",
  },
  {
    name: "a chat channel with nothing connected is attempted anyway",
    file: TYPES,
    from: "  const resolved = chosen.filter((c) => available.includes(c));",
    to: "  const resolved = [...chosen];",
  },
  {
    name: "Telegram is switched on by default for agent results",
    file: TYPES,
    from: `    critical: false,
    defaultChannels: ["in_app", "email"],
    // FIVE AGENTS AT 06:00 IS ONE NOTIFICATION.`,
    to: `    critical: false,
    defaultChannels: ["in_app", "email", "telegram"],
    // FIVE AGENTS AT 06:00 IS ONE NOTIFICATION.`,
  },

  // ------------------------------------------------------------------
  // THE MEASUREMENT.
  // ------------------------------------------------------------------
  {
    name: "an email open rate is reported as a number, from a prefetched pixel",
    file: ENGAGEMENT,
    from: '    return { measurable: false, why: "prefetching_makes_it_meaningless" };',
    to: "    return { measurable: true, percent: rate(counts.opened, counts.sent) ?? 0 };",
  },
  {
    name: "a rate is computed from three sends, and reads exactly like one from three hundred",
    file: ENGAGEMENT,
    from: "  if (denominator < MIN_SENDS_FOR_VERDICT) return null;",
    to: "  if (denominator <= 0) return null;",
  },
  {
    name: "a payment-failure notification is retired because nobody clicks it",
    file: ENGAGEMENT,
    from: '    ["credits_low", "payment_failed", "error_needs_attention"] as NotificationType[]',
    to: "    [] as NotificationType[]",
  },

  // ------------------------------------------------------------------
  // THE DIGEST.
  // ------------------------------------------------------------------
  {
    name: "a week where nothing happened is mailed anyway",
    file: WORTH,
    from: '  if (total <= 0) return { worth: false, reason: "nothing happened this week" };',
    to: "",
  },
  {
    name: "'up 100%' is claimed against a baseline of zero",
    file: DIGEST,
    from: "  if (before <= 0) return null;",
    to: "  if (before < 0) return null;",
  },
  {
    name: "a user with no published site is told their site had no visitors",
    file: DIGEST,
    from: "  if (facts.siteViews !== null) {",
    to: "  if (true) {",
  },
  {
    name: "the digest reports agent runs without saying how many found something",
    file: DIGEST,
    from: '      text: `${facts.agentRuns} agent ${facts.agentRuns === 1 ? "run" : "runs"}, ${facts.agentRunsWithFindings} found something`,',
    to: '      text: `${facts.agentRuns} agent ${facts.agentRuns === 1 ? "run" : "runs"}`,',
  },
  {
    name: "ordinary week-to-week noise is reported as a trend",
    file: DIGEST,
    from: "export const SPEND_CHANGE_THRESHOLD_PERCENT = 20;",
    to: "export const SPEND_CHANGE_THRESHOLD_PERCENT = 1;",
  },
  {
    name: "plurals stop agreeing, so one record reads '1 new records'",
    file: DIGEST,
    from: '      text: `${facts.newRecords} new ${facts.newRecords === 1 ? "record" : "records"}`,',
    to: "      text: `${facts.newRecords} new records`,",
  },

  // ------------------------------------------------------------------
  // THE ONE PATH.
  // ------------------------------------------------------------------
  {
    name: "the dispatcher stops asking whether it is worth sending",
    file: DISPATCH,
    from: "  const verdict = isWorthSending({ type: input.type, title, body, facts: input.facts });",
    to: "  const verdict = { worth: true } as ReturnType<typeof isWorthSending>;",
  },
  {
    name: "quiet hours are consulted after the send instead of before it",
    file: DISPATCH,
    from: "  const due = deliverAt({ at: now, type: input.type, quiet: context.quiet });",
    to: "  const due = now;",
  },
  {
    name: "suppressions stop being recorded, so rule 1 becomes unmeasurable",
    file: DISPATCH,
    from: `    await recordNotificationEvent({
      userId: input.userId,
      type: input.type,
      channel: "in_app",
      event: "suppressed",
      reason: verdict.reason,
    });
    return empty(verdict.reason);`,
    to: "    return empty(verdict.reason);",
  },
  {
    name: "the deferred drain is removed, so 'held until morning' means 'thrown away'",
    file: "src/app/api/cron/agent-runs/route.ts",
    from: "      deferredNotifications = await drainDeferredNotifications();",
    to: "      deferredNotifications = { examined: 0, sent: 0 };",
  },

  // ------------------------------------------------------------------
  // THE MIGRATION — a policy without a grant is a locked door.
  // ------------------------------------------------------------------
  {
    name: "notification_preferences gets perfect RLS and no GRANT",
    file: SQL,
    from: "grant select, insert, update, delete on public.notification_preferences to authenticated;",
    to: "",
  },
  {
    name: "notification_events becomes user-writable, so a click rate can be inflated",
    file: SQL,
    from: "revoke insert, update, delete on public.notification_events from authenticated;",
    to: "grant insert on public.notification_events to authenticated;",
  },
  {
    name: "anon keeps access to the settings table",
    file: SQL,
    from: "revoke all on public.notification_settings from anon;",
    to: "",
  },
  {
    name: "a type is added to TypeScript and forgotten in the CHECK constraint",
    file: SQL,
    from: "'payment_failed', 'team_member_joined', 'error_needs_attention'",
    to: "'team_member_joined', 'error_needs_attention'",
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  let mutated = original;
  for (const e of edits) mutated = mutated.replace(e.from, e.to);
  if (mutated === original) {
    missed.push({ ...m, why: "the mutation left the file byte-identical — it is not a defect" });
    console.log(`  NO-OP   ${m.name}`);
    continue;
  }
  writeFileSync(m.file, mutated);
  // DECIDED BY THE EXIT CODE, never by grepping stdout for FAIL: a gate
  // that dies on a syntax error and prints nothing has still gone red.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

try {
  execFileSync("node", [GATE], { stdio: "pipe" });
  console.log("\nbaseline: the gate is green on the unmutated tree");
} catch {
  console.log("\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
  process.exit(1);
}
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
