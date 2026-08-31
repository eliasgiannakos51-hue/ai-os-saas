-- ΒΗΜΑ 2 — ΜΟΝΟ ΑΝΑΓΝΩΣΗ. Δείχνει ΤΙ θα άλλαζε, με το μυστικό ήδη κρυμμένο.
-- Καμία γραμμή αυτού του αποτελέσματος δεν περιέχει διαπιστευτήριο.
with scrub as (
  select id, occurred_at, route,
         error_message as before_len_only,
         regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(error_message,
                   'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}', '[redacted-jwt]', 'g'),
                 '\y(sb|sbp|re|sk|pk|rk|whsec)_[A-Za-z0-9_-]{12,}', '[redacted-token]', 'g'),
               '\y\d{8,12}:[A-Za-z0-9_-]{30,}\y', '[redacted-bot-token]', 'g'),
             '([a-z][a-z0-9+.-]*://)[^/@\s]+:[^/@\s]+@', '\1[redacted-userinfo]@', 'g'),
           '\y[A-Za-z0-9_-]{40,}\y', '[redacted-opaque]', 'g') as after
    from public.production_errors
)
select id, occurred_at, route,
       length(before_len_only) as chars_before,
       after as message_after_cleaning
  from scrub
 where after is distinct from before_len_only
 order by occurred_at desc
 limit 50;
