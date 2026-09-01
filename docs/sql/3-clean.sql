-- ΒΗΜΑ 3 — ΓΡΑΦΕΙ. Ιδεμποτενσιακό: δεύτερη εκτέλεση δεν ταιριάζει καμία γραμμή.
-- Χωρίς DROP, χωρίς TRUNCATE, χωρίς DELETE. Το ιστορικό μένει· βγαίνουν τα κλειδιά.
begin;

create or replace function pg_temp.scrub_once(p text) returns text
language sql immutable as $$
  select case when p is null then null else
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(p,
              'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}', '[redacted-jwt]', 'g'),
            '\y(sb|sbp|re|sk|pk|rk|whsec)_[A-Za-z0-9_-]{12,}', '[redacted-token]', 'g'),
          '\y\d{8,12}:[A-Za-z0-9_-]{30,}\y', '[redacted-bot-token]', 'g'),
        '([a-z][a-z0-9+.-]*://)[^/@\s]+:[^/@\s]+@', '\1[redacted-userinfo]@', 'g'),
      '\y[A-Za-z0-9_-]{40,}\y', '[redacted-opaque]', 'g')
  end;
$$;

update public.production_errors
   set error_message = pg_temp.scrub_once(error_message),
       stack_trace   = pg_temp.scrub_once(stack_trace)
 where error_message is distinct from pg_temp.scrub_once(error_message)
    or stack_trace   is distinct from pg_temp.scrub_once(stack_trace);

update public.user_websites
   set error_message = pg_temp.scrub_once(error_message)
 where error_message is distinct from pg_temp.scrub_once(error_message);

commit;
