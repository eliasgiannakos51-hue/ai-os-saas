-- ============================================================================
-- TWO TRACKERS BECOME TWO TOOLS (V4 #19 + #20)
-- ============================================================================
--
-- /dashboard/data-analysis and /dashboard/coding were CRUD tables. A user
-- opened "Analysis notes" and found a form with a "findings" textarea to
-- type their own findings into; "Coding notes" was a form for describing
-- code they would then write themselves. Both were honestly NAMED after
-- the rename pass — which is why the sidebar gate exists — and neither
-- did anything.
--
-- This migration is the schema for the versions that do.
--
--   DATA ANALYSIS. An uploaded CSV or Excel file, its parsed rows, the
--   column profile computed in TypeScript (never by a model), the AI's
--   reading of that profile, the charts, and the questions asked about it.
--
--   CODING. One row per operation — generate, explain, find bugs,
--   convert, write tests — with the input, the output, and which of the
--   five it was. Not a repo, not an execution, not a commit: see
--   lib/coding/operations.ts, where those four exclusions are product
--   copy rather than a comment.
--
-- THE OLD TRACKER ROWS ARE IMPORTED, NOT ORPHANED. Section 5. A user who
-- typed twenty notes into the old form does not open the new page and
-- find nothing — that is data loss even though no row was deleted.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------
-- 1. data_analyses — one uploaded dataset
-- ----------------------------------------------------------------------
create table if not exists public.data_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  title text not null,
  source_kind text not null check (source_kind in ('csv', 'xlsx')),
  file_name text not null,
  /** Which sheet, for a workbook with several. Null for CSV. */
  sheet_name text,

  row_count int not null default 0 check (row_count >= 0),
  column_count int not null default 0 check (column_count >= 0),
  /** The file had more rows than we read. Recorded so the UI can say
   *  "the first 50,000 rows" rather than implying the whole file. */
  truncated boolean not null default false,
  /** Rows whose field count did not match the header — a file where this
   *  is large was parsed with the wrong delimiter, and saying so is more
   *  use than a chart drawn from misaligned columns. */
  ragged_rows int not null default 0,

  headers jsonb not null default '[]'::jsonb,

  -- THE PARSED ROWS, STORED WHOLE.
  --
  -- The alternative was keeping the original file in Storage and
  -- re-parsing on every chart. That is less data at rest and more moving
  -- parts: a second store to keep in step with this table, a second
  -- lifetime to manage, and a parse on a request somebody is waiting for.
  -- The upload is capped at 8MB and 50,000 rows (lib/data-analysis/csv.ts),
  -- so this column is bounded by construction, and jsonb TOASTs and
  -- compresses well for exactly this shape.
  rows jsonb not null default '[]'::jsonb,

  -- What each column IS, and its statistics. Computed by
  -- lib/data-analysis/profile.ts — arithmetic, not a model's opinion.
  profile jsonb not null default '{}'::jsonb,

  -- The AI's reading of the profile above. Null until it has run, which
  -- is a real state: an upload is useful (charts, export, questions)
  -- before anything has been analysed, and without ANTHROPIC_API_KEY it
  -- is the only state there is.
  findings jsonb,
  analysed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists data_analyses_user_idx
  on public.data_analyses (user_id, created_at desc);

alter table public.data_analyses enable row level security;

drop policy if exists data_analyses_select_own on public.data_analyses;
create policy data_analyses_select_own on public.data_analyses
  for select using (auth.uid() = user_id);
drop policy if exists data_analyses_insert_own on public.data_analyses;
create policy data_analyses_insert_own on public.data_analyses
  for insert with check (auth.uid() = user_id);
drop policy if exists data_analyses_update_own on public.data_analyses;
create policy data_analyses_update_own on public.data_analyses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists data_analyses_delete_own on public.data_analyses;
create policy data_analyses_delete_own on public.data_analyses
  for delete using (auth.uid() = user_id);

-- A POLICY WITHOUT A GRANT IS A LOCKED DOOR. Postgres checks table
-- privileges before row policies, so a table with perfect RLS and no
-- GRANT answers every query with "permission denied", including the
-- owner's. This cost a whole feature two migrations ago.
grant select, insert, update, delete on public.data_analyses to authenticated;
revoke all on public.data_analyses from anon;

drop trigger if exists set_updated_at on public.data_analyses;
create trigger set_updated_at before update on public.data_analyses
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------
-- 2. data_analysis_charts — what may be drawn
-- ----------------------------------------------------------------------
-- A chart is a CLAIM about the data, so only a spec that survived
-- validateChartSpec against the real profile is stored: one that names a
-- column the file does not have renders an empty axis, and one that
-- averages a text column renders zeros. Both look like charts.
create table if not exists public.data_analysis_charts (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.data_analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  kind text not null check (kind in ('bar', 'line', 'area', 'pie', 'scatter')),
  title text not null,
  x_column text not null,
  y_column text,
  aggregation text not null check (aggregation in ('sum', 'mean', 'count', 'min', 'max')),
  -- One sentence on why this chart is worth looking at.
  reason text,
  -- 'suggested' comes from the column types alone and needs no key;
  -- 'ai' came from a model; 'user' the person built themselves. Kept
  -- apart so "what did the AI actually contribute" is answerable.
  origin text not null default 'suggested' check (origin in ('suggested', 'ai', 'user')),
  position int not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists data_analysis_charts_analysis_idx
  on public.data_analysis_charts (analysis_id, position);

alter table public.data_analysis_charts enable row level security;

drop policy if exists data_analysis_charts_select_own on public.data_analysis_charts;
create policy data_analysis_charts_select_own on public.data_analysis_charts
  for select using (auth.uid() = user_id);
drop policy if exists data_analysis_charts_insert_own on public.data_analysis_charts;
create policy data_analysis_charts_insert_own on public.data_analysis_charts
  for insert with check (auth.uid() = user_id);
drop policy if exists data_analysis_charts_delete_own on public.data_analysis_charts;
create policy data_analysis_charts_delete_own on public.data_analysis_charts
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.data_analysis_charts to authenticated;
revoke all on public.data_analysis_charts from anon;

-- ----------------------------------------------------------------------
-- 3. data_analysis_questions — asking the data something
-- ----------------------------------------------------------------------
create table if not exists public.data_analysis_questions (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.data_analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  question text not null,
  answer text,
  -- The numbers the answer was built from, computed in code before the
  -- model was asked anything. Kept so an answer can be checked against
  -- what it was actually given rather than trusted.
  evidence jsonb,
  credits_charged int not null default 0 check (credits_charged >= 0),

  created_at timestamptz not null default now()
);

create index if not exists data_analysis_questions_analysis_idx
  on public.data_analysis_questions (analysis_id, created_at desc);

alter table public.data_analysis_questions enable row level security;

drop policy if exists data_analysis_questions_select_own on public.data_analysis_questions;
create policy data_analysis_questions_select_own on public.data_analysis_questions
  for select using (auth.uid() = user_id);
drop policy if exists data_analysis_questions_delete_own on public.data_analysis_questions;
create policy data_analysis_questions_delete_own on public.data_analysis_questions
  for delete using (auth.uid() = user_id);

-- INSERT IS SERVICE-ROLE ONLY. The answer and the credits charged are
-- written by the route after the call; a user who could insert could
-- write themselves a row claiming zero credits for work that cost money,
-- or an answer in our voice that the model never produced.
grant select, delete on public.data_analysis_questions to authenticated;
revoke insert, update on public.data_analysis_questions from authenticated;
revoke all on public.data_analysis_questions from anon;

-- ----------------------------------------------------------------------
-- 4. code_sessions — one coding operation
-- ----------------------------------------------------------------------
create table if not exists public.code_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The five operations of V4, and nothing else. A repo checkout, an
  -- execution and a commit are NOT in this list because they are not in
  -- the product — see lib/coding/operations.ts.
  operation text not null check (operation in ('generate', 'explain', 'find_bugs', 'convert', 'write_tests')),

  title text not null,
  -- What the user typed: a description for `generate`, code for the
  -- other four.
  input text not null default '',
  language text,
  -- Only meaningful for `convert`.
  target_language text,

  output text,
  -- Free-text label the user chooses, for organisation. Not a foreign
  -- key: a folder the user can rename without a migration.
  folder text,

  status text not null default 'draft' check (status in ('draft', 'done', 'failed')),
  error text,
  credits_charged int not null default 0 check (credits_charged >= 0),

  -- 'note' marks a row imported from the old ai_coding_requests tracker
  -- (section 5). It has no output and never had one, and mixing it in
  -- with real runs without a marker would make the history claim the
  -- tool produced things it did not.
  source text not null default 'run' check (source in ('run', 'note')),
  -- The id of the tracker row this came from, so the import is
  -- idempotent: running the migration twice does not duplicate anybody's
  -- notes.
  imported_from uuid unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists code_sessions_user_idx
  on public.code_sessions (user_id, created_at desc);
create index if not exists code_sessions_folder_idx
  on public.code_sessions (user_id, folder)
  where folder is not null;

alter table public.code_sessions enable row level security;

drop policy if exists code_sessions_select_own on public.code_sessions;
create policy code_sessions_select_own on public.code_sessions
  for select using (auth.uid() = user_id);
drop policy if exists code_sessions_update_own on public.code_sessions;
create policy code_sessions_update_own on public.code_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists code_sessions_delete_own on public.code_sessions;
create policy code_sessions_delete_own on public.code_sessions
  for delete using (auth.uid() = user_id);

-- Same reasoning as the questions table: the row is created by the route
-- that ran the operation and knows what it cost. The user may rename it,
-- move it between folders and delete it.
grant select, update, delete on public.code_sessions to authenticated;
revoke insert on public.code_sessions from authenticated;
revoke all on public.code_sessions from anon;

drop trigger if exists set_updated_at on public.code_sessions;
create trigger set_updated_at before update on public.code_sessions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------
-- 5. THE OLD NOTES ARE CARRIED ACROSS
-- ----------------------------------------------------------------------
-- ai_coding_requests and ai_data_analysis_requests are left exactly as
-- they are — no DROP, no DELETE, and both stay in the GDPR export
-- registry. What changes is that their rows also APPEAR in the new
-- product, so a user who typed twenty notes into the old form does not
-- open the new page and find it empty.
--
-- Idempotent through `imported_from`, which is unique: run this migration
-- twice and the second run inserts nothing.
insert into public.code_sessions (user_id, operation, title, input, language, source, imported_from, status, created_at)
select
  r.user_id,
  -- A note describing code the user meant to write is closest to the
  -- `generate` operation, which is the one that takes a description.
  'generate',
  coalesce(nullif(trim(r.title), ''), 'Untitled note'),
  coalesce(r.description, ''),
  nullif(trim(coalesce(r.language, '')), ''),
  'note',
  r.id,
  'draft',
  r.created_at
from public.ai_coding_requests r
where not exists (select 1 from public.code_sessions c where c.imported_from = r.id);

-- The analysis tracker's rows have no file behind them, so they cannot
-- become a dataset — there is nothing to profile, chart or ask questions
-- about. Inventing an empty dataset per note would put rows on the new
-- page that open onto nothing. They stay where they are, readable and
-- exportable, and the new page links to them rather than absorbing them.

-- ----------------------------------------------------------------------
-- 6. Nothing here is executable by anon
-- ----------------------------------------------------------------------
-- No functions are created by this migration, so there is nothing to
-- revoke execute on. Stated rather than left to inference: the
-- schema-wide grant normalisation in the later migration would catch one
-- anyway, and a reader checking the rule should not have to grep.
