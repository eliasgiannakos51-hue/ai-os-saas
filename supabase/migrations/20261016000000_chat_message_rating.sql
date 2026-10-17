-- ---------------------------------------------------------------------------
-- A RATING ON EACH ANSWER (2026-10-05, Δ.2).
--
-- The row under every answer in Chat carries thumbs up and thumbs down
-- (docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN §5, «ΣΥΝΟΜΙΛΙΑ»). A button that stores
-- nothing is one more control that does nothing, so the rating lives on the
-- answer itself: 1, -1, or null for none.
--
-- Written only by src/app/api/chat/messages/[id]/rating/route.ts, through
-- the signed-in session: the existing update_own_chat_messages policy
-- already limits it to the account's own rows, and the route limits it to
-- answers and to these three values.
--
-- Nothing personal is added: the rating is a number on a row the account
-- already owns.
--
-- Idempotent: add column if not exists; the check is named and replaced.
-- How to check it after running: /api/health lists chat_messages.rating
-- (src/lib/health/schema-canaries.ts).
-- How to undo: alter table public.chat_messages drop column rating;
-- ---------------------------------------------------------------------------

alter table public.chat_messages add column if not exists rating smallint;

alter table public.chat_messages drop constraint if exists chat_messages_rating_values;
alter table public.chat_messages
  add constraint chat_messages_rating_values check (rating is null or rating in (-1, 1));
