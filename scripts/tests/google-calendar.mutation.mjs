#!/usr/bin/env node
/*
 * CAN google-calendar.test.mjs SEE THE CALENDAR READ TOO MUCH, OR BE READ
 * WHEN IT SHOULD NOT?
 *
 * The days turned round losing the last one; a read with no ceiling on
 * its period; the description asked for; a cancelled meeting offered as
 * one that happens; Chat without the days, or without the calendar; the
 * switch ignored by the page, the connect route or Chat; the database
 * left refusing the new provider.
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

const MUTANTS = [
  {
    name: "days the wrong way round lose the last one",
    file: WINDOW,
    from: "    [first, last] = [last, first];\n    lastIsDay = isDay(from);\n",
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
    from: "      period: { from: input.from, to: input.to },\n",
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
  targets: [WINDOW, READ, TOOL, SWITCHES, CHAT, CONNECT, LIST, MIGRATION],
  mutants: MUTANTS,
});
