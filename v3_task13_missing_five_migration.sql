-- ============================================================================
-- V3 — Task 13: the five missing pieces.
--
-- Standalone, additive, idempotent. Safe to run on a project that already
-- has supabase_full_project_backup.sql and the earlier V3 migrations
-- applied.
--
-- Five features, six tables:
--   1. Changelog        — product_updates (content), product_update_views
--                         (who has seen what, which is what the bell badge
--                         counts down from).
--   2. Help Center      — help_articles.
--   3. Lifecycle emails — lifecycle_email_log (one row per user per email,
--                         which is what makes every send idempotent).
--   5. Feature requests — feature_requests + feature_request_votes, with
--                         the denormalised vote count kept by trigger so
--                         the public roadmap never counts at read time.
--   (4, micro-celebrations, is pure client wiring — no schema.)
--
-- WRITE PATHS, stated once: product_updates and help_articles are
-- AUTHORED content — there are deliberately NO insert/update policies for
-- users; the service role (owner tooling, SQL editor) is the only writer.
-- feature_requests are user content: insert-own only, status changes are
-- service-role only, and nothing is user-deletable — a request other
-- people voted for is not one person's to erase.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1a. product_updates — the changelog's content.
-- ---------------------------------------------------------------------------
create table if not exists public.product_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  -- 'feature' gets the in-app modal treatment, 'improvement' and 'fix'
  -- the banner/list treatment. Checked, so a typo cannot invent a kind.
  type text not null default 'improvement'
    check (type in ('feature', 'improvement', 'fix')),
  -- NULL = draft. The visibility policies below key off this, so a draft
  -- is invisible everywhere without any application code remembering to
  -- filter it.
  published_at timestamptz,
  -- Empty array = everyone. Otherwise plan slugs ('free', 'starter', ...)
  -- this update is relevant to; filtering happens server-side against the
  -- viewer's resolved plan.
  target_plans text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.product_updates enable row level security;

-- Published entries are public — /changelog is a public page.
drop policy if exists "select_published_product_updates" on public.product_updates;
create policy "select_published_product_updates" on public.product_updates
  for select using (published_at is not null and published_at <= now());

-- ---------------------------------------------------------------------------
-- 1b. product_update_views — who has seen what.
-- ---------------------------------------------------------------------------
create table if not exists public.product_update_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  update_id uuid not null references public.product_updates(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, update_id)
);

alter table public.product_update_views enable row level security;

drop policy if exists "select_own_product_update_views" on public.product_update_views;
create policy "select_own_product_update_views" on public.product_update_views
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_product_update_views" on public.product_update_views;
create policy "insert_own_product_update_views" on public.product_update_views
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. help_articles — the knowledge base.
-- ---------------------------------------------------------------------------
create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  -- Markdown. Rendered by the /help pages and read as plain text by the
  -- AI Support Chat's context builder.
  content text not null,
  category text not null,
  -- "order" is an SQL keyword; sort_order is the same column the spec
  -- calls "order", named so nothing ever has to quote it.
  sort_order integer not null default 0,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.help_articles enable row level security;

drop policy if exists "select_published_help_articles" on public.help_articles;
create policy "select_published_help_articles" on public.help_articles
  for select using (published);

-- ---------------------------------------------------------------------------
-- 3. lifecycle_email_log — one row per user per lifecycle email, ever.
-- ---------------------------------------------------------------------------
-- The PRIMARY KEY is the idempotency: the cron INSERTs the row FIRST
-- (claim), then sends. A crashed run can at worst lose one email, never
-- double-send one — the same claim-before-work rule as the activation run.
create table if not exists public.lifecycle_email_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- day0 | day1 | day3 | day7 | day14 | day30 | fr_shipped:<request-id>
  email_key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, email_key)
);

alter table public.lifecycle_email_log enable row level security;

drop policy if exists "select_own_lifecycle_email_log" on public.lifecycle_email_log;
create policy "select_own_lifecycle_email_log" on public.lifecycle_email_log
  for select using (auth.uid() = user_id);
-- No user insert/update/delete — the cron (service role) is the only writer.

-- ---------------------------------------------------------------------------
-- 5a. feature_requests.
-- ---------------------------------------------------------------------------
create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'under_review'
    check (status in ('under_review', 'planned', 'in_progress', 'shipped')),
  -- Denormalised; maintained by the trigger below. Never written by the
  -- application.
  votes integer not null default 0,
  -- Set by the service role when status flips to shipped; the notify cron
  -- clears the backlog of (shipped, not yet notified) and stamps
  -- shipped_notified_at so each request notifies its voters exactly once.
  shipped_at timestamptz,
  shipped_notified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.feature_requests enable row level security;

-- The roadmap is public: everyone can read every request.
drop policy if exists "select_feature_requests" on public.feature_requests;
create policy "select_feature_requests" on public.feature_requests
  for select using (true);

drop policy if exists "insert_own_feature_requests" on public.feature_requests;
create policy "insert_own_feature_requests" on public.feature_requests
  for insert with check (auth.uid() = user_id);
-- No user update/delete: status is the owner's call (service role), and a
-- request 40 people voted for is not its author's to erase.

-- ---------------------------------------------------------------------------
-- 5b. feature_request_votes.
-- ---------------------------------------------------------------------------
create table if not exists public.feature_request_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null references public.feature_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.feature_request_votes enable row level security;

drop policy if exists "select_own_feature_request_votes" on public.feature_request_votes;
create policy "select_own_feature_request_votes" on public.feature_request_votes
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_feature_request_votes" on public.feature_request_votes;
create policy "insert_own_feature_request_votes" on public.feature_request_votes
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_feature_request_votes" on public.feature_request_votes;
create policy "delete_own_feature_request_votes" on public.feature_request_votes
  for delete using (auth.uid() = user_id);

-- The denormalised count. SECURITY DEFINER because the voter cannot
-- update feature_requests under RLS — the trigger runs as the function
-- owner. It only ever adds or subtracts one for a real vote row, so it
-- cannot be aimed at anything.
create or replace function public.bump_feature_request_votes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.feature_requests set votes = votes + 1 where id = new.request_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.feature_requests set votes = greatest(votes - 1, 0) where id = old.request_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_bump_feature_request_votes on public.feature_request_votes;
create trigger trg_bump_feature_request_votes
  after insert or delete on public.feature_request_votes
  for each row execute function public.bump_feature_request_votes();

-- ---------------------------------------------------------------------------
-- 3b. Opt-outs for the two new email types. Must land WITH the code: the
-- preferences read selects every optional column by name, so a missing
-- column breaks the email gate for every user.
-- ---------------------------------------------------------------------------
alter table public.user_email_preferences
  add column if not exists lifecycle boolean not null default true;
alter table public.user_email_preferences
  add column if not exists feature_request_shipped boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2b. Seed articles. Idempotent upsert by slug — re-running refreshes
-- content. Deliberately NO plan numbers in any article: numeric limits
-- live in the computed support corpus (lib/support/knowledge.ts) and on
-- /pricing, where they cannot go stale. An article that hardcoded "10
-- presentations" would be wrong one plan-change later.
-- ---------------------------------------------------------------------------
insert into public.help_articles (slug, title, content, category, sort_order, published) values
('your-first-minute', 'Your first minute in Ionexa', E'When you first sign in, Ionexa asks one question: **what do you want to do first?**\n\n- **Build a website** — describe it in one sentence; the AI builds a real page you can edit and publish.\n- **Set a goal** — Mission Control breaks it into steps and helps you finish each one.\n- **Organise my data** — import a spreadsheet and the AI tells you something true about your business.\n- **Just ask something** — a chat with the input ready.\n\nEvery step is skippable, and you can reach any of these from the sidebar at any time. The question only appears once per account.', 'getting-started', 1, true),
('create-anything', 'The free-text inbox (Create Anything)', E'On **Create** you can type anything in plain language — "met a lead from Acme, they want a demo", "spent 40 on ads" — and the AI files it into the right module (Leads, Finance, Ideas, and so on) automatically.\n\nYou always see where an entry landed and can move or edit it. If the AI needs a decision from you, it asks instead of guessing.', 'getting-started', 2, true),
('website-builder', 'Website Builder', E'Describe the site you want in a sentence or two, optionally add reference images (a logo, product photos, a style screenshot), and the AI generates a complete one-page website with a live preview.\n\n- **Edit**: ask for changes in plain language, or edit by hand.\n- **Publish**: put the site live on the web from the same screen.\n- **Versions**: every generation and edit is kept, so you can roll back.\n\nGeneration costs credits; the estimate is shown before you confirm. If a generation fails, the reserved credits are released back.', 'modules', 10, true),
('mission-control', 'Mission Control', E'State a goal — "launch my newsletter", "open an online store" — and the AI researches it and proposes a step-by-step plan.\n\nEach step can be built with AI ("Create with AI"), scheduled to run automatically, or ticked off by hand. When all steps are done, a reviewer pass summarises what was achieved.\n\nYou stay in control: nothing runs without you starting it or scheduling it.', 'modules', 11, true),
('import-your-data', 'Importing your data', E'Bring real data in and the AI will find real patterns in it:\n\n- **CSV upload** — exports from your broker, bank or CRM. The AI proposes a column mapping which you can adjust, and shows a preview of exactly how each row will be stored before anything is imported.\n- **Paste text** — a business plan, notes, a list; the structured parts are extracted into entries.\n\nAfter an import, the AI looks for patterns — concentrations, streaks, outliers — computed from your rows, never invented. If there is not enough data to say something true, it says so instead of padding.\n\nEuropean number and date formats are handled, and cells that look like spreadsheet formulas are neutralised for safety.', 'modules', 12, true),
('how-credits-work', 'How credits work', E'AI actions cost **credits**. Before an action runs, an estimate is shown; the actual charge is settled from what actually ran (model and tokens used), so a cheaper-than-estimated run charges less.\n\n- Your monthly allowance renews on your billing date; current numbers per plan are on the **Pricing** page.\n- If an action fails before producing anything, the reserved credits are released back to you.\n- Every charge is listed in **Settings → Credit history**, including what ran, which model, and what it cost.\n\nRunning low? You can buy credit packs in Settings, or upgrade the plan.', 'credits-billing', 20, true),
('plans-and-billing', 'Plans and billing', E'Current plans, prices and limits always live on the **Pricing** page — that page is generated from the same configuration the product enforces, so it cannot be out of date.\n\n- **Upgrade / downgrade**: Settings → Billing, changes take effect immediately.\n- **Invoices and payment method**: managed through the billing portal (Settings → Billing).\n- **Cancel**: any time; your account drops to the Free plan at the end of the period and your data stays.\n\nFor anything billing-related the assistant cannot answer, use the contact page — a person handles refunds and disputes.', 'credits-billing', 21, true),
('something-went-wrong', 'When something goes wrong', E'The short version of how failures are handled:\n\n- **A generation failed** — reserved credits are released automatically. If you were charged for something that produced nothing, contact us via the contact page with the approximate time; every action is logged.\n- **A page will not load** — reload once; if it persists, log out and back in. Still stuck? Contact page, with the URL.\n- **An import looked wrong** — nothing is imported until you confirm the preview. If you confirmed and regret it, entries can be deleted from their module.\n- **You suspect a security issue** — contact us immediately via the contact page; do not post details publicly.', 'troubleshooting', 30, true)
on conflict (slug) do update set
  title = excluded.title,
  content = excluded.content,
  category = excluded.category,
  sort_order = excluded.sort_order,
  published = excluded.published,
  updated_at = now();
