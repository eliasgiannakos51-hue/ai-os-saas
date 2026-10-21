-- CODING BECOMES A CONVERSATION (owner, 2026-10-18): the five-button,
-- one-shot form that wrote into code_sessions is replaced by the same
-- conversational shell Chat already has — a thread of turns, each
-- optionally carrying the full set of files the conversation holds
-- after that turn.
--
-- PURELY ADDITIVE. code_sessions (supabase/migrations/20260902000000_
-- data_analysis_and_coding.sql) is untouched by this file: every row in
-- it — real runs and the notes imported from the old tracker alike —
-- stays exactly where it is, exactly as it reads today. The new
-- /dashboard/coding reads it too, as a read-only "before this" section
-- under the new conversations, so nothing a person made with the old
-- screen stops being there («τίποτα δεν χάνεται»). This migration adds
-- two tables and touches no existing one.
--
-- SHAPED LIKE chat_conversations / chat_messages ON PURPOSE (same
-- migration, lines 348-409) — same RLS pattern, same trigger, same
-- column names where the meaning is the same. A reviewer who already
-- knows one system should not have to learn a second shape for the
-- other.
--
-- How to undo: drop both tables. Nothing else in the schema references
-- them yet (this migration is the first thing that creates them), so
-- the statements below are the whole of it and the order does not
-- matter:
--
--   drop table if exists public.code_messages;
--   drop table if exists public.code_conversations;

create table if not exists public.code_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.code_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.code_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),

  -- A USER ROW: what they typed. An ASSISTANT ROW: the prose outside any
  -- file block (file-blocks.ts's parseReply) — "" when the reply was
  -- file blocks only, with nothing said around them.
  content text not null default '',

  -- ONLY ON AN ASSISTANT ROW, AND ONLY WHEN FILES WERE WRITTEN. A
  -- PATCH, not a snapshot: exactly the files THIS turn wrote or
  -- changed — [{path, content}], the exact shape
  -- lib/coding/file-blocks.ts's ParsedFile already uses, and exactly
  -- what parseReply(text).files already is, so the row is written
  -- straight from the parsed reply with no extra merge step. A file
  -- this turn did not touch is a file absent from the array, same as
  -- it is absent from the model's own reply (coding-prompt.ts tells it
  -- to say nothing about a file it is not changing).
  --
  -- "WHAT EXISTS RIGHT NOW" is answered by folding every assistant
  -- row's `files` in this conversation, oldest first, last write per
  -- path wins — reduceFiles in api/coding/send/route.ts is the one
  -- place that does this, so the UI and a later turn's prompt can
  -- never compute it two different ways.
  files jsonb,

  status text not null default 'done' check (status in ('done', 'failed')),
  -- A REASON CODE, not a sentence — same choice api/conversations/[id]
  -- already made (see that route's own comment) and the same reason:
  -- this column is read back by a page that renders its own translated
  -- wording, and an English sentence stored here is one a Greek user
  -- reads in English forever.
  error text,

  credits_charged int not null default 0 check (credits_charged >= 0),
  created_at timestamptz not null default now()
);

create index if not exists code_conversations_user_id_updated_at_idx
  on public.code_conversations (user_id, updated_at desc);

create index if not exists code_messages_conversation_id_created_at_idx
  on public.code_messages (conversation_id, created_at);

create index if not exists code_messages_user_id_created_at_idx
  on public.code_messages (user_id, created_at);

alter table public.code_conversations enable row level security;
alter table public.code_messages enable row level security;

drop policy if exists "select_own_code_conversations" on public.code_conversations;
create policy "select_own_code_conversations" on public.code_conversations
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_code_conversations" on public.code_conversations;
create policy "insert_own_code_conversations" on public.code_conversations
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_code_conversations" on public.code_conversations;
create policy "update_own_code_conversations" on public.code_conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_code_conversations" on public.code_conversations;
create policy "delete_own_code_conversations" on public.code_conversations
  for delete using (auth.uid() = user_id);

drop policy if exists "select_own_code_messages" on public.code_messages;
create policy "select_own_code_messages" on public.code_messages
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_code_messages" on public.code_messages;
create policy "insert_own_code_messages" on public.code_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "delete_own_code_messages" on public.code_messages;
create policy "delete_own_code_messages" on public.code_messages
  for delete using (auth.uid() = user_id);

-- NO UPDATE POLICY ON MESSAGES, same as chat_messages has one it never
-- needed and code_messages does not: a turn is written once and is
-- never edited in place. (chat_messages' own update policy is for its
-- rating column, added later — 20261016000000_chat_message_rating.sql —
-- which code_messages has no equivalent of yet.)

drop trigger if exists set_updated_at on public.code_conversations;
create trigger set_updated_at before update on public.code_conversations
  for each row execute function public.set_updated_at();
