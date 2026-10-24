#!/usr/bin/env node
/*
 * FIRE «ΕΙΔΟΠΟΙΗΣΕ ΜΕ ΟΤΑΝ ΑΝΟΙΞΕΙ» FOR ONE TOOL.
 *
 * A subscription (supabase/migrations/20261028000000_tool_notify_subscriptions.sql,
 * api/tools/notify) just sits in the database until this is run. There is
 * no cron: the day a tool's `ready` flips to true in
 * src/lib/nav/all-tools.ts, the SAME commit runs this once, by hand —
 * `node scripts/notify-tool-ready.mjs image` — which inserts one
 * user_notifications row per subscriber and deletes their subscriptions,
 * through psql, needing DATABASE_URL.
 *
 * It does not use the curated seven NotificationType values
 * (lib/notify/types.ts): "a tool you asked about opened" is a one-time
 * admin action, not a recurring product event, so it does not belong in
 * that list's per-type channel preferences or its worth-sending rules —
 * it writes the in-app row directly, the same table every type ends up
 * in.
 *
 * Run: node scripts/notify-tool-ready.mjs <toolKey>
 *      node scripts/notify-tool-ready.mjs image --dry-run
 */
import { execFileSync } from "node:child_process";

const toolKey = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!toolKey || toolKey.startsWith("--")) {
  console.log("Usage: node scripts/notify-tool-ready.mjs <toolKey> [--dry-run]");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("No DATABASE_URL — nothing was sent. Set it (the same value Vercel has) and run again.");
  process.exit(1);
}

function psql(sql) {
  return execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { encoding: "utf8" });
}

const escaped = toolKey.replace(/'/g, "''");
const count = Number(psql(`select count(*) from public.tool_notify_subscriptions where tool_key = '${escaped}';`).trim());
console.log(`${count} subscriber(s) for "${toolKey}".`);
if (count === 0) process.exit(0);
if (dryRun) {
  console.log("--dry-run: nothing written.");
  process.exit(0);
}

psql(`
  insert into public.user_notifications (user_id, source, title, body, url)
  select user_id, 'tool_ready',
    'Το ${escaped} άνοιξε',
    'Το εργαλείο που ζήτησες να σου πω όταν ανοίξει είναι τώρα έτοιμο.',
    '/dashboard/tools'
  from public.tool_notify_subscriptions where tool_key = '${escaped}';
`);
psql(`delete from public.tool_notify_subscriptions where tool_key = '${escaped}';`);
console.log(`Notified and cleared ${count} subscriber(s).`);
