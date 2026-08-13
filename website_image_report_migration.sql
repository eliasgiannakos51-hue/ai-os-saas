-- Website Builder: record what the photo step actually did.
--
-- WHY THIS COLUMN EXISTS.
--
-- A generation resolves every PLACEHOLDER:<slug> image to a real photo from
-- the stock library, or — when the library has no match, is out of quota, or
-- was never configured — to a seeded placeholder. On screen those look the
-- same, so a site whose brief said "put photos of Santorini on it" and came
-- back with unrelated placeholders is a site the owner publishes without
-- noticing. Nothing anywhere said which had happened.
--
-- The counts are stored, not a message. A sentence written into this column
-- would be an English sentence shown to a Greek user forever; the interface
-- renders these numbers in whatever language the user is reading.
--
-- Shape (see src/lib/website-image-brief.ts, WebsiteImageReport):
--   {
--     "total": 6,                    -- photos the page asked for
--     "fromLibrary": 4,              -- real photographs
--     "fromPlaceholder": 2,          -- seeded placeholders
--     "halted": null,                -- | "rate-limited" | "budget-exhausted" | "unauthorised"
--     "configured": true,            -- was a library key present at all
--     "requestedRealPhotos": true    -- did the brief explicitly ask for them
--   }
--
-- NULL, the default, means "not recorded" — every row generated before this
-- column existed. That is deliberately NOT the same value as a report saying
-- every photo is real: the interface must not make a claim about a
-- generation nobody measured.
--
-- Idempotent: safe to run repeatedly. Adds a column; drops nothing, deletes
-- nothing, and rewrites no existing row.

ALTER TABLE public.user_websites
  ADD COLUMN IF NOT EXISTS image_report jsonb;

COMMENT ON COLUMN public.user_websites.image_report IS
  'What the photo step did: {total, fromLibrary, fromPlaceholder, halted, configured, requestedRealPhotos}. NULL = not recorded (row predates the column), which is not the same as "every photo is real".';

-- No RLS change is needed: user_websites already restricts every row to its
-- owner, and a new column on an existing table inherits those policies. This
-- assertion is here so that stops being an assumption — it raises loudly if
-- the table ever loses row-level security, rather than letting a new column
-- be the thing that quietly widens access.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'user_websites' AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'user_websites does not have row-level security enabled; refusing to add image_report to an unprotected table';
  END IF;
END $$;
