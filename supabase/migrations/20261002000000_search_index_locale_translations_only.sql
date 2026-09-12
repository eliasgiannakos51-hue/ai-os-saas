-- ==========================================================================
-- THE LOCALE FILTER IS FOR TRANSLATIONS. A USER'S OWN ROW IS NOT A
-- TRANSLATION, AND ONE OF THEM STOPPED COMING BACK.
-- ==========================================================================
--
-- WHAT A USER SAW. Write a presentation in Greek, switch the interface to
-- English, search for it: it is gone. Their own row, in their own account,
-- missing from their own search. Switch back to Greek and it returns.
--
-- WHY. 20260914000000_search_index_locale.sql stamps search_index.locale
-- GENERICALLY, out of to_jsonb(NEW):
--
--     -- NULL FOR EVERY USER TABLE, which is the point: their own rows are
--     -- not in a language this product knows and must never be filtered
--     -- by one.
--     v_locale := nullif(v_row ->> 'locale', '');
--
-- The comment states the invariant. The code does not enforce it — it was
-- merely TRUE on the day it was written, because no user table had a
-- `locale` column yet. That file went further and called the generic pickup
-- a feature: "a table that GAINS a locale column starts being filtered
-- correctly with no migration."
--
-- Five migrations later 20260929000000_presentation_decks.sql added
-- `locale` to public.ai_presentations, which 20260824000000_unified_search
-- .sql line 224 indexes. Nothing was wired up wrong; the property simply
-- stopped holding, silently, in a migration that never mentions search.
--
-- THE TWO COLUMNS ARE NOT THE SAME KIND OF THING, and that is the whole
-- bug. help_articles.locale is an IDENTITY: one row per (slug, locale), ten
-- rows saying the same thing, and a reader must be shown exactly one of
-- them. ai_presentations.locale is a CHOICE: the language this user asked
-- their deck to be written in. There is one row. Filtering it by the
-- reader's interface language hides the only copy there is.
--
-- So the rule is not "filter by locale where the column exists". It is
-- "filter by locale where the rows are TRANSLATIONS OF EACH OTHER", and
-- that is a property of the table, which means it has to be declared.
--
-- WHAT THIS CHANGES. One line of the trigger: the locale is read only for
-- tables on an explicit list, and every other table writes null the way it
-- did before 20260929 — by construction now, rather than by luck.
--
-- The filter in search_all_localized is UNCHANGED and needs no change: it
-- already passes every row whose locale is null. Fixing the source is
-- enough, and it is the half that cannot be got wrong twice.
--
-- HELD BY: scripts/tests/search-index-locale.test.mjs, which reads the
-- indexed-table list out of 20260824 and this allowlist out of this file
-- and goes red when any OTHER indexed table gains a locale column. That
-- gate is the part that matters: this migration fixes one table, the gate
-- is what makes the next one somebody's decision instead of a surprise.
-- ==========================================================================

create or replace function public.search_index_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_title text;
  v_body text;
  v_when timestamptz;
  v_user uuid;
  v_locale text;
  v_group text;
begin
  if (tg_op = 'DELETE') then
    delete from public.search_index
      where source_table = tg_table_name and source_id = old.id;
    return old;
  end if;

  v_row := to_jsonb(new);
  v_title := coalesce(v_row ->> tg_argv[1], '');
  v_body := case when tg_argv[2] = '' then '' else coalesce(v_row ->> tg_argv[2], '') end;
  -- 20,000 characters is far past the point where more text changes
  -- whether a document matches, and it keeps one enormous PDF from
  -- dominating the table.
  v_body := left(v_body, 20000);
  v_when := coalesce((v_row ->> tg_argv[5])::timestamptz, now());
  v_user := nullif(v_row ->> 'user_id', '')::uuid;

  -- TRANSLATION TABLES, BY NAME. A row here is one of several saying the
  -- same thing in different languages, so a reader must be shown exactly
  -- one of them and locale is how search_all_localized picks it.
  --
  -- EVERY OTHER TABLE WRITES NULL, including one that has a locale column
  -- of its own (ai_presentations). Null is what makes a row pass the filter
  -- in every language, which is correct for a row that exists only once.
  --
  -- Adding a name here is a decision about a table's rows, not about its
  -- columns. search-index-locale.test.mjs requires that decision to be
  -- made in this list rather than inferred from a column appearing.
  if tg_table_name = 'help_articles' then
    v_locale := nullif(v_row ->> 'locale', '');
  else
    v_locale := null;
  end if;

  v_group := nullif(v_row ->> 'slug', '');

  insert into public.search_index
    (user_id, kind, module_slug, source_table, source_id, title, body, href,
     occurred_at, locale, group_key)
  values (
    v_user,
    tg_argv[0],
    nullif(tg_argv[4], ''),
    tg_table_name,
    new.id,
    v_title,
    v_body,
    tg_argv[3],
    v_when,
    v_locale,
    v_group
  )
  on conflict (source_table, source_id) do update set
    user_id     = excluded.user_id,
    kind        = excluded.kind,
    module_slug = excluded.module_slug,
    title       = excluded.title,
    body        = excluded.body,
    href        = excluded.href,
    occurred_at = excluded.occurred_at,
    locale      = excluded.locale,
    group_key   = excluded.group_key;

  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- The rows already stamped.
--
-- The trigger only rewrites a row when that row is written again, so every
-- deck indexed between 20260929 and this file keeps its locale — and stays
-- invisible in nine languages — until its owner happens to edit it. This
-- clears them in one statement.
--
-- Scoped by source_table rather than by "not help_articles" so that it
-- repairs exactly what the generic pickup stamped and cannot touch a
-- translation table added later. Re-running it is a no-op.
-- --------------------------------------------------------------------------
update public.search_index
   set locale = null
 where source_table <> 'help_articles'
   and locale is not null;
