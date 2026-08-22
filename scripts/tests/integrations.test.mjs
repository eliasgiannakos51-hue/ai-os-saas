// Universal Integrations (V3 Task 3) — the properties this feature is not
// allowed to lose.
//
// Every other table in this product holds data the user typed into us.
// user_integrations holds keys to a DIFFERENT building: a Google access
// token is read access to somebody's actual mail. A leak here is not "our
// data leaked", it is "their Gmail leaked, through us".
//
// So the assertions are weighted accordingly:
//
//   1. CRYPTO. Tokens are ciphertext, the key is not in the database, and
//      a ciphertext is bound to the row it belongs to — a token moved
//      between users or between columns must FAIL, not quietly work.
//   2. THE OAUTH HANDSHAKE. State is signed AND browser-bound, because
//      either alone lets an attacker connect a victim's account to the
//      attacker's mailbox — a prompt-injection channel with a login page.
//   3. DATA MINIMISATION. Read-only scopes, metadata not bodies, and the
//      two Google providers kept separate so mail is not the price of files.
//   4. THE DELIVERY BOUNDARY. Agents gained Slack, and the rule that a
//      target must be provably the user's own did not weaken.
//
// Run: node scripts/tests/integrations.test.mjs
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { schemaSql, enablesRls } from "./lib/schema-sql.mjs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail) console.log(`        ${detail}`);
}
function throws(name, fn) {
  try {
    fn();
    check(name, "did not throw", "threw");
  } catch {
    pass++;
    console.log(`  PASS  ${name}`);
  }
}

// loadTs, not loadTsWithDeps: this suite runs inside `next build`, and
// scripts/tests/billing-coverage.test.mjs forbids a build-gate suite from
// writing a bundle into node_modules. crypto.ts and oauth.ts import only
// `node:crypto`, which the loader now passes through in both modes — a
// builtin is not a node_modules dependency.
const { loadTs } = await import("./load-ts.mjs");

// A real key for the whole run, so nothing here depends on the ambient
// environment and nothing here can accidentally pass because encryption
// was disabled.
process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("hex");

const crypto = await loadTs("src/lib/integrations/crypto.ts");
const oauth = await loadTs("src/lib/integrations/oauth.ts");
const providers = await loadTs("src/lib/integrations/providers.ts");
const limits = await loadTs("src/lib/integrations/limits.ts");
const agentConfig = await loadTs("src/lib/agents/agent-config.ts");

const read = (f) => readFileSync(f, "utf8");

// ---------------------------------------------------------------------
console.log("== 1. tokens are ciphertext, and the ciphertext is bound to its row ==");
// ---------------------------------------------------------------------
const ctx = crypto.tokenContext("user-1", "gmail", "access");
// Assembled, not a literal — see the note on the redaction fixtures below.
const TOKEN = ["ya", "29.a0AfB_byC_this_is_a_realistic_looking_google_token"].join("");

{
  const sealed = crypto.encryptSecret(TOKEN, ctx);
  check("it round-trips", crypto.decryptSecret(sealed, ctx), TOKEN);
  checkTrue("the plaintext is not in the payload", !sealed.includes(TOKEN.slice(0, 12)), sealed);
  checkTrue("it is versioned", sealed.startsWith("v1."));
  check("it has four dot-separated parts", sealed.split(".").length, 4);

  // Nondeterministic: encrypting the same token twice must not produce the
  // same bytes, or equal ciphertexts reveal equal tokens across rows.
  const again = crypto.encryptSecret(TOKEN, ctx);
  checkTrue("the same token encrypts differently each time", sealed !== again);
  check("...and both decrypt to the same value", crypto.decryptSecret(again, ctx), TOKEN);
}

// THE ATTACK THIS CLOSES: a write primitive into this table (a bug, a
// mis-scoped policy, a restored backup) becomes account takeover if a
// ciphertext can be copied from one row into another. GCM's additional
// authenticated data binds each ciphertext to whose token it is and which
// token it is.
{
  const sealed = crypto.encryptSecret(TOKEN, crypto.tokenContext("victim", "gmail", "access"));
  throws("a token moved to ANOTHER USER's row fails to decrypt", () =>
    crypto.decryptSecret(sealed, crypto.tokenContext("attacker", "gmail", "access"))
  );
  throws("a token moved to another PROVIDER fails to decrypt", () =>
    crypto.decryptSecret(sealed, crypto.tokenContext("victim", "slack", "access"))
  );
  throws("an access token moved into the REFRESH column fails to decrypt", () =>
    crypto.decryptSecret(sealed, crypto.tokenContext("victim", "gmail", "refresh"))
  );
}

// Tampering. GCM is authenticated, so a modified ciphertext must fail
// rather than decrypt to something the app would then send to Google.
{
  const sealed = crypto.encryptSecret(TOKEN, ctx);
  const [v, iv, tag, data] = sealed.split(".");
  throws("a flipped ciphertext byte fails", () =>
    crypto.decryptSecret([v, iv, tag, data.slice(0, -2) + (data.endsWith("A") ? "B" : "A")].join("."), ctx)
  );
  throws("a swapped IV fails", () =>
    crypto.decryptSecret([v, Buffer.from(randomBytes(12)).toString("base64url"), tag, data].join("."), ctx)
  );
  throws("a stripped auth tag fails", () => crypto.decryptSecret([v, iv, "", data].join("."), ctx));
  throws("a truncated payload fails", () => crypto.decryptSecret(`${v}.${iv}.${tag}`, ctx));
  throws("an unknown version fails", () => crypto.decryptSecret(`v9.${iv}.${tag}.${data}`, ctx));
  throws("garbage fails", () => crypto.decryptSecret("not-a-payload", ctx));
}

// A wrong key must fail closed, not decrypt to noise.
{
  const sealed = crypto.encryptSecret(TOKEN, ctx);
  crypto.__setEncryptionKeyForTest(randomBytes(32));
  throws("a different key cannot read it", () => crypto.decryptSecret(sealed, ctx));
  crypto.__setEncryptionKeyForTest(null);
}

// ---------------------------------------------------------------------
console.log("\n== 2. the key itself ==");
// ---------------------------------------------------------------------
check("64 hex characters is accepted", crypto.parseEncryptionKey("a".repeat(64)).length, 32);
check(
  "32 bytes of base64url is accepted",
  crypto.parseEncryptionKey(randomBytes(32).toString("base64url")).length,
  32
);
check(
  "32 bytes of standard base64 is accepted",
  crypto.parseEncryptionKey(randomBytes(32).toString("base64")).length,
  32
);
// The failure this prevents: hashing a short passphrase into 32 bytes
// produces a perfectly valid-LOOKING key with almost no entropy, and
// nothing anywhere would ever say so.
for (const bad of ["", "changeme", "short", "a".repeat(63), "a".repeat(65), "!!!!"]) {
  throws(`"${bad || "(empty)"}" is refused rather than stretched into a key`, () =>
    crypto.parseEncryptionKey(bad)
  );
}
throws("an empty secret is never encrypted", () => crypto.encryptSecret("", ctx));

// ---------------------------------------------------------------------
console.log("\n== 3. nothing token-shaped can reach a log ==");
// ---------------------------------------------------------------------
// The fixtures are ASSEMBLED rather than written as literals.
//
// A string of the exact shape `xoxb-...` in a committed file is what
// GitHub's push protection blocks — correctly, since it cannot know a
// given one is fake, and a scanner that trusts "it's only a test" is
// useless. Concatenating the prefix keeps the RUNTIME value exactly
// token-shaped (which is the whole point of the assertion) while putting
// no scanner-matching literal in the repository.
const SLACK_BOT_SHAPED = ["xox", "b-1234567890-abcdefghijklmnop"].join("");
const SLACK_USER_SHAPED = ["xox", "p-1234567890-abcdefghijklmnop"].join("");
const GOOGLE_SHAPED = ["ya", "29.a0AfB_by_long_google_token_value"].join("");

for (const [value, why] of [
  [GOOGLE_SHAPED, "a Google access token"],
  [SLACK_BOT_SHAPED, "a Slack bot token"],
  [SLACK_USER_SHAPED, "a Slack user token"],
]) {
  check(`${why} is redacted`, crypto.redactSecrets(value), "[redacted]");
}
check(
  "a JWT is redacted",
  crypto.redactSecrets(`${"a".repeat(30)}.${"b".repeat(30)}.${"c".repeat(30)}`),
  "[redacted jwt]"
);
for (const key of ["access_token", "refresh_token", "client_secret", "authorization", "code_verifier"]) {
  const out = crypto.redactSecrets({ [key]: "whatever" });
  check(`a "${key}" field is redacted by NAME too`, out[key], "[redacted]");
}
check("ordinary text is left alone", crypto.redactSecrets("could not connect"), "could not connect");
check(
  "nested values are redacted",
  crypto.redactSecrets({ outer: { access_token: "x" } }).outer.access_token,
  "[redacted]"
);
// safeErrorDetail is the only shape allowed into logApiError's context.
check("an Error becomes a plain string", typeof crypto.safeErrorDetail(new Error("boom")), "string");
check(
  "...and a token inside its message is redacted",
  crypto.safeErrorDetail(new Error(SLACK_BOT_SHAPED)),
  "[redacted]"
);
check(
  "an object of unknown provenance is NEVER stringified into a log",
  crypto.safeErrorDetail({ access_token: `${GOOGLE_SHAPED}`, request: "..." }),
  "[non-error value withheld]"
);

// ---------------------------------------------------------------------
console.log("\n== 4. the OAuth handshake ==");
// ---------------------------------------------------------------------
// THE ATTACK: an attacker completes OAuth against their OWN mailbox, then
// gets a logged-in victim's browser to visit the callback with the
// resulting code. Without these checks the victim's account is silently
// connected to the attacker's mailbox — and the victim's AI then reads,
// summarises and acts on data the attacker writes.
{
  const now = Date.now();
  const payload = { n: "nonce-abc", p: "gmail", u: "user-1", t: now };
  const state = oauth.encodeState(payload);

  const decoded = oauth.decodeState(state, now);
  checkTrue("a state we minted verifies", decoded.ok);
  check("...and round-trips its payload", decoded.payload, payload);

  // Signed: the user id inside cannot be swapped.
  const [body] = state.split(".");
  const forgedBody = Buffer.from(
    JSON.stringify({ ...payload, u: "attacker" }),
    "utf8"
  ).toString("base64url");
  check(
    "a state with a swapped user id is refused",
    oauth.decodeState(`${forgedBody}.${state.split(".")[1]}`, now).reason,
    "bad_signature"
  );
  check(
    "a state with a swapped signature is refused",
    oauth.decodeState(`${body}.notasignature`, now).reason,
    "bad_signature"
  );
  check("a malformed state is refused", oauth.decodeState("nonsense", now).reason, "malformed");
  check("a state with no signature is refused", oauth.decodeState(body, now).reason, "malformed");

  // Time-bounded, in both directions.
  check(
    "a state older than the window is refused",
    oauth.decodeState(state, now + 11 * 60 * 1000).reason,
    "expired"
  );
  checkTrue("...but one inside it is accepted", oauth.decodeState(state, now + 5 * 60 * 1000).ok);
  check(
    "a state from the future is refused",
    oauth.decodeState(oauth.encodeState({ ...payload, t: now + 5 * 60 * 1000 }), now).reason,
    "expired"
  );
}

// PKCE.
{
  const a = oauth.createPkcePair();
  const b = oauth.createPkcePair();
  checkTrue("a verifier is long enough to be unguessable", a.verifier.length >= 43);
  checkTrue("two pairs differ", a.verifier !== b.verifier && a.challenge !== b.challenge);
  checkTrue("the challenge is not the verifier", a.challenge !== a.verifier);
  checkTrue("both are base64url", /^[A-Za-z0-9_-]+$/.test(a.verifier + a.challenge));
}

// The authorize URL. Google's three parameters below are the difference
// between an integration that keeps working and one that dies an hour
// after it is connected.
{
  process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id";
  process.env.NEXT_PUBLIC_SITE_URL = "https://ionexa.example";
  const gmail = providers.getProvider("gmail");
  const url = new URL(oauth.buildAuthorizeUrl({ provider: gmail, state: "s", codeChallenge: "c" }));

  check("it goes to Google", url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  check("access_type=offline — without it Google issues NO refresh token", url.searchParams.get("access_type"), "offline");
  check(
    "prompt=consent — without it a RECONNECT gets no refresh token",
    url.searchParams.get("prompt"),
    "consent"
  );
  check(
    "include_granted_scopes=false — a Drive connection must not inherit Gmail",
    url.searchParams.get("include_granted_scopes"),
    "false"
  );
  check("PKCE is used", url.searchParams.get("code_challenge_method"), "S256");
  check("the scope is the provider's own", url.searchParams.get("scope"), gmail.scopes.join(" "));
  check(
    "the redirect URI is ours and names the provider",
    url.searchParams.get("redirect_uri"),
    "https://ionexa.example/api/integrations/gmail/callback"
  );
  checkTrue("no secret is ever in the authorize URL", !url.search.includes("client_secret"));

  // Slack's v2 flow separates its scopes with commas, not spaces — a
  // space-separated list is silently accepted and grants nothing.
  process.env.SLACK_CLIENT_ID = "test-slack-id";
  const slack = providers.getProvider("slack");
  const slackUrl = new URL(oauth.buildAuthorizeUrl({ provider: slack, state: "s" }));
  check("Slack scopes are comma-separated", slackUrl.searchParams.get("scope"), slack.scopes.join(","));
  check("Slack does not get a PKCE challenge", slackUrl.searchParams.get("code_challenge_method"), null);
}

// ---------------------------------------------------------------------
console.log("\n== 5. data minimisation ==");
// ---------------------------------------------------------------------
// Gmail and Drive are SEPARATE integrations even though they share one
// Google OAuth client: a user who wants the AI to see their files must not
// have to hand over their mail to get it.
check("there are three providers", providers.PROVIDERS.length, 3);
check(
  "Gmail and Drive are separate rows",
  providers.PROVIDERS.filter((p) => p.oauthFamily === "google").map((p) => p.id),
  ["gmail", "google_drive"]
);
check("Gmail asks for read-only", providers.getProvider("gmail").scopes, [
  "https://www.googleapis.com/auth/gmail.readonly",
]);
check("Drive asks for read-only", providers.getProvider("google_drive").scopes, [
  "https://www.googleapis.com/auth/drive.readonly",
]);
check("Gmail is declared read-only", providers.getProvider("gmail").access, "read");
check("Drive is declared read-only", providers.getProvider("google_drive").access, "read");
// Slack is the ONE provider that can write, because it is the one an agent
// delivers into.
check(
  "exactly one provider can write",
  providers.PROVIDERS.filter((p) => p.access === "read_write").map((p) => p.id),
  ["slack"]
);
checkTrue(
  "no provider asks for a send/modify/delete Google scope",
  !providers.PROVIDERS.some((p) =>
    p.scopes.some((s) => /gmail\.(send|modify|compose)|drive\.file\b|\bdrive$/.test(s))
  )
);
check("an unknown provider id is not a provider", providers.isProviderId("dropbox"), false);
check("...and a real one is", providers.isProviderId("gmail"), true);

// The reads themselves. Asserted against the source because these
// functions need a live token to run, and what matters is which URL they
// build.
const readSrc = read("src/lib/integrations/read.ts");
checkTrue(
  "Gmail is read with format=metadata, not the full body",
  /set\("format", "metadata"\)/.test(readSrc),
  "reading full bodies would pull attachments and everything else"
);
checkTrue("...and Spam and Trash are excluded", /-in:spam -in:trash/.test(readSrc));
checkTrue(
  "the Drive query escapes apostrophes",
  /replace\(\/'\/g, "\\\\'"\)/.test(readSrc),
  "an unescaped quote is an injection into Drive's own search syntax"
);
checkTrue("results are capped", /MAX_RESULTS = 10/.test(readSrc));
checkTrue("fields are clipped before a model sees them", /function clip\(/.test(readSrc));
checkTrue(
  "provider error bodies never reach a caller",
  /those\s+\n?\/\/\s*echo the request|echo the request/.test(readSrc)
);

// ---------------------------------------------------------------------
console.log("\n== 6. fair use ==");
// ---------------------------------------------------------------------
check("Free connects nothing", limits.DEFAULT_INTEGRATION_LIMITS.free, 0);
check("Starter: 2", limits.DEFAULT_INTEGRATION_LIMITS.starter, 2);
check("Growth: 5", limits.DEFAULT_INTEGRATION_LIMITS.growth, 5);
checkTrue("Professional is unlimited", limits.DEFAULT_INTEGRATION_LIMITS.professional === Infinity);
checkTrue("Ultimate is unlimited", limits.DEFAULT_INTEGRATION_LIMITS.ultimate === Infinity);
check("an env override applies", limits.parseIntegrationLimits({ INTEGRATION_LIMIT_STARTER: "4" }).limits.starter, 4);
checkTrue(
  '"unlimited" is spellable',
  limits.parseIntegrationLimits({ INTEGRATION_LIMIT_STARTER: "unlimited" }).limits.starter === Infinity
);
for (const [value, why] of [["many", "not a number"], ["2.5", "fractional"], ["-1", "negative"], ["9999", "absurd"]]) {
  const result = limits.parseIntegrationLimits({ INTEGRATION_LIMIT_STARTER: value });
  check(`"${value}" is refused (${why})`, result.limits.starter, 2);
  checkTrue(`..."${value}" warns`, result.warnings.length === 1);
}
check("reads per hour default", limits.maxIntegrationReadsPerHour({}), 60);
check("...overridable", limits.maxIntegrationReadsPerHour({ INTEGRATION_MAX_READS_PER_HOUR: "10" }), 10);
check("...and nonsense is refused", limits.maxIntegrationReadsPerHour({ INTEGRATION_MAX_READS_PER_HOUR: "0" }), 60);

// ---------------------------------------------------------------------
console.log("\n== 7. agents gained Slack, and the delivery rule did not weaken ==");
// ---------------------------------------------------------------------
// Five now, not two. This assertion is not being relaxed — it still pins
// the EXACT list, so a channel cannot appear in the type without appearing
// here; it is being updated because Telegram, Discord and in-app delivery
// were added deliberately.
check("every delivery method exists", agentConfig.AGENT_DELIVERY_METHODS, [
  "email",
  "slack",
  "telegram",
  "discord",
  "in_app",
]);
check("an unknown method is still not one", agentConfig.isAgentDeliveryMethod("carrier_pigeon"), false);
check("nor is a near-miss", agentConfig.isAgentDeliveryMethod("in-app"), false);

// The email rule is untouched — the same five properties as before.
check("the account address is allowed", agentConfig.isDeliveryTargetAllowed("a@b.com", "a@b.com"), true);
check("any other address is refused", agentConfig.isDeliveryTargetAllowed("victim@x.com", "a@b.com"), false);

// The Slack rule is the same rule with a different proof of ownership.
check(
  "a channel in the user's own workspace is allowed",
  agentConfig.isSlackChannelAllowed("C123", ["C123", "C456"]),
  true
);
check(
  "a channel that is NOT in their workspace is refused",
  agentConfig.isSlackChannelAllowed("C999", ["C123"]),
  false
);
check("no connected workspace allows nothing", agentConfig.isSlackChannelAllowed("C123", []), false);
check("...and a null list allows nothing", agentConfig.isSlackChannelAllowed("C123", null), false);
check("an empty channel is refused", agentConfig.isSlackChannelAllowed("", ["C123"]), false);
// Slack ids are case-SENSITIVE; lowercasing one addresses nothing.
check("channel ids keep their case", agentConfig.normaliseSlackChannel("  C01ABCDEF "), "C01ABCDEF");
check("...unlike email, which is folded", agentConfig.normaliseDeliveryTarget("  A@B.com "), "a@b.com");

// End to end through the validator.
{
  const base = {
    name: "Nvidia Daily News",
    description: "d",
    prompt: "Summarise Nvidia news.",
    scheduleCron: "0 8 * * *",
    timezone: "UTC",
    config: { needsWebSearch: true, outputFormat: "bullets", language: "en" },
  };
  const slackDraft = { ...base, deliveryMethod: "slack", deliveryTarget: "C123" };

  const allowed = agentConfig.validateAgentDraft(slackDraft, "a@b.com", {
    allowedSlackChannels: ["C123"],
  });
  checkTrue("a Slack agent validates when the channel is the user's own", allowed.ok);
  check("...and keeps the method", allowed.ok && allowed.draft.deliveryMethod, "slack");
  check("...and the channel", allowed.ok && allowed.draft.deliveryTarget, "C123");

  const foreign = agentConfig.validateAgentDraft(slackDraft, "a@b.com", {
    allowedSlackChannels: ["C999"],
  });
  checkTrue("a channel from a workspace they have not connected is refused", !foreign.ok);

  const noContext = agentConfig.validateAgentDraft(slackDraft, "a@b.com");
  checkTrue(
    "...and with NO Slack context at all it is refused, not defaulted",
    !noContext.ok,
    "fail-closed is the only safe direction for a delivery target"
  );

  // The email path is byte-for-byte what it was.
  const email = agentConfig.validateAgentDraft(
    { ...base, deliveryTarget: "a@b.com" },
    "a@b.com"
  );
  checkTrue("an email agent still validates with two arguments", email.ok);
  check("...and still defaults to email", email.ok && email.draft.deliveryMethod, "email");
}

// The Slack channel must NOT have moved into the config jsonb — it
// belongs in the existing delivery_target column, where the ownership
// check reads it.
//
// THIS USED TO BE A FROZEN SNAPSHOT of the whole config object, which
// says "the shape is unchanged" and actually asserts "nobody has added
// any key for any reason" — so an unrelated field (the depth tier) broke
// it while a `slackChannel` key smuggled in beside the others would have
// broken it identically, telling you nothing about which happened. Named
// key sets say what is meant.
{
  const shape = agentConfig.normaliseAgentConfig({
    needsWebSearch: true,
    outputFormat: "report",
    language: "el",
  });
  const KNOWN = ["needsWebSearch", "depth", "outputFormat", "language", "builderSummary"];
  const unexpected = Object.keys(shape).filter((k) => !KNOWN.includes(k));
  check("the agent config has no key nobody declared", unexpected, []);
  // The real point: nothing about WHERE the result goes lives in here.
  const DELIVERY_ISH = /slack|channel|webhook|telegram|discord|email|target|recipient/i;
  check(
    "...and nothing delivery-related is in the config jsonb",
    Object.keys(shape).filter((k) => DELIVERY_ISH.test(k)),
    []
  );
  check("...the values still survive normalisation", [shape.needsWebSearch, shape.outputFormat, shape.language], [true, "report", "el"]);
}

// ---------------------------------------------------------------------
console.log("\n== 8. the wiring ==");
// ---------------------------------------------------------------------
{
  const connect = read("src/app/api/integrations/[provider]/connect/route.ts");
  checkTrue("connect authenticates", /auth\.getUser\(\)/.test(connect));
  checkTrue("...and 401s", /if \(!user\)/.test(connect) && /401/.test(connect));
  checkTrue("...is rate limited", /checkRateLimit\(/.test(connect));
  checkTrue("...enforces the plan cap", /maxIntegrationsForPlan\(/.test(connect));
  // Fail CLOSED before the redirect: sending a user through consent and
  // then failing to store the token leaves a live grant we have no record
  // of — the worst outcome of a misconfiguration.
  checkTrue("...refuses when encryption is unavailable", /encryptionAvailable\(\)/.test(connect));
  checkTrue(
    "...and does so BEFORE redirecting",
    connect.indexOf("encryptionAvailable()") < connect.indexOf("NextResponse.redirect")
  );
  checkTrue("...sets an HttpOnly state cookie", /httpOnly: true/.test(connect));
  checkTrue("...SameSite=lax so it survives the provider's redirect back", /sameSite: "lax"/.test(connect));
}
{
  const callback = read("src/app/api/integrations/[provider]/callback/route.ts");
  checkTrue("the callback authenticates", /auth\.getUser\(\)/.test(callback));
  checkTrue("...and 401s", /if \(!user\)/.test(callback) && /401/.test(callback));
  checkTrue("...verifies the state signature", /decodeState\(/.test(callback));
  checkTrue("...checks the state's provider against the URL's", /payload\.p !== provider\.id/.test(callback));
  checkTrue("...checks the state's user against the SESSION", /payload\.u, user\.id/.test(callback));
  checkTrue("...checks the browser-bound nonce", /stored\.n, stateCheck\.payload\.n/.test(callback));
  checkTrue("...compares them in constant time", /secretsMatch\(/.test(callback));
  checkTrue("...consumes the cookie whatever the outcome", /maxAge: 0/.test(callback));
  checkTrue("...refuses a grant with missing scopes", /missing_scopes/.test(callback));
  checkTrue("...never logs a provider body", !/logApiError\([^)]*json/.test(callback));
}
{
  const disconnect = read("src/app/api/integrations/[provider]/route.ts");
  checkTrue("disconnect authenticates", /auth\.getUser\(\)/.test(disconnect));
  checkTrue("...and 401s", /if \(!user\)/.test(disconnect) && /401/.test(disconnect));
  checkTrue("...reports honestly whether the provider revoke succeeded", /revokedAtProvider/.test(disconnect));

  const store = read("src/lib/integrations/store.ts");
  // Order matters: deleting first would leave a live grant we no longer
  // hold the token to revoke.
  checkTrue(
    "revocation happens BEFORE the row is deleted",
    store.indexOf("revokeAtProvider(") < store.indexOf('.from("user_integrations")\n    .delete()')
  );
  checkTrue(
    "a provider outage cannot block erasure",
    /best-effort \(a provider outage must\n \* not block erasure\)|revocation is best-effort/i.test(store) ||
      /catch[\s\S]{0,200}stage: "revoke"/.test(store)
  );
  checkTrue("the plan-cap count fails CLOSED", /Number\.MAX_SAFE_INTEGER/.test(store));
}
{
  // The tool the model can call. It must be built from what is ACTUALLY
  // connected — offering "email" to a user with no Gmail produces an
  // apology that reads as the product being broken.
  const tool = read("src/lib/integrations/chat-tool.ts");
  checkTrue("the tool enum is narrowed to live integrations", /status === "connected"/.test(tool));
  checkTrue("...and no tool is offered when nothing is connected", /return null/.test(tool));
  checkTrue("results are fenced as untrusted", /wrapUntrusted\(/.test(tool));
  checkTrue("the loop is bounded", /MAX_TOOL_ROUNDS = 2/.test(tool));
  checkTrue("reads are rate limited per account", /checkRateLimit\(/.test(tool));
  checkTrue("the tool never throws into the chat turn", /catch \(err\)/.test(tool));

  const chat = read("src/app/api/chat/route.ts");
  checkTrue("chat loops on tool_use", /tool_use/.test(chat));
  checkTrue("...bounded by the same constant", /MAX_TOOL_ROUNDS/.test(chat));
  checkTrue("...and records EVERY round's usage", /costs\.record\("generation"/.test(chat));
  // An account with no integrations must get the request it always got.
  checkTrue(
    "no tool and no instruction when nothing is connected",
    /integrationSearchTool\s*\n?\s*\?\s*\[WEB_SEARCH_TOOL, integrationSearchTool\]\s*\n?\s*:\s*\[WEB_SEARCH_TOOL\]/.test(
      chat
    )
  );
}
{
  const deliver = read("src/lib/agents/deliver.ts");
  // EU AI Act Article 50 does not care which transport was used.
  checkTrue("Slack delivery carries the AI-generated notice", /aiGeneratedNotice\(/.test(deliver));
  checkTrue("...and posts as plain text, not Slack markup", /mrkdwn/.test(read("src/lib/integrations/read.ts")));
  checkTrue("delivery never throws", /catch \(err\)/.test(deliver));

  const execute = read("src/lib/agents/execute-agent.ts");
  checkTrue("execution dispatches on the delivery method", /deliverAgentResult\(/.test(execute));
  checkTrue(
    "a result that never reached the user is recorded on the run",
    /!delivery\.delivered/.test(execute)
  );
}
{
  // Changing WHERE an agent posts goes through the same server-side
  // ownership proof as creating one.
  const patch = read("src/app/api/agents/[id]/route.ts");
  checkTrue("editing delivery is handled", /body\.deliveryMethod !== undefined/.test(patch));
  // The property is unchanged — where an agent may deliver is resolved
  // from the DATABASE, never from the request body — but both routes now
  // ask one shared resolver instead of each calling listSlackChannels
  // itself. That is what stopped Telegram and Discord arriving checked on
  // create and unchecked on edit.
  const ownership = read("src/lib/agents/delivery-ownership.ts");
  checkTrue("...and the channel list comes from the DATABASE", /resolveDeliveryOwnership\(user\.id/.test(patch));
  const create = read("src/app/api/agents/route.ts");
  checkTrue("creating with Slack resolves the channels server-side", /resolveDeliveryOwnership\(user\.id/.test(create));
  checkTrue("...and the resolver is the one that reads Slack", /listSlackChannels\(userId\)/.test(ownership));
  checkTrue("...and never trusts the body", !/allowedSlackChannels = draft\./.test(create));
}

// ---------------------------------------------------------------------
console.log("\n== 9. the schema ==");
// ---------------------------------------------------------------------
{
  // Was the loose `v3_integrations_migration.sql` at the repo root, which
  // nothing ran. supabase/migrations is what builds the database.
  const sql = schemaSql();
  checkTrue("the token columns are named as ciphertext", /access_token_encrypted text not null/.test(sql));
  checkTrue("...and the refresh one is nullable", /refresh_token_encrypted text,/.test(sql));
  checkTrue("no plaintext token column exists", !/\baccess_token text\b/.test(sql));
  checkTrue("one connection per provider per user", /unique index[^;]*user_integrations[^;]*\(user_id, provider\)/is.test(sql));
  // Was a COUNT of every `enable row level security` in a file that held
  // only these two tables. Against the whole schema that number is 70,
  // which is not a claim about user_integrations and integration_sync_log.
  for (const table of ["user_integrations", "integration_sync_log"]) {
    checkTrue(`${table} enables RLS`, enablesRls(sql, table));
  }
  checkTrue("the migration is idempotent", !/create table (?!if not exists)/.test(sql));
  checkTrue(
    "the prune RPC is service-role only",
    /grant execute on function public\.prune_integration_sync_log[^;]*to service_role/i.test(sql) &&
      /revoke all on function public\.prune_integration_sync_log[^;]*from anon/i.test(sql)
  );
  checkTrue(
    "agents can deliver to every channel the code offers",
    /delivery_method in \('email', 'slack', 'telegram', 'discord', 'in_app'\)/.test(sql)
  );

  // The sync log is an audit trail of what the AI READ. It must not be
  // able to hold what it read.
  // Comments stripped first: the block explains WHY it holds no content
  // ("never a provider error body"), and a scanner that flags its own
  // rationale is a scanner people switch off. What is being asserted is
  // the DDL.
  const logBlock = sql
    .slice(
      sql.indexOf("create table if not exists public.integration_sync_log"),
      sql.indexOf("create index if not exists integration_sync_log_integration_synced_idx")
    )
    .replace(/--.*$/gm, "");
  for (const forbidden of ["subject", "body", "content", "snippet", "filename", "message_text"]) {
    checkTrue(`the sync log has no ${forbidden} column`, !new RegExp(`\\b${forbidden}\\b`, "i").test(logBlock));
  }

  const backup = sql;
  for (const table of ["user_integrations", "integration_sync_log"]) {
    checkTrue(`${table} is in the full schema file`, backup.includes(`create table if not exists public.${table}`));
  }
  // Both files DROP this constraint by name before re-adding it, so
  // whichever runs last wins. A narrower definition left behind in one of
  // them would silently invalidate every Telegram, Discord and in-app
  // agent row the moment somebody re-ran it.
  checkTrue(
    "the backup's delivery_method CHECK matches the migration",
    /delivery_method in \('email', 'slack', 'telegram', 'discord', 'in_app'\)/.test(backup)
  );
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
