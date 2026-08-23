-- ============================================================================
-- FORMS ON PUBLISHED WEBSITES — the parts that were missing
-- ============================================================================
--
-- WHAT WAS ALREADY THERE, and works: the table, an owner-scoped SELECT
-- policy, the public submit endpoint, a honeypot, a per-website and a
-- per-IP rate limit, and a Resend email to the owner.
--
-- WHAT WAS NOT:
--
--   1. NO FOREIGN KEY ON website_id. Every other website-scoped table in
--      this schema — website_versions, published_sites, site_versions —
--      is `references public.user_websites(id) on delete cascade`. This
--      one was a bare uuid. So DELETING A SITE LEFT ITS FORM SUBMISSIONS
--      BEHIND FOREVER: rows carrying a stranger's name, email address and
--      message, belonging to a website that no longer exists, invisible
--      to every screen in the product and reachable by nothing. That is
--      the "delete the site, delete the submissions" requirement failing
--      silently, and it is personal data about a THIRD PARTY — someone
--      who never had an account here and cannot ask us for anything.
--
--   2. NO WAY FOR THE OWNER TO DELETE ONE. Select-own and nothing else.
--      The data belongs to the site owner; a data subject who writes to
--      them asking to be forgotten could not be obliged.
--
--   3. NO RECORD OF WHETHER THE EMAIL ACTUALLY WENT OUT. Without a
--      verified sending domain Resend refuses the message, the failure
--      was logged server-side and the owner was told nothing. A lead
--      that silently never arrived is worse than a form that visibly
--      does not work.
--
--   4. NO FORM TYPE and NO CONSENT RECORD. Contact, newsletter and quote
--      requests were one undifferentiated bag of jsonb, and nothing
--      stored whether the visitor ticked a consent box.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

-- ----------------------------------------------------------------------
-- 1. Columns
-- ----------------------------------------------------------------------

-- 'contact' | 'newsletter' | 'quote' | 'other'.
--
-- DEFAULT 'contact', which is what every existing row is: until this
-- migration the generated sites only ever produced one kind of form.
-- Booking is deliberately absent — it needs a calendar, availability and
-- double-booking rules, and a "booking" that only files a message is a
-- promise the product cannot keep.
alter table public.website_form_submissions
  add column if not exists form_type text not null default 'contact';

alter table public.website_form_submissions
  drop constraint if exists website_form_submissions_form_type_check;
alter table public.website_form_submissions
  add constraint website_form_submissions_form_type_check
  check (form_type in ('contact', 'newsletter', 'quote', 'other'));

-- GDPR consent, as TWO columns rather than one boolean.
--
-- `consent` is whether the box was ticked. `consent_text` is THE SENTENCE
-- THEY AGREED TO, copied from the page at submit time. A boolean alone
-- records that somebody consented to something; only the text records
-- what. The wording on the site can be edited afterwards, and then the
-- boolean is evidence of agreement to a sentence that no longer exists.
alter table public.website_form_submissions
  add column if not exists consent boolean not null default false;
alter table public.website_form_submissions
  add column if not exists consent_text text;

-- Did the notification email actually reach the owner?
--
-- 'pending'  — not attempted yet (the row is written before the send).
-- 'sent'     — Resend accepted it.
-- 'no_key'   — RESEND_API_KEY is not configured on this deployment.
-- 'unverified_domain' — Resend refused: the From domain is not verified,
--              or the deployment is still on the shared test sender,
--              which only delivers to the Resend account's own address.
-- 'opted_out'/'daily_cap' — the owner's own email settings stopped it.
-- 'failed'   — anything else; the detail is kept beside it.
--
-- Text rather than an enum, for the reason every other status column in
-- this schema is text: a new failure mode should be one line in
-- lib/websites/form-delivery.ts, not a migration.
alter table public.website_form_submissions
  add column if not exists email_status text not null default 'pending';
alter table public.website_form_submissions
  add column if not exists email_detail text;

alter table public.website_form_submissions
  drop constraint if exists website_form_submissions_email_status_check;
alter table public.website_form_submissions
  add constraint website_form_submissions_email_status_check
  check (email_status in (
    'pending', 'sent', 'no_key', 'unverified_domain',
    'opted_out', 'daily_cap', 'failed'
  ));

-- Read state, so "3 new submissions" can mean something.
alter table public.website_form_submissions
  add column if not exists read_at timestamptz;

-- ----------------------------------------------------------------------
-- 2. The missing foreign key
-- ----------------------------------------------------------------------
-- ORPHANS FIRST, because the constraint cannot be added while rows point
-- at websites that are gone.
--
-- This DELETE is the point of the whole section, not a side effect of it:
-- these rows are personal data about third parties, attached to a site
-- their owner deleted, unreachable from every screen in the product. The
-- product's own promise is that deleting a site deletes its submissions;
-- this is that promise applied to the backlog.
--
-- QUALIFIED, and narrowly: only rows whose website_id matches no row in
-- user_websites. Never an unqualified DELETE. The count is raised as a
-- notice so running this migration says out loud what it removed.
do $$
declare
  v_orphans bigint;
begin
  select count(*) into v_orphans
  from public.website_form_submissions s
  where not exists (
    select 1 from public.user_websites w where w.id = s.website_id
  );

  if v_orphans > 0 then
    delete from public.website_form_submissions s
    where not exists (
      select 1 from public.user_websites w where w.id = s.website_id
    );
    raise notice 'website_form_submissions: removed % submission(s) belonging to deleted websites', v_orphans;
  else
    raise notice 'website_form_submissions: no orphaned submissions';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'website_form_submissions_website_id_fkey'
      and conrelid = 'public.website_form_submissions'::regclass
  ) then
    alter table public.website_form_submissions
      add constraint website_form_submissions_website_id_fkey
      foreign key (website_id) references public.user_websites(id) on delete cascade;
  end if;
end $$;

-- ----------------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------------
-- The dashboard lists newest-first for one owner, and filters by site.
create index if not exists website_form_submissions_user_created_idx
  on public.website_form_submissions (user_id, created_at desc);
create index if not exists website_form_submissions_website_created_idx
  on public.website_form_submissions (website_id, created_at desc);
-- The unread badge, which is a count over a tiny subset of the rows.
create index if not exists website_form_submissions_unread_idx
  on public.website_form_submissions (user_id, created_at desc)
  where read_at is null;

-- ----------------------------------------------------------------------
-- 4. Row-level security
-- ----------------------------------------------------------------------
alter table public.website_form_submissions enable row level security;

-- SELECT already existed (select_own_website_form_submissions, in
-- 20260804000001). Restated here with `if not exists` semantics so a
-- database that somehow lost it gets it back, and so this file is
-- readable as the whole policy set for the table.
do $$ begin
  create policy select_own_website_form_submissions
    on public.website_form_submissions for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- UPDATE: marking a submission read. Scoped BOTH ways — USING decides
-- which rows you may touch, WITH CHECK decides what they may become, and
-- without the second an owner could hand a submission to somebody else
-- by rewriting user_id.
drop policy if exists update_own_website_form_submissions on public.website_form_submissions;
create policy update_own_website_form_submissions
  on public.website_form_submissions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: the data belongs to the site owner, so erasing it has to be
-- something they can do. Without this policy a visitor asking the owner
-- to delete their message could not be obliged from inside the product.
drop policy if exists delete_own_website_form_submissions on public.website_form_submissions;
create policy delete_own_website_form_submissions
  on public.website_form_submissions for delete
  using (auth.uid() = user_id);

-- NO INSERT POLICY, deliberately. Rows are written by the public submit
-- endpoint through the service-role client (it is a stranger with no
-- account who fills the form in), and an authenticated user who could
-- insert here could plant a "lead" in their own dashboard — or, worse,
-- in the export they later hand to somebody as a record of enquiries.

-- ----------------------------------------------------------------------
-- 5. Grants
-- ----------------------------------------------------------------------
-- RLS decides which rows; the grant decides whether the role may reach
-- the table at all. The 20260824 search-index migration is here because
-- that distinction was missed once already.
grant select, update, delete on public.website_form_submissions to authenticated;
revoke insert on public.website_form_submissions from authenticated;
revoke all on public.website_form_submissions from anon;
