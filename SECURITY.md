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

*Gate: `scripts/tests/rate-limit-coverage.test.mjs` — scans every route
handler that exports a mutating method (POST/PATCH/PUT/DELETE) and fails
the build unless it calls `checkRateLimit`, calls `checkAiCallAllowed`
(the AI routes' per-user hourly cap plus platform cap plus duplicate
breaker), or is on a justified list with the mechanism that bounds it
instead written down. Where the justification is an inline mechanism —
the login route's failed-attempt counter, the public form's per-website
cap — the gate pins the mechanism's identifier, so deleting it
un-justifies the route in the same commit.*

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

**A charge that costs no tokens still lives inside the credit system.**
Badge removal (V4 #25) makes no model call, so it has no AI cost and no
margin ratio to satisfy — but it is charged through `deductCredits` like
everything else, which puts it in `credit_transactions` (where the user
reads their history and where the ceiling applies) and deliberately NOT in
`ai_cost_log` (where a zero-cost row would flatter the AI margin report).

**State a visitor pays for is read at serve time, never baked into stored
bytes.** `published_sites.html_content` is a snapshot and `site_versions`
holds twenty more that a rollback can promote back to live. Anything that
depends on "has this account paid?" — today that is the "Made with Ionexa"
badge — is resolved per request from the current plan and the current
`badge_removal_paid_until`, by `lib/publishing/badge.ts`, which strips any
badge the stored copy contains before deciding. A lapsed period therefore
restores the badge with no write anywhere; there is nothing to forget to
run.

*Gate: `scripts/tests/billing-coverage.test.mjs` — scans for every
`anthropic.messages.*` call site in `src/`, and fails on any file not
DECLARED with its call count and billing mode.*

*Gate: `scripts/tests/badge-removal.test.mjs` — asserts no write path
stores a badge, that the serve path decides it from live state, and that a
plan which includes badge removal is refused at purchase and skipped at
renewal.*

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

### Presentations

- **A share link is a credential.** There is no login on `/p/<token>`, so
  the URL is the only thing protecting the deck. The token is 16 bytes of
  `randomBytes` — 128 bits, the strength of a v4 UUID. `Math.random()`
  here would be a credential drawn from a predictable sequence.
- **No public RLS policy.** The share page reads through the
  service-role client and selects only `title`, `theme` and `slides`. An
  "anyone can read a shared presentation" policy is evaluated against the
  ANON key, which is printed in the client bundle — anyone could then
  query the table directly and read every shared deck's `brief` and
  `credits_charged`, not just the one they were sent.
- **`fetchCache = "force-no-store"` on the share page.** `force-dynamic`
  governs the route, not the fetches the route makes; without this, Next's
  Data Cache serves the slides it had when it was warmed and a revoked
  share link keeps working. This is the same bug the published-sites route
  shipped once.
- **Export fetches from an allowlisted host and nowhere else.** It is the
  only place the server fetches a URL out of a user-controlled row, and an
  authenticated user can PATCH their own deck with any `https` URL and
  press Export. `images.unsplash.com` / `plus.unsplash.com` only, with
  `redirect: "manual"` so an allowlisted host cannot be used to reach one
  that is not. A blocklist of internal ranges would have to anticipate
  every private range, every redirect and every DNS name resolving into
  one; the allowlist has to know one hostname.
- **The image type comes from the bytes**, never the `Content-Type`, and
  the response is size-capped before and after reading.
- **Turning sharing off keeps the token; rotating replaces it.** Those are
  different intentions and conflating them breaks one of them — a user who
  toggles the switch twice has not asked to invalidate every URL they
  already sent.
- Versions are **append-only**: a rollback writes a new version rather
  than rewinding, so no button can erase what the user had.

### Marketplace

- **The paywall is the schema.** The merchandise lives in
  `marketplace_listing_payloads`, a separate table whose only select
  policy is the seller's own. RLS is ROW-level: a `payload` column on
  `marketplace_listings` would be readable by exactly the policy that
  makes the shop window browsable, so every buyer could take every
  product by selecting a column the UI happens not to render.
- **`marketplace_listings` has no insert or update policy.** The obvious
  one — `with check (auth.uid() = seller_id)` — is wrong here and looks
  identical to the correct policy on every other table. This row carries
  `status`: a seller holding the anon key could insert `published`
  directly and be live without the mandatory scan ever running. Same for
  update, plus `purchase_count` (manufacturing a bestseller) and the
  rating aggregate. Every write goes through a route that whitelists
  columns.
- **Browsing requires a session.** A bare `status = 'published'` policy is
  satisfied by the anon key, which turns the shop window into a public API
  for scraping every seller's price and sales count.
- **Money columns are platform-written.** `seller_accounts` and
  `marketplace_purchases` have no insert or update policy at all — an
  insertable purchases table is a free-products button.
- **The publish scan is mandatory and fail-closed**, and the payload is
  BUILT by the server from a row read under the seller's own id, never
  taken from the request body. What is stored is what was scanned.
- **Nothing sold carries the seller's identity or data.** A listed agent
  drops `delivery_target` and the Slack channel; a listed deck drops its
  sources and brief. The buyer's copy sets `user_id` from the verified
  session and an agent's delivery to the BUYER's own address — no install
  path reads a user id out of a payload.
- **Nothing installs running.** Agents arrive paused, automations
  inactive, missions in planning. Buying a thing that immediately starts
  spending your credits is not something a purchase consented to.
- **Fulfilment is webhook-only and idempotent.** Nothing installs because
  a browser reached a success URL. The claim is conditioned on the
  purchase still being `pending`, so a Stripe retry cannot deliver twice
  or pay the seller twice. A failed install leaves the purchase `paid`
  with no `installed_entity_id` — the state "paid and not received" has to
  be findable, not hidden.
- **You cannot review what you did not buy.** `purchase_id` is NOT NULL
  and unique per `(listing_id, buyer_id)`, so a fake review costs the
  price of the product.

### Data export (GDPR Article 20)

- **Read through the CALLER's own client, never the service-role one.**
  Every query in the export is subject to the same RLS as the rest of the
  app, so a wrong table or scope column in the manifest returns nothing.
  A service-role export with a `user_id` filter behaves identically right
  up until that mistake is made, and then hands somebody else's rows to
  whoever asked.
- **The manifest is gated against the schema.** Every table in
  `supabase_full_project_backup.sql` must appear in the exported list or
  the excluded list, and every exclusion carries a written reason. The
  realistic failure here is not refusing a request but answering one
  incompletely, which looks exactly like answering it — a feature table
  added next year silently dropping out of every subject access request.
- **No credentials in the file.** `user_integrations` is exported with a
  narrow column list that names no token; `account_deletion_requests` is
  excluded entirely, because it holds the hash of a live token that
  erases the account and a downloads folder is not where that belongs.
- **Failures and truncation are reported inside the file.** A table that
  could not be read, or that hit the row cap, is named in the manifest. A
  silently absent table is indistinguishable from one that was empty.

*Gate: `scripts/tests/gdpr.test.mjs` — §1 (no table unaccounted for, no
phantom table, every scope column exists), §3 (no credential is
exported), §4 (route posture, caller's client not service-role), §5
(erasure still deletes the storage objects, and before the auth user).*

### Live website editing (V3 Task 12)

- **Nothing reaches the public page without a security scan.** The
  preview step runs the static scan plus the AI content review; the apply
  step re-runs the deterministic static scan on the exact bytes about to
  be written — fail-closed, 422 on any finding. The apply step **never
  trusts the submitted HTML**: a preview result is client-held, so a
  tampered payload trying to slip a `<script>` past is caught by the
  re-scan, not by faith that the preview arrived unmodified.
- **Every live state is a version.** The result is snapshotted into
  `site_versions` (pruned to `MAX_SITE_VERSIONS`) before the visible
  content changes, so rollback means "what the public actually saw" and a
  bad edit is one click undone. The version helpers are shared by the
  publish, rollback and live-edit routes so "max 20" cannot mean 20 in
  one route and 30 in another.
- **Charged once, at preview.** The AI runs at preview time and is billed
  there; apply makes no model call and no charge. The per-site-per-day
  ceiling (`MAX_LIVE_EDITS_PER_SITE_PER_DAY`) is enforced on apply, where
  the page changes — a preview that is never applied costs no budget.

### AI Support Chat

- **Grounded in a computed corpus.** The assistant answers only from
  `lib/support/knowledge.ts`, whose plan numbers are computed from the
  same limit modules the API enforces with — it structurally cannot
  quote an allowance the server would not apply. A support answer the
  user acts on is a commitment; a guessed one is a liability.
- **It reads nothing about the account.** No user rows go into the
  prompt, so there is nothing for a crafted question to exfiltrate. The
  user's pasted text is fenced with `wrapUntrusted()` like any other
  replayed content.
- **Free by policy, bounded by rate.** Declared `unbilled` in
  `billing-coverage.test.mjs` with the reason written down: the most
  common support question in a credit-metered product is "why was I
  charged?", and charging to answer it is indefensible. The bound is
  40/hr per user on the cheap model, plus length caps on the question
  and the replayed history.

### Affiliate program

- **First touch wins and is never overwritten.** The referral cookie is
  set only when absent, so a later link cannot steal an earlier
  referrer's signup, and the attribution a commission pays on is the one
  that actually introduced the account.
- **Commissions are computed from Stripe's invoice, not the client.**
  `recordCommissionForInvoice` runs in the webhook on Stripe-reported
  amounts; nothing the browser sends can size a payout.
- **Self-referral pays nothing.** An account cannot be its own referrer,
  and the unique constraints make replaying a webhook idempotent rather
  than double-paying.

*Gate: `scripts/tests/marketplace.test.mjs` §2 (the split reconciles at
every price and rate), §3 (what must not travel with a listing), §4
(installs land on the buyer, switched off), §5 (the scan), §6 (the
schema's policies), §7 (route posture, webhook-only fulfilment).*

*Gate: `scripts/tests/presentations.test.mjs` §5 (the allowlist, including
lookalike hosts and userinfo spoofing) and §8 (auth, ownership-as-filter,
404-not-403, rate limits, fail-closed fair use, the share page's
service-role read and cache headers, and the token's entropy).*

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
| A mutating route has no rate limit, no AI breaker and no justification | `rate-limit-coverage.test.mjs` |
| A route justified by an inline limiter loses that limiter | `rate-limit-coverage.test.mjs` |
| Maintenance documented as scheduled has no caller | `security-posture.test.mjs` §4 |
| A new Anthropic call site is not DECLARED with its billing mode | `billing-coverage.test.mjs` §1 |
| A declared call site's call count changes | `billing-coverage.test.mjs` §1 |
| Generated HTML would bypass the security scan | `publishing.test.mjs` |
| The public serve route widens its column select | `publishing.test.mjs` §5 |
| A write path bakes the "Made with Ionexa" badge into stored HTML | `badge-removal.test.mjs` §4 |
| The badge stops being decided from live plan + expiry at serve time | `badge-removal.test.mjs` §4 |
| A plan that includes badge removal could be charged for it | `badge-removal.test.mjs` §5 |
| The badge renewal cron loses its `checkCronAuth` or its schedule | `badge-removal.test.mjs` §5 |
| A deck theme's text drops below WCAG AA on its own background | `presentations.test.mjs` §1 |
| A presentation route loses its auth, ownership filter or rate limit | `presentations.test.mjs` §8 |
| The PPTX export would fetch an image from an unallowlisted host | `presentations.test.mjs` §5 |
| The PPTX writer emits unbalanced XML or unescaped user text | `presentations.test.mjs` §7 |
| A marketplace payload column appears on the browsable listings table | `marketplace.test.mjs` §6 |
| `marketplace_listings` gains an insert or update policy | `marketplace.test.mjs` §6 |
| A listing's platform fee and seller share stop summing to the price | `marketplace.test.mjs` §2 |
| A listing would carry the seller's delivery address or research | `marketplace.test.mjs` §3 |
| A purchased agent or automation would install already running | `marketplace.test.mjs` §4 |
| Anything but the Stripe webhook installs a purchase | `marketplace.test.mjs` §7 |
| A new table is neither exported nor explicitly excluded from the data export | `gdpr.test.mjs` §1 |
| The data export would include a credential | `gdpr.test.mjs` §3 |
| The data export reads through the service-role client | `gdpr.test.mjs` §4 |
| A payload can close the untrusted fence from inside it | `red-team.test.mjs` §1 |
| Instruction-override phrasing stops being neutralised | `red-team.test.mjs` §2 |
| A path that sends third-party text to a model loses its fence | `red-team.test.mjs` §5 |
| The fence markers get a second definition | `red-team.test.mjs` §5 |
| A reserving route prices at the base margin instead of its plan's | `billing-coverage.test.mjs` |
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
