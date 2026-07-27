# AI OS

Next.js 14 (App Router) + Supabase MVP. Dark, amber-accented, monospace UI.

Currently implemented: email/password auth and the **Ideas** module (list +
add form, RLS-scoped to the logged-in user). The other 12 modules
(competitors, research, finance_entries, learning_entries, trades, decisions,
products, content, leads, feedback, metrics, automations) share the same
schema/RLS shape and will be added incrementally.

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
   `user_id = auth.uid()`.

4. **Configure environment variables.** Copy the example file and fill in
   your project's values (Project Settings → API):

   ```bash
   cp .env.local.example .env.local
   ```

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

   `.env.local` is gitignored — never commit real credentials.

5. **Email confirmation.** By default Supabase requires email confirmation
   before a new user can log in. For local testing you can disable this
   under Authentication → Providers → Email → "Confirm email", or just
   confirm the account from your inbox.

6. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) — you'll be
   redirected to `/login`. Sign up, then you'll land on `/dashboard` with
   the Ideas module.

## Project structure

```
src/
  app/
    login/page.tsx        # email+password login/signup
    dashboard/page.tsx     # protected dashboard, Ideas module
    layout.tsx
    globals.css
  components/
    logout-button.tsx
    ideas/
      add-idea-form.tsx
      ideas-list.tsx
  lib/supabase/
    client.ts               # browser client
    server.ts                # server component / route handler client
  middleware.ts               # session refresh + route protection
  types/ideas.ts
supabase_schema.sql
```

## Deploy

Any Next.js host works (e.g. [Vercel](https://vercel.com/new)). Set the same
two environment variables in your hosting provider's dashboard.
