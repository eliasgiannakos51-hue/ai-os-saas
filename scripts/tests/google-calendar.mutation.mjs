#!/usr/bin/env node
/*
 * CAN google-calendar.test.mjs SEE THE CALENDAR READ TOO MUCH, OR BE READ
 * WHEN IT SHOULD NOT?
 *
 * The days turned round losing the last one; a read with no ceiling on
 * its period; the description asked for; a cancelled meeting offered as
 * one that happens; Chat without the days, or without the calendar; the
 * switch ignored by the page, the connect route, Chat or an automation;
 * the database left refusing the new provider; a consent that promises
 * no reads «in the background» while an automation reads at its hour; a
 * consent step that opens out of view; and Greenwich's days where the
 * person's are meant (2026-10-08).
 *
 * Run: node scripts/tests/google-calendar.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/google-calendar.test.mjs";
const WINDOW = "src/lib/integrations/calendar-window.ts";
const READ = "src/lib/integrations/read.ts";
const TOOL = "src/lib/integrations/chat-tool.ts";
const SWITCHES = "src/lib/integrations/switches.ts";
const CHAT = "src/app/api/chat/route.ts";
const CONNECT = "src/app/api/integrations/[provider]/connect/route.ts";
const LIST = "src/components/integrations/integrations-list.tsx";
const MIGRATION = "supabase/migrations/20261020000000_google_calendar_connection.sql";
const RUNNER = "src/lib/automations/runner.ts";
const FLOW_ACCESS = "src/lib/automations/flow-access.ts";
const PAGE_DATA = "src/lib/automations/page-data.ts";
const EN = "messages/en.json";
const WORKSPACE = "src/components/chat/chat-workspace.tsx";

const MUTANTS = [
  {
    name: "days the wrong way round lose the last one",
    file: WINDOW,
    from: "    [first, last] = [last, first];\n    [firstDay, lastDay] = [lastDay, firstDay];\n",
    to: "    [first, last] = [last, first];\n",
    expect: "days the wrong way round are turned round",
  },
  {
    name: "one read may cover any number of years",
    file: WINDOW,
    from: "  if (end - start > MAX_CALENDAR_SPAN_DAYS * DAY_MS) end = start + MAX_CALENDAR_SPAN_DAYS * DAY_MS;\n",
    to: "",
    expect: "never more than a year in one read",
  },
  {
    name: "the invitation's description is read",
    file: READ,
    from: '"items(id,summary,start,end,location,htmlLink,organizer(displayName,email),status)"',
    to: '"items(id,summary,description,start,end,location,htmlLink,organizer(displayName,email),status)"',
    expect: "the least of each event: never the description",
  },
  {
    name: "a cancelled meeting is offered as one that happens",
    file: READ,
    from: '      .filter((event) => event.status !== "cancelled")\n',
    to: "",
    expect: "a cancelled event is not offered",
  },
  {
    name: "Chat's question about a day reaches the calendar without the day",
    file: TOOL,
    from: "      period: { from: input.from, to: input.to, timeZone: params.timeZone ?? undefined },\n",
    to: "",
    expect: "...with days, offered only when the calendar is connected",
  },
  {
    name: "the calendar is not a source Chat can name",
    file: TOOL,
    from: '  google_calendar: "calendar",\n',
    to: "",
    expect: "the calendar is a source of its own",
  },
  {
    name: "the switch is ignored: every provider is open to everyone",
    file: SWITCHES,
    from: '(p.behindSwitch === "connections" && calendar)',
    to: "true",
    expect: "one answer to which providers are open",
  },
  {
    name: "Chat goes on reading a connected calendar after the switch closes",
    file: CHAT,
    from: "      const integrations = (await listIntegrations(user.id)).filter((i) => open.has(i.provider));",
    to: "      const integrations = await listIntegrations(user.id); void open;",
    expect: "Chat stops reading an account already connected",
  },
  {
    name: "a closed switch still lets the calendar be connected",
    file: CONNECT,
    from: '    if (!(await providersOpenTo(user)).has(provider.id)) {\n      return NextResponse.json({ ok: false, code: "unknown_provider" }, { status: 404 });\n    }\n',
    to: "",
    expect: "the connect route refuses the others",
  },
  {
    name: "the page draws the calendar card with the switch closed",
    file: LIST,
    from: "PROVIDERS.filter((p) => shown.includes(p.id) && matchesSearch(p.name, q))",
    to: "PROVIDERS.filter((p) => matchesSearch(p.name, q))",
    expect: "the page draws only those",
  },
  {
    name: "the database goes on refusing the calendar",
    file: MIGRATION,
    from: "  check (provider in ('gmail', 'google_drive', 'google_calendar', 'slack'));",
    to: "  check (provider in ('gmail', 'google_drive', 'slack'));",
    expect: "the database accepts the fourth provider",
  },
  {
    name: "an automation goes on reading the calendar after the switch closes",
    file: RUNNER,
    from: '    if (!(await providersOpenTo(ctx.user)).has("google_calendar")) return { ok: false, note: "not_connected" };\n',
    to: "",
    expect: "an automation already on stops reading the calendar",
  },
  {
    name: "switching an automation on counts a calendar behind a closed switch as connected",
    file: FLOW_ACCESS,
    from: '? !open.has("google_calendar") || !integrations.some(',
    to: "? !integrations.some(",
    expect: "...and the automations count the calendar as connected only while the switch is open",
  },
  {
    name: "the boxes on the screen count a calendar behind a closed switch as connected",
    file: PAGE_DATA,
    from: 'google_calendar: open.has("google_calendar") && integrations.some(',
    to: "google_calendar: integrations.some(",
    expect: "...and the automations count the calendar as connected only while the switch is open",
  },
  {
    name: "the consent promises again that it never reads in the background",
    file: EN,
    from: "It reads only when one of your questions, or an automation you switched on, needs it — nothing else —",
    to: "It reads only when a question needs it — never in the background —",
    expect: "en.json: the consent says an automation the person switched on reads it too",
  },
  {
    name: "the consent step opens below the fold, as if the press did nothing",
    file: LIST,
    from: '    panelRef.current?.scrollIntoView({ block: "center" });\n',
    to: "",
    expect: "one press shows its answer",
  },
  {
    name: "a day is Greenwich's again, whatever the person's zone",
    file: WINDOW,
    from: "    return zone && isDay(value) ? midnightOf(value) : t;\n",
    to: "    return t;\n",
    expect: "«2026-10-09» in Athens is Athens' day",
  },
  {
    name: "a day ends 24 hours after it starts, even when the clocks go back",
    file: WINDOW,
    from: "    if (!zone) return at + DAY_MS;\n    return midnightOf(",
    to: "    return at + DAY_MS;\n    return midnightOf(",
    expect: "...the day the clocks go back is 25 hours",
  },
  {
    name: "today is Greenwich's today",
    file: WINDOW,
    from: '  if (typeof timeZone !== "string" || !isValidTimeZone(timeZone)) return now.toISOString().slice(0, 10);\n',
    to: "  return now.toISOString().slice(0, 10);\n",
    expect: "today at 00:30 in Athens",
  },
  {
    name: "the model is told Greenwich's date",
    file: TOOL,
    from: "  const today = timeZone ? `${todayIn(timeZone)} (${timeZone})` : todayIn(null);\n",
    to: "  const today = todayIn(null);\n",
    expect: "...and the model is told today's date WHERE THE PERSON IS",
  },
  {
    name: "Chat takes any string the browser sends as a zone",
    file: CHAT,
    from: ' && isValidTimeZone(body.timeZone) ? body.timeZone : null;',
    to: " ? body.timeZone : null;",
    expect: "Chat takes the person's zone from the browser",
  },
  {
    name: "the Chat screen stops sending where the person is",
    file: WORKSPACE,
    from: "          timeZone: resolveBrowserTimeZone(),\n",
    to: "",
    expect: "...the Chat screen and the voice conversation send it",
  },
  {
    name: "an automation reads Greenwich's days",
    file: RUNNER,
    from: "period: { ...periodFor(box.source, ctx.flow.time_zone), timeZone: ctx.flow.time_zone }",
    to: "period: periodFor(box.source, ctx.flow.time_zone)",
    expect: "...and an automation reads its days in its own zone",
  },
  {
    name: "Connect goes back into the card's menu",
    file: LIST,
    from: "                  {connectButton && !isConnected && (",
    to: "                  {false && connectButton && !isConnected && (",
    expect: "ONE PRESS",
  },
];

runMutations({
  name: "connections",
  gate: GATE,
  targets: [WINDOW, READ, TOOL, SWITCHES, CHAT, CONNECT, LIST, MIGRATION, RUNNER, FLOW_ACCESS, PAGE_DATA, EN, WORKSPACE],
  mutants: MUTANTS,
});
