// NOTIFICATIONS THAT ARE WORTH SENDING (V4 #18).
//
// WHAT THIS ENVIRONMENT COULD NOT DO, said first and plainly:
//
//   NO EMAIL WAS SENT. There is no RESEND_API_KEY here and no verified
//   sending domain, so not one message left the machine. Every claim below
//   about the email channel is about the code that would send it.
//   NO TELEGRAM MESSAGE AND NO DISCORD POST were made either — there is no
//   TELEGRAM_BOT_TOKEN and no webhook, and both senders refuse cleanly
//   without one, which is the only part of them this can prove.
//   NOBODY CLICKED ANYTHING. The click rate that decides whether a type is
//   worth sending is measured from real clicks by real people; what is
//   checked here is that the arithmetic over those clicks is right and
//   that it refuses to answer when the sample is too small.
//
// THE SIX THINGS THAT WOULD BE WRONG QUIETLY:
//
//   A NOTIFICATION WITH NOTHING IN IT. "Your agent ran" every morning is
//   true, useless, and the reason nobody reads the one that matters.
//   Section 1 is the cross-product of every type against the facts that
//   make it worthless.
//
//   QUIET HOURS THAT DROP INSTEAD OF DEFER. Indistinguishable from working
//   correctly until the morning somebody does not get told their card was
//   declined. Section 2, including the window that wraps midnight — which
//   is the normal case, not the edge case.
//
//   GROUPING THAT SWALLOWS. Merging 80% and 100% credit warnings loses the
//   second one. Section 3 checks that the types which must never group
//   never do, from the SPECS rather than from a list written twice.
//
//   A CRITICAL TYPE THAT OVERRIDES A CHOICE. "Critical" buys exactly two
//   exemptions and no more; a third would be a product deciding it knows
//   better than a user who turned something off on purpose. Section 4.
//
//   AN INVENTED OPEN RATE. Apple Mail prefetches every image in every
//   message, so an email "open" is a machine most of the time. Reporting a
//   number anyway is fabricating data. Section 5.
//
//   A DIGEST OF ZEROES. Section 6, plus the observations that must NOT
//   appear — the ones computed from a baseline that does not exist.
//
// Run: node scripts/tests/notifications.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const eq = (name, actual, expected) =>
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const types = await loadTs("src/lib/notify/types.ts");
const quiet = await loadTs("src/lib/notify/quiet-hours.ts");
const worth = await loadTs("src/lib/notify/worth-sending.ts");
const grouping = await loadTs("src/lib/notify/grouping.ts");
const engagement = await loadTs("src/lib/notify/engagement.ts");
const digest = await loadTs("src/lib/notify/digest.ts");

const { NOTIFICATION_TYPES, NOTIFICATION_CHANNELS, NOTIFICATION_SPECS, resolveChannels } = types;

// =====================================================================
console.log("\n== 1. RULE 1: never a notification without value ==");
// =====================================================================

// EVERY TYPE, not a sample. A type with no branch in isWorthSending would
// silently be "always worth sending", which is precisely the default this
// rule exists to remove.
for (const type of NOTIFICATION_TYPES) {
  const empty = worth.isWorthSending({ type, title: "", body: "" });
  ok(`${type}: a notification with no title is refused`, empty.worth === false, JSON.stringify(empty));
}

// The one that matters most, in the shape it actually arrives.
{
  const ran = worth.isWorthSending({
    type: "agent_completed",
    title: "Competitor watch",
    body: "",
    facts: { output: "" },
  });
  ok("an agent that ran and produced nothing is NOT worth sending", ran.worth === false, JSON.stringify(ran));

  const nothingNew = worth.isWorthSending({
    type: "agent_completed",
    title: "Competitor watch",
    body: "Nothing new to report.",
    facts: { output: "Nothing new to report.", foundSomething: false },
  });
  ok(
    "…and neither is one whose result IS the words 'nothing new'",
    nothingNew.worth === false,
    JSON.stringify(nothingNew)
  );

  const found = worth.isWorthSending({
    type: "agent_completed",
    title: "Competitor watch",
    body: "They cut the Pro tier to $19.",
    facts: { output: "They cut the Pro tier to $19.", foundSomething: true },
  });
  ok("but one that found something IS", found.worth === true, JSON.stringify(found));
}

{
  const below = worth.isWorthSending({ type: "credits_low", title: "Credits", body: "", facts: { percentUsed: 60 } });
  ok("a credit warning below the 80% threshold is refused", below.worth === false);
  const at80 = worth.isWorthSending({ type: "credits_low", title: "Credits", body: "", facts: { percentUsed: 80 } });
  ok("…and one exactly at 80 is not (>=, not >)", at80.worth === true, JSON.stringify(at80));
}

{
  // A PAYMENT FAILURE IS ALWAYS WORTH SENDING. There is no fact that
  // makes it not, and a predicate that could refuse it would be a way to
  // lose somebody's subscription silently.
  const failed = worth.isWorthSending({ type: "payment_failed", title: "Payment failed", body: "" });
  ok("a payment failure is always worth sending", failed.worth === true, JSON.stringify(failed));
}

{
  const empty = worth.isWorthSending({ type: "research_ready", title: "Report", body: "", facts: { sectionCount: 0 } });
  ok("a research report with no sections is refused", empty.worth === false);
  const noUrl = worth.isWorthSending({ type: "website_published", title: "Site", body: "" });
  ok("a publish notification with no address is refused", noUrl.worth === false);
}

// =====================================================================
console.log("\n== 2. RULE 3: quiet hours DEFER, they never drop ==");
// =====================================================================

const nightly = { startMinute: 22 * 60, endMinute: 8 * 60, utcOffsetMinutes: 0 };

// THE WINDOW WRAPS MIDNIGHT, which is what almost everybody sets. A
// naive `start <= m && m < end` answers false for every minute of it.
{
  const cases = [
    [23 * 60, true, "23:00 is inside 22:00–08:00"],
    [0, true, "midnight is inside it"],
    [3 * 60, true, "03:00 is inside it"],
    [7 * 60 + 59, true, "07:59 is inside it"],
    [8 * 60, false, "08:00 is the end, and is OUT"],
    [12 * 60, false, "noon is out"],
    [22 * 60, true, "22:00 is the start, and is IN"],
    [21 * 60 + 59, false, "21:59 is out"],
  ];
  for (const [minute, expected, label] of cases) {
    ok(label, quiet.isQuietAt(minute, nightly) === expected);
  }
}

// A non-wrapping window still works — a user who sleeps in the afternoon
// is unusual, not unsupported.
{
  const siesta = { startMinute: 13 * 60, endMinute: 16 * 60, utcOffsetMinutes: 0 };
  ok("13:30 is inside a same-day window", quiet.isQuietAt(13 * 60 + 30, siesta) === true);
  ok("22:00 is outside a same-day window", quiet.isQuietAt(22 * 60, siesta) === false);
}

// start === end is NOT a 24-hour blackout. Reading it as one would mean a
// user who set both ends to the same time never hears anything again.
{
  const degenerate = { startMinute: 9 * 60, endMinute: 9 * 60, utcOffsetMinutes: 0 };
  ok("a zero-length window silences nothing", quiet.isQuietAt(9 * 60, degenerate) === false);
  ok("…at any hour", quiet.isQuietAt(3 * 60, degenerate) === false);
}

// NEGATIVE OFFSETS. A single `%` in JavaScript returns a negative
// remainder, so a user in UTC-5 would get a negative minute-of-day and
// every comparison after it would be wrong.
{
  const at = new Date("2026-03-01T02:00:00Z");
  eq("UTC-5 turns 02:00Z into 21:00 local", quiet.localMinuteOfDay(at, -300), 21 * 60);
  eq("UTC+9 turns 02:00Z into 11:00 local", quiet.localMinuteOfDay(at, 540), 11 * 60);
  eq("UTC-14 wraps to the previous day without going negative", quiet.localMinuteOfDay(at, -840), 12 * 60);
}

// THE DEFERRAL ITSELF.
{
  const at = new Date("2026-03-01T23:30:00Z");
  const due = quiet.deliverAt({ at, type: "agent_completed", quiet: nightly });
  ok("a notification raised at 23:30 is held", quiet.wasDeferred(at, due) === true);
  ok("…until the window ends, not later", due.getUTCHours() === 8 && due.getUTCMinutes() === 0, due.toISOString());
  ok("…and the next day, not the same one", due.getUTCDate() === 2, due.toISOString());
  ok("IT IS A DATE, NOT A DROP", due instanceof Date && Number.isFinite(due.getTime()));

  // A CRITICAL TYPE IGNORES THE WINDOW. This is one of exactly two
  // exemptions critical buys, and it is why the flag exists.
  const critical = quiet.deliverAt({ at, type: "payment_failed", quiet: nightly });
  ok("a payment failure is not held until morning", quiet.wasDeferred(at, critical) === false);

  const daytime = new Date("2026-03-01T12:00:00Z");
  ok(
    "nothing is held outside the window",
    quiet.wasDeferred(daytime, quiet.deliverAt({ at: daytime, type: "agent_completed", quiet: nightly })) === false
  );
  ok(
    "and nothing is held when no window is set",
    quiet.wasDeferred(at, quiet.deliverAt({ at, type: "agent_completed", quiet: quiet.NO_QUIET_HOURS })) === false
  );
}

// =====================================================================
console.log("\n== 3. RULE 2: five agents are ONE notification ==");
// =====================================================================

{
  const base = new Date("2026-03-02T06:00:00Z");
  const five = [0, 1, 2, 3, 4].map((i) => ({
    type: "agent_completed",
    groupKey: "agent_completed",
    title: `Agent ${i} finished`,
    body: "found something",
    at: new Date(base.getTime() + i * 60_000),
  }));
  const grouped = grouping.groupNotifications(five);
  eq("five agent results inside the window collapse to one", grouped.length, 1);
  eq("…and it says how many", grouped[0].count, 5);
  ok("…named after the FIRST, which is the one the user would have seen", grouped[0].title === "Agent 0 finished");
  eq("…and the summary states the remainder", grouping.groupSummary(grouped[0]).extraCount, 4);
}

{
  // THE WINDOW IS MEASURED FROM THE FIRST ITEM, not slid forward by each
  // new arrival — otherwise a steady trickle every 59 minutes would group
  // forever and the user would never be told anything again.
  const base = new Date("2026-03-02T06:00:00Z");
  const window = NOTIFICATION_SPECS.agent_completed.groupWindowMinutes;
  const trickle = [0, 50, 100].map((mins) => ({
    type: "agent_completed",
    groupKey: "agent_completed",
    title: `t+${mins}`,
    body: "",
    at: new Date(base.getTime() + mins * 60_000),
  }));
  const grouped = grouping.groupNotifications(trickle);
  ok(
    `a trickle does not group forever (window ${window}m -> ${grouped.length} groups)`,
    grouped.length === 2,
    JSON.stringify(grouped.map((g) => ({ title: g.title, count: g.count })))
  );
}

// THE TYPES THAT MUST NEVER GROUP, read from the specs so this cannot
// drift away from what the dispatcher actually does.
for (const type of ["credits_low", "payment_failed", "website_published"]) {
  ok(`${type} never groups (window is 0)`, NOTIFICATION_SPECS[type].groupWindowMinutes === 0);
}
{
  // …and proved behaviourally, not just by reading the constant: 80% and
  // 100% must survive as two separate notifications.
  const base = new Date("2026-03-02T06:00:00Z");
  const warnings = [80, 100].map((pct, i) => ({
    type: "credits_low",
    groupKey: "credits_low",
    title: `${pct}% of your credits used`,
    body: "",
    at: new Date(base.getTime() + i * 60_000),
  }));
  const grouped = grouping.groupNotifications(warnings);
  eq("the 80% and 100% warnings stay two notifications", grouped.length, 2);
  ok("…and neither claims to stand for the other", grouped.every((g) => g.count === 1));
}

// =====================================================================
console.log("\n== 4. RULE 4: opt out per type — and what 'critical' does NOT buy ==");
// =====================================================================

{
  const off = resolveChannels({ type: "agent_completed", disabled: true });
  eq("a non-critical type switched off goes nowhere at all", off, []);

  const criticalOff = resolveChannels({ type: "payment_failed", disabled: true });
  eq("a critical type switched off still leaves its in-app record", criticalOff, ["in_app"]);
  ok("…and does NOT re-enable email", !criticalOff.includes("email"));
}

{
  // THE THIRD EXEMPTION THAT MUST NOT EXIST. A user who removed email
  // from a critical type made a decision; overriding it is how a product
  // earns a spam complaint from the one person who reads everything.
  const chosen = resolveChannels({ type: "payment_failed", chosen: ["in_app"] });
  eq("critical does not override a per-channel choice", chosen, ["in_app"]);
}

{
  const unavailable = resolveChannels({
    type: "agent_completed",
    chosen: ["in_app", "telegram"],
    available: ["in_app", "email"],
  });
  eq("a channel with nothing connected is dropped, not attempted", unavailable, ["in_app"]);
}

{
  // NO CHAT CHANNEL IS ON BY DEFAULT. Connecting Telegram to receive an
  // agent result is not consent to be messaged about credit balances.
  for (const type of NOTIFICATION_TYPES) {
    const defaults = NOTIFICATION_SPECS[type].defaultChannels;
    ok(
      `${type}: no chat channel is on by default`,
      !defaults.includes("telegram") && !defaults.includes("discord"),
      JSON.stringify(defaults)
    );
  }
}

{
  // ORDER IS STABLE, so two calls with the same inputs are comparable —
  // which is what makes every assertion above meaningful.
  const a = resolveChannels({ type: "agent_completed", chosen: ["email", "in_app"] });
  const b = resolveChannels({ type: "agent_completed", chosen: ["in_app", "email"] });
  eq("channel order does not depend on the order the user picked", a, b);
}

// EVERY TYPE HAS A DESTINATION (rule 5: one click goes somewhere).
for (const type of NOTIFICATION_TYPES) {
  const href = NOTIFICATION_SPECS[type].href;
  ok(
    `${type}: has a relative in-app destination (${href})`,
    typeof href === "string" && href.startsWith("/") && !href.startsWith("//")
  );
}

// =====================================================================
console.log("\n== 5. THE MEASUREMENT — and the number that must not be invented ==");
// =====================================================================

{
  const report = engagement.engagementForType("agent_completed", {
    in_app: { sent: 100, opened: 40, clicked: 30, suppressed: 5 },
    email: { sent: 100, opened: 0, clicked: 4, suppressed: 0 },
  });

  const inApp = report.channels.find((c) => c.channel === "in_app");
  const email = report.channels.find((c) => c.channel === "email");

  eq("in-app click rate is clicked/sent as a percentage", inApp.clickRatePercent, 30);
  ok(
    "AN EMAIL OPEN RATE IS REPORTED AS UNMEASURABLE, NOT AS A NUMBER",
    email.openRate.measurable === false,
    JSON.stringify(email.openRate)
  );
  ok(
    "…for the right reason (prefetching, not 'no data')",
    email.openRate.why === "prefetching_makes_it_meaningless",
    email.openRate.why
  );
  ok("a 4% email click rate is below the floor", email.clickRatePercent < engagement.CLICK_RATE_FLOOR_PERCENT);
}

{
  // A VERDICT FROM THREE SENDS IS NOT A VERDICT. Two clicks out of three
  // is 67% and means nothing; nor does zero out of three.
  const thin = engagement.engagementForType("research_ready", {
    email: { sent: 3, opened: 0, clicked: 0, suppressed: 0 },
  });
  ok(
    `no verdict below ${engagement.MIN_SENDS_FOR_VERDICT} sends`,
    thin.verdict === "too_early_to_say",
    JSON.stringify(thin.verdict)
  );
  ok("…and no rate is reported at all, rather than a meaningless one", thin.clickRatePercent === null, JSON.stringify(thin.clickRatePercent));
  ok("…so it cannot be retired on it", engagement.isSafeToRetire("research_ready", thin) === false);
}

{
  // THE CRITICAL TYPES ARE NEVER RETIRED BY A CLICK RATE. Nobody clicks
  // "your payment failed" — they go and fix their card. A low click rate
  // on it is the feature working.
  for (const type of ["payment_failed", "credits_low", "error_needs_attention"]) {
    const dead = engagement.engagementForType(type, {
      email: { sent: 500, opened: 0, clicked: 1, suppressed: 0 },
    });
    ok(`${type} is never retired on a click rate`, engagement.isSafeToRetire(type, dead) === false);
  }
  const chatty = engagement.engagementForType("team_member_joined", {
    email: { sent: 500, opened: 0, clicked: 2, suppressed: 0 },
  });
  ok("a non-critical type with a dead click rate IS a candidate", engagement.isSafeToRetire("team_member_joined", chatty) === true);
}

// =====================================================================
console.log("\n== 6. THE DIGEST — real numbers, and the ones it must not print ==");
// =====================================================================

const noWeek = {
  agentRuns: 0, agentRunsWithFindings: 0, agentRunsFailed: 0, newRecords: 0,
  siteViews: null, siteViewsPrevious: null, creditsSpent: 0, creditsAveragePerWeek: null,
  leadsWithoutFollowUp: 0,
};

{
  const quietWeek = digest.buildDigest(noWeek);
  ok("a week where nothing happened is not sent", quietWeek.worth.worth === false, JSON.stringify(quietWeek.worth));
  eq("…and produces no lines to send", quietWeek.lines.length, 0);
}

{
  // The brief's own example, as data.
  const week = digest.buildDigest({
    ...noWeek,
    agentRuns: 3,
    agentRunsWithFindings: 2,
    newRecords: 12,
    siteViews: 45,
    siteViewsPrevious: 45,
    creditsSpent: 340,
    creditsAveragePerWeek: 280,
    leadsWithoutFollowUp: 5,
  });
  const text = week.lines.map((l) => l.text).join(" | ");
  ok("it says how many agents ran AND how many found something", /3 agent runs, 2 found something/.test(text), text);
  ok("it counts the new records", /12 new records/.test(text), text);
  ok("it reports the site's real visits", /your site: 45 visits/.test(text), text);
  ok("it reports spend against the user's OWN average", /340 credits spent \(your average: 280\)/.test(text), text);

  const noticed = week.observations.map((o) => o.text).join(" | ");
  ok("it notices leads with no follow-up", /5 leads have no follow-up recorded/.test(noticed), noticed);
  ok("it notices spending up 21% on the average", /spending is up 21%/.test(noticed), noticed);
}

{
  // A USER WITH NO SITE IS NOT TOLD THEIR SITE HAD NO VISITORS.
  const week = digest.buildDigest({ ...noWeek, newRecords: 4, siteViews: null });
  ok("no published site means no site line at all", !week.lines.some((l) => l.key === "site"), JSON.stringify(week.lines));

  const withSite = digest.buildDigest({ ...noWeek, newRecords: 4, siteViews: 0, siteViewsPrevious: 0 });
  ok("a site with genuinely zero visits IS reported", withSite.lines.some((l) => l.key === "site"));
}

{
  // NO AVERAGE, NO COMPARISON. A first-week account has no baseline, and
  // "spending is up 100%" against a zero baseline is a fabricated fact.
  const firstWeek = digest.buildDigest({ ...noWeek, creditsSpent: 340, creditsAveragePerWeek: null });
  ok(
    "spend is reported without an average when there is no baseline",
    firstWeek.lines.some((l) => /340 credits spent$/.test(l.text)),
    JSON.stringify(firstWeek.lines)
  );
  ok("…and no percentage change is claimed", !firstWeek.observations.some((o) => o.key === "spend_change"));

  eq("a change from zero has no percentage", digest.percentChange(340, 0), null);
  const zeroBase = digest.buildDigest({ ...noWeek, creditsSpent: 340, creditsAveragePerWeek: 0 });
  ok("…and a zero average produces no observation", !zeroBase.observations.some((o) => o.key === "spend_change"));
}

{
  // NOISE IS NOT AN OBSERVATION.
  const small = digest.buildDigest({ ...noWeek, newRecords: 3, creditsSpent: 105, creditsAveragePerWeek: 100 });
  ok("a 5% move is not mentioned", !small.observations.some((o) => o.key === "spend_change"));
  const real = digest.buildDigest({ ...noWeek, newRecords: 3, creditsSpent: 130, creditsAveragePerWeek: 100 });
  ok("a 30% move is", real.observations.some((o) => o.key === "spend_change"));
}

{
  // SINGULARS. "1 agent runs, 1 found something" is the kind of sentence
  // that tells a reader a machine wrote it and nobody read it.
  const one = digest.buildDigest({ ...noWeek, agentRuns: 1, agentRunsWithFindings: 1, newRecords: 1, siteViews: 1 });
  const text = one.lines.map((l) => l.text).join(" | ");
  ok("one run reads as 'run', not 'runs'", /1 agent run,/.test(text), text);
  ok("one record reads as 'record'", /1 new record\b/.test(text), text);
  ok("one visit reads as 'visit'", /1 visit\b/.test(text), text);
  const oneLead = digest.buildDigest({ ...noWeek, newRecords: 1, leadsWithoutFollowUp: 1 });
  ok("one lead reads as 'lead has'", /1 lead has no follow-up/.test(oneLead.observations.map((o) => o.text).join(" ")), JSON.stringify(oneLead.observations));
}

// =====================================================================
console.log("\n== 7. the wiring the compiler cannot see ==");
// =====================================================================

// Every channel the specs name is a channel the code knows how to send
// on. A typo here would be a preference the user sets that never fires.
{
  const known = new Set(NOTIFICATION_CHANNELS);
  for (const type of NOTIFICATION_TYPES) {
    ok(
      `${type}: every default channel is a real channel`,
      NOTIFICATION_SPECS[type].defaultChannels.every((c) => known.has(c)),
      JSON.stringify(NOTIFICATION_SPECS[type].defaultChannels)
    );
  }
}

// The migration's CHECK constraints are written as string literals in
// SQL. If a type is added to TypeScript and not to the constraint, every
// preference row for it fails to insert — at runtime, for real users.
{
  const sql = readFileSync("supabase/migrations/20260901000000_notifications.sql", "utf8");
  // COMMENTS STRIPPED BEFORE THE DESTRUCTIVE SCAN. This file documents in
  // prose that it contains no DROP TABLE and no TRUNCATE, and a scan of
  // the raw text finds those words in the sentence that promises they are
  // absent — a check that fails on a file BECAUSE it explains itself.
  const statements = sql.replace(/--[^\n]*/g, "");
  for (const type of NOTIFICATION_TYPES) {
    ok(`${type} is allowed by the notification_preferences CHECK`, sql.includes(`'${type}'`));
  }
  for (const channel of NOTIFICATION_CHANNELS) {
    ok(`${channel} is allowed by the channels CHECK`, sql.includes(`'${channel}'`));
  }
  // A POLICY WITHOUT A GRANT IS A LOCKED DOOR — the lesson that cost a
  // whole feature one migration ago. Every new table must grant.
  for (const table of ["notification_settings", "notification_preferences", "notification_channels", "notification_events"]) {
    ok(`${table} has an explicit GRANT (a policy alone is a locked door)`, new RegExp(`grant [^;]+ on public\\.${table} to authenticated`).test(sql));
    ok(`${table} revokes anon`, new RegExp(`revoke [^;]+ on public\\.${table} from anon`).test(sql));
    ok(`${table} has RLS enabled`, sql.includes(`alter table public.${table} enable row level security`));
  }
  // Writes to the measurement table are service-role only: a user who
  // could insert could change what the product decides is worth sending.
  ok(
    "notification_events refuses user writes",
    /revoke insert, update, delete on public\.notification_events from authenticated/.test(sql)
  );
  // And nothing destructive.
  ok("the migration contains no DROP TABLE", !/drop\s+table/i.test(statements));
  ok("the migration contains no TRUNCATE", !/truncate/i.test(statements));
  ok("…and no unqualified DELETE", !/delete\s+from\s+\S+\s*;/i.test(statements));
}

// The dispatcher must ask the questions in the order that makes them
// answerable, and there must be no way round it.
{
  const src = readFileSync("src/lib/notify/dispatch.ts", "utf8");
  // THE BODY OF dispatchNotification, not the whole file. Scanning the
  // file finds findOpenGroup's DEFINITION, which sits above the function
  // that calls it — so the check would have been reading the order the
  // helpers happen to be declared in, which is not a behaviour at all.
  const bodyStart = src.indexOf("export async function dispatchNotification(");
  const bodyEnd = src.indexOf("async function sendToChannels(");
  ok("the dispatcher's body was located", bodyStart > 0 && bodyEnd > bodyStart);
  const body = src.slice(bodyStart, bodyEnd);
  const order = ["isWorthSending", "resolveChannels", "deliverAt", "findOpenGroup", "createNotification"];
  let last = -1;
  let inOrder = true;
  for (const step of order) {
    const at = body.indexOf(step + "(");
    if (at < 0 || at < last) inOrder = false;
    last = at;
  }
  ok(`dispatch asks the five questions in order (${order.join(" -> ")})`, inOrder);
  ok("every step is actually present in the body", last > 0);
  ok("there is no 'send anyway' escape hatch", !/force\s*[:?]|bypassWorth|skipPreferences/.test(src));
  // NOT JUST "the words appear somewhere". Rule 1 is only checkable if
  // THE REFUSAL ITSELF is counted, so the assertion is on the branch that
  // does the refusing: a `suppressed` event carrying the verdict's own
  // reason, written before the dispatcher returns.
  ok(
    "the worth-sending refusal is recorded with its reason",
    /if \(!verdict\.worth\) \{[\s\S]{0,400}?event: "suppressed"[\s\S]{0,120}?reason: verdict\.reason/.test(body)
  );
  ok("…and the opt-out refusal is recorded too", /channels\.length === 0[\s\S]{0,400}?event: "suppressed"/.test(body));
  ok("…and so is a channel held by quiet hours", /if \(deferred\) \{[\s\S]{0,600}?event: "suppressed"[\s\S]{0,120}?reason: "quiet hours"/.test(body));
  ok("the deferred half of quiet hours is actually drained", /drainDeferredNotifications/.test(src));
}

// The drain must be reachable, or "deferred" means "dropped".
{
  const cron = readFileSync("src/app/api/cron/agent-runs/route.ts", "utf8");
  ok("a scheduled job drains deferred notifications", cron.includes("drainDeferredNotifications()"));
}

// Rule 5's redirect must record BEFORE it redirects, or the click rate is
// measured from nothing.
{
  const route = readFileSync("src/app/api/n/[id]/route.ts", "utf8");
  ok("the click route records the click", route.includes("recordClick("));
  ok(
    "…before it redirects",
    route.indexOf("recordClick(") < route.lastIndexOf("NextResponse.redirect")
  );
  ok("…and refuses an absolute destination", route.includes("safeNotificationUrl("));
  ok("…and scopes the lookup to the signed-in user", readFileSync("src/lib/notify/tracking.ts", "utf8").includes('.eq("user_id", params.userId)'));
}

// A chat target is a credential. It must be ciphertext, and the sender
// must never put the token in a log line.
{
  const prefs = readFileSync("src/lib/notify/preferences.ts", "utf8");
  ok("chat targets are encrypted before storage", prefs.includes("encryptSecret("));
  ok("…and refused outright when there is no key", prefs.includes("encryptionAvailable()"));
  const tg = readFileSync("src/lib/notify/channels/telegram.ts", "utf8");
  ok("the Telegram sender never logs its URL (it contains the token)", !/console\.(log|error)\([^)]*url/i.test(tg));
  const dc = readFileSync("src/lib/notify/channels/discord.ts", "utf8");
  ok("Discord posts cannot ping a server", dc.includes("allowed_mentions"));
  ok("…and the webhook host is checked at SEND time, not only at save time", dc.includes("checkDiscordWebhook(params.webhookUrl)"));
}

// =====================================================================
console.log("\n== 8. the seven types, in ten languages ==");
// =====================================================================
// The settings panel builds its keys at runtime — `types.${type}.label` —
// so the i18n gate's literal-t() scan cannot see them and next-intl
// renders a missing key as its own dotted path without failing anything.
// A Greek user would see "settings.notifications.types.credits_low.label"
// on the screen where they decide what interrupts them. Checked here
// instead, per type and per channel, across every locale.
{
  const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
  const messages = Object.fromEntries(
    LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
  );
  const read = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

  const required = [
    ...NOTIFICATION_TYPES.flatMap((t) => [
      `settings.notifications.types.${t}.label`,
      `settings.notifications.types.${t}.description`,
    ]),
    ...NOTIFICATION_CHANNELS.map((c) => `settings.notifications.channels.${c}`),
    ...["telegram", "discord"].flatMap((k) => [
      `settings.notifications.chat.${k}.help`,
      `settings.notifications.chat.${k}.placeholder`,
    ]),
    ...[
      "title", "description", "saved", "saveError", "criticalNote",
      "quiet.title", "quiet.description", "quiet.enable", "quiet.from", "quiet.to",
      "quiet.offset", "quiet.deferNote",
      "chat.title", "chat.description", "chat.connect", "chat.connecting",
      "chat.disconnect", "chat.connected", "chat.notConfigured",
      "chat.testSent", "chat.testFailed",
    ].map((k) => `settings.notifications.${k}`),
  ];

  const missing = [];
  for (const key of required) {
    for (const locale of LOCALES) {
      const value = read(messages[locale], key);
      if (typeof value !== "string" || value.trim() === "") missing.push(`${locale}: ${key}`);
    }
  }
  ok(`every notification key resolves in all ten locales (${required.length} keys)`, missing.length === 0, missing.slice(0, 10).join("\n        "));

  // PRESENT IS NOT TRANSLATED. Copying the English into el.json satisfies
  // "the key exists" and ships an English settings screen to a Greek
  // user — which is the failure this product has had before.
  const untranslated = [];
  for (const key of required) {
    const en = read(messages.en, key);
    for (const locale of ["el", "ja", "ar"]) {
      const value = read(messages[locale], key);
      // Brand names and a URL placeholder are the same in every script,
      // so they are exempt by VALUE rather than by key name.
      if (typeof en !== "string" || /^(Telegram|Discord|Email|https?:)/.test(en)) continue;
      if (value === en) untranslated.push(`${locale}: ${key}`);
    }
  }
  ok("…and is actually translated into el/ja/ar", untranslated.length === 0, untranslated.slice(0, 10).join("\n        "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  - " + f).join("\n")); process.exit(1); }
