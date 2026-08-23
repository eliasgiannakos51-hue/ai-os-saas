// NOTIFICATIONS, AGAINST A REAL POSTGRES (V4 #18).
//
// Every claim here is one the DATABASE either enforces or does not, and
// the reason to check them here rather than in TypeScript is that a route
// written next month will not call this file's validators — it will just
// write a row.
//
//   A POLICY WITHOUT A GRANT IS A LOCKED DOOR. This cost a whole feature
//   one migration ago: four tables with perfect RLS, no GRANT, and
//   "permission denied" for the owner. Postgres checks table privileges
//   BEFORE row policies, so the only way to know is to try it as the
//   role, which is section 1.
//
//   THE QUIET WINDOW THAT WRAPS. 22:00 to 08:00 is start > end. A CHECK
//   asserting start < end would reject the setting almost everybody
//   wants, and it would do it at 3am on somebody's phone. Section 2.
//
//   NOBODY MAY WRITE THE MEASUREMENT. A user who could insert into
//   notification_events could inflate the click rate of a type and change
//   what the product decides is worth sending. Section 4.
//
//   NOBODY MAY WRITE THEIR OWN CHAT TARGET. The row is created by the
//   server after a test message arrived; a user who could insert one
//   could point our sender at somebody else's Discord channel. Section 5.
//
// Run: node scripts/tests/notifications.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+)$/;
function answer(out) {
  const lines = out.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !PSQL_TAG.test(l));
  return lines.length === 0 ? "" : lines[lines.length - 1];
}
const dbArgs = () =>
  process.env.DATABASE_URL ? ["-d", process.env.DATABASE_URL] : ["-d", process.env.PGDATABASE];

function sql(query) {
  return answer(
    execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
}
function trySql(query) {
  try {
    return { ok: true, out: sql(query) };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.stdout || err.message) };
  }
}
function tryAs(role, userId, query) {
  const script = `set local role ${role};
set local request.jwt.claim.sub = '${userId}';
set local request.jwt.claim.role = '${role}';
${query}`;
  try {
    return {
      ok: true,
      out: answer(
        execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", `begin; ${script}; commit;`], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
      ),
    };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.stdout || err.message) };
  }
}

const OWNER = "dddddddd-0000-0000-0000-000000000001";
const OTHER = "dddddddd-0000-0000-0000-000000000002";

// Emails namespaced per suite: every *.dbtest.mjs runs against the SAME
// throwaway database in sequence and auth.users.email is unique.
sql(`insert into auth.users (id, email) values
  ('${OWNER}', 'notify-owner@test.local'), ('${OTHER}', 'notify-other@test.local')
  on conflict (id) do nothing`);

console.log("== 1. A POLICY WITHOUT A GRANT IS A LOCKED DOOR ==");
{
  // The owner must be able to read AND write their own settings through
  // the `authenticated` role, which is the only role a real user has.
  const write = tryAs(
    "authenticated",
    OWNER,
    `insert into public.notification_settings (user_id, quiet_start_minute, quiet_end_minute, utc_offset_minutes)
     values ('${OWNER}', 1320, 480, 120)
     on conflict (user_id) do update set utc_offset_minutes = 120;`
  );
  ok("the owner can write their own notification_settings", write.ok, write.error);

  const read = tryAs("authenticated", OWNER, `select count(*) from public.notification_settings;`);
  ok("…and read it back", read.ok && read.out === "1", read.error ?? read.out);

  const prefs = tryAs(
    "authenticated",
    OWNER,
    `insert into public.notification_preferences (user_id, type, enabled, channels)
     values ('${OWNER}', 'agent_completed', true, array['in_app','email'])
     on conflict (user_id, type) do update set enabled = true;`
  );
  ok("the owner can write their own per-type preference", prefs.ok, prefs.error);

  const events = tryAs("authenticated", OWNER, `select count(*) from public.notification_events;`);
  ok("the owner can read their own engagement events", events.ok, events.error);

  const channels = tryAs("authenticated", OWNER, `select count(*) from public.notification_channels;`);
  ok("the owner can read their own connected channels", channels.ok, channels.error);
}

console.log("\n== 2. the quiet window WRAPS MIDNIGHT, and the CHECKs allow it ==");
{
  // 22:00 -> 08:00 is start(1320) > end(480). This is the normal case.
  const wrap = trySql(
    `insert into public.notification_settings (user_id, quiet_start_minute, quiet_end_minute)
     values ('${OTHER}', 1320, 480) on conflict (user_id) do update set quiet_start_minute = 1320, quiet_end_minute = 480;`
  );
  ok("a window from 22:00 to 08:00 is accepted (start > end)", wrap.ok, wrap.error);

  const outOfRange = trySql(
    `update public.notification_settings set quiet_start_minute = 1440 where user_id = '${OTHER}';`
  );
  ok("a minute past the end of the day is refused", !outOfRange.ok);

  const halfWindow = trySql(
    `update public.notification_settings set quiet_start_minute = 600, quiet_end_minute = null where user_id = '${OTHER}';`
  );
  ok("half a window is refused (both ends or neither)", !halfWindow.ok);

  const noWindow = trySql(
    `update public.notification_settings set quiet_start_minute = null, quiet_end_minute = null where user_id = '${OTHER}';`
  );
  ok("no window at all is fine", noWindow.ok, noWindow.error);

  const absurdOffset = trySql(
    `update public.notification_settings set utc_offset_minutes = 2000 where user_id = '${OTHER}';`
  );
  ok("an offset no timezone has is refused", !absurdOffset.ok);
}

console.log("\n== 3. the preference table only accepts channels and types the code knows ==");
{
  const badChannel = trySql(
    `insert into public.notification_preferences (user_id, type, channels)
     values ('${OTHER}', 'agent_completed', array['in_app','smoke_signal']);`
  );
  ok("a channel the sender has never heard of is refused", !badChannel.ok);

  const badType = trySql(
    `insert into public.notification_preferences (user_id, type, channels)
     values ('${OTHER}', 'agent_ran_but_found_nothing', array['in_app']);`
  );
  ok("a type outside the seven is refused", !badType.ok);

  // AN EMPTY ARRAY IS A REAL CHOICE — "keep this type, send it nowhere
  // but the bell" — and must not be confused with switching it off.
  const bellOnly = trySql(
    `insert into public.notification_preferences (user_id, type, enabled, channels)
     values ('${OTHER}', 'research_ready', true, array[]::text[])
     on conflict (user_id, type) do update set channels = array[]::text[];`
  );
  ok("an empty channel list is accepted (bell only)", bellOnly.ok, bellOnly.error);

  const groupCount = trySql(
    `insert into public.user_notifications (user_id, source, title, body, type, group_count)
     values ('${OTHER}', 'notify', 'x', '', 'agent_completed', 0);`
  );
  ok("a group standing for zero notifications is refused", !groupCount.ok);
}

console.log("\n== 4. NOBODY MAY WRITE THE MEASUREMENT ==");
{
  const insert = tryAs(
    "authenticated",
    OWNER,
    `insert into public.notification_events (user_id, type, channel, event)
     values ('${OWNER}', 'agent_completed', 'email', 'clicked');`
  );
  ok("a user cannot inflate their own click rate", !insert.ok);

  // Seeded through the service-role path (psql superuser stands in for
  // it, exactly as the app's admin client bypasses RLS).
  sql(`insert into public.notification_events (user_id, type, channel, event)
       values ('${OWNER}', 'agent_completed', 'email', 'sent');`);

  const del = tryAs("authenticated", OWNER, `delete from public.notification_events where user_id = '${OWNER}';`);
  ok("…nor delete the evidence that a type is not working", !del.ok);

  const other = tryAs("authenticated", OTHER, `select count(*) from public.notification_events;`);
  ok("…nor read somebody else's", other.ok && other.out === "0", other.error ?? other.out);
}

console.log("\n== 5. a chat target is written by the server, never by the user ==");
{
  const insert = tryAs(
    "authenticated",
    OWNER,
    `insert into public.notification_channels (user_id, kind, target_encrypted, verified_at)
     values ('${OWNER}', 'discord', 'v1.fake', now());`
  );
  ok("a user cannot point our sender at a channel of their choosing", !insert.ok);

  sql(`insert into public.notification_channels (user_id, kind, target_encrypted, label, verified_at)
       values ('${OWNER}', 'telegram', 'v1.ciphertext.here', '@owner', now())
       on conflict (user_id, kind) do nothing;`);

  const update = tryAs(
    "authenticated",
    OWNER,
    `update public.notification_channels set target_encrypted = 'v1.mine' where user_id = '${OWNER}';`
  );
  ok("…nor repoint one that already exists", !update.ok);

  const disconnect = tryAs("authenticated", OWNER, `delete from public.notification_channels where user_id = '${OWNER}';`);
  ok("but they CAN disconnect", disconnect.ok, disconnect.error);

  const kind = trySql(
    `insert into public.notification_channels (user_id, kind, target_encrypted)
     values ('${OTHER}', 'sms', 'v1.x');`
  );
  ok("a channel kind with no sender behind it is refused", !kind.ok);
}

console.log("\n== 6. anon reaches none of it ==");
{
  for (const table of ["notification_settings", "notification_preferences", "notification_channels", "notification_events"]) {
    const read = tryAs("anon", OWNER, `select count(*) from public.${table};`);
    ok(`anon cannot read ${table}`, !read.ok, read.out);
  }
}

console.log("\n== 7. deleting the account takes the notifications with it ==");
{
  sql(`insert into public.notification_settings (user_id) values ('${OTHER}') on conflict (user_id) do nothing;`);
  sql(`insert into public.notification_events (user_id, type, channel, event)
       values ('${OTHER}', 'credits_low', 'in_app', 'sent');`);
  sql(`delete from auth.users where id = '${OTHER}';`);

  for (const table of ["notification_settings", "notification_preferences", "notification_events", "notification_channels"]) {
    ok(
      `${table} rows go with the user`,
      sql(`select count(*) from public.${table} where user_id = '${OTHER}'`) === "0"
    );
  }
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  - " + f).join("\n")); process.exit(1); }
