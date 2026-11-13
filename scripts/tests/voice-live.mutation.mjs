#!/usr/bin/env node
/*
 * CAN voice-live.test.mjs SEE THE LIVE CONVERSATION'S PROTECTIONS GO AWAY?
 *
 * Each mutation re-introduces one real defect — a minute charged twice,
 * a call left open when it cannot be paid for, words stored unchecked, a
 * cloned voice — and the gate must go red on the clause that names it.
 *
 * Run: node scripts/tests/voice-live.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/voice-live.test.mjs";
const PRICING = "src/lib/voice/live-pricing.ts";
const EVENTS = "src/lib/voice/live-events.ts";
const PROVIDER = "src/lib/voice/live-provider.ts";
const SESSION = "src/lib/voice/live-session.ts";
const START = "src/app/api/voice/live/start/route.ts";
const TICK = "src/app/api/voice/live/tick/route.ts";
const END = "src/app/api/voice/live/end/route.ts";
const SWEEP = "src/app/api/cron/voice-live-sweep/route.ts";
const SCREEN = "src/components/voice/voice-live.tsx";
const ORB = "src/components/voice/voice-orb.tsx";
const CHAT = "src/components/chat/chat-workspace.tsx";
const MIGRATION = "supabase/migrations/20261124000000_voice_live_sessions.sql";

const MUTANTS = [
  {
    name: "the cost basis drops below what was measured",
    file: PRICING,
    from: "export const LIVE_COST_USD_PER_MINUTE = 0.06;",
    to: "export const LIVE_COST_USD_PER_MINUTE = 0.02;",
    expect: "the cost basis is above every measured figure it cites",
  },
  {
    name: "a minute is charged without the margin",
    file: PRICING,
    from: "return voiceCredits(LIVE_COST_USD_PER_MINUTE, config ?? resolvePricingConfig(), marginMultiplier);",
    to: "return voiceCredits(LIVE_COST_USD_PER_MINUTE, config ?? resolvePricingConfig(), 1);",
    expect: "a minute's credits cover the cost basis at least M times",
  },
  {
    name: "a call may continue past the cap",
    file: PRICING,
    from: "minutesBilled >= 0 && minutesBilled < LIVE_MAX_SESSION_MINUTES;",
    to: "minutesBilled >= 0;",
    expect: "a call may continue below the cap and not at it",
  },
  {
    name: "any role the browser sends is stored",
    file: PRICING,
    from: '    if (role !== "user" && role !== "assistant") continue;\n',
    to: "",
    expect: "any other role is dropped",
  },
  {
    name: "a kept line is no longer clipped",
    file: PRICING,
    from: "const clipped = text.trim().slice(0, LIVE_MAX_TURN_CHARS);",
    to: "const clipped = text.trim();",
    expect: "a long line is clipped",
  },
  {
    name: "the number of kept lines is no longer bounded",
    file: PRICING,
    from: "    if (out.length >= LIVE_MAX_TURNS) break;\n",
    to: "",
    expect: "the count is bounded",
  },
  {
    name: "speaking over the answer no longer returns the globe to listening",
    file: EVENTS,
    from: '    case "input_audio_buffer.speech_started":\n      return { ...model, state: "listening" };',
    to: '    case "input_audio_buffer.speech_started":\n      return model;',
    expect: "speaking over it: listening at once",
  },
  {
    name: "lines are kept in the order their words arrived",
    file: EVENTS,
    from: '      return { ...model, entries: [...model.entries, { id, role, text: "" }] };',
    to: "      return model;",
    expect: "question first, answer second, whatever order the words arrived in",
  },
  {
    name: "the finished transcript is appended to the pieces instead of replacing them",
    file: EVENTS,
    from: 'return { ...model, entries: upsert(model.entries, id, "assistant", () => transcript) };',
    to: 'return { ...model, entries: upsert(model.entries, id, "assistant", (previous) => previous + transcript) };',
    expect: "the finished transcript replaces the pieces",
  },
  {
    name: "the next minute is asked for only when the paid one has ended",
    file: EVENTS,
    from: "return Math.max(0, paidUntil - leadSeconds * 1000 - nowMs);",
    to: "return Math.max(0, paidUntil - nowMs);",
    expect: "the next minute is asked for LEAD seconds before the paid time ends",
  },
  {
    name: "the call is opened on a custom voice id",
    file: PROVIDER,
    from: "output: { voice: LIVE_VOICE },",
    to: "output: { voice: { id: LIVE_VOICE } },",
    expect: "the voice is a stock one by name",
  },
  {
    name: "speaking over the answer no longer stops it",
    file: PROVIDER,
    from: "          interrupt_response: true,",
    to: "          interrupt_response: false,",
    expect: "speaking over the answer stops it",
  },
  {
    name: "a call with no id is handed to the browser",
    file: PROVIDER,
    from: "    if (!callId) {",
    to: "    if (false) {",
    expect: "a call that comes back with no id is refused, not handed on",
  },
  {
    name: "the month's seconds are consumed before the balance is looked at",
    file: SESSION,
    from: "    const affordable = await hasEnoughCredits(user.id, credits, plan);\n    if (!affordable.ok) return { ok: false, code: \"insufficient_credits\" };",
    to: "    void hasEnoughCredits;",
    expect: "billing: the plan, then the balance, then the month, then the hold, then the charge",
  },
  {
    name: "closing a call overwrites the reason it already ended with",
    file: SESSION,
    from: '    .eq("id", id)\n    .is("ended_at", null);',
    to: '    .eq("id", id);',
    expect: "billing: a row already ended keeps its first reason",
  },
  {
    name: "start: a refused minute leaves the call open",
    file: START,
    from: "    if (!billed.ok) {\n      await hangupLiveCall(call.callId);",
    to: "    if (!billed.ok) {",
    expect: "start: a refused minute hangs the call up and returns no answer",
  },
  {
    name: "start: a table that cannot be read is carried on past",
    file: START,
    from: '        { ok: false, code: "not_ready", error: "Live conversation is not set up on this deployment yet." },',
    to: '        { ok: false, code: "failed", error: "Live conversation is not set up on this deployment yet." },',
    expect: "start: a table that cannot be read answers not_ready",
  },
  {
    name: "start: the switch closed no longer refuses",
    file: START,
    from: '    if (!(await isFeatureOn("voice-live", user))) {\n      return NextResponse.json({ ok: false, code: "not_found", error: "Not found." }, { status: 404 });\n    }\n',
    to: "",
    expect: "start: signed in, then the switch, before anything is read",
  },
  {
    name: "tick: the minute is charged without being claimed on the count it read",
    file: TICK,
    from: '      .eq("minutes_billed", row.minutes_billed)\n',
    to: "",
    expect: "tick: the minute is CLAIMED, on the count it read, before it is charged",
  },
  {
    name: "tick: a minute that cannot be paid for leaves the call open",
    file: TICK,
    from: '    if (!billed.ok) {\n      await hangupLiveCall(row.call_id);\n      await closeLiveSession(admin, row.id, "unpaid");',
    to: "    if (!billed.ok) {",
    expect: "tick: a minute that cannot be paid for hangs up and closes",
  },
  {
    name: "tick: any account's call can be ticked",
    file: TICK,
    from: '      .eq("id", sessionId)\n      .eq("user_id", user.id)',
    to: '      .eq("id", sessionId)',
    expect: "tick: the row is the caller's own",
  },
  {
    name: "end: what the browser sent is stored as it came",
    file: END,
    from: "const turns = cleanLiveTurns(rawTurns);",
    to: "const turns = (Array.isArray(rawTurns) ? rawTurns : []) as { role: \"user\" | \"assistant\"; text: string }[];",
    expect: "end: what the browser sent is cleaned before it is stored",
  },
  {
    name: "end: a request sent twice writes the conversation twice",
    file: END,
    from: '      .is("transcript_saved_at", null)\n',
    to: "",
    expect: "end: the words are written once",
  },
  {
    name: "end: any account's call can be ended and written to",
    file: END,
    from: '      .eq("id", sessionId)\n      .eq("user_id", user.id)',
    to: '      .eq("id", sessionId)',
    expect: "end: the row is the caller's own",
  },
  {
    name: "sweep: calls are closed in the table and left open at the provider",
    file: SWEEP,
    from: "      const hungUp = await hangupLiveCall(row.call_id);",
    to: "      const hungUp = true;",
    expect: "sweep: every one is hung up and closed",
  },
  {
    name: "sweep: an overrun is charged past the cap",
    file: SWEEP,
    from: "        Math.max(0, LIVE_MAX_SESSION_MINUTES - row.minutes_billed),",
    to: "        60,",
    expect: "sweep: the unpaid minutes are charged, and never past the cap",
  },
  {
    name: "screen: the price is gone from before the call",
    file: SCREEN,
    from: '{t("live.price", { credits: live.creditsPerMinute, minutes: live.maxMinutes })}',
    to: "{null}",
    expect: "screen: the price is on it before the call",
  },
  {
    name: "screen: a parent re-render ends the call",
    file: SCREEN,
    from: "    [teardown]\n  );",
    to: "    [teardown, onKept]\n  );",
    expect: "screen: finish keeps one identity",
  },
  {
    name: "the live globe grows a halo",
    file: ORB,
    from: '{variant === "orb" && <span className="voice-orb-halo" aria-hidden="true" />}',
    to: '<span className="voice-orb-halo" aria-hidden="true" />',
    expect: "the globe variant draws no halo and no ring",
  },
  {
    name: "Chat opens both conversations at once",
    file: CHAT,
    from: "{talking && !liveAvailable && (",
    to: "{talking && (",
    expect: "Chat: the live screen where it is available, the loop where it is not",
  },
  {
    name: "the table is opened to the signed-in role",
    file: MIGRATION,
    from: "revoke all on public.voice_live_sessions from anon, authenticated;",
    to: "revoke all on public.voice_live_sessions from anon;\ngrant select, update on public.voice_live_sessions to authenticated;",
    expect: "row level security is on, and nothing is granted to a browser role",
  },
  {
    name: "the table stops accepting a reason the code closes a call with",
    file: MIGRATION,
    from: "('closed', 'unpaid', 'cap', 'swept', 'failed')",
    to: "('closed', 'unpaid', 'cap', 'failed')",
    expect: "the reasons the code closes a call with are the ones the table accepts",
  },
];

runMutations({
  name: "voice-live",
  gate: GATE,
  targets: [PRICING, EVENTS, PROVIDER, SESSION, START, TICK, END, SWEEP, SCREEN, ORB, CHAT, MIGRATION],
  mutants: MUTANTS,
});
