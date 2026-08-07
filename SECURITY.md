# Security rules for Ionexa AI

Every feature added to this codebase must satisfy everything below. This
is not a checklist to tick after the fact — most of these are things that
are cheap to build in and expensive to retrofit, and several of them are
written here because they were once got wrong.

Where a rule is enforced by a test that FAILS THE BUILD, the test is
named. A rule with no automated gate is a rule that will eventually be
forgotten, so the goal is for every line here to have one.

---

## α. Row Level Security

**Every new table has RLS enabled and a policy for every operation the
owner needs.** Deny by default: RLS on with no policy denies everything
to `anon` and `authenticated` (service-role bypasses), which is the
correct state for a table only server code touches — and a catastrophe
for anything else, silently returning zero rows with no error.

- The policy shape in this schema is `auth.uid() = user_id`, everywhere.
  A policy that has to join to find its owner is a policy nobody can read
  at a glance, so `user_id` is denormalised onto join tables
  (`file_collection_items`, `website_versions`, `site_versions`) rather
  than derived.
- A table that is an **audit trail or a billing record** is SELECT-only
  to its owner; only the service-role client writes. An audit trail the
  subject can edit is not an audit trail. This applies to `agent_runs`,
  `site_analytics` and `integration_sync_log`, and the gate asserts each
  has exactly one policy and that it is `for select`.
- The migration goes in its own `v*_migration.sql` file **and** is
  appended to `supabase_full_project_backup.sql`. The gate reads the
  backup; a migration that only exists as a standalone file is invisible
  to it.

*Gate: `scripts/tests/security-posture.test.mjs` §1 — expands the dynamic
`do $$ … end $$` loops, then fails on any created table without RLS, any
listed feature table without a policy, and any RLS-enabled table with no
policy and no recorded justification.*

## β. Authentication

**Every route handler calls `supabase.auth.getUser()` and returns 401 on
a null user.** Not `getSession()` — that reads a cookie the client can
write. No exceptions without a written reason.

The handful of routes that legitimately have no session (login, signup,
the Stripe webhook, the CRON_SECRET-guarded crons, the emailed
delete-account token, the public contact form, the error beacon, the
OAuth landing, the public site server) are on an explicit allowlist in
the gate, each with its reason recorded. Adding to that list is a
deliberate decision, not a drift.

Cron routes are authenticated by `checkCronAuth(request)` from
`lib/cron-auth.ts`, which **fails closed** when `CRON_SECRET` is unset.
An inline check is not acceptable: the failure mode of a hand-rolled one
is that it fails open.

*Gate: `security-posture.test.mjs` §3 — walks every `route.ts` under
`src/app` (not just `src/app/api`; V3's public site route lives outside
it), and checks both that `getUser()` is called and that something acts
on `!user` with a 401.*

## γ. Ownership

**Being logged in is not authorisation.** Every action verifies the user
owns the resource.

The pattern that works, and the one used throughout: **filter the query,
do not check afterwards.** Both are correct; only one of them cannot be
forgotten by the next person who adds a branch.

```ts
const { data: file } = await supabase
  .from("user_files")
  .select("id, storage_path")
  .eq("id", params.id)
  .eq("user_id", user.id)   // <- this
  .maybeSingle();
if (!file) return 404;
```

Two consequences that matter:

- **Anything derived from the row is now trusted.** The storage path
  deleted from the bucket is the one that query returned, so no
  arrangement of request parameters reaches another user's object. A
  route that took the path from the request body would be a one-line
  delete of any file in the system.
- **Return 404, not 403, for someone else's id.** A 403 confirms the row
  exists, which is an existence oracle over every record in the system.

Ids that arrive in a request body and will be written into a join table
must be **re-checked against the user's own rows**. A foreign key proves
the row exists; only the check proves whose it is.

## δ. Rate limiting

**Every endpoint that costs something — AI tokens, storage, email, an
outbound request — has a per-user, per-time-unit limit** via
`checkRateLimit` from `lib/rate-limit.ts`.

That includes endpoints that look free: anything that mints a credential
(`/api/integrations/*/connect`, `/api/files/[id]/download`) is rate
limited too, because an unbounded loop of it accumulates live URLs or
fills a log.

`checkRateLimit` deliberately fails **open** on a database error — a
logging hiccup must not stop a paying user working. The hard ceilings are
elsewhere:

- **Plan caps** (files, storage, integrations, agents, research runs per
  month) fail **closed**. They bound resources that cost money every
  month, and a counting error must not be the way past them.
- The **AI circuit breaker** (`lib/ai-circuit-breaker.ts`) is the
  platform-wide backstop on runaway spend, independent of both.

## ε. Input validation

Maximum sizes, an allowlist of types, and sanitisation **before** any
processing.

- **Decide file types from the CONTENT.** The extension and the
  `Content-Type` header are both supplied by whoever is uploading.
  `sniffFileType` reads the magic bytes; a PDF renamed to `.txt` is still
  refused as a `.txt`, and a ZIP named `.zip` is refused entirely because
  a JAR and an APK are ZIPs too.
- **Cap the decompressed size, not just the compressed one.** A 3MB
  archive of zeroes expands to tens of gigabytes. `inflateRawSync(…,
  { maxOutputLength })` makes that a refusal instead of an
  out-of-memory kill. The size declared in a header is
  attacker-controlled and is only a cheap first check.
- **Never build a path from a filename.** Storage paths are
  `<user_id>/<uuid>.<ext>` — ids we generate. The user's filename is
  stored for display, sanitised of control characters and length-capped,
  and appears nowhere in the path.
- **Do not parse untrusted XML with a general parser.** OOXML text lives
  in known elements; scanning for those cannot expand an entity or open a
  file. Only the five predefined entities and numeric references are
  decoded — no DTD is ever consulted.
- Every loop over attacker-supplied structure is **bounded**. A PDF is a
  graph with references and a crafted one points at itself.

## στ. Credits

**Every AI call goes through reserve → execute → settle**, on a
`CostAccumulator`, with the ≥4× margin the pricing guarantees. Zero
exceptions.

- Estimate with `estimateForAction`; the client and the server use the
  same function so the quoted number and the held number cannot disagree.
- **Size the reservation after the real input is known** when the cost is
  dominated by loaded data (a record, a document selection). A hold sized
  from the user's question alone is off by orders of magnitude on a
  200-page contract.
- **Settle on every exit path, including the failures.** Every attempt
  that ran spent real tokens. A failed run that charges zero is a cost
  that lands entirely on us and never appears in the margin report.
  Release only when nothing was called at all.
- Retries record onto the **same** accumulator, so the hold must cover
  `MAX_ATTEMPTS × single`.

*Gate: `scripts/tests/billing-coverage.test.mjs` — scans for every
`anthropic.messages.*` call site in `src/`, and fails on any file not
DECLARED with its call count and billing mode.*

## ζ. Secrets

No key, token or credential in client code, in logs, or in an error
message.

- Third-party tokens are stored as **ciphertext** (AES-256-GCM,
  `lib/integrations/crypto.ts`) with the user id, provider and token kind
  bound in as additional authenticated data — so a ciphertext moved
  between rows fails to decrypt instead of quietly working. The column
  names say `_encrypted`, and the gate asserts no plaintext-shaped column
  appears.
- Provider errors routinely echo the request, and the request carried a
  token. Log a short error CODE, never a provider body. Use
  `safeErrorDetail()`.
- A client component must never learn which secrets exist. Resolve
  `providerConfigured()` on the server and pass a list of provider IDs,
  which is public information.
- Note that the Supabase **anon key ships in the client bundle**. Any
  policy that reads `using (true)` hands that table to the whole
  internet.

---

## Feature-specific rules

### Autonomous agents

An agent runs forever, on a schedule, spending money while nobody is
watching. Therefore:

- It **cannot execute arbitrary code**. It has one tool — web search —
  and its output is text.
- It **cannot call internal APIs**. There is no mechanism by which an
  agent's prompt reaches one.
- It **cannot send to an address the user did not themselves define**.
  Delivery targets are validated against the account's own email and the
  Slack channels the user's own connected workspace exposes — read from
  the DATABASE, never from the request body.
- Output is validated for shape before it is delivered, and an unsafe
  shape is **not retried**: retrying a safety failure until it passes is
  how a safety check becomes a formality.
- Free plans get zero agents. An agent is the one feature that spends
  money unattended, and accounts that can be created in bulk do not get
  one.

### Published sites

- Every response carries a restrictive **CSP** (`default-src 'self'`,
  `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`,
  `form-action 'self'`), `X-Frame-Options: DENY`, `nosniff`, and a
  restrictive `Permissions-Policy`.
- The generated HTML passes a **static security scan before publish**,
  fail-closed. Rollback re-scans, because a version that was safe under
  an older scanner is not thereby safe.
- Public serving is **rate limited** and reads through the admin client,
  selecting only the columns a visitor needs. `published_sites` has no
  public RLS policy, so a visitor cannot read the table at all.
- `dynamic = "force-dynamic"` is **not enough** — it does not govern
  fetches the route makes. `fetchCache = "force-no-store"` and
  `revalidate = 0` are required, or `.next/cache` serves a stale page
  forever and edits never appear.

### Files

- Bucket **PRIVATE**, and the schema forces it private again on every
  run (`on conflict do update set public = false`) so a bucket flipped
  open in the dashboard is corrected rather than silently left open.
- Downloads are **60-second signed URLs**, minted only after an ownership
  check. A signed URL is a bearer token: it lands in browser history and
  gets pasted into chat windows, and the expiry is chosen against that
  rather than against convenience.
- Object policies match `auth.uid()::text = (storage.foldername(name))[1]`
  — the path's first segment is the ownership proof.
- **Account deletion must delete the objects.** `storage.objects` has no
  foreign key to `auth.users`; nothing cascades. `delete_user_file_objects`
  runs before the auth user is deleted, and a failure stops the deletion
  rather than proceeding — "we deleted your account" must not be said
  while the files are still there.

*Gate: `security-posture.test.mjs` §1 (bucket private, policies scoped)
and §4 (the erasure RPC is called, and called first).*

---

## Prompt injection

**The system prompt and user input are different things, and the
separation is structural rather than polite.**

- Every piece of content that did not come from our own code is wrapped
  in `wrapUntrusted()` from `lib/agents/agent-config.ts`, which fences it
  in `<<<UNTRUSTED_SOURCE_MATERIAL>>>` markers and strips any attempt to
  close the fence from inside.
- **File content, search results and third-party API responses are DATA,
  never INSTRUCTIONS.** Every system prompt that receives them says so
  explicitly, and says what to do with an apparent instruction: report
  it, do not obey it.
- User text that will be stored and replayed (an agent's prompt) is
  sanitised of the known injection patterns — "ignore previous
  instructions", "you are now…", "system:" — with the removal made
  visible rather than silent.
- **Reject output that is outside the expected schema.** Where the answer
  is a structure, use forced `tool_choice` so it comes back as one; where
  it is prose, validate its shape before acting on it.
- One fence around the whole corpus, not one per document. A document
  that closes its own fence would otherwise speak as us for everything
  after it.

### The specific attack this defends

An attacker who gets content in front of the user's AI — a shared Drive
file, an email, a web page a research run finds — is trying to make the
model act on their words as if they were the user's. The consequence is
not "the model says something odd": it is the model summarising, acting
on, and delivering attacker-controlled content to a person who believes
they are reading their own data. That is why the OAuth callback
authenticates and binds three independent checks: connecting a victim's
account to an attacker's mailbox is a prompt-injection channel with a
login page in front of it.

---

## What fails the build

`npm run build` runs `check-i18n.js` and every `scripts/tests/*.test.mjs`
before `next build`. A new feature fails the build if:

| Condition | Gate |
|---|---|
| A new table has no RLS | `security-posture.test.mjs` §1 |
| An RLS-enabled table has no policy and no justification | `security-posture.test.mjs` §1 |
| An audit/billing table is writable by its owner | `security-posture.test.mjs` §1 |
| A new route handler has no `getUser()` and is not justified | `security-posture.test.mjs` §3 |
| A route calls `getUser()` but does not 401 on null | `security-posture.test.mjs` §3 |
| A cron route does not use `checkCronAuth` | `security-posture.test.mjs` §3 |
| Maintenance documented as scheduled has no caller | `security-posture.test.mjs` §4 |
| A new Anthropic call site is not DECLARED with its billing mode | `billing-coverage.test.mjs` §1 |
| A declared call site's call count changes | `billing-coverage.test.mjs` §1 |
| Generated HTML would bypass the security scan | `publishing.test.mjs` |
| Server-side English prose grows past its recorded baseline | `i18n-coverage.test.mjs` §1 |
| A user-facing string is hardcoded in a component | `i18n-coverage.test.mjs` §1 |
| A `t()` key does not exist in all ten locales | `check-i18n.js` |
| A sidebar item has no tooltip key | `sidebar-hints-coverage.test.mjs` |

**When a gate blocks you, fix the code, not the gate.** The one
legitimate reason to edit a gate is to record a new, deliberate decision
with its reason written down — which is why the allowlists in these
files carry prose explaining each entry rather than bare strings.

## Reporting a vulnerability

Email **security@ionexa.ai**. Please include what you did, what happened,
and what you expected. We will confirm receipt within two working days.
Do not open a public issue for a security report.
