-- ============================================================================
-- THE MOAT: THE BUSINESS'S OWN NETWORK, REMEMBERED (no roadmap item asked
-- for this — it is the one new feature chosen by the 2026-11-07 market
-- round, docs/QUEUE.md "ΤΟ MOAT").
-- ============================================================================
--
-- THE EVIDENCE. Reddit-complaint analysis of ~500 posts about ChatGPT,
-- Claude and Gemini (IndieHackers, "I analyzed 500 reddit complaints about
-- AI tools", read 2026-11-07) found the #1 complaint, at 34%, is memory
-- loss between sessions ("it forgets everything every conversation"), with
-- "I have to re-explain my context every time" third at 19%. A second piece
-- (aiproductivity.ai, "The AI Tool-Hopping Problem", same date) says what
-- keeps people on one assistant instead: context, proficiency and
-- integrations they built around it — "depth beats novelty every time".
--
-- Ionexa's own principle 2 (docs/CONTEXT.md, ΑΡΧΕΣ) is already "shared
-- memory: what one tool knows about the user, every tool knows" — but
-- today that memory is free prose (chat_memory) plus one narrow structured
-- extraction, the business's name and brand colours (lib/memory/brand.ts,
-- package 6). A name and a colour do not compound: they are learned once.
--
-- THIS TABLE IS THE PART THAT COMPOUNDS. Every customer, supplier and
-- partner the owner ever mentions in Chat becomes its own row, with a
-- count of how often it has come up and the date it was first learned —
-- a visible, growing asset that is specific to THIS account's real
-- business relationships. Copying the chat UI is a week's work for any
-- competitor; copying two years of a specific taverna's supplier list is
-- not, because there is nothing to copy — it has to be re-lived,
-- conversation by conversation, on whichever product the owner is using.
-- That is the switching cost the second article describes, built
-- deliberately instead of arriving by accident.
--
-- Read by /dashboard/ai-memory (a panel, behind the switch
-- "business-contact-memory") and by src/app/api/memory/contacts/route.ts,
-- so the data a future Sales or Finances tool needs — "who is this person
-- to the business" — already exists before either tool is built.
--
-- Written only through business_contact_record(), from the same
-- extraction call chat_memory already makes after a reply (second real
-- Claude call, costs billed there — see lib/chat/memory.ts) — no new
-- model call, no new charge.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
--
-- How to undo: drop function if exists public.business_contact_record(text, text, text, text, uuid);
--              drop table if exists public.business_contacts;
-- ============================================================================

do $$
begin
  if to_regclass('public.chat_conversations') is null then
    raise exception 'public.chat_conversations is missing — run 20260803000000_baseline_schema.sql first';
  end if;
end $$;

create table if not exists public.business_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- The same fold lib/text/unicode-patterns.ts#foldForMatch produces, so
  -- "Γιώργος" and "γιωργος" are one row rather than two half-filled ones.
  name_fold text not null,
  role text not null default 'other',
  -- Free text: a phone, an email, or a short note ("προμηθευτής ξύλου"),
  -- exactly as the person said it. Never required, never structured
  -- further — a wrong guess at structure here would need its own
  -- migration every time someone's business worked differently.
  detail text,
  mention_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source_conversation_id uuid references public.chat_conversations(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.business_contacts drop constraint if exists business_contacts_role_check;
alter table public.business_contacts add constraint business_contacts_role_check
  check (role in ('customer', 'supplier', 'partner', 'other'));

alter table public.business_contacts drop constraint if exists business_contacts_name_not_blank;
alter table public.business_contacts add constraint business_contacts_name_not_blank
  check (length(btrim(name)) > 0 and length(btrim(name_fold)) > 0);

-- ONE ROW PER PERSON, the same rule chat_memory's fold index follows: the
-- business owner saying "ο Γιώργος απ' τον προμηθευτή" in March and again
-- in June is one relationship seen twice, not two.
create unique index if not exists business_contacts_user_name_fold_key
  on public.business_contacts (user_id, name_fold);

create index if not exists business_contacts_user_last_seen_idx
  on public.business_contacts (user_id, last_seen_at desc);

alter table public.business_contacts enable row level security;

-- SAME SHAPE AS chat_memory (20260803000000): select and delete are the
-- user's own row, scoped by auth.uid(); there is no update policy and no
-- client-side insert path. Every write goes through
-- business_contact_record() below, SECURITY DEFINER, which is the only
-- place the mention-count bump can happen — a counter is not a reason to
-- open an UPDATE policy to the signed-in role.
revoke all on public.business_contacts from anon, authenticated;
grant select, delete on public.business_contacts to authenticated;

drop policy if exists "select_own_business_contacts" on public.business_contacts;
create policy "select_own_business_contacts" on public.business_contacts
  for select using (auth.uid() = user_id);

drop policy if exists "delete_own_business_contacts" on public.business_contacts;
create policy "delete_own_business_contacts" on public.business_contacts
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- business_contact_record — insert, or bump the count and refresh the role
-- ----------------------------------------------------------------------------
-- The identity comes from auth.uid(), never from a parameter — a userId
-- argument here would be a write-anything primitive, the same rule
-- memory_record() and chat_memory_record() are held to.
create or replace function public.business_contact_record(
  p_name text,
  p_name_fold text,
  p_role text,
  p_detail text,
  p_conversation_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
  v_role text := coalesce(p_role, 'other');
begin
  if v_user is null then
    raise exception 'business_contact_record: no authenticated user' using errcode = '28000';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    return null;
  end if;
  if p_name_fold is null or length(btrim(p_name_fold)) = 0 then
    raise exception 'business_contact_record: a name fold is required' using errcode = '22023';
  end if;
  -- AN UNKNOWN ROLE IS COERCED TO 'other', NOT REFUSED — unlike an unknown
  -- memory surface, a role is the extractor's own guess at a word a
  -- person used in free speech, so a role this does not recognise is a
  -- fact worth keeping anyway, filed as a plain contact.
  if v_role not in ('customer', 'supplier', 'partner', 'other') then
    v_role := 'other';
  end if;

  update public.business_contacts
     set mention_count = mention_count + 1,
         last_seen_at   = now(),
         -- THE NEWEST ROLE WINS. A supplier who becomes a regular
         -- customer, or the reverse, is not a contradiction to resolve —
         -- it is the business changing, and the row should say what the
         -- person just said rather than what was true the first time.
         role           = v_role,
         -- The newest detail if one was given this time; the row keeps
         -- what it already had when this mention carried none, so a bare
         -- "ο Γιώργος ξανατηλεφώνησε" does not erase a phone number
         -- learned earlier.
         detail         = coalesce(p_detail, detail),
         source_conversation_id = coalesce(source_conversation_id, p_conversation_id)
   where user_id = v_user
     and name_fold = p_name_fold
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.business_contacts
    (user_id, name, name_fold, role, detail, source_conversation_id)
  values
    (v_user, btrim(p_name), p_name_fold, v_role, p_detail, p_conversation_id)
  -- Two extractions of the same name landing at once (two chat turns a
  -- moment apart) turn into a bump rather than a unique-index error.
  on conflict (user_id, name_fold)
  do update set mention_count = business_contacts.mention_count + 1,
                last_seen_at = now(),
                role = excluded.role,
                detail = coalesce(excluded.detail, business_contacts.detail)
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.business_contact_record(text, text, text, text, uuid) from public;
grant execute on function public.business_contact_record(text, text, text, text, uuid) to authenticated;
