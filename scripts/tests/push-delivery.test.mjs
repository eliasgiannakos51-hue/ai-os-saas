// WEB PUSH: WHERE IT MAY GO, HOW LONG IT MAY TAKE, AND WHO WAITS FOR WHOM.
//
// Until 2026-11-05 a stored subscription was any `https://` URL, written
// straight into the table by the browser if it liked, with no cap on how
// many and no rate limit; the sender made a signed request to whatever
// was stored with no time limit; and three crons awaited one person's
// push before starting the next person's.
//
// src/lib/push/delivery.ts decides all of it and is pure, so §1–§4 RUN
// it — with a sender that never answers, one that throws, one that says
// 410. §5 reads the wiring: the route, the sender, the three crons and
// the migration that takes direct writes away.
//
// Run: node scripts/tests/push-delivery.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";
import { stripSqlComments } from "../lib/sql-text.mjs";
import { migrationFiles } from "./lib/schema-sql.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const d = await loadTs("src/lib/push/delivery.ts");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const never = () => new Promise(() => {});
/** `p`, or "HUNG" after `ms`: a deadline that went missing makes this
 *  gate fail, rather than wait forever with nothing printed. */
async function within(p, ms) {
  let timer;
  const guard = new Promise((r) => { timer = setTimeout(() => r("HUNG"), ms); });
  try { return await Promise.race([p, guard]); } finally { clearTimeout(timer); }
}

console.log("== 1. only a known push service's endpoint is a subscription ==");
{
  const ALLOWED = [
    "https://fcm.googleapis.com/fcm/send/dGVzdA:APA91bH-example",
    "https://fcm.googleapis.com/wp/dGVzdA",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABexample",
    "https://web.push.apple.com/QGexampleToken",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAexample",
  ];
  for (const e of ALLOWED) ok(`allowed: ${e.slice(8, 48)}`, d.isAllowedPushEndpoint(e) === true);
  const REFUSED = [
    ["http://fcm.googleapis.com/fcm/send/x", "not https"],
    ["https://push.example.com/fcm/send/x", "another host"],
    ["https://fcm.googleapis.com.example.com/x", "our host as a prefix of theirs"],
    ["https://example.com/?u=https://fcm.googleapis.com/x", "our host in the query"],
    ["https://fcm.googleapis.com@example.com/x", "our host as the user part"],
    ["https://someone:secret@fcm.googleapis.com/x", "a credential part before our host"],
    ["https://evilnotify.windows.com/w/x", "the suffix without its dot"],
    ["https://notify.windows.com/w/x", "the bare suffix"],
    ["https://fcm.googleapis.com:8443/x", "a port"],
    ["https://fcm.googleapis.com./x", "a trailing dot"],
    ["https://127.0.0.1/x", "an address"],
    ["https://[::1]/x", "an IPv6 address"],
    [`https://fcm.googleapis.com/${"a".repeat(2001)}`, "longer than any real one"],
    ["javascript:alert(1)", "not a URL anyone sends to"],
    ["", "empty"],
  ];
  for (const [e, why] of REFUSED) ok(`refused: ${why}`, d.isAllowedPushEndpoint(e) === false, e.slice(0, 80));
  ok("refused: not a string", d.isAllowedPushEndpoint(null) === false && d.isAllowedPushEndpoint({ toString: () => "https://fcm.googleapis.com/x" }) === false);

  const p256dh = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
  const authKey = "tBHItJI5svbpez7KI4CCXg";
  ok("a real P-256 key is a key", d.isPushKey(p256dh));
  ok("...and a real auth secret", d.isPushKey(authKey));
  ok("a key outside base64url is not", !d.isPushKey("not a key!!!not a key!!!"));
  ok("...nor a tiny one, nor a huge one", !d.isPushKey("abc") && !d.isPushKey("a".repeat(201)));
}

console.log("\n== 2. one send cannot take longer than its deadline ==");
{
  const rows = [
    { id: "hang", endpoint: "https://fcm.googleapis.com/fcm/send/hang", p256dh: "k", auth: "a" },
    { id: "fast", endpoint: "https://updates.push.services.mozilla.com/wpush/v2/fast", p256dh: "k", auth: "a" },
  ];
  const t0 = Date.now();
  const tally = await within(d.deliverToSubscriptions(rows, {
    send: (row) => (row.id === "hang" ? never() : Promise.resolve({ statusCode: 201 })),
    revoke: async () => {},
    timeoutMs: 80,
  }), 3000);
  const took = Date.now() - t0;
  ok("a push service that never answers is given up on", tally !== "HUNG" && took < 1000, `${took} ms`);
  ok("...and counted as timed out, and as failed", tally?.timedOut === 1 && tally?.failed === 1, JSON.stringify(tally));
  ok("...while the other subscription is delivered", tally?.sent === 1, JSON.stringify(tally));
  ok("the deadline is ten seconds", d.PUSH_SEND_TIMEOUT_MS === 10_000, String(d.PUSH_SEND_TIMEOUT_MS));

  const late = await d.withDeadline(sleep(60).then(() => { throw new Error("late"); }), 10);
  await sleep(80);
  ok("a send that fails after its deadline does not surface later", late.ok === false && late.timedOut === true);
}

console.log("\n== 3. the sender keeps to the list, the cap and the dead ==");
{
  const sent = [];
  const revoked = [];
  const errors = [];
  const rows = [
    { id: "ok", endpoint: "https://fcm.googleapis.com/fcm/send/ok", p256dh: "k", auth: "a" },
    { id: "elsewhere", endpoint: "https://collector.example.com/push", p256dh: "k", auth: "a" },
    { id: "gone", endpoint: "https://web.push.apple.com/gone", p256dh: "k", auth: "a" },
    { id: "broken", endpoint: "https://web.push.apple.com/broken", p256dh: "k", auth: "a" },
    { id: "throws", endpoint: "https://web.push.apple.com/throws", p256dh: "k", auth: "a" },
  ];
  const tally = await d.deliverToSubscriptions(rows, {
    send: (row) => {
      sent.push(row.id);
      if (row.id === "gone") return Promise.reject(Object.assign(new Error("gone"), { statusCode: 410 }));
      if (row.id === "broken") return Promise.reject(Object.assign(new Error("boom"), { statusCode: 500 }));
      if (row.id === "throws") throw new Error("synchronous");
      return Promise.resolve({ statusCode: 201 });
    },
    revoke: async (id) => { revoked.push(id); },
    onError: (err, status) => errors.push(status),
    timeoutMs: 500,
  });
  ok("a stored endpoint on another host is never sent to", !sent.includes("elsewhere"), sent.join(","));
  ok("...it is refused and marked revoked", tally.refused === 1 && revoked.includes("elsewhere"), JSON.stringify(tally));
  ok("a 410 revokes the subscription", tally.revoked === 1 && revoked.includes("gone"), revoked.join(","));
  ok("a 500 is a failure, reported", errors.includes(500) && !revoked.includes("broken"));
  ok("a sender that throws is a failure, not an exception", tally.failed === 2 && tally.sent === 1, JSON.stringify(tally));

  const many = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, p256dh: "k", auth: "a" }));
  let calls = 0;
  const capped = await d.deliverToSubscriptions(many, { send: async () => { calls++; }, revoke: async () => {} });
  ok("at most MAX_PUSH_SUBSCRIPTIONS_PER_USER are sent to", calls === d.MAX_PUSH_SUBSCRIPTIONS_PER_USER && capped.sent === calls, `${calls} sends`);
  ok("...and that is ten", d.MAX_PUSH_SUBSCRIPTIONS_PER_USER === 10);

  // AT ONCE, not one after another: three sends of 120 ms each.
  const t0 = Date.now();
  await d.deliverToSubscriptions(many.slice(0, 3), { send: () => sleep(120), revoke: async () => {}, timeoutMs: 2000 });
  const took = Date.now() - t0;
  ok("one person's subscriptions are sent to at once", took < 300, `${took} ms for three sends of 120 ms`);
}

console.log("\n== 4. a sweep's pushes: nobody waits behind anybody ==");
{
  // One person whose push service hangs, then twenty who answer in 20 ms.
  const batch = d.createPushBatch();
  let done = 0;
  batch.add(() => never());
  for (let i = 0; i < 20; i++) batch.add(async () => { await sleep(20); done++; });
  const t0 = Date.now();
  const r = await within(batch.settle(300), 3000);
  const took = Date.now() - t0;
  ok("everybody behind a hung push is still reached", done === 20, `${done} of 20`);
  ok("...and the sweep is not held past its budget", r !== "HUNG" && took < 1000 && r.abandoned === 1 && r.finished === 20, `${took} ms, ${JSON.stringify(r)}`);

  // CONCURRENCY IS BOUNDED, so two hundred people are not two thousand
  // sockets at once.
  const small = d.createPushBatch(3);
  let active = 0;
  let peak = 0;
  for (let i = 0; i < 12; i++) {
    small.add(async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(15);
      active--;
    });
  }
  const all = await small.settle();
  ok("at most `concurrency` run at once", peak === 3, `peak ${peak}`);
  ok("...and every one of them runs", all.finished === 12 && all.abandoned === 0, JSON.stringify(all));
  ok("the default is a small number", d.PUSH_BATCH_CONCURRENCY >= 4 && d.PUSH_BATCH_CONCURRENCY <= 32, String(d.PUSH_BATCH_CONCURRENCY));

  const throwing = d.createPushBatch();
  throwing.add(async () => { throw new Error("x"); });
  throwing.add(() => { throw new Error("sync"); });
  const t = await throwing.settle(200).then((v) => v, () => null);
  ok("a task that throws does not break the batch", t !== null && t.finished === 2, JSON.stringify(t));
}

console.log("\n== 5. the wiring ==");
{
  const push = stripComments(readFileSync("src/lib/push/web-push.ts", "utf8"));
  ok("the sender goes through deliverToSubscriptions", /await deliverToSubscriptions\(data as PushRow\[\], \{/.test(push));
  ok("...passing web-push its own timeout too", /\{ TTL: 60 \* 60 \* 24, timeout: PUSH_SEND_TIMEOUT_MS \}/.test(push));
  ok("...and reads at most the cap, newest first",
    /\.order\("updated_at", \{ ascending: false \}\)\s*\.limit\(MAX_PUSH_SUBSCRIPTIONS_PER_USER\)/.test(push));
  ok("...and calls webpush nowhere else", (push.match(/webpush\.sendNotification\(/g) ?? []).length === 1);

  const route = stripComments(readFileSync("src/app/api/push/subscribe/route.ts", "utf8"));
  ok("subscribe: the endpoint must be a known push service's", /if \(!isAllowedPushEndpoint\(endpoint\) \|\| !isPushKey\(p256dh\) \|\| !isPushKey\(auth\)\) return null;/.test(route));
  const post = route.slice(route.indexOf("export async function POST"), route.indexOf("export async function PATCH"));
  ok("subscribe: the POST is rate-limited per account, before anything is read",
    /checkRateLimit\(\{ scope: "push_subscribe", identifier: user\.id,/.test(post) && post.indexOf("checkRateLimit(") < post.indexOf("request.json()"));
  ok("...and refuses with 429", /if \(!limited\.allowed\) return NextResponse\.json\(\{ ok: false, code: "rate_limited" \}, \{ status: 429 \}\);/.test(post));
  ok("subscribe: the row is written by the server, stamped with the caller",
    /await admin\.from\("push_subscriptions"\)\.upsert\(\s*\{\s*user_id: user\.id,/.test(post) && !/supabase\.from\("push_subscriptions"\)\.upsert/.test(post));
  ok("subscribe: past the cap, the caller's oldest go",
    /\.eq\("user_id", user\.id\)\s*\.order\("updated_at", \{ ascending: false \}\)[\s\S]{0,80}\.range\(MAX_PUSH_SUBSCRIPTIONS_PER_USER, /.test(post) &&
      /\.delete\(\)\s*\.eq\("user_id", user\.id\)\s*\.in\("id", /.test(post));
  const patch = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
  ok("PATCH writes with the server, scoped to the caller",
    /await createAdminClient\(\)\s*\.from\("push_subscriptions"\)\s*\.update\(\{ \[column\]: body\.enabled \}\)\s*\.eq\("endpoint", endpoint\)\s*\.eq\("user_id", user\.id\)/.test(patch));

  // THE POPULATION: every cron route, not the three named in the finding.
  const crons = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const f = path.join(dir, e);
      if (statSync(f).isDirectory()) walk(f);
      else if (e === "route.ts") crons.push(f);
    }
  })("src/app/api/cron");
  ok(`the cron routes were found (${crons.length})`, crons.length >= 10);
  const pushing = crons.filter((f) => /sendPushToUser\(/.test(readFileSync(f, "utf8")));
  ok(`crons that push (${pushing.length})`, pushing.length >= 3, pushing.join(", "));
  // Inside the argument list of a `pushes.add(` call: the parentheses
  // opened at that call are still open where sendPushToUser( is written.
  const insideAdd = (src, at) => {
    const add = src.lastIndexOf("pushes.add(", at);
    if (add === -1) return false;
    let depth = 0;
    for (let i = add + "pushes.add".length; i < at; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
    }
    return depth > 0;
  };
  ok("control: a call inside pushes.add( is seen as queued", insideAdd("pushes.add(async () => { await sendPushToUser(a); });", 35));
  ok("control: ...and one after it closed is not", !insideAdd("pushes.add(() => x());\nawait sendPushToUser(a);", 30));
  for (const f of pushing) {
    const src = stripComments(readFileSync(f, "utf8"));
    const name = f.split(path.sep).slice(-2, -1)[0];
    const calls = [...src.matchAll(/sendPushToUser\(/g)].map((m) => m.index).filter((i) => !/import \{[^}]*$/.test(src.slice(Math.max(0, i - 40), i)));
    const loose = calls.filter((i) => !insideAdd(src, i));
    ok(`${name}: no push is sent outside the sweep's batch`, calls.length > 0 && loose.length === 0,
      loose.map((i) => src.slice(i - 20, i + 40).replace(/\n/g, " ")).join(" | "));
    ok(`${name}: ...each is queued on a batch`, /const pushes = createPushBatch\(\);/.test(src) && /pushes\.add\((async )?\(\) =>/.test(src));
    ok(`${name}: ...which is settled, with a budget, before the run answers`, /await pushes\.settle\(PUSH_SETTLE_MS\)/.test(src));
  }
  const scheduled = stripComments(readFileSync("src/app/api/cron/scheduled-runs/route.ts", "utf8"));
  ok("scheduled-runs settles in a finally, so every one of its returns waits",
    /\} finally \{\s*const pushed = await pushes\.settle\(PUSH_SETTLE_MS\);/.test(scheduled));

  // THE MIGRATION, and that nothing after it gives the writes back.
  const MIG = "20261116000000_push_subscriptions_server_written.sql";
  const mig = stripSqlComments(readFileSync(`supabase/migrations/${MIG}`, "utf8"));
  ok("the direct-insert policy is dropped", /drop policy if exists "push_subscriptions_insert_own" on public\.push_subscriptions;/.test(mig));
  ok("...and the update one", /drop policy if exists "push_subscriptions_update_own" on public\.push_subscriptions;/.test(mig));
  ok("...and the privileges with them", /revoke insert, update on public\.push_subscriptions from anon, authenticated;/.test(mig));
  const later = migrationFiles().filter((f) => f > MIG);
  const regrant = later.filter((f) => {
    const t = stripSqlComments(readFileSync(`supabase/migrations/${f}`, "utf8"));
    return /create policy[^;]*on public\.push_subscriptions\s+for (insert|update|all)/i.test(t) ||
      /grant[^;]*\b(insert|update|all)\b[^;]*on (table )?public\.push_subscriptions/i.test(t);
  });
  ok("no later migration gives the account its writes back", regrant.length === 0, regrant.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
