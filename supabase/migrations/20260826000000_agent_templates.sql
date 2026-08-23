-- ============================================================================
-- AGENT TEMPLATE LIBRARY
-- ============================================================================
--
-- WHY. Building an agent costs a full Sonnet tool call, and a large share
-- of what people ask for is the same handful of shapes: a daily news
-- watch, a weekly competitor check, a price monitor. Paying the builder
-- to re-derive "search the web daily for X and email me bullets" is
-- paying to rediscover something already written down.
--
-- A TEMPLATE IS A PATTERN WITH ONE HOLE IN IT: {subject}. That is not a
-- convenience, it is the anonymisation model. What is shared is the
-- sentence AROUND the specific thing; the specific thing never leaves the
-- account it came from.
--
-- WHAT IS NEVER STORED HERE, and the constraints below enforce as much of
-- it as a database can:
--   * the sharer's agent NAME or DESCRIPTION (people name an agent after
--     their own company)
--   * the delivery target
--   * the timezone (it is a location)
--   * email addresses, links, @handles, long digit runs — checked in
--     lib/agents/agent-templates.ts AND again by the constraint below,
--     because a table that only trusts its callers is a table that holds
--     whatever the next caller sends.
--
-- MATCHING IS FULL-TEXT, NOT SEMANTIC, and this file does not pretend
-- otherwise. It reuses public.search_fold (20260813) so a Greek user
-- typing "ανταγωνιστες" matches a template whose keywords say
-- "ανταγωνιστές". Embeddings drop in beside the tsvector later, exactly
-- as in 20260824's search_index.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

create extension if not exists unaccent;

-- ----------------------------------------------------------------------
-- 1. The table
-- ----------------------------------------------------------------------
create table if not exists public.agent_templates (
  id uuid primary key default gen_random_uuid(),

  -- Stable identity for the built-ins, so the adopt route names a slug
  -- rather than a uuid that changes when the seed is re-run.
  slug text not null unique,

  -- NULL for the curated built-ins, which belong to nobody and were
  -- written from nothing. Set for a user-shared one, so they can delete
  -- it and so the cascade removes it if the account goes.
  shared_by uuid references auth.users(id) on delete cascade,

  title text not null,
  description text not null default '',
  -- The task, with {subject} where the specific thing goes.
  task_pattern text not null,

  schedule_cron text not null,
  depth text not null default 'standard',
  needs_web_search boolean not null default true,
  output_format text not null default 'summary',

  -- Extra spellings the title and description do not already contain,
  -- including translations — this is what makes a Greek request match an
  -- English-titled template.
  keywords text[] not null default '{}',

  -- How many agents have been created from it. Ordering signal, and the
  -- only usage figure kept: not who, not when, not what subject.
  use_count integer not null default 0,

  created_at timestamptz not null default now(),

  -- THE SLOT IS MANDATORY. A template with no {subject} is one person's
  -- task prompt published under a general heading.
  constraint agent_templates_has_slot check (position('{subject}' in task_pattern) > 0),
  constraint agent_templates_depth_check check (depth in ('simple', 'standard', 'deep')),
  constraint agent_templates_format_check check (output_format in ('summary', 'bullets', 'report')),
  constraint agent_templates_pattern_length check (length(task_pattern) between 60 and 4000),
  constraint agent_templates_title_length check (length(title) between 3 and 60)
);

-- THE SECOND LINE OF THE ANONYMISATION RULE, in the database.
--
-- lib/agents/agent-templates.ts refuses these on the way in. This refuses
-- them at the table, so a future route, a script, or a hand-written
-- INSERT cannot publish somebody's email address by forgetting to call
-- the validator. Posix regexes, applied to the three text columns a
-- reader ever sees.
alter table public.agent_templates
  drop constraint if exists agent_templates_no_contact_details;
alter table public.agent_templates
  add constraint agent_templates_no_contact_details check (
    (title || ' ' || description || ' ' || task_pattern) !~* '[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}'
    and (title || ' ' || description || ' ' || task_pattern) !~* 'https?://'
    and (title || ' ' || description || ' ' || task_pattern) !~ '[0-9]{4,}'
  );

-- ----------------------------------------------------------------------
-- 2. Matching
-- ----------------------------------------------------------------------
-- 'simple' plus search_fold, for the reason 20260824 gives at length: the
-- library is read by users writing in ten languages, and an English
-- stemmer applied to Greek fails silently rather than loudly.
--
-- Title weighted A, keywords B, description C. A template whose TITLE is
-- "price check" should beat one that merely mentions price in passing.

-- AN IMMUTABLE array_to_string, for the reason immutable_unaccent exists
-- (20260813): the built-in is marked STABLE — it resolves the element
-- type's output function at call time — and a STABLE expression cannot be
-- used in a generated column. Pinned to text[] with a text separator,
-- whose output function genuinely is immutable, so the label is honest
-- rather than merely convenient.
create or replace function public.immutable_join(p_items text[], p_sep text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select array_to_string(coalesce(p_items, '{}'::text[]), p_sep)
$$;

alter table public.agent_templates
  add column if not exists document tsvector
  generated always as (
    setweight(to_tsvector('simple', public.search_fold(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('simple', public.search_fold(public.immutable_join(keywords, ' '))), 'B') ||
    setweight(to_tsvector('simple', public.search_fold(coalesce(description, ''))), 'C')
  ) stored;

create index if not exists agent_templates_document_idx
  on public.agent_templates using gin (document);
create index if not exists agent_templates_shared_by_idx
  on public.agent_templates (shared_by);

-- ----------------------------------------------------------------------
-- 3. Row-level security
-- ----------------------------------------------------------------------
alter table public.agent_templates enable row level security;

-- EVERY SIGNED-IN USER MAY READ EVERY TEMPLATE. That is what a library
-- is, and it is safe precisely because of what the columns above are not
-- allowed to contain.
drop policy if exists agent_templates_select_all on public.agent_templates;
create policy agent_templates_select_all
  on public.agent_templates for select
  using (auth.uid() is not null);

-- A SHARER MAY WITHDRAW THEIR OWN. Not the built-ins (shared_by is
-- null, and `auth.uid() = shared_by` is never true for null), and not
-- anybody else's.
drop policy if exists agent_templates_delete_own on public.agent_templates;
create policy agent_templates_delete_own
  on public.agent_templates for delete
  using (shared_by is not null and auth.uid() = shared_by);

-- NO INSERT AND NO UPDATE POLICY. Sharing goes through the API route,
-- which runs the validator and writes with the service role. A user who
-- could insert directly could publish a template into everybody else's
-- library with any text in it — which is exactly the thing every rule
-- above exists to prevent.

grant select, delete on public.agent_templates to authenticated;
revoke insert, update on public.agent_templates from authenticated;
revoke all on public.agent_templates from anon;

-- ----------------------------------------------------------------------
-- 4. The matching function
-- ----------------------------------------------------------------------
-- SECURITY INVOKER, so the select policy above is what scopes it. It
-- reads a table every signed-in user may read anyway, which makes the
-- choice cheap — and making it DEFINER would still be wrong, because the
-- next column added here would inherit a bypass nobody remembered.
create or replace function public.match_agent_templates(
  p_query text,
  p_limit integer default 5
)
returns table (
  slug text,
  title text,
  description text,
  task_pattern text,
  schedule_cron text,
  depth text,
  needs_web_search boolean,
  output_format text,
  use_count integer,
  rank real
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  with q as (
    select public.search_query(p_query) as tsq
  )
  select
    t.slug, t.title, t.description, t.task_pattern, t.schedule_cron,
    t.depth, t.needs_web_search, t.output_format, t.use_count,
    ts_rank(t.document, q.tsq) as rank
  from public.agent_templates t, q
  where q.tsq is not null
    and t.document @@ q.tsq
  -- use_count breaks ties, so the shape people actually adopt rises.
  order by ts_rank(t.document, q.tsq) desc, t.use_count desc, t.slug
  limit greatest(least(p_limit, 20), 1);
$$;

-- Counting an adoption. SECURITY DEFINER because no user may UPDATE this
-- table (see the policies above) and the count still has to move —
-- and it is the ONLY thing that may change on a row, which is why it is
-- a function that increments one column rather than a policy.
create or replace function public.record_template_use(p_slug text)
returns void
language sql
security definer
set search_path = public, pg_catalog
as $$
  update public.agent_templates
     set use_count = use_count + 1
   where slug = p_slug;
$$;

-- ----------------------------------------------------------------------
-- 5. The curated library
-- ----------------------------------------------------------------------
-- `on conflict (slug) do nothing`, so re-running never overwrites a
-- template whose text has since been improved in place, and never
-- resets a use_count.
insert into public.agent_templates
  (slug, title, description, task_pattern, schedule_cron, depth, needs_web_search, output_format, keywords)
values
  ('daily-news-watch', 'Daily news watch',
   'Every morning, what actually happened with one topic since yesterday.',
   'Find what has genuinely changed about {subject} in the last 24 hours. Report only real developments with a source for each: announcements, results, incidents, decisions. Leave out opinion pieces, speculation and anything already reported before yesterday. If nothing of substance happened, say so rather than filling the space.',
   '0 8 * * *', 'standard', true, 'bullets',
   array['news','daily','updates','latest','briefing','morning','νεα','ειδησεις','ημερησιο','noticias','nouvelles','nachrichten','notizie','ニュース','新闻','أخبار']),

  ('competitor-watch', 'Weekly competitor watch',
   'What a named competitor did this week — pricing, product, hiring, press.',
   'Check what {subject} has done in the past week. Look specifically for: pricing or packaging changes, new product or feature announcements, notable hires or departures, funding, and press coverage. For each, give the fact and the source. Say plainly which of those areas you found nothing on.',
   '0 9 * * 1', 'standard', true, 'report',
   array['competitor','rival','competition','market','weekly','ανταγωνιστης','ανταγωνισμος','competencia','concurrent','wettbewerber','concorrente','競合','竞争对手','منافس']),

  ('price-check', 'Daily price check',
   'One number, once a day.',
   'Find the current price of {subject} and report it as a single line with the figure, the currency, the date it is as of, and the source. If today''s figure is not published yet, say so and give the most recent one with its date. Never estimate or interpolate a price.',
   '0 9 * * *', 'simple', true, 'summary',
   array['price','cost','rate','quote','value','exchange','τιμη','κοστος','ισοτιμια','precio','prix','preis','prezzo','preço','価格','价格','سعر']),

  ('regulation-monitor', 'Regulation monitor',
   'Rule changes in one area, weekly, before they bite.',
   'Check for changes to the rules, laws or official guidance affecting {subject}. Report only changes that have actually been published or formally proposed — with the issuing body, the date, and a link. Distinguish clearly between what is in force, what is proposed, and what is merely being discussed.',
   '0 9 * * 2', 'standard', true, 'report',
   array['regulation','law','compliance','legal','rules','policy','νομοθεσια','κανονισμος','συμμορφωση','regulación','réglementation','vorschrift','normativa','規制','法规','لوائح']),

  ('market-landscape', 'Monthly market landscape',
   'The broad picture of one market, once a month.',
   'Build a picture of the current state of the {subject} market. Cover: who the significant players are and how they position themselves, what customers in this market are actually buying on, what has shifted in the last quarter, and where the market appears to be heading. Use many sources, name each one, and be explicit about anything the sources disagree on.',
   '0 9 1 * *', 'deep', true, 'report',
   array['market','landscape','industry','sector','overview','research','monthly','αγορα','κλαδος','ερευνα','mercado','marché','markt','mercato','市場','市场','سوق']),

  ('job-market-watch', 'Job market watch',
   'What is being hired for, in one field, each week.',
   'Look at what employers are currently hiring for in {subject}. Report the roles that appear most, the skills most often asked for, the salary ranges being advertised where they are stated, and anything that has visibly changed since a month ago. Cite where each observation comes from.',
   '0 9 * * 3', 'standard', true, 'bullets',
   array['jobs','hiring','recruitment','salary','roles','careers','εργασια','προσλήψεις','μισθος','empleo','emploi','stellen','lavoro','求人','招聘','وظائف']),

  ('supplier-check', 'Supplier check',
   'Is a supplier still solid? Monthly.',
   'Check the current standing of {subject} as a supplier. Look for: financial distress or insolvency filings, ownership changes, service outages or recalls, legal action, and recent customer complaints at scale. Report only what is documented, with sources. If you find nothing concerning, say that plainly — it is the useful answer.',
   '0 9 1 * *', 'standard', true, 'report',
   array['supplier','vendor','partner','risk','due diligence','προμηθευτης','ρισκο','proveedor','fournisseur','lieferant','fornitore','仕入先','供应商','مورد']),

  ('grant-funding-watch', 'Grants and funding watch',
   'Open funding a business in one field could actually apply for.',
   'Find funding, grants and subsidy schemes currently open to organisations working in {subject}. For each: who runs it, who is eligible, roughly how much, and the closing date. Exclude anything already closed or not yet open for applications. Give a link for each.',
   '0 9 * * 4', 'standard', true, 'bullets',
   array['grant','funding','subsidy','finance','programme','scheme','επιδοτηση','χρηματοδοτηση','subvención','subvention','förderung','sovvenzione','助成金','补贴','منحة']),

  ('reputation-check', 'Reputation check',
   'What is being said publicly about one name, weekly.',
   'Find what has been said publicly about {subject} in the past week — reviews, forum threads, news mentions, social posts that got traction. Summarise the themes rather than listing every mention, separate praise from complaint, and give a source for each theme. Do not speculate about anything you cannot source.',
   '0 9 * * 5', 'standard', true, 'report',
   array['reputation','reviews','mentions','sentiment','brand','feedback','φημη','κριτικες','reputación','réputation','ruf','reputazione','評判','声誉','سمعة']),

  ('release-notes-digest', 'Release notes digest',
   'What changed in a tool you depend on.',
   'Check what has been released or changed in {subject} since a week ago. Report only actual releases and changelog entries — version numbers, what changed, and anything flagged as breaking or deprecated. Ignore blog posts and marketing. Link the changelog entry for each item.',
   '0 9 * * 1', 'simple', true, 'bullets',
   array['release','changelog','version','update','software','tool','εκδοση','ενημερωση','versión','version','fassung','versione','リリース','版本','إصدار']),

  ('event-watch', 'Event watch',
   'Conferences and events worth attending in one field.',
   'Find upcoming conferences, trade shows and significant events for {subject} in the next three months. For each: the name, the dates, where it is, roughly what it costs to attend, and who it is for. Exclude anything already past and anything with no confirmed date.',
   '0 9 1 * *', 'standard', true, 'bullets',
   array['events','conference','trade show','exhibition','calendar','εκδηλωσεις','συνεδριο','eventos','événements','veranstaltungen','eventi','イベント','活动','فعاليات']),

  ('weekly-summary', 'Weekly topic summary',
   'One topic, one page, once a week — no web search.',
   'Write a clear, structured explanation of {subject} for somebody who needs to understand it well enough to make a decision. Cover what it is, why it matters, the main trade-offs, and the questions worth asking. Work from what you know; do not present anything as current news.',
   '0 9 * * 1', 'simple', false, 'report',
   array['explain','summary','learn','understand','primer','briefing','εξηγηση','περιληψη','explicar','expliquer','erklären','spiegare','説明','解释','شرح'])
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------
-- 6. Grants
-- ----------------------------------------------------------------------
-- 20260818000000_function_grants loops over pg_proc and runs BEFORE this
-- file, so these two need their own.
--
-- match_agent_templates is granted to authenticated: it is how the
-- browser finds a template, and it is SECURITY INVOKER so the select
-- policy scopes it. record_template_use is NOT — it is SECURITY DEFINER
-- and increments a counter on a table nobody may update, so only the
-- service role may call it, from the adopt route.
do $$
begin
  execute 'revoke all on function public.match_agent_templates(text, integer) from public';
  execute 'revoke all on function public.match_agent_templates(text, integer) from anon';
  execute 'grant execute on function public.match_agent_templates(text, integer) to authenticated';
  execute 'grant execute on function public.match_agent_templates(text, integer) to service_role';

  execute 'revoke all on function public.immutable_join(text[], text) from public';
  execute 'revoke all on function public.immutable_join(text[], text) from anon';
  execute 'grant execute on function public.immutable_join(text[], text) to authenticated';
  execute 'grant execute on function public.immutable_join(text[], text) to service_role';

  execute 'revoke all on function public.record_template_use(text) from public';
  execute 'revoke all on function public.record_template_use(text) from anon';
  execute 'revoke all on function public.record_template_use(text) from authenticated';
  execute 'grant execute on function public.record_template_use(text) to service_role';
end $$;
