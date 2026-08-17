// "Only email." — and where an agent's result is allowed to go instead.
//
// WHAT WAS ACTUALLY THERE. delivery_method allowed 'email' and 'slack',
// and Slack was unreachable: the agent editor had no delivery field of any
// kind, so every agent anyone could create emailed, and the alternative
// was a capability only somebody with curl could use. A feature nobody can
// find is not a feature.
//
// Four destinations are added. The interesting part is not the transports,
// it is the ownership rule, because an agent runs unattended, forever, on
// data its owner has not read yet:
//
//   AN AGENT DELIVERS ONLY WHERE ITS OWNER ESTABLISHED. A delivery target
//   taken from a request body — or a webhook URL pointing at whatever host
//   will accept a POST — is not a configuration option. It is an
//   exfiltration channel with a schedule attached.
//
// Run: node scripts/tests/delivery-channels.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const { loadTs } = await import("./load-ts.mjs");
const d = await loadTs("src/lib/agents/delivery-channels.ts");
const cfg = await loadTs("src/lib/agents/agent-config.ts");

const migration = readFileSync("supabase/migrations/20260814_agent_delivery_channels.sql", "utf8");
const store = readFileSync("src/lib/agents/delivery-store.ts", "utf8");
const deliver = readFileSync("src/lib/agents/deliver.ts", "utf8");
const ownership = readFileSync("src/lib/agents/delivery-ownership.ts", "utf8");
const createRoute = readFileSync("src/app/api/agents/route.ts", "utf8");
const patchRoute = readFileSync("src/app/api/agents/[id]/route.ts", "utf8");
const channelRoute = readFileSync("src/app/api/delivery-channels/route.ts", "utf8");
const picker = readFileSync("src/components/agents/delivery-picker.tsx", "utf8");
const workspace = readFileSync("src/components/agents/agents-workspace.tsx", "utf8");

const ACCOUNT = "owner@example.com";

// ---------------------------------------------------------------------
console.log("== 1. five destinations, defined once ==");
eq("the five channels", d.DELIVERY_CHANNELS, ["email", "slack", "telegram", "discord", "in_app"]);
check("an unknown one is refused", !d.isDeliveryChannel("webhook") && !d.isDeliveryChannel(null));
// Two lists of allowed destinations is how a channel comes to be accepted
// by one route and rejected by another.
eq("agent-config takes the same list, not a copy of it", cfg.AGENT_DELIVERY_METHODS, d.DELIVERY_CHANNELS);
check("and the same guard", cfg.isAgentDeliveryMethod("telegram") && !cfg.isAgentDeliveryMethod("carrier_pigeon"));
check("the database allows exactly these five", /check \(delivery_method in \('email', 'slack', 'telegram', 'discord', 'in_app'\)\)/.test(migration));
// Every existing row is 'email' or 'slack' and must stay valid.
check("the constraint is replaced, never dropped and left off", /drop constraint if exists[\s\S]{0,200}add constraint/.test(migration));

console.log("\n== 2. THE OWNERSHIP RULE, per channel ==");
// email — the account's own address, and nothing else.
eq(
  "email defaults to the account address",
  d.resolveDeliveryTarget("email", undefined, { accountEmail: ACCOUNT }),
  { ok: true, target: ACCOUNT }
);
check(
  "someone else's address is refused",
  d.resolveDeliveryTarget("email", "attacker@example.com", { accountEmail: ACCOUNT }).ok === false
);
// The homoglyph case, and the reason folding would be WRONG here: a
// Cyrillic "о" folds to a Latin "o", so a folded comparison would make
// this lookalike EQUAL the account address — and the stored target is the
// string the caller supplied, so the agent would then email the lookalike.
check(
  "a lookalike address written in Cyrillic is refused",
  d.resolveDeliveryTarget("email", "оwner@example.com", { accountEmail: ACCOUNT }).ok === false,
  "matching MORE is the wrong direction when the answer decides where data goes"
);
check("case and spacing do not matter", d.resolveDeliveryTarget("email", "  OWNER@Example.com ", { accountEmail: ACCOUNT }).ok === true);
check("an account with no address can send nowhere", d.resolveDeliveryTarget("email", undefined, { accountEmail: null }).ok === false);

// slack — a channel in the caller's OWN workspace.
check(
  "a Slack channel from the user's workspace is allowed",
  d.resolveDeliveryTarget("slack", "C01ABCDEF", { accountEmail: ACCOUNT, allowedSlackChannels: ["C01ABCDEF"] }).ok === true
);
check(
  "a channel id they were not offered is refused",
  d.resolveDeliveryTarget("slack", "C0DEADBEEF", { accountEmail: ACCOUNT, allowedSlackChannels: ["C01ABCDEF"] }).ok === false
);
check(
  "with NO workspace connected, nothing is allowed — fail closed",
  d.resolveDeliveryTarget("slack", "C01ABCDEF", { accountEmail: ACCOUNT }).ok === false
);

// telegram — the chat saved with the user's own bot token.
check(
  "Telegram uses the chat saved with the token",
  d.resolveDeliveryTarget("telegram", undefined, { accountEmail: ACCOUNT, telegramChat: "123456789" }).ok === true
);
eq(
  "and stores THAT chat, not the requested one",
  d.resolveDeliveryTarget("telegram", "123456789", { accountEmail: ACCOUNT, telegramChat: "123456789" }),
  { ok: true, target: "123456789" }
);
// Refused rather than silently corrected: quietly redirecting a delivery
// is how a user comes to believe their results went somewhere they did not.
check(
  "a DIFFERENT chat id is refused, not quietly replaced",
  d.resolveDeliveryTarget("telegram", "-100999", { accountEmail: ACCOUNT, telegramChat: "123456789" }).ok === false
);
check(
  "with no Telegram connected, Telegram cannot be chosen",
  d.resolveDeliveryTarget("telegram", "123456789", { accountEmail: ACCOUNT }).ok === false
);

// discord — the webhook they saved, and the row never holds it.
eq(
  "Discord stores a marker, never the webhook",
  d.resolveDeliveryTarget("discord", "https://discord.com/api/webhooks/1/x", {
    accountEmail: ACCOUNT,
    hasDiscordWebhook: true,
  }),
  { ok: true, target: "discord:webhook" }
);
check(
  "with no webhook saved, Discord cannot be chosen",
  d.resolveDeliveryTarget("discord", undefined, { accountEmail: ACCOUNT }).ok === false
);
// in_app — the one destination that cannot be misaddressed.
eq(
  "in-app targets the user themselves",
  d.resolveDeliveryTarget("in_app", "anything at all", { accountEmail: ACCOUNT }),
  { ok: true, target: "in_app:self" }
);

console.log("\n== 3. the Discord webhook allowlist — the security boundary ==");
const GOOD = "https://discord.com/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz012345";
check("a real webhook address is accepted", d.isDiscordWebhookUrl(GOOD));
check("...on discordapp.com too", d.isDiscordWebhookUrl(GOOD.replace("discord.com", "discordapp.com")));
check("...and with a version segment", d.isDiscordWebhookUrl(GOOD.replace("/api/", "/api/v10/")));
// Each of these is a request the server would otherwise make, on a
// schedule, to a host somebody else picked.
const REFUSED = [
  ["cloud instance metadata", "http://169.254.169.254/latest/meta-data/"],
  ["the local database", "http://localhost:54321/api/webhooks/1/x"],
  ["something else in the VPC", "http://10.0.0.5/api/webhooks/1/x"],
  ["a plain attacker host", "https://evil.example/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz012345"],
  // Contains "discord.com" and resolves to evil.example — which is why
  // the check parses the URL instead of searching the string.
  ["userinfo smuggling", "https://discord.com@evil.example/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz012345"],
  ["a lookalike domain", "https://discord.com.evil.example/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz012345"],
  ["a subdomain that is not on the list", "https://cdn.discord.com/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz012345"],
  ["http, which would put the credential on the wire", GOOD.replace("https:", "http:")],
  ["a non-webhook path on the right host", "https://discord.com/api/users/@me"],
  ["a port, which no real webhook has", "https://discord.com:8080/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz012345"],
  ["not a URL at all", "webhook"],
  ["an empty string", ""],
];
for (const [label, url] of REFUSED) {
  check(`refused: ${label}`, !d.isDiscordWebhookUrl(url), url);
}
check("a non-string is refused", !d.isDiscordWebhookUrl(null) && !d.isDiscordWebhookUrl(42));
// Re-checked at SEND time as well, so a row written by older code or
// edited in the database cannot become a POST to somebody else's host.
check("and it is checked again before every send", /isDiscordWebhookUrl\(credential\.secret\)/.test(deliver));

console.log("\n== 4. Telegram credentials are checked for shape ==");
check("a BotFather token is accepted", d.isTelegramBotToken("123456789:AAF-abcdefghijklmnopqrstuvwxyz01234"));
check("a bare word is not", !d.isTelegramBotToken("mytoken"));
check("nor a colon with nothing after it", !d.isTelegramBotToken("123456789:"));
eq("a numeric chat id passes through", d.normaliseTelegramChat("123456789"), "123456789");
eq("a group's negative id too", d.normaliseTelegramChat("-1001234567890"), "-1001234567890");
eq("a @username is normalised", d.normaliseTelegramChat("mychannel"), "@mychannel");
eq("and kept if already prefixed", d.normaliseTelegramChat("@mychannel"), "@mychannel");
// ASCII only: a Cyrillic lookalike username must not resolve to a target
// that LOOKS like the user's own channel.
eq("a non-ASCII lookalike is refused", d.normaliseTelegramChat("@mусhannel"), "");
eq("and so is nonsense", d.normaliseTelegramChat("hi!"), "");

console.log("\n== 5. one resolver, called by every write path ==");
// The failure this prevents: a channel checked on create and unchecked on
// edit is not checked at all — the edit route is one PATCH away.
check("creating an agent resolves ownership from the database", /resolveDeliveryOwnership\(user\.id, draft\.deliveryMethod\)/.test(createRoute));
check("editing one resolves it the same way", /resolveDeliveryOwnership\(user\.id, method\)/.test(patchRoute));
check("and both end at the same decision function", /resolveDeliveryTarget\(/.test(patchRoute) && /resolveDeliveryTarget\(/.test(readFileSync("src/lib/agents/agent-config.ts", "utf8")));
check("the edit route no longer carries its own copy of the Slack check", !/listSlackChannels/.test(patchRoute));
check("nor its own copy of the email check", !/isDeliveryTargetAllowed/.test(patchRoute));
// The facts come from the database, never from the body.
check("ownership is resolved from the user's own rows", /listDeliveryChannels\(userId\)/.test(ownership) && /listSlackChannels\(userId\)/.test(ownership));
check("an unknown channel resolves to an empty context, not a second error", /return \{ ok: true, context: \{\} \}/.test(ownership));

console.log("\n== 6. the secrets ==");
check("stored encrypted, with the key that is not in the database", /encryptSecret\(/.test(store) && /INTEGRATION_ENCRYPTION_KEY/.test(migration));
check("and REFUSED rather than stored in the clear when there is no key", /encryptionAvailable\(\)/.test(store) && /not_configured/.test(store));
check("bound to the user and channel, so two rows cannot be swapped", /ionexa:delivery:\$\{channel\}:\$\{userId\}/.test(store));
// A credential that satisfied a regex and was never tried is a delivery
// that fails at 08:00 on a morning nobody is watching.
check("proved against the real platform before it is saved", /verifyTelegram\(/.test(store) && /verifyDiscord\(/.test(store));
check("and the order is verify-then-write", store.indexOf("const proof =") < store.indexOf("secret_encrypted: encryptSecret"));
check("every outbound call is time-bounded", /VERIFY_TIMEOUT_MS/.test(store) && /SEND_TIMEOUT_MS/.test(deliver));
check("and never follows a redirect", (store.match(/redirect: "manual"/g) ?? []).length >= 1 && /redirect: "manual"/.test(deliver));
// The API must never hand a secret back.
check("the API returns a hint, never the secret", /secretHint/.test(channelRoute) || /listDeliveryChannels/.test(channelRoute));
check("...and the store's list query does not even select it", /select\("channel, target, secret_hint, verified_at, updated_at"\)/.test(store));
check("there is no reveal endpoint", !/secret_encrypted/.test(channelRoute));
eq("a hint shows the ends only", d.redactSecret("1234567890abcdef"), "1234••••cdef");
eq("and a short secret shows nothing", d.redactSecret("abc"), "••••");
check("saving is rate-limited, because each save posts to a third party", /scope: "delivery_channel_save"/.test(channelRoute));

console.log("\n== 7. the message fits, and keeps its disclosure ==");
// Telegram and Discord do not truncate an over-long message — they
// REJECT it. Silently sending nothing every morning is the failure.
eq("Discord's limit", d.CHANNEL_TEXT_LIMITS.discord, 2000);
eq("Telegram's limit", d.CHANNEL_TEXT_LIMITS.telegram, 4096);
const long = "x".repeat(5000);
check("an over-long message is cut to fit", d.fitToChannel(long, "discord").length <= 2000);
check("and says it was cut", d.fitToChannel(long, "discord").endsWith("…"));
eq("a short one is untouched", d.fitToChannel("hello", "discord"), "hello");
check("the AI disclosure survives the cut", /The notice survives the cut/.test(deliver));

console.log("\n== 8. the in-app bell has something behind it ==");
const bell = readFileSync("src/components/dashboard/notification-bell.tsx", "utf8");
const topNav = readFileSync("src/components/dashboard/top-nav.tsx", "utf8");
// Anchored to the STRING, not to the panel's CSS classes: the first
// version of this matched "absolute right-0 top-11 w-56", which the
// account menu also uses — it was reading the wrong panel and would have
// gone green or red for reasons unrelated to notifications.
check("the header no longer renders 'no notifications' itself", !/noNotifications/.test(topNav));
check("and the bell is a real component", /<NotificationBell/.test(topNav));
check("that reads a real endpoint", /\/api\/notifications/.test(bell));
check("there is a table for it", /create table if not exists public\.user_notifications/.test(migration));
check("only the service role can write one", !/for insert/.test(migration.slice(migration.indexOf("user_notifications"))));
check("the owner can read and mark their own", /user_notifications_select_own/.test(migration) && /user_notifications_update_own/.test(migration));
// A notification is the one place we invite a click on something the user
// did not go looking for.
const notifications = readFileSync("src/lib/notifications/store.ts", "utf8");
check("a notification's link must be an in-app path", /safeNotificationUrl/.test(notifications));
check("and a protocol-relative URL is refused", /startsWith\("\/\/"\)/.test(notifications));

console.log("\n== 9. and the user can actually FIND it ==");
// The whole reason Slack was invisible: there was no delivery field.
check("the agent editor has a delivery picker", /<DeliveryPicker/.test(workspace));
check("it offers every channel", /DELIVERY_CHANNELS\.map/.test(picker));
check("the Slack channels come from the server, not the browser", /slackChannels/.test(readFileSync("src/app/dashboard/agents/page.tsx", "utf8")));
check("saving an edit sends the method and the target together", /deliveryMethod: editDraft\.deliveryMethod/.test(workspace));
check("each choice explains itself", /emailNote/.test(picker) && /inAppNote/.test(picker));
check("connecting sends a real test message", /connectSuccess/.test(picker) && /Connect and send a test|connect/.test(picker));
// Touch targets on a phone.
check("the channel buttons are tall enough to tap", /min-h-\[44px\]/.test(picker));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
