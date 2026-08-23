# Ionexa AI

**Ionexa AI** — "the energy behind everything you build" — is a personal
operating system for running a startup. It combines 13 structured business modules,
an AI-powered free-text inbox that files anything you throw at it into the
right module, and a general-purpose AI assistant, all in one dark,
amber-accented workspace. Next.js 14 (App Router) + Supabase + the Claude
API + Stripe.

There's a public marketing site (landing page, pricing, roadmap, terms,
privacy) at the root, then everything else lives behind email/password auth
on `/dashboard`. Every module gets the same feature set: create, inline
edit, delete (all RLS-scoped to the logged-in user), live search,
newest/oldest sorting with pagination, CSV export, toast notifications on
every mutation, and loading/error states. The whole app is responsive
(sidebar collapses to a hamburger overlay on small screens) and works on
mobile and desktop.

**Touch targets: measured, not claimed.** This paragraph used to assert
"44px minimum touch targets" as a finished property. It was not one, and
nothing checked it — the claim survived because every layout test in the
repo ran against an empty account, where the only thing on screen is a
centred empty state. `scripts/tests/layout-stress.prodtest.mjs` measures
it against an account with real data in it, at four widths in two locales,
and prints the count every run. It was 346. It is now 119, most of the
remainder being inline links in prose (which WCAG 2.5.8 exempts) and
controls 4px short. The number is pinned so it cannot grow, and the same
file also measures three things nothing else does: text clipped with no
way to read the rest, controls a tap physically cannot reach, and the
modals.

## Product surface

- **Overview** (`/dashboard/overview`) — the default landing page after
  login. Totals across all modules (entry count, entries in the last 7
  days, most-active module) plus a card per module showing its entry count
  and most recent entry, linking through to the module.
- **13 business modules** (`/dashboard` for Ideas, `/dashboard/<slug>` for
  the rest) — Ideas, Competitors, Research, Finance, Learning, Trading,
  Decisions, Products, Content, Sales (CRM), Feedback, Analytics, and
  Automation. Ideas is hand-built; the other 12 are driven by a shared
  config (`src/lib/modules.ts`) and generic list/form components
  (`src/components/modules/`), so every module gets the exact same
  list/form/RLS pattern without 12 near-duplicate files.
- **Create Anything** (`/dashboard/create`) — a single free-text box,
  reachable from anywhere in the dashboard with Cmd+K / Ctrl+K. It posts to
  `/api/create`, a server-only route that calls the Claude API
  (`ANTHROPIC_API_KEY`, never exposed to the client) with a forced tool call
  to classify the message into one of the 13 modules and extract that
  table's fields, then inserts it via the same RLS-scoped pattern as every
  other module. If nothing matches clearly, it explains the available
  modules instead of guessing.
- **Ionexa Chat** (`/dashboard/chat`) — a separate, general-purpose AI
  assistant (not tied to any module) with real token-by-token streaming,
  markdown-rendered replies, and a conversation sidebar (pin, rename,
  delete, grouped by recency). Backed by `/api/chat`.
- **AI Agents** (`/dashboard/agents`) — autonomous agents. The user
  describes what they want in one sentence ("every morning, send me the
  latest news about Nvidia"); `/api/agents/build` asks only the questions
  that are genuinely missing (the shared clarifying-questions pre-check,
  kind `agent`), designs a complete configuration, and shows a preview —
  what it understood, when it will run, the first three run times in the
  user's own timezone, and the credits each run will cost — before
  anything exists. Confirmed agents run on our infrastructure forever:
  `/api/cron/agent-runs` fires every 15 minutes, executes whatever is due
  (optionally with a web search first), and emails the result via Resend.
  Each execution reserves credits before the first token and settles on
  measured usage, retries twice on a transient failure, auto-pauses the
  agent if the account runs out of credits, and switches it off with an
  email after five consecutive failures. Per-agent controls: pause/resume,
  edit, delete, "Run now" (a real execution, which deliberately does not
  touch the schedule or the failure streak), and the full run history with
  each run's output, cost and outcome. Fair use is per plan (Free 0,
  Starter 2, Growth 5, Professional 15, Ultimate 50, Enterprise 100), every
  number overridable via `AGENT_LIMIT_*`, plus a per-account cap of
  `AGENT_MAX_RUNS_PER_HOUR` executions an hour.
- **Published Sites** (`/dashboard/published`) — real hosting. A finished
  site in the Website Builder gets a **Publish** button: the user picks an
  address (3-30 chars, `[a-z0-9-]`, unique, with a reserved blocklist that
  keeps `admin`, `support`, `billing`, `www` and ~70 others out of
  customers' hands) and the site goes live immediately at `/s/<address>` —
  or at `<address>.<PUBLISHED_SITE_DOMAIN>` once a wildcard domain exists,
  with no migration, because the stored value is a bare label. The public
  route (`src/app/s/[subdomain]/route.ts`) reads no session, returns the
  published bytes as their own document rather than injecting them into
  ours, and carries a CSP that permits the inline CSS/JS a single-file
  generated site needs and nothing else — no external script host,
  `form-action 'self'`, `frame-ancestors 'none'`, `base-uri 'none'` —
  plus `X-Frame-Options`, `nosniff`, a `Permissions-Policy` and an
  in-memory rate limit. Every publish and every rollback re-runs the
  static security scan, fail-closed. Re-publishing appends a version;
  the last 20 are kept and any of them can be rolled back to in one click.
  Analytics are views per day with **no cookies and no personal data of
  any kind** — the table has no column that could hold an IP, a user agent
  or a visitor id. Fair use per plan (Free 0, Starter 1, Growth 3,
  Professional 10, Ultimate 30, Enterprise unlimited), overridable via
  `PUBLISHED_SITE_LIMIT_*`.
- **Integrations** (`/dashboard/integrations`) — Gmail, Google Drive and
  Slack, so the AI works on the user's real data. One generic OAuth flow
  serves every provider (`/api/integrations/[provider]/connect` and
  `/callback`), with CSRF state that is both HMAC-signed and bound to an
  HttpOnly cookie, PKCE where the provider supports it, and refresh at the
  point of use rather than on a schedule. Tokens are **AES-256-GCM
  ciphertext** with a key that lives only in the environment; each one is
  bound by GCM additional-authenticated-data to *whose* token it is and
  *which* token it is, so a ciphertext copied between rows or columns
  fails to decrypt instead of quietly working. Nothing token-shaped can
  reach a log — the redactor and a string-only `safeErrorDetail` are the
  only paths into `logApiError`. Gmail and Drive are deliberately
  **separate** integrations sharing one Google client, so a user who wants
  the AI to read their files never has to hand over their mail; Gmail is
  read with `format=metadata` (subjects, senders, a snippet — never
  bodies, never attachments, never Spam or Trash). Consent is a step, not
  a checkbox: the panel states what the AI will see and lists the scopes
  verbatim before the user leaves for Google. Disconnect revokes at the
  provider **first**, then deletes our row, and the delete cascades to the
  audit trail of what was read. In Ionexa Chat the model gets a real
  `search_my_data` tool (the app's first client-side tool loop, bounded at
  two rounds), whose results are fenced as untrusted third-party content;
  Autonomous Agents can deliver to a Slack channel, which must be one the
  user's own connected workspace offers. Fair use per plan (Free 0,
  Starter 2, Growth 5, Professional+ unlimited) via `INTEGRATION_LIMIT_*`.
- **Settings** (`/dashboard/settings`) — account email, password change,
  current plan + billing management, Buy Credits, credit transaction
  history, and a full-data JSON export.
- **Team** (`/dashboard/team`) — Professional/Enterprise plan owners can
  invite teammates by email; invited members get full access at the
  owner's plan for a flat €20/month/seat.
- **Pricing** (`/pricing`) — six tiers (Free, Starter, Growth, Professional,
  Ultimate, Enterprise), each with a monthly credit allotment (EUR pricing)
  and a set of plan capabilities, plus a team-seat add-on on Professional+.
  Checkout supports Stripe promotion codes.
- **Roadmap** (`/roadmap`) — a public, purely informational page laying out
  what's live today, what's coming next, and the longer-term product
  vision. No interactive elements by design.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com) (or
   use an existing one).

3. **Run the schema.** In the Supabase SQL editor, run the contents of
   [`supabase_schema.sql`](./supabase_schema.sql). It creates every table
   (the 13 modules, `create_requests`, `chat_conversations`/
   `chat_messages`, `team_members`) and enables row-level security so each
   is scoped to `user_id = auth.uid()`.

4. **Configure environment variables.** Copy the example file and fill in
   your project's values (Project Settings → API):

   ```bash
   cp .env.local.example .env.local
   ```

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ANTHROPIC_API_KEY=your-anthropic-api-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   RESEND_API_KEY=your-resend-api-key
   RESEND_FROM_EMAIL="Ionexa AI <onboarding@resend.dev>"
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   STRIPE_SECRET_KEY=your-stripe-secret-key
   STRIPE_WEBHOOK_SECRET=your-stripe-webhook-signing-secret
   STRIPE_PRICE_STARTER=price_...
   STRIPE_PRICE_GROWTH=price_...
   STRIPE_PRICE_PROFESSIONAL=price_...
   STRIPE_PRICE_ULTIMATE=price_...
   STRIPE_PRICE_TEAM_SEAT=price_...
   STRIPE_PRICE_CREDITS_10=price_...
   STRIPE_PRICE_CREDITS_25=price_...
   STRIPE_PRICE_CREDITS_50=price_...
   STRIPE_PRICE_CREDITS_100=price_...
   STRIPE_PRICE_ADDON_CREDITS_1000=price_...
   STRIPE_PRICE_ADDON_AGENTS_5=price_...
   STRIPE_PRICE_ADDON_STORAGE_10GB=price_...
   STRIPE_PRICE_ADDON_PRIORITY=price_...
   CRON_SECRET=your-cron-secret
   ADMIN_EMAILS=owner@example.com,cofounder@example.com
   BETA_INVITE_CODE=your-beta-invite-code
   BETA_FEEDBACK_URL=mailto:feedback@yourdomain.com
   UNSPLASH_ACCESS_KEY=your-unsplash-access-key
   OPENAI_API_KEY=your-openai-api-key
   ELEVENLABS_API_KEY=your-elevenlabs-api-key
   GOOGLE_API_KEY=your-google-ai-api-key
   GROQ_API_KEY=your-groq-api-key
   TELEGRAM_BOT_TOKEN=your-telegram-bot-token
- `IONEXA_DIAG` — optional. Set to `1` to enable verbose request tracing for the auth middleware, Stripe checkout/webhook, the team-page gate, and the Mission Control/Timeline data loads (see `src/lib/diag.ts`). Off by default: middleware runs on every request, so leaving this on writes a log line per page view. Turn it on, redeploy, reproduce the issue, read the logs, turn it off again.
- `CREDIT_MARGIN_MULTIPLIER` — optional, default `4`, allowed range `4`-`10`. Multiplier applied to an action's real API cost before converting to credits. Anything outside the range (or unparseable) is ignored with a logged warning and the default is used.
- `CREDIT_PRICE_EUR` — optional, default `0.02`. List price of one credit, in EUR.
- `USD_TO_EUR_RATE` — optional, default `0.92`. Anthropic bills in USD; credits are priced in EUR.
- `LARGE_ACTION_CONFIRM_THRESHOLD` — optional, default `50`. Estimates above this many credits require explicit user confirmation before the action starts.
- `RESERVE_BUFFER_PERCENT` — optional, default `10`. Extra percentage held (not charged) when reserving credits, released at settlement.

#### Notifications (V4 #18)

Seven things worth interrupting somebody for — an agent that FOUND
something (never one that merely ran), a website published, research
ready, credits at 80% and 100%, a failed payment, a new team member, and
an error that needs the user. Each one goes wherever that user said, per
type: in-app, email, Telegram, Discord. See `src/lib/notify/`.

The rules are code rather than intentions: `worth-sending.ts` refuses a
notification with nothing in it, `grouping.ts` collapses five agent
results into one, `quiet-hours.ts` DEFERS rather than drops (the held
notifications are drained by `/api/cron/agent-runs`, so "held until 08:00"
means 08:00), and `engagement.ts` reports the click rate per type so
"under 10% and the type is not worth sending" is a query rather than an
opinion.

- `TELEGRAM_BOT_TOKEN` — optional. The bot that delivers Telegram
  notifications. **Without it the Telegram channel is disabled cleanly**:
  `telegramConfigured()` is false, Settings says Telegram is not set up on
  this deployment instead of offering a field that cannot work, and the
  dispatcher drops the channel however a preference reads. Every other
  channel is unaffected. Get one from @BotFather; the user then messages
  the bot and pastes back the chat id, and a test message must actually
  arrive before the channel is stored as verified.
- Discord needs **no server-side variable**. The credential is the webhook
  URL, which each user supplies; it is validated against Discord's own
  hosts and path shape (an SSRF guard), stored encrypted per user with
  `INTEGRATION_ENCRYPTION_KEY`, and re-validated at send time.
- Both chat targets need `INTEGRATION_ENCRYPTION_KEY` (already required by
  the OAuth integrations). Without it, connecting a chat channel is
  REFUSED rather than stored in plaintext.

Email notifications share the existing Resend setup and the same
20-per-day-per-user cap as every other email. **They will not leave the
building without a verified sending domain** — see "Email delivery" below.

#### Data Analysis and AI Coding (V4 #19 + #20)

Two pages that were CRUD trackers — a form for typing your own findings,
and a form for describing code you would then go and write yourself — and
are now tools. Both moved from the sidebar's **Tracking** group to
**Build**, and `scripts/tests/sidebar-naming.test.mjs` now proves that
claim from the code rather than from a list: every item under Build must
have an API route it fetches that actually reaches a model, and every
module still in `lib/build-modules.ts` must NOT.

**Data Analysis** (`/dashboard/data-analysis`). Upload a CSV or an Excel
file up to 8 MB; it is parsed, every column profiled, and charts drawn
from the real rows. The division of labour is the point:

- **Every number is computed in TypeScript.** `lib/data-analysis/profile.ts`
  does the types, means, medians, standard deviations, outliers and
  Pearson correlations over the whole file. A mean produced by a language
  model is indistinguishable from a real one until somebody's decision
  depends on it.
- **The model only interprets.** It is handed the profile — never the rows
  — and asked what it means. Every chart it proposes is validated against
  the real column list before it is stored, and a finding naming a column
  the file does not have is dropped.
- **Questions are answered from the data.** Your question becomes a
  *query*, which this server runs over the real rows; the model then
  writes one framing sentence, and any figure in that sentence that is not
  in the computed result is removed and reported. That last check is what
  stops the fluent invented number every "chat with your spreadsheet"
  feature produces.
- **No dependency was added.** The CSV parser (RFC 4180), the ZIP reader
  and the .xlsx reader are in `lib/data-analysis/`. A spreadsheet parser
  is a file-format parser running on files strangers upload, which is the
  highest-risk dependency class there is; this one does read only, two
  compression methods, and refuses everything else by name.
- Uploading, profiling, charting and exporting cost **nothing** and work
  with no API key. Only "find patterns" and asking a question call a model.

**AI Coding** (`/dashboard/coding`). Five operations: write a snippet,
explain this, find bugs, convert, write tests. And four things it does
NOT do, stated on the screen in all ten languages rather than in a
comment:

- it has **no repository** — it cannot see your codebase or the file next
  to the one you paste;
- it **runs nothing** — not your code, not the code it writes, not the
  tests it writes;
- it makes **no commits**, branches or pull requests;
- it does **not build a project** — one function, one file, one paste.

Those four are V5. Syntax highlighting is a tokeniser in
`lib/coding/highlight.ts` that returns TOKENS rather than an HTML string,
so the component maps them to `<span>` elements and pasted code goes
through React's normal escaping — there is no `dangerouslySetInnerHTML`
anywhere near a paste box.

**The advantage** (`lib/ai/workspace-context.ts`). Both tools can read a
short, bounded list of headlines from the user's OWN modules, so "a
function that calculates the margin" can mean what margin means in this
account. Four rules: the caller's own RLS-scoped client (never the admin
one), headline fields only, capped per module and in total, and only when
the caller explicitly asks — the panel has a visible toggle.

**Nothing was deleted.** `ai_coding_requests` and
`ai_data_analysis_requests` are untouched and still in the GDPR export.
The coding notes were *copied* into `code_sessions` (marked
`source = 'note'`, idempotently, keyed on `imported_from`), and the
analysis notes are listed on the new page under "your earlier notes".

#### Email delivery: the verified sending domain

**Nothing leaves the building without this.** The default sender,
`onboarding@resend.dev`, is Resend's shared TESTING address: it delivers
ONLY to the email address of the Resend account owner. Every other
message — welcome, digest, agent result, notification — is refused with
*"You can only send testing emails to your own address"*. Production
logged twenty of those before `RESEND_FROM_EMAIL` was upgraded from
optional to recommended in `src/lib/env-check.ts`.

It is not a code problem and there is no code fix for it. It is a DNS
problem, and this is exactly what to do:

1. **Pick a subdomain to send from**, not the root domain — `send.example.com`
   or `mail.example.com`. Sending reputation attaches to whatever you sign
   with, and keeping it off the root means a bad week for marketing mail
   never affects the domain your normal business email arrives from.
2. **Add the domain in Resend**: <https://resend.com/domains> → *Add
   Domain* → enter the subdomain → pick the region closest to your users
   (it changes one of the records below).
3. **Resend then shows you three or four records.** Copy them EXACTLY as
   shown — the values are generated for your domain and are not
   guessable, so do not copy them from any documentation including this
   file. What you will see:
   - a **DKIM** record — type `TXT`, name `resend._domainkey`, value a
     long `p=MIG...` public key. This is what signs the mail as yours.
   - an **SPF** record — type `TXT`, on the sending subdomain, value
     `v=spf1 include:amazonses.com ~all`. This is what says Resend's
     servers may send as you.
   - an **MX** record — on the same subdomain, pointing at
     `feedback-smtp.<your-region>.amazonses.com`, priority `10`. This is
     where bounces and complaints go; without it you never learn that an
     address is dead.
   - optionally a **DMARC** record — type `TXT`, name `_dmarc`, value
     `v=DMARC1; p=none;` to start. Add it AFTER the first three verify,
     and leave it at `p=none` until you have looked at a few reports.
4. **Add each record at your DNS provider** (Cloudflare, Namecheap, your
   registrar). Two things that bite here: some providers append the
   domain to the name automatically, so entering
   `resend._domainkey.example.com` produces
   `resend._domainkey.example.com.example.com` — enter just
   `resend._domainkey`. And on Cloudflare, DNS records for mail must be
   **DNS only (grey cloud)**, never proxied.
5. **Click Verify in Resend.** It is usually minutes; DNS propagation can
   take up to 72 hours. The dashboard shows per-record status, so a single
   failing row tells you which one was typed wrong.
6. **Set the sender** once the domain shows *Verified*:

   ```
   RESEND_FROM_EMAIL="Ionexa AI <hello@send.example.com>"
   ```

   in Vercel → Project → Settings → Environment Variables (Production),
   then **redeploy** — environment variables are read at build/boot, so an
   existing deployment keeps the old value until it is rebuilt.
7. **Check it worked.** `src/lib/env-check.ts` flags any address still
   ending in `@resend.dev` as suspicious, so the startup check will say
   so. Then trigger one real email (sign up a test account) and confirm
   it arrives at an address that is NOT the Resend account owner's.

Until step 6 is done, the notification system's email channel is a
correctly-built path with nothing at the end of it. In-app notifications,
Telegram and Discord are unaffected — they do not go through Resend.

#### Free chat

A monthly allowance of chat messages that cost no credits. Free messages run in a smaller envelope than paid ones — 2,000-character input, 6 messages of history, 800 output tokens, and no web search — which is what keeps the worst case affordable enough to give away (≈€0.035 per message, versus ≈€1.01 for a full paid message with three web searches). See `src/lib/billing/free-chat.ts`; `npm run test:unit` enforces that no allowance can exceed 25% of its plan price.

Requires `supabase_free_chat_migration.sql` to have been applied. Without it the feature degrades to off and chat charges credits exactly as before.

- `FREE_CHAT_ENABLED` — optional. Set to `false` to disable free chat entirely on every plan.
- `FREE_CHAT_MESSAGES_FREE` — optional, default `15`.
- `FREE_CHAT_MESSAGES_STARTER` — optional, default `120`.
- `FREE_CHAT_MESSAGES_GROWTH` — optional, default `300`.
- `FREE_CHAT_MESSAGES_PROFESSIONAL` — optional, default `600`.
- `FREE_CHAT_MESSAGES_ULTIMATE` — optional, default `1200`.
- `FREE_CHAT_MESSAGES_ENTERPRISE` — optional, default `1200`.

  Each accepts a non-negative integer; `0` disables the allowance for that plan. An unparseable or negative value is ignored and the default is used. The allowance resets on the first of each calendar month (UTC).

#### Trading journal and the Strategy Guardian

Your own trades, your own rules, counted (V4 #14). Lives at
`/dashboard/trading-journal`; the schema extends the existing `trades`
module table rather than forking it, so one question has one answer.

**The Guardian parses once and counts in code.** You write your rules the
way you would say them — *"Max 2% risk. Only London. RR at least 1:2. Max
3 trades a day."* — and they are turned into a checkable form **in the
browser, with no model call** (`src/lib/trading/rules.ts` is pure). What
was understood is shown beside your own sentence *before* anything is
saved, and a sentence that cannot be made checkable is **refused rather
than stored**: a rule sitting in the list marked active that can never
fire is worse than no rule, because you would believe you were being
watched.

Every trade is then evaluated by arithmetic (`src/lib/trading/guardian.ts`),
so *"you broke this rule eight times in March"* is a number you can check
one trade at a time — not a model's impression of 200 rows, which would be
different tomorrow.

**Three things it gets right that are easy to get wrong:**

- **The London/New York overlap.** London runs 07:00–16:00 UTC and New
  York 12:00–21:00, so a 13:00 trade is in *both*. A rule of "only London"
  is checked against **every** session containing the entry; the
  statistics group by a **single** primary session, so no trade is counted
  twice.
- **Risk-reward is measured on the plan, not the outcome.** Computing it
  from the exit price would mark every trade that hit its stop as a rule
  violation — punishing you for the stop working.
- **A figure that cannot be computed honestly is absent.** A win rate
  under five decisive trades, a profit factor with no losses in the
  sample, a percentage drawdown with no starting balance: each is `null`
  and rendered as a sentence explaining why, never as a number.

#### Bank connections and crypto wallets

Read-only, always (V4 #15). Requires
`supabase/migrations/20260831000000_bank_crypto.sql`.

**Six rules, each enforced by something that fails when it stops being
true — not by a promise in a comment:**

1. **Read-only, without exception.** No column in the schema could carry a
   payment instruction. `bank_connections.access_mode` is a CHECK
   constraint pinned to `read_only`, the `scopes` array is constrained to
   four read scopes, and `src/lib/finance/read-only.ts` is the only way
   this codebase calls a financial provider — it refuses any method but
   GET/POST and any path containing `transfer`, `payment`, `payout`,
   `withdraw`, `beneficiar`, `sign` and a dozen more.
2. **Never a private key, never a seed phrase.** `crypto_wallets` has one
   address column and no jsonb to hide one in;
   `src/lib/finance/secret-guard.ts` recognises BIP-39 mnemonics, raw hex
   keys, WIF and `xprv` **by shape** and refuses them **without echoing
   the value** into an error, a log or the DOM. The database refuses them
   again: the address column forbids whitespace and is bounded at 128
   characters. A watch-only `xpub` is deliberately *not* refused.
3. **Never investment advice.** `src/lib/trading/conduct.ts` constrains
   every trading-related model call in both languages **and** scans the
   output before it reaches a user. A response that recommends is
   *replaced*, not edited — editing an advisory sentence leaves the advice
   and removes the evidence.
4. **Never a market prediction.** Same layer, same treatment.
5. **An explicit disclaimer everywhere.** `TradingDisclaimer` is a
   **server** component with no dismiss control, and the build gate fails
   if any dashboard surface reading trading, bank or crypto data omits it.
   Its text is checked in all ten locales for all three claims: not
   advice, not a forecast, risk of loss.
6. **Credentials never in a log.** Tokens are ciphertext through the
   **existing** AES-256-GCM module (`src/lib/integrations/crypto.ts`) —
   not a second implementation, because one encryption path means one
   place for a key to be mishandled. The build gate asserts that nothing
   in `src/lib/trading/` or `src/lib/finance/` writes to the console at
   all.

**No provider keys are wired yet.** No bank was ever connected, no wallet
balance was ever read, and no aggregator credential exists in this
codebase. The schema, the guards and the read-only layer are in place and
tested; the sync itself is the next piece.

#### Model providers and failover

One interface, several providers (V4 #12). Every model call can go through
`src/lib/ai/providers/`, which picks a provider per *purpose*, translates
the request, and fails over when one is having an incident. **The user
never sees any of this** — the same answer, the same error sentence,
whoever served it.

**Off unless you turn it on.** With no configuration the chain is
Anthropic alone and behaviour is exactly what it was. Adding a provider is
an explicit act: a key added for something else (`OPENAI_API_KEY` is also
what Voice transcription uses) does **not** silently reroute your chat.

- `OPENAI_API_KEY` — optional. Also used by Voice. Without it OpenAI is
  dropped from any chain that names it, with the reason logged.
- `GOOGLE_API_KEY` — optional. Gemini.
- `GROQ_API_KEY` — optional. Open models, fast and cheap, **no prompt
  cache** — see the warning below.
- `AI_PROVIDER_ORDER` — optional, default `anthropic`. Comma-separated,
  tried in order, e.g. `anthropic,openai,groq`. An unknown name is
  **warned about and skipped**; the rest of the chain still stands, because
  a typo here must not take every AI feature down at once.
- `AI_PROVIDER_ORDER_<PURPOSE>` — optional per-purpose override, beating
  the global chain. Purposes: `CHAT`, `AGENT_RUN`, `AGENT_BUILD`,
  `RESEARCH`, `WEBSITE_BUILD`, `CREATE`, `FILE_ASK`, `CLASSIFICATION`,
  `SUMMARISATION`. Example: `AI_PROVIDER_ORDER_CLASSIFICATION=groq,anthropic`.
- `AI_FAILOVER_ENABLED` — optional, default `true`. Set to `false` for
  deterministic single-provider behaviour.

**What fails over and what does not.** 5xx, 529, 429, timeouts and network
failures move to the next provider. A **400 does not** — it is our bug, and
paying a second vendor to reject the same malformed request hides it. A
**404 does not** — it means the model catalog is wrong, permanently. An
error nobody can classify does not either.

> ### ⚠️ The cache minimum, and why a cheaper provider can cost more
>
> Prompt caching fails **silently**. Below a model's minimum prefix
> length the provider does not cache, reports nothing unusual, and bills
> full price.
>
> | Model | Minimum cacheable prefix |
> | --- | --- |
> | `claude-sonnet-4-6` | 1,024 tokens |
> | `claude-haiku-4-5` | **4,096 tokens** |
> | `openai/gpt-*` | 1,024 tokens (automatic, no markers) |
> | `google/gemini-2.5-flash` | 1,024 tokens |
> | `google/gemini-2.5-pro` | 2,048 tokens |
> | `groq/*` | **no prompt cache at all** |
>
> The minimum is **not** monotonic with price. Routing a call with a
> 2,000-token cached prefix from Sonnet "down" to Haiku to save money:
>
> ```
> on Sonnet   2,000 cached read tokens  @ $0.30/MTok  = $0.00060
> on Haiku    2,000 FULL input tokens   @ $1.00/MTok  = $0.00200
> ```
>
> The cheaper model is **3.3x more expensive** for that prefix, on every
> request, and nothing reports it. `src/lib/ai/providers/cache-policy.ts`
> computes this before a route is taken, `comparedRequestCostUsd()`
> answers "is it actually cheaper for *this* request", and every attempt
> in `ai_provider_log` carries a `cache_kept` column — the only trace a
> silent failover leaves.

**Prices are not verified.** The non-Anthropic rows in
`src/lib/ai/providers/catalog.ts` are published list prices written down
without an account to check them against. Every credit charge is computed
from them. **Check them before serving real traffic** — the app logs a
warning naming that file the first time an unverified provider is enabled.

**Who served what** is in `public.ai_provider_log`: one row per *attempt*,
with the provider, model, outcome, HTTP status, latency, why that provider
was tried, and whether the cache survived. No prompt, no completion — the
table has no column that could hold either. Requires
`supabase/migrations/20260828000000_ai_provider_log.sql`; without it
routing still works and the log write fails quietly (it never blocks a
call).

#### Batch API for scheduled agents

Scheduled agent runs can go through Anthropic's Message Batches API at
**half price** (V4 #13), collected by `/api/cron/agent-batches`.

- `AI_BATCH_ENABLED` — optional, **default `false`**. Must be exactly the
  string `true`. Off by default because it changes *when* results arrive,
  and deciding on somebody's behalf that a delay does not matter to them is
  not an optimisation, it is a product change.

**What qualifies**, and nothing else does: a **scheduled** run (not
manual — somebody is watching a spinner), on an agent that runs **daily or
slower** (an hourly agent could have 24 submissions outstanding), that
does **not need live web research** (a batch cannot use the server-side
search tool, and answering from training data instead produces a
confident, unsourced report that looks exactly like a real one), with **no
batch already in flight** — enforced by a partial unique index in SQL, not
by application code, because it is a race between cron invocations.

**The delay is named, not hidden.** A batched run is written as `queued`
with its submission time and shown as "Queued" in the agent's history,
never as "Running". Individual agents can opt out with `batchOptOut` in
their config.

**When it fails.** The batch expires (24h), a request inside it errors, or
it is cancelled → that run is closed with a sentence the owner can read and
the agent is made due immediately, so the ordinary synchronous path runs it
at full price. Submission itself failing queues nothing and the agent runs
synchronously in the same tick. There is no second executor and no retry
loop of its own.

**Credits are not held across the window.** A reservation lives 60 minutes
and a batch may take 24 hours. Affordability is checked at submission and
the charge is taken at settlement from measured usage, at the batch rate.
The gap is real: a user who spends their balance in between is charged
against what is left. The exposure is one run of one agent at half price.

Requires `supabase/migrations/20260829000000_agent_run_batches.sql`.

#### Voice

Speaking to the app instead of typing, and having answers read back
(V4 #19, #23, #2). Two provider keys, both **optional to the deployment
and mandatory to the feature**:

- `OPENAI_API_KEY` — optional, no default. Transcription (`whisper-1`).
  **Without it, no microphone button renders anywhere.** Not a broken
  button and not an error toast: `/api/voice/usage` reports
  `configured.transcribe: false`, and every `VoiceInput` returns `null`.
  Typing is unaffected everywhere, because the microphone was never the
  only way in.
- `ELEVENLABS_API_KEY` — optional, no default. Speech (`eleven_turbo_v2_5`).
  **Without it, no "Listen" button renders** and the hands-free
  conversation entry point in Chat is hidden, since a loop that can hear
  but not answer aloud is not the thing that button promises. Reports
  `configured.speak: false`.

Both keys are checked **by name, before any client is constructed** — the
`new Resend(undefined)` lesson: a provider SDK that throws from its own
constructor makes "the key is missing" indistinguishable from "the
network is down".

**The audio is stored nowhere.** It is streamed to the provider for
transcription and the transcript comes back to the browser for the user
to edit; nothing is written to Supabase, to storage, or to a log. The
same is true in reverse for speech: the clip is a response body and a
blob URL that is revoked when the component unmounts.

**Minutes per plan**, a capacity ceiling on top of the credit charge (the
providers bill per minute and per character, so a tab holding a
microphone open is somebody else's invoice). Each accepts a non-negative
integer; `0` disables voice for that plan entirely, and the UI then says
"not included on your plan" rather than hiding the reason. Requires
`supabase/migrations/20260827000000_voice_usage.sql`; without it the
`voice_usage` ledger cannot be read and the routes **fail closed** — the
month reports as fully used and voice refuses, which is the safe
direction for a metered external cost.

- `VOICE_MINUTES_FREE` — optional, default `0` (voice is not on the free plan).
- `VOICE_MINUTES_STARTER` — optional, default `30`.
- `VOICE_MINUTES_GROWTH` — optional, default `90`.
- `VOICE_MINUTES_PROFESSIONAL` — optional, default `300`.
- `VOICE_MINUTES_ULTIMATE` — optional, default `900`.
- `VOICE_MINUTES_ENTERPRISE` — optional, default `2000`.

**What it costs, in credits, at the default margin.** Listening is cheap
and speaking is not, by roughly sixteen times, so the price is on the
button before it is pressed:

| Action | Provider price | Credits per minute (M=4) | (M=5) | (M=6) |
| --- | --- | --- | --- | --- |
| Transcribe | $0.006/min | 2 | 2 | 2 |
| Speak | $0.15/1k chars | 25 | 32 | 38 |

A 30-second dictation is 1 credit. A 1,200-character answer read aloud is
42 credits at M=5 — more than a standard agent run, which is exactly why
that number is rendered on the "Listen" control rather than discovered
afterwards.
   ```

   `.env.local` is gitignored — never commit real credentials.
   `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, the
   `STRIPE_*` vars, `ADMIN_EMAILS`, and `BETA_INVITE_CODE` have no
   `NEXT_PUBLIC_` prefix on purpose — they're only read server-side and are
   never sent to the browser. `RESEND_FROM_EMAIL` is optional — it falls
   back to Resend's shared sandbox address, which only delivers to the
   email on your own Resend account, so set it to a verified sending
   address before real users sign up. `ADMIN_EMAILS` is optional and
   additive to the founder account already hardcoded in
   `src/lib/admin.ts` — see [Admin access](#admin-access) below.
   `BETA_INVITE_CODE`/`BETA_FEEDBACK_URL` are optional — see
   [Beta testers](#beta-testers) below. `UNSPLASH_ACCESS_KEY` is optional —
   see [Website Builder photos](#website-builder-photos) below; without it,
   image resolution falls back to a solid-color placeholder instead of a
   real photo. `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` are optional —
   see [Voice](#voice) above; without them the microphone and "Listen"
   controls do not render at all and every surface stays fully usable by
   typing and reading. `GOOGLE_API_KEY` and `GROQ_API_KEY` are optional
   too — see
   [Model providers and failover](#model-providers-and-failover); a
   provider with no key is dropped from the routing chain cleanly, with
   the reason logged, and never causes a failed call. See [Billing](#billing) and
   [Credits](#credits) below for how the Stripe vars are used and how to
   create the required Price IDs.

5. **Email confirmation is auto-skipped for now.** Signup goes through
   `/api/signup`, which creates the user, immediately marks their email
   confirmed via the Supabase Admin API (`SUPABASE_SERVICE_ROLE_KEY`), and
   signs them in — so new users land straight on `/dashboard/overview` with
   no inbox step. This is intentional for early development; re-enable real
   email confirmation (drop the `email_confirm: true` admin call in
   `/api/signup/route.ts`) before shipping to real users.

6. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) — you'll be
   redirected to `/login`. Sign up, then you'll land on `/dashboard/overview`
   with a sidebar to reach every module.

## Testing

`tests/smoke.spec.ts` is a [Playwright](https://playwright.dev) suite that
objectively checks every module has create/search/sort/export, that
sidebar links resolve, and that login/signup, Overview, Settings, the
Cmd+K shortcut, and the mobile sidebar all work — rather than relying on
reading the code. Run it against your local dev server:

```bash
npx playwright install chromium   # first time only
npm run test:e2e
```

It starts `npm run dev` for you if it isn't already running. The three
"public pages" checks need nothing extra, but everything under
"authenticated dashboard" signs up a throwaway test account through the
real signup flow, so it needs a working `.env.local` with real Supabase
credentials (see Setup above) — if signup can't reach Supabase, those
tests report as **skipped** with the reason, not failed.

## Email

Transactional email is sent via [Resend](https://resend.com).

- **Welcome email** — sent from `/api/signup` right after a new user's
  email is auto-confirmed, introducing the 13 modules. It's fire-and-forget
  by design: `sendWelcomeEmail` catches and logs its own errors, so a
  misconfigured `RESEND_API_KEY` or a Resend outage never blocks signup —
  the user can always log in even if the email didn't go out.
- **Team invite email** — sent from `/api/team/invite` when a plan owner
  invites a teammate.
- **Weekly digest** — `/api/weekly-digest` computes, per user, how many
  entries were logged in each module over the last 7 days and emails a
  summary. It's a placeholder: nothing in the app calls it yet. To go live,
  point a scheduler (Vercel Cron, a GitHub Action, etc.) at it on a weekly
  interval. If you set `CRON_SECRET`, the route only responds to requests
  carrying `Authorization: Bearer <CRON_SECRET>` — set that before exposing
  it in production, since an unauthenticated hit emails every user.

## Website Builder photos

When a generated website needs a real photo (a room, food, a product, a
team) and no reference image was uploaded for it, Website Builder emits a
placeholder marker that a post-processing step (`src/lib/website-image-resolver.ts`)
resolves to an actual, working photo URL — never a broken or invented link.

- **With `UNSPLASH_ACCESS_KEY` set** — resolves to a real Unsplash photo
  matched to what the site actually needs (e.g. "modern hotel room
  interior"), via Unsplash's Search API. See `.env.local.example` for
  step-by-step instructions on getting a free key from
  [unsplash.com/developers](https://unsplash.com/developers).
- **Without it** — the placeholder is removed and the site ships with
  fewer photos. It used to fall back to [picsum.photos](https://picsum.photos)
  — a live URL, but a photo of something else entirely, presented as the
  business. Fewer relevant images beat more random ones.

Every photo that does appear is a real, legal, functioning image — this
app never scrapes Google Images and never uses a photo it has no licence
for.

**Unsplash's three API guidelines are requirements, not suggestions**, and
they are what a production application (50 -> 5,000 requests/hour) is
granted on. All three are enforced in code:

1. **Hotlinking** — photos load from `images.unsplash.com` and are never
   copied into our storage. This is an obligation, so do not "optimise" it
   by caching the bytes or routing them through `next/image`.
2. **Registering the use** — every photo that reaches a stored page gets a
   request to its `links.download_location`
   (`registerUnsplashUses`, `src/lib/website-image-resolver.ts`). It fires
   after the document is saved, so a rejected edit or a flagged generation
   never counts as a use.
3. **Attribution** — every photo carries "Photo by *name* on Unsplash"
   with `utm_source=ionexa&utm_medium=referral` on both links, rebuilt
   from the photographer carried on the `<img>` itself every time a
   document is stored, so an AI edit cannot quietly drop it.

`node scripts/unsplash-attribution-proof.mjs` renders all three in a real
browser under the published-site CSP; with `UNSPLASH_ACCESS_KEY` set it
uses the live API and its screenshots are what the application is made
with.

## Billing

Subscriptions run through [Stripe](https://stripe.com) Checkout + the
Billing Portal — no card data ever touches this app's servers.

- **Plans** (`src/lib/billing/plans.ts`) — Free, Starter (€20), Growth
  (€50), Professional (€100), Ultimate (€200), Enterprise (custom, Contact
  Sales only), shown on `/pricing`. All pricing is EUR
  (`CURRENCY_SYMBOL`) — every Stripe Product backing this app was created
  in EUR. Each plan carries a `capabilities` object (max AI agents,
  Website/Automation Builder, Mobile/SaaS Builder, image/video generation,
  AI Memory, team collaboration) enforced server-side wherever the
  corresponding page or action exists, and a `monthlyCredits` allotment —
  see **Credits** below. Professional, Ultimate, and Enterprise also offer
  a €20/month **team seat** add-on (`TEAM_SEAT_PRICE`) with an adjustable
  quantity (starts at 0 in Checkout, changed later from the Billing
  Portal). Checkout has `allow_promotion_codes: true`, so Stripe's hosted
  page shows an "Add promotion code" field — coupons are created and
  managed entirely in the Stripe Dashboard, no app code involved.
- **Stripe setup** — create 4 recurring Prices in the Stripe Dashboard (one
  per self-serve paid plan — Enterprise has none, it's Contact Sales only),
  plus one shared "Team seat" price, plus 4 one-time Prices for the credit
  packs (see **Credits** below), and set their IDs as `STRIPE_PRICE_STARTER`
  / `STRIPE_PRICE_GROWTH` / `STRIPE_PRICE_PROFESSIONAL` /
  `STRIPE_PRICE_ULTIMATE` / `STRIPE_PRICE_TEAM_SEAT` /
  `STRIPE_PRICE_CREDITS_10` / `STRIPE_PRICE_CREDITS_25` /
  `STRIPE_PRICE_CREDITS_50` / `STRIPE_PRICE_CREDITS_100`. Then add a
  webhook endpoint pointed at `<your-domain>/api/webhooks/stripe`
  subscribed to `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`, and
  `invoice.paid`, and set its signing secret as `STRIPE_WEBHOOK_SECRET`.
- **Flow** — `/pricing`'s paid-plan buttons POST to `/api/checkout`, which
  creates (or reuses) a Stripe Customer for the logged-in user and a
  subscription-mode Checkout Session, then the browser is redirected to
  the session's own `url`. `/api/webhooks/stripe` re-derives the user's
  `subscription_tier` and `seat_count` from the live subscription on every
  relevant event and writes them to that user's `auth.users.raw_user_meta_data`
  via the service-role client — nothing else in the app reads Stripe
  directly.
- **Team seats** (`/dashboard/team`, owners on Professional/Ultimate/
  Enterprise only — the `teamCollaboration` capability) — invites live in
  the `team_members` table; inviting someone sends them an email (via
  Resend) and creates an `invited` row. When that email address next logs
  in, `dashboard/layout.tsx` calls `acceptPendingTeamInvite`, which — if
  the owner still has team collaboration — marks the invite `active` and
  copies the owner's `subscription_tier` onto the new member's own
  `user_metadata`.
- **Settings** (`/dashboard/settings`) shows the current plan/seat count,
  a "Manage Billing" button that opens a Stripe Billing Portal session
  (`/api/billing-portal`) for anyone with a `stripe_customer_id` already
  on file, a "Buy Credits" section, the add-ons panel, the usage-overage
  opt-in, and the last 20 credit transactions.

### Add-ons

Four optional purchases sit alongside the plan
(`src/lib/billing/addons.ts`): **+1,000 credits** (EUR15, one-off),
**+5 agents** (EUR10/month), **+10 GB storage** (EUR5/month) and
**priority execution** (EUR20/month, not stackable). Each needs its own
Stripe price ID:

| Env var | Add-on | Default | Without it |
| --- | --- | --- | --- |
| `STRIPE_PRICE_ADDON_CREDITS_1000` | +1,000 credits | unset | The add-on is listed as unavailable and the buy button is disabled; the panel names the missing variable. Nothing else is affected. |
| `STRIPE_PRICE_ADDON_AGENTS_5` | +5 agents | unset | Same — and every agent cap stays at the plan's own number. |
| `STRIPE_PRICE_ADDON_STORAGE_10GB` | +10 GB storage | unset | Same. |
| `STRIPE_PRICE_ADDON_PRIORITY` | Priority execution | unset | Same. |

All four are **optional**. An unset variable never 500s a checkout: the
route refuses with `not_configured` and names the variable, because a buy
button that reaches Stripe with an undefined price reads to a customer as
"this product is broken" rather than "this is not set up".

Agent caps are read through `maxAgentsForAccount()`, which is the plan cap
plus whatever `agents_5` add-ons the account holds — no creator route
reads `maxAgentsForPlan()` directly any more.

### Usage overage (opt-in)

When an action needs more credits than the balance holds,
`reserveCredits()` — the one function every paid action already goes
through — asks `decideOverage()` whether the shortfall may be bought at
EUR0.03/credit. It says no unless **all** of the following are true, and
the default with no settings row is no:

- the account has explicitly turned overage on in Settings,
- under the **current** `OVERAGE_CONSENT_VERSION` (a change to the terms
  invalidates old consent and the user is asked again),
- with a monthly cap **they typed themselves** (there is no default cap),
- and this whole shortfall fits under that cap — an action that would
  cross it is refused whole, never part-charged.

The price is snapshotted at consent, so a list-price rise never applies to
standing consent. Warnings go out at **80%** and **100%** of the cap
through the one notification path, once each per calendar month. Each
month's overage becomes **one separate line on the next Stripe invoice**
("Usage overage — N extra credits"), created by the daily cron once the
month has closed and keyed for idempotency on customer plus month.
Turning it off is one click and deletes the settings row; the ledger is
never touched, because deleting it would be deleting an invoice.

No new environment variable is required — EUR0.03/credit, the EUR1
minimum cap and the EUR10,000 maximum are constants in
`src/lib/billing/overage.ts`.

## Credits

Every AI action spends credits from `user_credits.credits_remaining`
(`src/lib/billing/credits.ts`) instead of a flat rate limit — 1 credit per
Create Anything request or Ionexa Chat message, 40 for an AI agent, 50 for
an automation, 100 for a website, 300 for an app. An action is blocked
with "Not enough credits..." if the balance is too low; every
grant/spend/purchase is logged to `credit_transactions` (run
`supabase_credits_schema.sql` once, after `supabase_schema.sql`, to create
both tables — additive only, RLS grants users read-only access to their
own rows, every write goes through the service-role client).

- **Monthly allotment** — set at signup (`api/signup`) for Free, and
  re-synced by `/api/webhooks/stripe` on `checkout.session.completed`,
  `customer.subscription.updated/deleted`, and `invoice.paid` (the event
  that actually fires on a normal monthly renewal). `/api/cron/reset-credits`
  is a placeholder, not yet wired to a scheduler (same pattern as
  `/api/weekly-digest`) — point a monthly Vercel Cron/GitHub Action at it,
  with `CRON_SECRET` set, as a safety net for accounts whose credits
  didn't get reset by a Stripe event that cycle (Free accounts never touch
  Stripe at all).
- **Buying more credits** — Settings → Buy Credits sells 4 one-time packs
  (€10=500, €25=1500, €50=3500, €100=8000 credits) via `/api/credits/checkout`
  (Stripe Checkout, `mode: "payment"`, not a subscription); credits are
  granted on `checkout.session.completed` for that payment-mode session,
  from the session's own metadata.
- **Live display** — `CreditsProvider` (`components/credits/credits-context.tsx`)
  seeds the top-nav balance from a server-fetched value in
  `dashboard/layout.tsx`, then every credit-spending action calls
  `refresh()` afterward so the number updates without a page reload.

## Admin access

`src/lib/admin.ts` defines an `ADMIN_EMAILS` allowlist (the founder account
is hardcoded there; extend it via the `ADMIN_EMAILS` env var). Any signed-in
user whose email is on that list is treated as Enterprise tier with
unlimited credits and full plan capabilities everywhere the app would
otherwise check `subscription_tier` or a credit balance — no real Stripe
subscription required. This is resolved server-side per request from the
caller's own session; it's never bundled into client JavaScript and never
shown to, or inferable by, any other user. The only visible trace is a
"Owner Access" badge on `/dashboard/settings`, shown only to the admin
account itself in place of the normal billing button.

## Beta testers

A separate, independent system from [Admin access](#admin-access) above —
the two never overlap and one can be reconfigured without touching the
other. Set `BETA_INVITE_CODE` to any string; entering that exact code
(case-sensitive) in the optional "Invite code" field at signup grants the
new account full Ultimate-tier access (`subscription_tier: "ultimate"`,
`is_beta_tester: true` in `user_metadata`, 25,000 credits granted, and —
same mechanism as admin — every credit deduction in `api/chat`,
`api/create`, `api/modules/create`, and `api/text-actions` skipped
entirely) with no Stripe subscription. Leaving the field blank, or typing
the wrong code, never blocks signup — the account is just created on the
normal Free plan, same as today.

If `BETA_INVITE_CODE` is unset, the field still appears but can never grant
anything (every signup falls through to Free) — safe to deploy without
configuring it.

Visible traces: a "Beta Tester" badge on `/dashboard/settings` (in place of
the "Upgrade Plan"/billing-portal button, alongside a working "Manage
Team" link since Ultimate includes team seats), and — starting 3 days
after the account's `created_at` — a small dismissible banner on Home
thanking them and linking to `BETA_FEEDBACK_URL` (falls back to a
`mailto:` placeholder if unset).

## Project structure

```
src/
  app/
    page.tsx                       # public landing page ("/")
    pricing/page.tsx                # 5-tier pricing + promo-code-enabled checkout
    roadmap/page.tsx                # public, non-interactive product roadmap
    terms/, privacy/                # legal pages
    login/                          # email+password login/signup (shared form)
    forgot-password/, reset-password/
    dashboard/
      layout.tsx                    # auth guard + sidebar shell (wraps every route)
      loading.tsx, error.tsx        # shared loading/error states
      page.tsx                      # Ideas module (hand-built)
      [module]/page.tsx             # the other 12 modules, driven by lib/modules.ts
      create/page.tsx               # Create Anything
      chat/page.tsx                 # Ionexa Chat
      overview/page.tsx             # Overview — default post-login landing
      settings/page.tsx             # account, billing summary, data export
      team/page.tsx                 # team seat management (paid plans only)
    api/
      create/route.ts               # server-only: Claude classifier → module table
      chat/route.ts                 # server-only: Claude streaming chat (NDJSON)
      signup/route.ts               # signup + auto-confirm + auto sign-in + welcome email
      checkout/, billing-portal/, webhooks/stripe/   # Stripe integration
      team/invite/route.ts          # team invite + email
      weekly-digest/route.ts        # placeholder, not yet scheduled — see Email above
    layout.tsx, globals.css
  components/
    logo.tsx                        # Ionexa AI wordmark + icon-only mark (SVG)
    dashboard/                      # sidebar, top nav, page header, keyboard shortcuts
    modules/, ideas/                # generic + hand-built module list/form/row components
    create/                         # Create Anything chat UI
    chat/                           # Ionexa Chat workspace, conversation sidebar, markdown rendering
    overview/                       # Overview cards/stats
    settings/                       # billing summary, export, danger zone, password change
    team/                           # invite form + member list
    billing/                        # subscribe + manage-billing buttons
    toast/                          # toast state/provider, used on every mutation
  lib/
    modules.ts                      # per-module table/field config + nav items
    classifier-modules.ts           # all 13 modules' fields, for /api/create's system prompt
    admin.ts                        # ADMIN_EMAILS allowlist — see Admin access above
    billing/                        # plan metadata + Stripe price-id lookup
    team/                           # pending-invite auto-accept logic
    email/                          # Resend client + welcome/digest/invite templates
    supabase/                       # browser, server, and service-role clients
    csv.ts, format-time.ts, use-sort-and-paginate.ts   # shared list utilities
  middleware.ts                     # session refresh + route protection
  types/
tests/
  smoke.spec.ts                     # Playwright smoke suite — see Testing above
supabase_schema.sql
```

## Deploy

Any Next.js host works (e.g. [Vercel](https://vercel.com/new)). Set the same
environment variables listed above in your hosting provider's dashboard,
and make sure `supabase_schema.sql` has been run against the Supabase
project you point it at.
