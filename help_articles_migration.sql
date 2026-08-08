-- ============================================================================
-- Help articles + support escalations.
--
-- Standalone, additive, idempotent.
--
-- WHAT THIS TABLE IS FOR: it is the ONLY prose the support assistant is
-- allowed to answer from. Anything not in here (or in the generated price
-- sheet — see lib/support/facts.ts) cannot be stated, because
-- lib/support/grounding.ts checks the answer against exactly this material
-- and discards anything it does not contain.
--
-- So the quality bar for a row here is not "is this nice copy". It is: is
-- every sentence true of the shipped product today. A wrong article is a
-- wrong answer given confidently to a paying customer.
--
-- PRICES ARE DELIBERATELY ABSENT FROM THE SEED ROWS BELOW. They are
-- generated from lib/billing/plans.ts on every request instead, so a price
-- change in the checkout is a price change in support in the same commit.
-- An article that hardcoded "€20/month" would be a second copy of the
-- truth with nothing keeping it honest.
-- ============================================================================

create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  -- Plain text, not markdown or HTML. This is model input and it is also
  -- what the grounding check searches; formatting would only add tokens
  -- and false non-matches.
  body text not null,
  category text not null default 'general',
  -- Retrieval is keyword-based (see lib/support/retrieve.ts). No vector
  -- extension is assumed: this corpus is dozens of articles, not
  -- millions, and a keyword match over a few dozen rows is both adequate
  -- and explainable — you can see WHY an article was chosen.
  keywords text[] not null default '{}',
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists help_articles_published_idx
  on public.help_articles (is_published) where is_published;

alter table public.help_articles enable row level security;

-- Published help is public by design: someone deciding whether to sign up
-- has the most need of it, and they have no session.
drop policy if exists "read_published_help_articles" on public.help_articles;
create policy "read_published_help_articles" on public.help_articles
  for select using (is_published);

-- No insert/update/delete policy. Articles are the assistant's entire
-- source of truth; a table any logged-in account could write to would be
-- a way to make the support bot say anything at all to other customers.

-- ----------------------------------------------------------------------------
-- support_escalations — the questions the assistant refused to guess at.
--
-- Every row here is a case where the widget said "I don't know" and the
-- person asked for a human. That makes this table two things at once: a
-- work queue, and the list of help articles that need writing.
-- ----------------------------------------------------------------------------
create table if not exists public.support_escalations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  -- Kept even when the account is later deleted (user_id goes null), because
  -- an unanswered support question is not the user's data to erase — it is
  -- correspondence addressed to us. The address is needed to reply.
  email text not null,
  question text not null,
  -- Why the assistant did not answer: no_answer, ungrounded_number,
  -- ungrounded_claim, empty, or user_asked. Recorded because
  -- "ungrounded_number" repeated across many rows means the price sheet is
  -- missing something, which is a different fix from writing an article.
  reason text not null default 'no_answer',
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists support_escalations_status_idx
  on public.support_escalations (status, created_at desc);
create index if not exists support_escalations_user_idx
  on public.support_escalations (user_id, created_at desc);

alter table public.support_escalations enable row level security;

-- The user can read what they sent. Only the service-role client writes:
-- the escalation row is created by the API route that also sends the
-- email, so a row without an email attempt behind it cannot exist.
drop policy if exists "select_own_support_escalations" on public.support_escalations;
create policy "select_own_support_escalations" on public.support_escalations
  for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- The seed corpus.
--
-- Every statement below was checked against the code that implements it:
--   credits          -> lib/billing/credits.ts, lib/billing/credit-formula.ts
--   agents           -> lib/agents/*, api/cron/agent-runs
--   website builder  -> lib/website-builder.ts, app/s/[subdomain]
--   integrations     -> lib/integrations/*, integration_consent_migration.sql
--   data + deletion  -> api/delete-account/*, SECURITY.md
--   team             -> api/team/*
--
-- on conflict updates the body so re-running the migration republishes the
-- corrected text rather than silently keeping an old copy.
-- ----------------------------------------------------------------------------
insert into public.help_articles (slug, title, body, category, keywords) values

('what-is-ionexa', 'What Ionexa AI does',
'Ionexa AI is a web app where you describe what you want in plain words and it gets built or done. You can ask it to write and publish a website, turn a goal into a plan you can actually work through, build an agent that runs on a schedule and emails you the result, research your own uploaded files, or just keep track of your business across ideas, finance, sales, trading, research and the rest. It runs on Anthropic Claude models. There is no phone or desktop application: you use it in a browser.',
'basics', array['what is','about','product','overview','ionexa','do']),

('credits-explained', 'How credits work',
'Every AI action costs credits: a chat reply, a generated website, an agent run, a research report. Your plan includes a monthly allowance that resets each month; unused monthly credits do not carry over. You can also buy one-off credit packs that sit on top of the allowance. Before an expensive action you are shown an estimate, and after it you are shown what it actually cost — the charge is measured from the real tokens used, not from a flat price list. Credit history is in Settings.',
'billing', array['credit','credits','cost','charge','usage','allowance','how much']),

('billing-and-plans', 'Plans, upgrading and cancelling',
'You choose a plan when you sign up and can change it at any time from Settings, under Billing. Billing runs through Stripe; the "Manage billing" button opens Stripe''s own portal, where you can change your card, see invoices, or cancel. Cancelling leaves you on your paid plan until the end of the period you already paid for, then drops you to Free. Upgrading takes effect immediately and Stripe prorates the difference.',
'billing', array['plan','plans','upgrade','downgrade','cancel','subscription','invoice','stripe','billing','pay']),

('website-builder', 'Building and publishing a website',
'Describe the site you want in the Website Builder and Ionexa writes a complete single-page website — one HTML document, styling included. You can preview it, ask for changes in plain words, download the HTML, or publish it. Publishing puts it on the web at an address of the form /s/your-name, which you can share with anyone. Every generated page is scanned before it can be published, and a page that fails the scan is held back with the reason shown. Each edit is kept as a version, so you can roll back.',
'features', array['website','site','web page','landing page','publish','builder','html','domain']),

('agents', 'Agents that run on a schedule',
'An agent is an instruction plus a schedule. You describe what you want it to do and when, and it runs on its own and delivers the result to your email or to a Slack channel. Agents are on paid plans, and each plan allows a certain number of them. An agent that fails repeatedly switches itself off and emails you to say so, rather than failing silently. You can pause, edit or delete an agent at any time, and every past run is listed with what it cost.',
'features', array['agent','agents','schedule','scheduled','automation','cron','every morning','daily','recurring']),

('missions', 'Turning a goal into steps',
'Mission Control takes a goal in plain words and breaks it into steps. Each step says what you will have once it is done and roughly how long it takes. You can build a step with AI, tick it off yourself, or schedule it for a specific day. When every step is done, a reviewer pass reads the whole mission back to you. Nothing runs on its own: each step happens when you ask for it.',
'features', array['mission','goal','plan','steps','planner','project','mission control']),

('integrations-privacy', 'Connecting Gmail, Drive and Slack',
'You can connect Gmail, Google Drive and Slack so the AI can work with what is already there. Gmail and Drive are read-only. Slack can also post, because that is how an agent delivers into a channel. Before any connection you are shown exactly what will be read and why, and you have to agree — that agreement is recorded with the date and the exact wording, and you can see it and take it back at any time in Settings. Access tokens are encrypted with a key that is not stored in the database. Disconnecting revokes the access at the provider and deletes everything held for it, including the record of what was read.',
'privacy', array['gmail','google drive','slack','integration','connect','oauth','permission','consent','read my email']),

('your-data', 'What happens to your data',
'Your workspace data is yours. Every table is row-level-secured so one account cannot read another''s. You can export everything you have entered as a file from Settings at any time. Deleting your account is a two-step action with an emailed confirmation, and it removes your rows, your files, your integrations and your account itself. Content you write is sent to Anthropic to produce AI responses; it is not used to train models.',
'privacy', array['data','privacy','gdpr','export','delete','delete account','security','who can see']),

('teams', 'Working with other people',
'Team collaboration is available on the higher plans. You invite someone by email from the Team page; they get a link, create their own account and join your workspace. Some plans include a number of seats and charge for extra ones. Removing a member takes their access away immediately.',
'features', array['team','teams','invite','seat','seats','colleague','member','collaboration','share']),

('files-and-research', 'Uploading files and asking about them',
'You can upload documents into the File Workspace and then ask questions across them — the answer cites which files it came from. Deep Research goes further: it works through a question over several rounds and returns a report with its sources. Both cost credits based on how much text is actually processed.',
'features', array['file','files','upload','pdf','document','research','deep research','ask my files']),

('getting-started', 'Getting started',
'Sign up, pick a plan (Free works with no card), and you land in a short onboarding that asks what you are working on. The fastest first thing to try is Create Anything: type what you want in one sentence and let it decide where it belongs. After that, the Website Builder and Mission Control are the two features people find most useful first.',
'basics', array['start','getting started','begin','first','new','signup','sign up','onboarding','how do i']),

('languages', 'Languages',
'The interface is available in English, Greek, Spanish, French, German, Italian, Portuguese, Chinese, Japanese and Arabic. You change it from the globe icon at the top of any page. The AI replies in the language you write to it in.',
'basics', array['language','languages','greek','english','translate','locale'])

on conflict (slug) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  keywords = excluded.keywords,
  is_published = true,
  updated_at = now();
