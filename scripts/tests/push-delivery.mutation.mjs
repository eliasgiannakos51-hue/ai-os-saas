#!/usr/bin/env node
/*
 * CAN push-delivery.test.mjs SEE A PUSH GO SOMEWHERE IT SHOULD NOT, OR
 * HOLD A SWEEP UP?
 *
 * Each mutant puts back one thing the 2026-11-05 change took away: a
 * host that is not a push service's, a send with no deadline, a sweep
 * that awaits one person after another, a subscription written past the
 * route's checks.
 *
 * Run: node scripts/tests/push-delivery.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/push-delivery.test.mjs";
const DELIVERY = "src/lib/push/delivery.ts";
const SENDER = "src/lib/push/web-push.ts";
const ROUTE = "src/app/api/push/subscribe/route.ts";
const LEADS = "src/app/api/cron/lead-reminders/route.ts";
const ACTIONS = "src/app/api/cron/meeting-action-reminders/route.ts";
const SCHEDULED = "src/app/api/cron/scheduled-runs/route.ts";
const MIGRATION = "supabase/migrations/20261116000000_push_subscriptions_server_written.sql";

const MUTANTS = [
  {
    name: "any host at all is a push service",
    file: DELIVERY,
    from: "  if ((PUSH_SERVICE_HOSTS as readonly string[]).includes(host)) return true;",
    to: "  if (host.length > 0) return true;",
    expect: "refused: another host",
  },
  {
    name: "the Windows suffix loses its dot",
    file: DELIVERY,
    from: "export const PUSH_SERVICE_HOST_SUFFIXES = [\".notify.windows.com\"] as const;",
    to: "export const PUSH_SERVICE_HOST_SUFFIXES = [\"notify.windows.com\"] as const;",
    expect: "refused: the suffix without its dot",
  },
  {
    name: "a credential part is allowed through",
    file: DELIVERY,
    from: "  if (url.username !== \"\" || url.password !== \"\") return false;",
    to: "  void url.username;",
    expect: "refused: a credential part before our host",
  },
  {
    name: "a port is allowed through",
    file: DELIVERY,
    from: "  if (url.port !== \"\") return false;",
    to: "  void url.port;",
    expect: "refused: a port",
  },
  {
    name: "a key is anything at all",
    file: DELIVERY,
    from: "value.length <= 200 && /^[A-Za-z0-9_-]+=*$/.test(value);",
    to: "value.length <= 200;",
    expect: "a key outside base64url is not",
  },
  {
    name: "one send has no deadline",
    file: DELIVERY,
    from: "      const outcome = await withDeadline(\n        Promise.resolve().then(() => deps.send(row)),\n        timeoutMs\n      );",
    to: "      const outcome: Settled<unknown> = await Promise.resolve()\n        .then(() => deps.send(row))\n        .then((value) => ({ ok: true as const, value }), (error) => ({ ok: false as const, error, timedOut: false }));",
    expect: "a push service that never answers is given up on",
  },
  {
    name: "an endpoint on another host is sent to anyway",
    file: DELIVERY,
    from: "      if (!isAllowedPushEndpoint(row.endpoint)) {",
    to: "      if (!isAllowedPushEndpoint(row.endpoint) && row.id === \"\") {",
    expect: "a stored endpoint on another host is never sent to",
  },
  {
    name: "every stored subscription is sent to",
    file: DELIVERY,
    from: "    rows.slice(0, MAX_PUSH_SUBSCRIPTIONS_PER_USER).map(async (row) => {",
    to: "    rows.map(async (row) => {",
    expect: "at most MAX_PUSH_SUBSCRIPTIONS_PER_USER are sent to",
  },
  {
    name: "a 410 is retried forever",
    file: DELIVERY,
    from: "      if (status === 404 || status === 410) {",
    to: "      if (status === 404) {",
    expect: "a 410 revokes the subscription",
  },
  {
    name: "the batch runs everything at once",
    file: DELIVERY,
    from: "    while (active < limit && waiting.length > 0) waiting.shift()!();",
    to: "    while (waiting.length > 0) waiting.shift()!();",
    expect: "at most `concurrency` run at once",
  },
  {
    name: "the batch waits for a hung push past its budget",
    file: DELIVERY,
    from: "        await withDeadline(everything, Math.max(0, budgetMs));",
    to: "        await everything;",
    expect: "the sweep is not held past its budget",
  },
  {
    name: "web-push gets no timeout of its own",
    file: SENDER,
    from: "{ TTL: 60 * 60 * 24, timeout: PUSH_SEND_TIMEOUT_MS }",
    to: "{ TTL: 60 * 60 * 24 }",
    expect: "passing web-push its own timeout too",
  },
  {
    name: "the sender reads every stored subscription",
    file: SENDER,
    from: "      .order(\"updated_at\", { ascending: false })\n      .limit(MAX_PUSH_SUBSCRIPTIONS_PER_USER);",
    to: "      .order(\"updated_at\", { ascending: false });",
    expect: "reads at most the cap",
  },
  {
    name: "subscribe takes any https URL again",
    file: ROUTE,
    from: "  if (!isAllowedPushEndpoint(endpoint) || !isPushKey(p256dh) || !isPushKey(auth)) return null;",
    to: "  if (typeof endpoint !== \"string\" || !endpoint.startsWith(\"https://\") || !isPushKey(p256dh) || !isPushKey(auth)) return null;",
    expect: "subscribe: the endpoint must be a known push service's",
  },
  {
    name: "subscribe is not rate-limited",
    file: ROUTE,
    from: "    if (!limited.allowed) return NextResponse.json({ ok: false, code: \"rate_limited\" }, { status: 429 });",
    to: "    void limited;",
    expect: "refuses with 429",
  },
  {
    name: "subscribe writes through the caller's own client",
    file: ROUTE,
    from: "    const { error } = await admin.from(\"push_subscriptions\").upsert(",
    to: "    const { error } = await supabase.from(\"push_subscriptions\").upsert(",
    expect: "subscribe: the row is written by the server",
  },
  {
    name: "subscribe keeps every subscription",
    file: ROUTE,
    from: ".range(MAX_PUSH_SUBSCRIPTIONS_PER_USER, MAX_PUSH_SUBSCRIPTIONS_PER_USER + 99);",
    to: ".range(1000, 1099);",
    expect: "subscribe: past the cap",
  },
  {
    name: "PATCH forgets whose row it is",
    file: ROUTE,
    from: "      .eq(\"endpoint\", endpoint)\n      .eq(\"user_id\", user.id);\n    if (error) {\n      logApiError(\"/api/push/subscribe\", error, { stage: \"patch\" });",
    to: "      .eq(\"endpoint\", endpoint);\n    if (error) {\n      logApiError(\"/api/push/subscribe\", error, { stage: \"patch\" });",
    expect: "PATCH writes with the server, scoped to the caller",
  },
  {
    name: "lead reminders await each push again",
    file: LEADS,
    from: "      pushes.add(() => sendPushToUser(String(lead.user_id), \"mission_reminders\", { title, body, url, tag: `lead-${lead.id}` }));",
    to: "      await sendPushToUser(String(lead.user_id), \"mission_reminders\", { title, body, url, tag: `lead-${lead.id}` });",
    expect: "lead-reminders: no push is sent outside the sweep's batch",
  },
  {
    name: "meeting reminders await each push again",
    file: ACTIONS,
    from: "      pushes.add(() => sendPushToUser(String(action.user_id), \"mission_reminders\", { title, body, url, tag: `meeting-action-${action.id}` }));",
    to: "      await sendPushToUser(String(action.user_id), \"mission_reminders\", { title, body, url, tag: `meeting-action-${action.id}` });",
    expect: "meeting-action-reminders: no push is sent outside the sweep's batch",
  },
  {
    name: "lead reminders answer before their pushes settle",
    file: LEADS,
    from: "    const pushed = await pushes.settle(PUSH_SETTLE_MS);",
    to: "    const pushed = { abandoned: 0 };",
    expect: "lead-reminders: ...which is settled",
  },
  {
    name: "scheduled runs settle only on the last return",
    file: SCHEDULED,
    from: "  } finally {\n    const pushed = await pushes.settle(PUSH_SETTLE_MS);",
    to: "  } finally {\n    const pushed = { abandoned: 0 };",
    expect: "scheduled-runs settles in a finally",
  },
  {
    name: "the direct-insert policy stays",
    file: MIGRATION,
    from: "drop policy if exists \"push_subscriptions_insert_own\" on public.push_subscriptions;\n",
    to: "",
    expect: "the direct-insert policy is dropped",
  },
  {
    name: "the privileges stay",
    file: MIGRATION,
    from: "revoke insert, update on public.push_subscriptions from anon, authenticated;\n",
    to: "",
    expect: "and the privileges with them",
  },
];

runMutations({
  name: "push-delivery",
  gate: GATE,
  targets: [DELIVERY, SENDER, ROUTE, LEADS, ACTIONS, SCHEDULED, MIGRATION],
  mutants: MUTANTS,
});
