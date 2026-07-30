# AI OS

A personal "operating system" for running a startup — 13 structured data
modules (ideas, competitors, research, finance, learning, trading,
decisions, products, content, sales, feedback, analytics, automation) plus
an AI-powered free-text inbox that files anything you throw at it into the
right module. Next.js 14 (App Router) + Supabase. Dark, amber-accented,
monospace UI.

There's a public landing page at `/`, then everything else lives behind
email/password auth on `/dashboard`. Every module gets the same feature
set: create, inline edit, delete (all RLS-scoped to the logged-in user),
live search, newest/oldest sorting with pagination, CSV export, toast
notifications on every mutation, and loading/error states.

- **Overview** (`/dashboard/overview`) — the default landing page after
  login. A header with totals across all modules (entry count, entries in
  the last 7 days, most-active module) plus a card per module showing its
  entry count and most recent entry (RLS-scoped), linking through to the
  module.
- **Ideas** (`/dashboard`) — hand-built, the original module.
- **Competitors, Research, Finance, Learning, Trading, Decisions, Products,
  Content, Sales, Feedback, Analytics, Automation** (`/dashboard/<slug>`) —
  driven by a shared config (`src/lib/modules.ts`) and generic list/form
  components (`src/components/modules/`), so every module gets the exact
  same list/form/RLS pattern as Ideas without 12 near-duplicate files.
- **Create Anything** (`/dashboard/create`) — a single free-text box,
  reachable from anywhere in the dashboard with Cmd+K / Ctrl+K. It posts to
  `/api/create`, a server-only route that calls the Claude API
  (`ANTHROPIC_API_KEY`, never exposed to the client) with a forced tool call
  to classify the message into one of the 13 modules and extract that
  table's fields, then inserts it via the same RLS-scoped pattern as every
  other module. If nothing matches clearly, it explains the available
  modules instead of guessing.
- **Settings** (`/dashboard/settings`) — shows the logged-in user's email
  and a password-change form (`auth.updateUser`).
- **Email** — a welcome email (via [Resend](https://resend.com),
  `RESEND_API_KEY`) goes out right after signup, introducing the 13
  modules. A weekly digest template and route (`/api/weekly-digest`) exist
  but aren't scheduled yet — see [Email](#email) below.

The whole app is responsive (sidebar collapses to a hamburger overlay on
small screens, 44px minimum touch targets) and works identically on mobile
and desktop.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com) (or
   use an existing one).

3. **Run the schema.** In the Supabase SQL editor, run the contents of
   [`supabase_schema.sql`](./supabase_schema.sql). It creates all 13 tables
   and enables row-level security so every table is scoped to
   `user_id = auth.uid()`. Safe to re-run: it drops and recreates the 12
   non-`ideas` tables first (they were redefined to match the dashboard
   fields), and leaves `ideas` untouched.

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
   ```

   `.env.local` is gitignored — never commit real credentials.
   `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and
   the `STRIPE_*` vars have no `NEXT_PUBLIC_` prefix on purpose — they're
   only read server-side (`ANTHROPIC_API_KEY` in `/api/create`;
   `SUPABASE_SERVICE_ROLE_KEY` in `/api/signup`, `/api/webhooks/stripe`,
   and the team-invite auto-accept check; `RESEND_API_KEY` in `/api/signup`,
   `/api/weekly-digest`, and `/api/team/invite`; the `STRIPE_*` vars in
   `/api/checkout`, `/api/billing-portal`, and `/api/webhooks/stripe`) and
   are never sent to the browser. `RESEND_FROM_EMAIL` is optional — it falls
   back to Resend's shared sandbox address, which only delivers to the
   email on your own Resend account, so set it to a verified sending
   address before real users sign up. See [Billing](#billing) below for how
   the Stripe vars are used and how to create the five Price IDs.

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
  Billing Portal).
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
  the session's own `url`. (Older Stripe.js versions had a client-side
  `redirectToCheckout()` helper for this — it's been removed from
  `@stripe/stripe-js`, so this app doesn't depend on the library or a
  publishable key at all; a plain redirect to the session URL is Stripe's
  current recommended approach.) `/api/webhooks/stripe` re-derives the
  user's `subscription_tier` and `seat_count` from the live subscription
  on every relevant event and writes them to that user's
  `auth.users.raw_user_meta_data` via the service-role client — nothing
  else in the app reads Stripe directly.
- **Team seats** (`/dashboard/team`, owners on a paid plan only) — invites
  live in the `team_members` table (see `supabase_schema.sql`); inviting
  someone sends them an email (via Resend) and creates an `invited` row.
  When that email address next logs in, `dashboard/layout.tsx` calls
  `acceptPendingTeamInvite`, which — if the owner is still on a paid
  plan — marks the invite `active` and copies the owner's
  `subscription_tier` onto the new member's own `user_metadata`. Note that
  no part of the app currently branches its *behavior* on
  `subscription_tier` (every module, and the existing hourly rate limits
  on `/api/create`/`/api/chat`, are unchanged) — this turn wires up the
  billing/records plumbing, not tier-gated features or monthly quota
  enforcement.
- **Settings** (`/dashboard/settings`) shows the current plan/seat count
  and a "Manage Billing" button that opens a Stripe Billing Portal session
  (`/api/billing-portal`) for anyone with a `stripe_customer_id` already
  on file.

## Project structure

```
src/
  app/
    page.tsx                    # public landing page ("/")
    login/page.tsx               # email+password login/signup
    dashboard/
      layout.tsx                 # auth guard + sidebar shell (wraps every module)
      loading.tsx                 # shared loading state for every dashboard route
      error.tsx                   # shared error boundary for every dashboard route
      page.tsx                    # Ideas module (hand-built)
      [module]/page.tsx          # the other 12 modules, driven by lib/modules.ts
      create/page.tsx            # Create Anything
      overview/page.tsx          # Overview — default post-login landing
      settings/page.tsx          # account email + password change
    api/
      create/route.ts            # server-only: calls Claude, inserts into the right table
      signup/route.ts            # server-only: signup + auto-confirm email + auto sign-in + welcome email
      weekly-digest/route.ts     # server-only: placeholder, not yet scheduled — see Email below
    layout.tsx
    globals.css
  components/
    logout-button.tsx
    delete-button.tsx            # shared delete-with-confirm, used by every module
    empty-state.tsx              # shared "no records" / "no matches" placeholder
    error-message.tsx            # shared inline error box with retry
    loading-state.tsx            # shared full-page loading indicator
    pagination-controls.tsx      # shared prev/next pager (20 records per page)
    sort-toggle.tsx               # shared newest/oldest sort toggle
    dashboard/
      sidebar.tsx                 # nav links: Overview, Create, all 13 modules, Settings
      sidebar-context.tsx        # mobile sidebar open/close state
      menu-button.tsx             # mobile hamburger trigger
      dashboard-header.tsx        # top bar (email + logout + mobile menu button)
      page-header.tsx              # eyebrow + title used at the top of every page
      keyboard-shortcuts.tsx      # global Cmd+K / Ctrl+K → focuses Create Anything
    toast/
      toast-context.tsx           # toast state/provider (used on every create/update/delete)
      toast-container.tsx        # renders active toasts, bottom-right
    ideas/
      add-idea-form.tsx
      ideas-list.tsx
      idea-row.tsx                # view/edit/delete for a single idea
    modules/
      generic-add-form.tsx       # config-driven add form used by the 12 modules
      generic-list.tsx            # config-driven list used by the 12 modules
      generic-record-row.tsx     # config-driven view/edit/delete row
    create/create-chat.tsx       # Create Anything's input + result UI
    overview/
      module-summary-card.tsx    # per-module count + latest-entry card
      overview-stats.tsx          # totals / last-7-days / most-active-module header
    settings/password-change-form.tsx
  lib/
    modules.ts                    # per-module table/field config + nav items
    classifier-modules.ts        # all 13 modules' fields, for /api/create's system prompt
    csv.ts                         # CSV generation + download (export.csv())
    format-time.ts                # human-readable relative timestamps ("2 days ago")
    use-sort-and-paginate.ts     # shared sort + pagination hook
    resend.ts                      # server-only Resend client factory
    email/
      templates.ts                 # welcome + weekly-digest HTML (table-based, inline styles)
      send-welcome-email.ts        # best-effort send, never blocks signup
      send-weekly-digest-email.ts  # best-effort send, used by /api/weekly-digest
    supabase/
      client.ts                   # browser client
      server.ts                    # server component / route handler client
      admin.ts                     # service-role client — server-only, used by /api/signup and /api/weekly-digest
  middleware.ts                    # session refresh + route protection
  types/
    ideas.ts
    module-record.ts
tests/
  smoke.spec.ts                       # Playwright smoke suite — see Testing above
playwright.config.ts
supabase_schema.sql
```

## Deploy

Any Next.js host works (e.g. [Vercel](https://vercel.com/new)). Set the same
environment variables listed above in your hosting provider's dashboard,
and make sure `supabase_schema.sql` has been run against the Supabase
project you point it at.
