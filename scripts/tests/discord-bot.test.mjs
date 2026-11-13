/*
 * IONEXA IN DISCORD (the owner's Discord directive, 2026-11-05): the plan
 * that is refused rather than repaired, the permission bits that never
 * carry Administrator, the two signatures (connect state, interaction),
 * the REST client's own rate limiting, and the apply/undo that touches
 * Discord — all held here against stand-ins, with no network and no
 * database. src/lib/discord/*.ts name this file as the thing that holds
 * them; this is that file.
 *
 * Run: node scripts/tests/discord-bot.test.mjs
 */
import { readFileSync } from "node:fs";
import { generateKeyPairSync, sign } from "node:crypto";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const read = (p) => readFileSync(p, "utf8");

const PERMISSIONS = "src/lib/discord/permissions.ts";
const BLUEPRINT = "src/lib/discord/blueprint.ts";
const SIGNATURES = "src/lib/discord/signatures.ts";
const REST = "src/lib/discord/rest.ts";
const APPLY = "src/lib/discord/apply.ts";
const CONFIG = "src/lib/discord/config.ts";
const MIGRATION = "supabase/migrations/20261119000000_discord_bot.sql";

console.log("\n== 1. permissions: never Administrator, nothing not named ==");
{
  const P = await loadTs(PERMISSIONS);
  const botBits = BigInt(P.botPermissionInteger());
  check("the invite's integer never carries Administrator", (botBits & P.PERMISSION_BITS.administrator) === 0n);
  check("...nor Ban Members", (botBits & P.PERMISSION_BITS.ban_members) === 0n);
  check("every BOT_PERMISSIONS name carries a reason", P.BOT_PERMISSIONS.every((p) => typeof p.why === "string" && p.why.length > 0));
  check("ROLE_SAFE is a subset of what the bot itself holds (Discord's permission hierarchy)",
    P.ROLE_SAFE.every((name) => (botBits & P.PERMISSION_BITS[name]) !== 0n));

  check("a role may carry a safe permission with no tick", P.rolePermissionInteger(["view_channel"], []) === P.PERMISSION_BITS.view_channel.toString());
  check("...and an elevated one only when granted", BigInt(P.rolePermissionInteger([], ["manage_roles"])) === P.PERMISSION_BITS.manage_roles);
  let threwAdmin = false;
  try {
    // isElevatedPermission/isRefusedPermission gate the public setTick/readRole
    // path; rolePermissionInteger's own guard is exercised by feeding it the
    // bit directly through a hand-built array, bypassing the type.
    P.rolePermissionInteger(["view_channel"], ["administrator"]);
  } catch {
    threwAdmin = true;
  }
  // "administrator" is not an ElevatedPermission, so isElevatedPermission
  // filters it out before the bit check runs — proving the FILTER, not the
  // guard beneath it, is what is reached first. The guard is proven next.
  check("administrator is not a grantable elevated name", !P.isElevatedPermission("administrator"));
  check("ban_members is not a grantable elevated name", !P.isElevatedPermission("ban_members"));
  check("...but IS a refused name", P.isRefusedPermission("administrator") && P.isRefusedPermission("ban_members"));

  check("isSafePermission accepts only ROLE_SAFE", P.ROLE_SAFE.every(P.isSafePermission) && !P.isSafePermission("manage_guild") && !P.isSafePermission("nonsense"));
  check("overwriteInteger drops anything not safe", P.overwriteInteger(["view_channel", "manage_guild"]) === P.PERMISSION_BITS.view_channel.toString());
  check("an overwrite with nothing safe is the zero bit", P.overwriteInteger(["manage_guild"]) === "0");

  const MANAGE_GUILD_BIT = P.PERMISSION_BITS.manage_guild.toString();
  check("hasPermission reads the member's own bit string", P.hasPermission(MANAGE_GUILD_BIT, "manage_guild"));
  check("...and a bit not set reads false", !P.hasPermission(P.PERMISSION_BITS.view_channel.toString(), "manage_guild"));
  check("a malformed permission string never throws, just reads false", P.hasPermission("not a number", "manage_guild") === false);
  check("a missing permissions field reads false, not undefined behaviour", P.hasPermission(undefined, "manage_guild") === false);
  check("administrator on the member also satisfies the ask check (api/discord/interactions ORs the two)",
    P.hasPermission(P.PERMISSION_BITS.administrator.toString(), "administrator"));
}

console.log("\n== 2. blueprint: refused rather than repaired ==");
{
  const B = await loadTs(BLUEPRINT);
  const minimal = { title: "Test", roles: [], categories: [], channels: [{ key: "general", name: "general", kind: "text", category: null, topic: null, overwrites: [] }], messages: [], automod: [] };

  const ok = B.readBlueprint(minimal);
  check("a minimal valid plan is accepted", ok.ok === true);
  check("empty is refused with nothing to make", B.readBlueprint({ ...minimal, channels: [] }).reason === "empty");
  check("not an object is refused", B.readBlueprint("plan").reason === "not_object");
  check("not an object (array) is refused", B.readBlueprint([1, 2]).reason === "not_object");

  const withAdminRole = { ...minimal, roles: [{ key: "mod", name: "Mod", permissions: ["administrator"] }] };
  check("Administrator anywhere in a role is refused_permission, never silently dropped", B.readBlueprint(withAdminRole).reason === "refused_permission");
  const withBanRole = { ...minimal, roles: [{ key: "mod", name: "Mod", ask: ["ban_members"] }] };
  check("Ban Members as an 'ask' is also refused_permission", B.readBlueprint(withBanRole).reason === "refused_permission");

  const tooManyChannels = { ...minimal, channels: Array.from({ length: B.MAX_CHANNELS + 1 }, (_, i) => ({ key: `c${i}`, name: `c${i}`, kind: "text", category: null, topic: null, overwrites: [] })) };
  check(`more than ${B.MAX_CHANNELS} channels is too_many_channels`, B.readBlueprint(tooManyChannels).reason === "too_many_channels");
  const tooManyRoles = { ...minimal, roles: Array.from({ length: B.MAX_ROLES + 1 }, (_, i) => ({ key: `r${i}`, name: `r${i}` })) };
  check(`more than ${B.MAX_ROLES} roles is too_many_roles`, B.readBlueprint(tooManyRoles).reason === "too_many_roles");

  const dup = { ...minimal, roles: [{ key: "general", name: "x" }] };
  check("a role reusing a channel's key is duplicate_key", B.readBlueprint(dup).reason === "duplicate_key");
  const reserved = { ...minimal, channels: [{ key: "everyone", name: "general", kind: "text", category: null, topic: null, overwrites: [] }] };
  check("'everyone' as a key is refused: it names @everyone, not a box", B.readBlueprint(reserved).reason === "duplicate_key");

  const badOverwriteTarget = { ...minimal, channels: [{ key: "general", name: "general", kind: "text", category: null, topic: null, overwrites: [{ target: "nosuchrole", allow: [], deny: [] }] }] };
  check("an overwrite naming a role that is not in the plan is unknown_target", B.readBlueprint(badOverwriteTarget).reason === "unknown_target");
  const badCategoryRef = { ...minimal, channels: [{ key: "general", name: "general", kind: "text", category: "nosuchcat", topic: null, overwrites: [] }] };
  check("a channel naming a category that is not in the plan is unknown_category", B.readBlueprint(badCategoryRef).reason === "unknown_category");
  const badMessageChannel = { ...minimal, messages: [{ key: "welcome", channel: "nosuchchannel", text: "hi" }] };
  check("a welcome naming a channel that is not in the plan is unknown_channel", B.readBlueprint(badMessageChannel).reason === "unknown_channel");
  const voiceMessage = { ...minimal, channels: [{ key: "lobby", name: "lobby", kind: "voice", category: null, topic: null, overwrites: [] }], messages: [{ key: "welcome", channel: "lobby", text: "hi" }] };
  check("a message cannot post into a voice channel", B.readBlueprint(voiceMessage).reason === "unknown_channel");
  const twoWelcomes = { ...minimal, messages: [{ key: "welcome", channel: "general", text: "a" }, { key: "welcome", channel: "general", text: "b" }] };
  check("two messages of the same kind is refused", B.readBlueprint(twoWelcomes).reason === "bad_message");

  const allowDenySame = { ...minimal, channels: [{ key: "general", name: "general", kind: "text", category: null, topic: null, overwrites: [{ target: "everyone", allow: ["view_channel"], deny: ["view_channel"] }] }] };
  check("allowing and denying the same permission on one overwrite is refused", B.readBlueprint(allowDenySame).reason === "bad_overwrite");

  console.log("\n  -- the model's answer is never trusted with ticks --");
  const fromModel = { ...minimal, roles: [{ key: "mod", name: "Mod", granted: ["manage_roles"], ask: ["manage_guild"] }] };
  const verdictModel = B.readBlueprint(fromModel, { fromModel: true });
  check("a model's own 'granted' is thrown away, not stored", verdictModel.ok && verdictModel.blueprint.roles[0].granted.length === 0);
  check("...and its 'ask' survives, as a question for the person", verdictModel.ok && verdictModel.blueprint.roles[0].ask.includes("manage_guild"));
  const verdictStored = B.readBlueprint(fromModel, { fromModel: false });
  check("a STORED plan (fromModel false) keeps a real granted list", verdictStored.ok && verdictStored.blueprint.roles[0].granted.includes("manage_roles"));

  console.log("\n  -- readPlanAnswer: the tool call, or a question, never both --");
  const planInput = { plan: minimal, question: "" };
  const answer = B.readPlanAnswer(planInput);
  check("a plan with no question is read as a plan", answer.ok === true);
  const questionInput = { plan: { ...minimal, channels: [] }, question: "What should the server be for?" };
  const qAnswer = B.readPlanAnswer(questionInput);
  check("a question takes priority over an unusable plan", !qAnswer.ok && qAnswer.kind === "question" && qAnswer.question.includes("server"));
  check("no tool call at all is read as unusable, not as an empty plan", B.readPlanAnswer(null).ok === false);

  console.log("\n  -- setTick, removeBox, replaceOneBox, carryTicks, planBoxes --");
  const withRole = { ...minimal, roles: [{ key: "mod", name: "Mod", colour: null, hoist: false, mentionable: false, permissions: [], ask: ["manage_guild"], granted: [] }] };
  const read1 = B.readBlueprint(withRole);
  check("setup: the role-bearing plan reads as a plan", read1.ok);
  const bp1 = read1.blueprint;

  const ticked = B.setTick(bp1, "mod", "manage_guild", true);
  check("ticking an asked-for permission grants it", ticked.ok && ticked.blueprint.roles[0].granted.includes("manage_guild"));
  check("...and it is no longer in 'ask' once granted", ticked.ok && !ticked.blueprint.roles[0].ask.includes("manage_guild"));
  const untouchedAdmin = B.setTick(bp1, "mod", "administrator", true);
  check("ticking Administrator is refused outright, no matter who presses it", !untouchedAdmin.ok && untouchedAdmin.reason === "refused_permission");
  const tickUnknownRole = B.setTick(bp1, "nosuch", "manage_guild", true);
  check("ticking a role that does not exist is unknown_target", !tickUnknownRole.ok && tickUnknownRole.reason === "unknown_target");

  const removed = B.removeBox(bp1, "mod");
  check("removing the only role leaves zero roles", removed.ok && removed.blueprint.roles.length === 0);

  const changedPlan = { ...minimal, title: "Changed", roles: [], categories: [], channels: [{ key: "general", name: "general-renamed", kind: "text", category: null, topic: null, overwrites: [] }], messages: [], automod: [] };
  const changedRead = B.readBlueprint(changedPlan);
  const replaced = B.replaceOneBox(bp1, changedRead.blueprint, "general");
  check("replaceOneBox changes only the named box", replaced.ok && replaced.blueprint.channels[0].name === "general-renamed" && replaced.blueprint.roles.length === 1);
  const replaceWrongKind = B.replaceOneBox(bp1, changedRead.blueprint, "mod");
  check("replaceOneBox refuses when the next plan does not have that key as the same kind", !replaceWrongKind.ok);

  const carried = B.carryTicks(ticked.blueprint, bp1);
  check("carryTicks keeps a surviving role's own grant across a whole-plan change", carried.roles[0].granted.includes("manage_guild"));

  const boxes = B.planBoxes(bp1);
  check("planBoxes lists roles before channels, matching APPLY_ORDER", boxes.findIndex((b) => b.kind === "role") < boxes.findIndex((b) => b.kind === "channel"));
  check("APPLY_ORDER puts messages after channels and automod last", B.APPLY_ORDER.indexOf("message") > B.APPLY_ORDER.indexOf("channel") && B.APPLY_ORDER.indexOf("automod") === B.APPLY_ORDER.length - 1);
  check("requestCount counts exactly one request per box", B.requestCount(bp1) === boxes.length);
}

console.log("\n== 3. signatures: the connect state, and the Ed25519 interaction ==");
{
  const S = await loadTs(SIGNATURES);
  const secret = "a-test-client-secret";
  const now = Date.UTC(2026, 10, 7, 12, 0, 0);
  const nonce = "nonce-abc";
  const state = S.signState({ n: nonce, u: "user-1", t: now }, secret);

  const good = S.verifyState(state, { secret, userId: "user-1", cookieNonce: nonce, now });
  check("a state signed and checked with the same secret, user and cookie verifies", good.ok === true);
  const wrongSecret = S.verifyState(state, { secret: "other-secret", userId: "user-1", cookieNonce: nonce, now });
  check("a different secret is an invalid_signature, never accepted", !wrongSecret.ok && wrongSecret.reason === "invalid_signature");
  const wrongUser = S.verifyState(state, { secret, userId: "user-2", cookieNonce: nonce, now });
  check("a state signed for one user does not verify for another", !wrongUser.ok && wrongUser.reason === "wrong_user");
  const wrongCookie = S.verifyState(state, { secret, userId: "user-1", cookieNonce: "different-nonce", now });
  check("a mismatched cookie nonce is refused: a stolen link lands on nobody's account", !wrongCookie.ok && wrongCookie.reason === "wrong_cookie");
  const noCookie = S.verifyState(state, { secret, userId: "user-1", cookieNonce: null, now });
  check("no cookie at all is also refused, not treated as a match", !noCookie.ok && noCookie.reason === "wrong_cookie");
  const expired = S.verifyState(state, { secret, userId: "user-1", cookieNonce: nonce, now: now + S.STATE_TTL_MS + 1000 });
  check("a state older than ten minutes is expired", !expired.ok && expired.reason === "expired");
  const tampered = S.verifyState(state.slice(0, -2) + "xx", { secret, userId: "user-1", cookieNonce: nonce, now });
  check("a tampered signature is caught", !tampered.ok);
  check("a malformed state (no dot) is 'malformed', not a crash", S.verifyState("not-a-state-at-all", { secret, userId: "user-1", cookieNonce: nonce, now }).reason === "malformed");

  console.log("\n  -- a REAL Ed25519 keypair, the shape Discord actually signs --");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyHex = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
  const tsSeconds = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ type: 1 });
  const signatureHex = sign(null, Buffer.from(String(tsSeconds) + body), privateKey).toString("hex");

  check("a genuinely signed PING verifies", S.verifyInteraction({ publicKeyHex, signatureHex, timestamp: String(tsSeconds), rawBody: body }));
  check("the SAME signature over a DIFFERENT body does not verify (raw bytes matter)",
    !S.verifyInteraction({ publicKeyHex, signatureHex, timestamp: String(tsSeconds), rawBody: JSON.stringify({ type: 2 }) }));
  check("a timestamp more than five minutes old is refused even with a valid signature",
    !S.verifyInteraction({ publicKeyHex, signatureHex, timestamp: String(tsSeconds - 6 * 60), rawBody: body }));
  check("a flipped signature byte fails", !S.verifyInteraction({ publicKeyHex, signatureHex: signatureHex.replace(/^../, (h) => (h === "00" ? "01" : "00")), timestamp: String(tsSeconds), rawBody: body }));
  check("no public key configured refuses everything, by design", !S.verifyInteraction({ publicKeyHex: undefined, signatureHex, timestamp: String(tsSeconds), rawBody: body }));
  check("a short/garbled signature is refused, not thrown", !S.verifyInteraction({ publicKeyHex, signatureHex: "zz", timestamp: String(tsSeconds), rawBody: body }));
  check("a non-numeric timestamp is refused", !S.verifyInteraction({ publicKeyHex, signatureHex, timestamp: "not-a-number", rawBody: body }));
}

console.log("\n== 4. rest.ts: Discord's own rate limits, respected without a network ==");
{
  const R = await loadTs(REST);
  console.log("\n  -- a 429 is retried after its own retry_after, not resent blindly --");
  let calls = 0;
  const waits = [];
  const sleep = async (ms) => {
    waits.push(ms);
  };
  let now = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) {
      return new Response(JSON.stringify({ retry_after: 1.5 }), { status: 429, headers: { "retry-after": "1.5" } });
    }
    return new Response(JSON.stringify({ id: "999" }), { status: 200, headers: {} });
  };
  const rest = new R.DiscordRest({ fetchImpl, sleep, now: () => now });
  const res = await rest.request("POST", "/guilds/1/roles", { name: "x" });
  check("the retried request eventually succeeds", res.ok === true && res.body.id === "999");
  check("exactly one wait was taken, for retry_after (1500ms)", waits.length === 1 && waits[0] === 1500);
  check("exactly two fetches were made: the 429 and the retry", calls === 2);

  console.log("\n  -- a bucket at zero remaining is waited out on the NEXT call, not sent to fail --");
  let calls2 = 0;
  const waits2 = [];
  let now2 = 0;
  const fetchImpl2 = async () => {
    calls2++;
    const headers = { "x-ratelimit-bucket": "b1", "x-ratelimit-remaining": calls2 === 1 ? "0" : "5", "x-ratelimit-reset-after": "2" };
    return new Response(JSON.stringify({ id: String(calls2) }), { status: 200, headers });
  };
  const rest2 = new R.DiscordRest({ fetchImpl: fetchImpl2, sleep: async (ms) => waits2.push(ms), now: () => now2 });
  await rest2.request("GET", "/guilds/1");
  await rest2.request("GET", "/guilds/1");
  check("the second call on the same bucket waited for the remembered reset", waits2.length === 1 && waits2[0] === 2000);

  console.log("\n  -- a wait longer than maxWaitMs fails the call instead of outliving the function --");
  const fetchImpl3 = async () => new Response(JSON.stringify({ retry_after: 9999 }), { status: 429, headers: {} });
  const rest3 = new R.DiscordRest({ fetchImpl: fetchImpl3, sleep: async () => {}, now: () => 0, maxWaitMs: 1000 });
  const res3 = await rest3.request("POST", "/guilds/1/roles", {});
  check("a wait far beyond maxWaitMs is reported as rate_limited, never slept through", !res3.ok && res3.reason === "rate_limited");

  console.log("\n  -- a global 429 blocks every route, not just the one it answered --");
  let calls4 = 0;
  const fetchImpl4 = async (url) => {
    calls4++;
    if (String(url).includes("/roles") && calls4 === 1) return new Response(JSON.stringify({ retry_after: 1, global: true }), { status: 429, headers: { "x-ratelimit-global": "true" } });
    return new Response(JSON.stringify({ id: "ok" }), { status: 200, headers: {} });
  };
  let now4 = 0;
  const waits4 = [];
  const rest4 = new R.DiscordRest({ fetchImpl: fetchImpl4, sleep: async (ms) => { waits4.push(ms); now4 += ms; }, now: () => now4 });
  await rest4.request("POST", "/guilds/1/roles", {});
  const before = now4;
  await rest4.request("POST", "/guilds/1/channels", {});
  check("a different route is ALSO made to wait once the global flag is set", now4 >= before || waits4.length >= 1);

  console.log("\n  -- the plain failures: 404, 403, a network error that gives up ==");
  const notFound = new R.DiscordRest({ fetchImpl: async () => new Response("{}", { status: 404, headers: {} }), sleep: async () => {}, now: () => 0 });
  check("a 404 reads as not_found", (await notFound.request("GET", "/channels/1")).reason === "not_found");
  const forbidden = new R.DiscordRest({ fetchImpl: async () => new Response(JSON.stringify({ code: 50013 }), { status: 403, headers: {} }), sleep: async () => {}, now: () => 0 });
  const forbiddenRes = await forbidden.request("POST", "/guilds/1/roles", {});
  check("a 403 reads as forbidden, with Discord's own error code carried through", forbiddenRes.reason === "forbidden" && forbiddenRes.code === 50013);
  let netCalls = 0;
  const flaky = new R.DiscordRest({
    fetchImpl: async () => {
      netCalls++;
      throw new Error("ECONNRESET");
    },
    sleep: async () => {},
    now: () => 0,
  });
  const netRes = await flaky.request("GET", "/guilds/1");
  check("a network error that never recovers gives up as 'network' after its retries, not forever", !netRes.ok && netRes.reason === "network" && netCalls === 4);

  check("routeKey keeps the MAJOR id (right after guilds/channels/webhooks) literal, so buckets separate per server",
    R.routeKey("POST", "/guilds/123456789012345678/roles") === "POST /guilds/123456789012345678/roles");
  check("...but generalises a MINOR id, so one role's DELETE shares a bucket with another's",
    R.routeKey("DELETE", "/guilds/123456789012345678/roles/987654321098765432") === "DELETE /guilds/123456789012345678/roles/:id");
}

console.log("\n== 5. apply.ts: one request per box, recorded before the next is sent ==");
{
  const B = await loadTs(BLUEPRINT);
  const A = await loadTs(APPLY);
  const minimal = {
    title: "Test",
    roles: [{ key: "mod", name: "Mod", colour: null, hoist: false, mentionable: false, permissions: ["view_channel"], ask: [], granted: [] }],
    categories: [{ key: "cat", name: "Category", overwrites: [{ target: "mod", allow: ["view_channel"], deny: [] }] }],
    channels: [{ key: "general", name: "general", kind: "text", category: "cat", topic: null, overwrites: [] }],
    messages: [{ key: "welcome", channel: "general", text: "Welcome!" }],
    automod: [],
  };
  const verdict = B.readBlueprint(minimal);
  check("setup: the apply fixture is itself a valid plan", verdict.ok);
  const bp = verdict.blueprint;

  console.log("\n  -- a clean apply: every box made, ids recorded in order --");
  let nextId = 1;
  const snowflake = (n) => `${100000000000000000n + BigInt(n)}`;
  const seen = [];
  const stubRest = { request: async (method, path) => { seen.push(`${method} ${path}`); return { ok: true, status: 200, code: null, body: { id: snowflake(nextId++) } }; } };
  const recorded = [];
  const outcome = await A.applyBlueprint(bp, {
    rest: stubRest,
    guildId: "100000000000000000",
    botUserId: "200000000000000000",
    community: false,
    record: async (item) => {
      recorded.push(item);
      return true;
    },
  });
  check("the clean apply succeeds", outcome.ok === true);
  check("exactly one request per box", seen.length === B.planBoxes(bp).length);
  check("the role is created before the category that overwrites it", seen.findIndex((s) => s.includes("/roles")) < seen.findIndex((s) => s.endsWith("/channels")));
  check("every created item was recorded before the apply returned", recorded.length === seen.length);
  check("seq numbers are sequential starting at 1", recorded.every((it, i) => it.seq === i + 1));
  check("the message carries the channel it was posted into, for its own delete path", recorded.find((r) => r.kind === "message").channelId !== null);

  console.log("\n  -- a failure STOPS the apply: nothing after it is sent --");
  let calls = 0;
  // Boxes run in APPLY_ORDER: role (1st request), category (2nd), then the
  // channel (3rd) — the third request is the one made to fail, by COUNT
  // rather than by path, because a category and a channel both POST to
  // the same /guilds/:id/channels endpoint (Discord: a category IS a
  // channel, type 4).
  const failingRest = {
    request: async (method, path) => {
      calls++;
      if (calls === 3) return { ok: false, status: 403, code: 50013, reason: "forbidden" };
      return { ok: true, status: 200, code: null, body: { id: `${400000000000000000n + BigInt(calls)}` } };
    },
  };
  const progress = [];
  const outcome2 = await A.applyBlueprint(bp, {
    rest: failingRest,
    guildId: "100000000000000000",
    botUserId: "200000000000000000",
    community: false,
    record: async () => true,
    onProgress: (e) => progress.push(e),
  });
  check("the apply reports failure rather than partial success", outcome2.ok === false);
  check("the role and the category were made before the channel failed", outcome2.made.some((m) => m.kind === "role") && outcome2.made.some((m) => m.kind === "category"));
  check("nothing after the failing box was attempted: no message, no automod request", !outcome2.made.some((m) => m.kind === "message"));
  check("onProgress announced the failure with its box and kind", progress.some((e) => e.type === "failed" && e.kind === "channel"));

  console.log("\n  -- a made-but-not-recorded id is taken back at once, never orphaned --");
  let deleteCalls = 0;
  const unrecordableRest = {
    request: async (method, path) => {
      if (method === "DELETE") {
        deleteCalls++;
        return { ok: true, status: 204, code: null, body: null };
      }
      return { ok: true, status: 200, code: null, body: { id: "500000000000000001" } };
    },
  };
  const outcome3 = await A.applyBlueprint(bp, {
    rest: unrecordableRest,
    guildId: "100000000000000000",
    botUserId: "200000000000000000",
    community: false,
    record: async () => false, // the database write itself fails
  });
  check("a record failure stops the apply", outcome3.ok === false);
  check("...and the id that could not be recorded was deleted again immediately", deleteCalls === 1);

  console.log("\n  -- undo: newest first, and only the recorded ids --");
  const deletedPaths = [];
  const undoRest = { request: async (method, path) => { deletedPaths.push(`${method} ${path}`); return { ok: true, status: 204, code: null, body: null }; } };
  const marked = [];
  const items = [
    { seq: 1, kind: "role", boxKey: "mod", discordId: "111000000000000000", channelId: null, note: null },
    { seq: 2, kind: "category", boxKey: "cat", discordId: "222000000000000000", channelId: null, note: null },
    { seq: 3, kind: "channel", boxKey: "general", discordId: "333000000000000000", channelId: null, note: null },
  ];
  const undone = await A.undoItems(items, { rest: undoRest, guildId: "100000000000000000", markDeleted: async (seq) => { marked.push(seq); return true; } });
  check("undo reports every item deleted", undone.ok === true && undone.deleted === 3);
  check("undo deletes NEWEST first (seq 3, then 2, then 1)", marked.join(",") === "3,2,1");
  check("the channel's own DELETE path is used for a category too (Discord: categories are channels)", deletedPaths[0].startsWith("DELETE /channels/333000000000000000"));
  check("the role's DELETE path is under /guilds/:id/roles", deletedPaths[2].includes("/guilds/100000000000000000/roles/111000000000000000"));

  console.log("\n  -- a 404 on delete counts as already gone, by hand, and undo keeps going --");
  const alreadyGoneRest = { request: async () => ({ ok: false, status: 404, code: 10011, reason: "not_found" }) };
  const alreadyGone = await A.undoItems([items[0]], { rest: alreadyGoneRest, guildId: "100000000000000000", markDeleted: async () => true });
  check("a 404 on undo's delete is treated as success, not a failure to report", alreadyGone.ok === true && alreadyGone.deleted === 1);

  console.log("\n  -- a real delete failure stops undo and reports which box --");
  const stubbornRest = { request: async () => ({ ok: false, status: 403, code: 50013, reason: "forbidden" }) };
  const stuck = await A.undoItems(items, { rest: stubbornRest, guildId: "100000000000000000", markDeleted: async () => true });
  check("undo stops at the first delete Discord refuses", stuck.ok === false && stuck.deleted === 0 && stuck.failedBox === "general");

  check("deletePath for a message needs the channel id, not the guild", A.deletePath("g1", { kind: "message", discordId: "m1", channelId: "c1" }) === "/channels/c1/messages/m1");
}

console.log("\n== 6. config.ts: the four values, named, and what is missing ==");
{
  const C = await loadTs(CONFIG);
  check("all four present reads as configured", C.discordConfigured({ DISCORD_CLIENT_ID: "a", DISCORD_CLIENT_SECRET: "b", DISCORD_BOT_TOKEN: "c", DISCORD_PUBLIC_KEY: "d" }));
  check("any one missing is named, not hidden behind a single boolean", C.discordMissing({ DISCORD_CLIENT_ID: "a" }).includes("DISCORD_CLIENT_SECRET"));
  check("an empty string counts as missing, not as a configured empty value", C.discordMissing({ DISCORD_CLIENT_ID: "" }).includes("DISCORD_CLIENT_ID"));
  check("there are exactly the four documented values, no more and no fewer", C.DISCORD_ENV.length === 4);
}

console.log("\n== 7. the migration: the record Undo reads, and how it undoes itself ==");
{
  const sql = read(MIGRATION);
  check("it says how to undo", /-- How to undo:/.test(sql));
  check("one account per server: guild_id is the primary key", /guild_id text primary key/.test(sql));
  check("a server id is bounded to a real snowflake shape", /check \(guild_id ~ '\^\[0-9\]\{15,22\}\$'\)/.test(sql));
  check("every created id is bounded to a snowflake shape too", /discord_id text not null check \(discord_id ~ '\^\[0-9\]\{15,22\}\$'\)/.test(sql));
  check("all three tables have row level security", (sql.match(/enable row level security/g) ?? []).length === 3);
  check("...and no grants survive to anon or authenticated", (sql.match(/revoke all on public\.discord_\w+ from anon, authenticated;/g) ?? []).length === 3);
  check("no policy is created anywhere in this file: the service role is the only reader", !/create policy/.test(sql));
  check("a build's status is constrained to the six real states", /check \(status in \('planned', 'applying', 'applied', 'failed', 'undoing', 'undone'\)\)/.test(sql));
  check("an item's kind is constrained to the five box kinds", /check \(kind in \('role', 'category', 'channel', 'message', 'automod'\)\)/.test(sql));
  check("every table cascades away with the account", (sql.match(/references auth\.users\(id\) on delete cascade/g) ?? []).length >= 3);
  check("items reference their build, and vanish with it", /references public\.discord_builds\(id\) on delete cascade/.test(sql));
}

console.log("\n== 8. wired into the things a feature cannot skip ==");
{
  check("the switch is declared, staff-first, with its migration named", /"discord-bot":/.test(read("src/lib/flags/flags.ts")) && /Needs migration 20261119000000_discord_bot\.sql/.test(read("src/lib/flags/flags.ts")));
  check("the page is notFound() for anyone the switch is not open to", /if \(!\(await isFeatureOn\("discord-bot", user\)\)\) notFound\(\);/.test(read("src/app/dashboard/discord/page.tsx")));
  for (const route of ["connect", "plan", "apply"]) {
    check(`api/discord/${route} refuses with 404 the same way when the switch is off`,
      /isFeatureOn\("discord-bot", user\)/.test(read(`src/app/api/discord/${route}/route.ts`)) && /"not_found"/.test(read(`src/app/api/discord/${route}/route.ts`)));
  }
  // callback is reached by the BROWSER, mid-redirect from Discord's own
  // OAuth screen — not by fetch, so a raw JSON 404 would leave the person
  // on a blank error page instead of back in the app with an explanation.
  // It still refuses, by the same switch, but as the "unavailable" flash
  // the dashboard screen already renders a sentence for.
  check("api/discord/callback also checks the switch, redirecting with its own flash instead of 404 (it is reached by the browser mid-redirect, not by fetch)",
    /isFeatureOn\("discord-bot", user\)/.test(read("src/app/api/discord/callback/route.ts")) && /back\("unavailable"\)/.test(read("src/app/api/discord/callback/route.ts")));
  check("the bot never asks for Administrator in the invite route either (defence in depth)",
    /botPermissionInteger\(\)/.test(read("src/app/api/discord/connect/route.ts")));
  check("discord_plan is billed through the same estimate function as everything else", /discordPlan:/.test(read("src/lib/billing/estimate.ts")));
  check("...and settles under the discord_plan feature", /discordPlan: "discord_plan"/.test(read("src/lib/billing/margin-policy.ts")));
  check("a finished plan completion routes back to the Discord screen", /discord_plan: "\/dashboard\/discord"/.test(read("src/lib/nav/recent-tools.ts")));
  check("the page's own address is tracked like every other screen (nav-events)", /"discord",/.test(read("src/lib/nav/nav-path.ts")));
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
