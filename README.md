# Veron AI

**Veron AI** is "one platform, every AI capability" — a personal operating
system for running a startup. It combines 13 structured business modules,
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
(sidebar collapses to a hamburger overlay on small screens, 44px minimum
touch targets) and works identically on mobile and desktop.

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
- **Veron Chat** (`/dashboard/chat`) — a separate, general-purpose AI
  assistant (not tied to any module) with real token-by-token streaming,
  markdown-rendered replies, and a conversation sidebar (pin, rename,
  delete, grouped by recency). Backed by `/api/chat`.
- **Settings** (`/dashboard/settings`) — account email, password change,
  current plan + billing management, and a full-data JSON export.
- **Team** (`/dashboard/team`) — plan owners on a paid tier can invite
  teammates by email; invited members get full access at the owner's plan
  for a flat $20/month/seat.
- **Pricing** (`/pricing`) — five tiers (Free, Starter, Growth,
  Professional, Ultimate), each with a monthly AI-request allowance and a
  team-seat add-on. Checkout supports Stripe promotion codes.
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
   RESEND_FROM_EMAIL="Veron AI <onboarding@resend.dev>"
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   STRIPE_SECRET_KEY=your-stripe-secret-key
   STRIPE_WEBHOOK_SECRET=your-stripe-webhook-signing-secret
   STRIPE_PRICE_STARTER=price_...
   STRIPE_PRICE_GROWTH=price_...
   STRIPE_PRICE_PROFESSIONAL=price_...
   STRIPE_PRICE_ULTIMATE=price_...
   STRIPE_PRICE_TEAM_SEAT=price_...
   ADMIN_EMAILS=owner@example.com,cofounder@example.com
   ```

   `.env.local` is gitignored — never commit real credentials.
   `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, the
   `STRIPE_*` vars, and `ADMIN_EMAILS` have no `NEXT_PUBLIC_` prefix on
   purpose — they're only read server-side and are never sent to the
   browser. `RESEND_FROM_EMAIL` is optional — it falls back to Resend's
   shared sandbox address, which only delivers to the email on your own
   Resend account, so set it to a verified sending address before real
   users sign up. `ADMIN_EMAILS` is optional and additive to the founder
   account already hardcoded in `src/lib/admin.ts` — see
   [Admin access](#admin-access) below. See [Billing](#billing) below for
   how the Stripe vars are used and how to create the five Price IDs.

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

## Billing

Subscriptions run through [Stripe](https://stripe.com) Checkout + the
Billing Portal — no card data ever touches this app's servers.

- **Plans** (`src/lib/billing/plans.ts`) — Free, Starter ($20), Growth
  ($50), Professional ($100), Ultimate ($200), shown on `/pricing`. Every
  paid plan also offers a $20/month **team seat** add-on with an
  adjustable quantity (starts at 0 in Checkout, changed later from the
  Billing Portal). Checkout has `allow_promotion_codes: true`, so Stripe's
  hosted page shows an "Add promotion code" field — coupons are created and
  managed entirely in the Stripe Dashboard, no app code involved.
- **Stripe setup** — create 5 recurring Prices in the Stripe Dashboard (one
  per paid plan, plus one shared "Team seat" price used by every plan) and
  set their IDs as `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_GROWTH` /
  `STRIPE_PRICE_PROFESSIONAL` / `STRIPE_PRICE_ULTIMATE` /
  `STRIPE_PRICE_TEAM_SEAT`. Then add a webhook endpoint pointed at
  `<your-domain>/api/webhooks/stripe` subscribed to
  `checkout.session.completed`, `customer.subscription.updated`, and
  `customer.subscription.deleted`, and set its signing secret as
  `STRIPE_WEBHOOK_SECRET`.
- **Flow** — `/pricing`'s paid-plan buttons POST to `/api/checkout`, which
  creates (or reuses) a Stripe Customer for the logged-in user and a
  subscription-mode Checkout Session, then the browser is redirected to
  the session's own `url`. `/api/webhooks/stripe` re-derives the user's
  `subscription_tier` and `seat_count` from the live subscription on every
  relevant event and writes them to that user's `auth.users.raw_user_meta_data`
  via the service-role client — nothing else in the app reads Stripe
  directly.
- **Team seats** (`/dashboard/team`, owners on a paid plan only) — invites
  live in the `team_members` table; inviting someone sends them an email
  (via Resend) and creates an `invited` row. When that email address next
  logs in, `dashboard/layout.tsx` calls `acceptPendingTeamInvite`, which —
  if the owner is still on a paid plan — marks the invite `active` and
  copies the owner's `subscription_tier` onto the new member's own
  `user_metadata`.
- **Settings** (`/dashboard/settings`) shows the current plan/seat count
  and a "Manage Billing" button that opens a Stripe Billing Portal session
  (`/api/billing-portal`) for anyone with a `stripe_customer_id` already
  on file.

## Admin access

`src/lib/admin.ts` defines an `ADMIN_EMAILS` allowlist (the founder account
is hardcoded there; extend it via the `ADMIN_EMAILS` env var). Any signed-in
user whose email is on that list is treated as Ultimate tier with unlimited
AI requests everywhere the app would otherwise check `subscription_tier` or
enforce the hourly rate limit — no real Stripe subscription required. This
is resolved server-side per request from the caller's own session; it's
never bundled into client JavaScript and never shown to, or inferable by,
any other user. The only visible trace is a "Owner Access" badge on
`/dashboard/settings`, shown only to the admin account itself in place of
the normal billing button.

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
      chat/page.tsx                 # Veron Chat
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
    logo.tsx                        # Veron AI wordmark + icon-only mark (SVG)
    dashboard/                      # sidebar, top nav, page header, keyboard shortcuts
    modules/, ideas/                # generic + hand-built module list/form/row components
    create/                         # Create Anything chat UI
    chat/                           # Veron Chat workspace, conversation sidebar, markdown rendering
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
