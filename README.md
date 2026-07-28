# AI OS

Next.js 14 (App Router) + Supabase MVP. Dark, amber-accented, monospace UI.

Currently implemented: email/password auth and all 13 modules, each with a
list (RLS-scoped to the logged-in user) and an add form, reachable from a
sidebar on `/dashboard`:

- **Overview** (`/dashboard/overview`) — the default landing page after
  login. A card per module showing its entry count and most recent entry
  (RLS-scoped), linking through to the module.
- **Ideas** (`/dashboard`) — hand-built, the original module.
- **Competitors, Research, Finance, Learning, Trading, Decisions, Products,
  Content, Sales, Feedback, Analytics, Automation** (`/dashboard/<slug>`) —
  driven by a shared config (`src/lib/modules.ts`) and generic list/form
  components (`src/components/modules/`), so every module gets the exact
  same list/form/RLS pattern as Ideas without 12 near-duplicate files.
- **Create Anything** (`/dashboard/create`) — a single free-text box. It
  posts to `/api/create`, a server-only route that calls the Claude API
  (`ANTHROPIC_API_KEY`, never exposed to the client) with a forced tool call
  to classify the message into one of the 13 modules and extract that
  table's fields, then inserts it via the same RLS-scoped pattern as every
  other module. If nothing matches clearly, it explains the available
  modules instead of guessing.

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
   ```

   `.env.local` is gitignored — never commit real credentials.
   `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` have no
   `NEXT_PUBLIC_` prefix on purpose — they're only read server-side (in
   `/api/create` and `/api/signup` respectively) and are never sent to the
   browser.

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

## Project structure

```
src/
  app/
    login/page.tsx           # email+password login/signup
    dashboard/
      layout.tsx               # auth guard + sidebar shell (wraps every module)
      page.tsx                 # Ideas module (hand-built)
      [module]/page.tsx        # the other 12 modules, driven by lib/modules.ts
      create/page.tsx          # Create Anything
      overview/page.tsx        # Overview — default post-login landing
    api/
      create/route.ts          # server-only: calls Claude, inserts into the right table
      signup/route.ts          # server-only: signup + auto-confirm email + auto sign-in
    layout.tsx
    globals.css
  components/
    logout-button.tsx
    dashboard/sidebar.tsx      # nav links: Overview, Create, then all 13 modules
    ideas/
      add-idea-form.tsx
      ideas-list.tsx
    modules/
      generic-add-form.tsx     # config-driven add form used by the 12 modules
      generic-list.tsx         # config-driven list used by the 12 modules
    create/create-chat.tsx     # Create Anything's input + result UI
    overview/module-summary-card.tsx  # per-module count + latest-entry card
  lib/
    modules.ts                 # per-module table/field config + nav items
    classifier-modules.ts      # all 13 modules' fields, for /api/create's system prompt
    supabase/
      client.ts                # browser client
      server.ts                 # server component / route handler client
      admin.ts                  # service-role client — server-only, used only by /api/signup
  middleware.ts                 # session refresh + route protection
  types/
    ideas.ts
    module-record.ts
supabase_schema.sql
```

## Deploy

Any Next.js host works (e.g. [Vercel](https://vercel.com/new)). Set the same
two environment variables in your hosting provider's dashboard.
