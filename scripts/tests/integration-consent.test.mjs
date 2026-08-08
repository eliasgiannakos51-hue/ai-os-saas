// Consent as a control, not a screen.
//
// The app already RENDERED a consent panel before every OAuth connect, and
// that was the whole of it. Two things were wrong with it, and both are
// the kind of wrong that only shows up when somebody asks a question you
// cannot answer:
//
//   1. NOTHING ENFORCED IT. /api/integrations/gmail/connect answered a
//      bare GET, so a bookmark, a pasted link, or any other page in the
//      app could start the OAuth flow with the panel never rendered. A
//      screen a user can walk past is a design, not a control.
//   2. NOTHING RECORDED IT. "Did this person agree, when, and to what
//      wording" had no answer anywhere in the system — which is exactly
//      what GDPR Art. 7(1) says a controller has to be able to produce.
//
// This suite pins both, plus the property that makes the record worth
// keeping: the user cannot write it, and neither can their browser.
//
// Run: node scripts/tests/integration-consent.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

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
  if (!cond && detail !== undefined) console.log(`        ${detail}`);
}
const read = (p) => readFileSync(p, "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("== 1. the redirect cannot happen without a recorded agreement ==");
{
  const connect = stripComments(read("src/app/api/integrations/[provider]/connect/route.ts"));
  checkTrue("connect asks whether consent is live", /await hasActiveConsent\(user\.id, provider\.id\)/.test(connect));
  checkTrue("...and refuses with 403 when it is not", /consentRequired: true[\s\S]{0,200}status: 403/.test(connect));

  // Ordering matters: the check has to come before the authorize URL is
  // built, or a user without consent still gets sent to Google and only
  // fails on the way back — having already approved access to their mail.
  const gateAt = connect.indexOf("hasActiveConsent");
  const redirectAt = connect.indexOf("buildAuthorizeUrl(");
  checkTrue("the gate is before the authorize URL is built", gateAt > 0 && gateAt < redirectAt, `${gateAt} vs ${redirectAt}`);
}

console.log("\n== 2. the panel records before it navigates ==");
{
  const panel = stripComments(read("src/components/integrations/integrations-list.tsx"));
  // The old code was `<a href={`/api/integrations/${provider.id}/connect`}>`
  // — a plain link straight past the record.
  checkTrue(
    "there is no direct link to /connect any more",
    !/href=\{`\/api\/integrations\/\$\{provider\.id\}\/connect`\}/.test(panel)
  );
  checkTrue("agreeing POSTs to the consent endpoint", /fetch\(`\/api\/integrations\/\$\{provider\.id\}\/consent`, \{\s*method: "POST"/.test(panel));
  checkTrue("...sending the wording version it rendered", /version: CONSENT_VERSION/.test(panel));
  checkTrue("...and the purpose sentence it displayed", /body: JSON\.stringify\(\{ purpose, version: CONSENT_VERSION \}\)/.test(panel));
  checkTrue("only then does the browser go to the provider", /window\.location\.href = data\.connectUrl/.test(panel));

  // The panel has to say WHAT and WHY. Data without a purpose is not
  // informed consent, and the purpose shown is the purpose stored.
  checkTrue("the panel names what will be read", /consentWhatLabel/.test(panel));
  checkTrue("the panel names why", /consentWhyLabel/.test(panel));
  checkTrue(
    "the stored purpose is the sentence on screen",
    /const purpose = t\(`providers\.\$\{provider\.key\}\.consent`\)/.test(panel) &&
      /<p className="text-sm leading-relaxed text-foreground">\{purpose\}<\/p>/.test(panel)
  );
  checkTrue("the panel says how to take it back", /consentPointRevoke/.test(panel));
  checkTrue("the panel says the agreement is recorded", /consentPointRecorded/.test(panel));
}

console.log("\n== 3. what the server accepts ==");
{
  const route = stripComments(read("src/app/api/integrations/[provider]/consent/route.ts"));
  checkTrue("unauthenticated is refused", /if \(!user\)[\s\S]{0,120}status: 401/.test(route));
  checkTrue("an unknown provider is refused", /isProviderId\(params\.provider\)[\s\S]{0,140}status: 404/.test(route));
  checkTrue("it is rate limited", /checkRateLimit\(\{[\s\S]{0,120}integration_consent/.test(route));

  // A tab left open across a deploy would otherwise record an agreement to
  // text the person never saw.
  checkTrue(
    "a stale wording version is refused with 409",
    /body\.version !== CONSENT_VERSION[\s\S]{0,240}status: 409/.test(route)
  );

  // The recorded scopes must be the ones that will actually be requested.
  // Taking them from the request body would let a crafted call record a
  // narrower grant than the one about to be made.
  checkTrue("scopes come from the server registry", /scopes: provider\.scopes/.test(route));
  checkTrue("...never from the request body", !/scopes: body\./.test(route));
}

console.log("\n== 4. the record is not the user's to write ==");
{
  const sql = read("integration_consent_migration.sql");
  checkTrue("RLS is on", /alter table public\.integration_consents enable row level security/.test(sql));
  checkTrue("the owner can read their own record", /create policy "select_own_integration_consents"[\s\S]{0,160}for select using \(auth\.uid\(\) = user_id\)/.test(sql));

  // The whole point. A consent row a browser can insert is not evidence
  // that a human saw anything, and one it can update is not evidence of
  // what they agreed to.
  const policies = [...sql.matchAll(/create policy "([^"]+)" on public\.integration_consents\s+for (\w+)/g)];
  check(
    "there is exactly one policy, and it is select",
    policies.map((m) => m[2]),
    ["select"]
  );

  checkTrue("erasure cascades from the account", /user_id uuid not null references auth\.users\(id\) on delete cascade/.test(sql));
  checkTrue("the migration is idempotent", !/create table (?!if not exists)/.test(sql));

  // One live consent per provider, enforced by the database rather than by
  // the function that happens to write it.
  checkTrue(
    "one LIVE consent per provider is a database guarantee",
    /create unique index if not exists integration_consents_active_key[\s\S]{0,160}where revoked_at is null/.test(sql)
  );

  // History, not state: a revoked row stays.
  checkTrue("revocation is a timestamp, not a delete", /revoked_at timestamptz/.test(sql));
  checkTrue(
    "the reason a consent ended is constrained",
    /revoke_reason[\s\S]{0,120}in \('user_revoked', 'superseded'\)/.test(sql)
  );

  // No new personal data collected in the name of protecting personal data.
  const stripped = sql.replace(/--.*$/gm, "");
  for (const forbidden of ["ip_address", "ip_hash", "user_agent", "fingerprint"]) {
    checkTrue(`the record holds no ${forbidden}`, !new RegExp(`\\b${forbidden}\\b`, "i").test(stripped));
  }

  const backup = read("supabase_full_project_backup.sql");
  checkTrue(
    "integration_consents is in the full schema file",
    backup.includes("create table if not exists public.integration_consents")
  );
}

console.log("\n== 5. taking it back actually takes it back ==");
{
  const route = stripComments(read("src/app/api/integrations/[provider]/consent/route.ts"));
  checkTrue("withdrawing disconnects too", /disconnectIntegration\(user\.id, params\.provider\)/.test(route));
  checkTrue("...and marks the consent withdrawn", /revokeConsent\(user\.id, params\.provider\)/.test(route));
  // Order: the token goes first. Marking consent withdrawn while the token
  // still works would tell the user something untrue.
  checkTrue(
    "the token is dealt with before the record is",
    route.indexOf("disconnectIntegration(user.id") < route.indexOf("revokeConsent(user.id")
  );
  checkTrue(
    "the answer says whether the provider actually revoked",
    /revokedAtProvider: disconnected\.revokedAtProvider/.test(route)
  );

  // Disconnecting from the integrations page must withdraw consent too —
  // otherwise the next Connect skips the screen on the strength of an
  // agreement the user has already walked back.
  const disconnect = stripComments(read("src/app/api/integrations/[provider]/route.ts"));
  checkTrue("plain disconnect withdraws consent as well", /revokeConsent\(user\.id, params\.provider\)/.test(disconnect));
}

console.log("\n== 6. it is visible and revocable from Settings ==");
{
  const settings = read("src/app/dashboard/settings/page.tsx");
  checkTrue("Settings loads the consent history", /listConsents\(user\.id\)/.test(settings));
  checkTrue("...and renders it", /<IntegrationConsents consents=\{integrationConsents\} \/>/.test(settings));

  const section = stripComments(read("src/components/settings/integration-consents.tsx"));
  checkTrue("each row can be withdrawn", /method: "DELETE"/.test(section));
  checkTrue("withdrawing asks first", /window\.confirm\(t\("confirmWithdraw"/.test(section));
  // Withdrawn entries stay on the list. A history that deletes what it no
  // longer needs cannot answer "was this ever on?".
  checkTrue("withdrawn agreements stay visible", /statusWithdrawn/.test(section));
  checkTrue("the withdrawal date is shown", /withdrawnAt/.test(section));
  checkTrue(
    "the purpose shown is the one that was stored, not today's copy",
    /\{entry\.purpose\}/.test(section)
  );
  checkTrue("the scopes agreed to are shown", /entry\.scopes\.map/.test(section));
  checkTrue(
    "a partial revoke at the provider is reported honestly",
    /data\.revokedAtProvider \? t\("withdrawn"\) : t\("withdrawnLocalOnly"\)/.test(section)
  );
}

console.log("\n== 7. the version is shared by both halves ==");
{
  // The client sends the version it rendered and the server compares. If
  // the two read different constants the check is theatre.
  const providers = await loadTs("src/lib/integrations/providers.ts");
  checkTrue("providers.ts exports a version", typeof providers.CONSENT_VERSION === "string");
  checkTrue("...that looks like a date-stamped version", /^\d{4}-\d{2}-\d{2}\.\d+$/.test(providers.CONSENT_VERSION));

  const consentLib = read("src/lib/integrations/consent.ts");
  checkTrue(
    "consent.ts re-exports the same constant rather than declaring its own",
    /import \{ CONSENT_VERSION[^}]*\} from "@\/lib\/integrations\/providers"/.test(consentLib) &&
      /export \{ CONSENT_VERSION \}/.test(consentLib) &&
      !/export const CONSENT_VERSION/.test(consentLib)
  );
  // providers.ts is imported by a Client Component, so it must stay free
  // of server-only imports. Comments stripped first: the file's own header
  // explains that the SECRETS live in a `server-only` module, and a
  // scanner that fails on its subject's rationale teaches people to delete
  // the rationale.
  checkTrue(
    "the shared constant lives in a client-safe module",
    !/server-only/.test(stripComments(read("src/lib/integrations/providers.ts")))
  );
}

console.log("\n== 8. the check fails closed ==");
{
  const lib = stripComments(read("src/lib/integrations/consent.ts"));
  // An unreadable consent table must mean "no consent", not "probably fine".
  const fn = lib.slice(lib.indexOf("export async function hasActiveConsent"), lib.indexOf("export async function recordConsent"));
  checkTrue("a query error means no consent", /if \(error\) \{[\s\S]{0,160}return false;/.test(fn));
  checkTrue("a thrown error means no consent", /catch \(err\) \{[\s\S]{0,160}return false;/.test(fn));
  checkTrue("a stale version does not count as live", /data\?\.consent_version === CONSENT_VERSION/.test(fn));
  checkTrue("there is no true-by-default path", !/return true;/.test(fn.replace(/consent_version === CONSENT_VERSION/g, "")));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
