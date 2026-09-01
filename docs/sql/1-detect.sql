-- ΒΗΜΑ 1 — ΜΟΝΟ ΑΝΑΓΝΩΣΗ. Δεν αλλάζει τίποτα.
-- Πόσες γραμμές περιέχουν κάτι σε σχήμα διαπιστευτηρίου, και τι είδους.
with hit as (
  select
    'production_errors.error_message' as source, id::text as row_id, error_message as t
      from public.production_errors
  union all
  select 'production_errors.stack_trace', id::text, stack_trace
      from public.production_errors
  union all
  select 'user_websites.error_message', id::text, error_message
      from public.user_websites
),
classified as (
  select source, row_id,
    (t ~ 'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}') as jwt,
    (t ~ '\y(sb|sbp|re|sk|pk|rk|whsec)_[A-Za-z0-9_-]{12,}')            as prefixed_token,
    (t ~ '\y\d{8,12}:[A-Za-z0-9_-]{30,}\y')                            as bot_token,
    (t ~ '[a-z][a-z0-9+.-]*://[^/@\s]+:[^/@\s]+@')                     as url_userinfo,
    (t ~ '\y[A-Za-z0-9_-]{40,}\y')                                     as long_opaque
  from hit
  where t is not null and t <> ''
)
select
  source,
  count(*) filter (where jwt)            as jwt,
  count(*) filter (where prefixed_token) as prefixed_token,
  count(*) filter (where bot_token)      as bot_token,
  count(*) filter (where url_userinfo)   as url_userinfo,
  count(*) filter (where long_opaque)    as long_opaque,
  count(*) filter (where jwt or prefixed_token or bot_token or url_userinfo or long_opaque) as rows_to_clean
from classified
group by source
order by source;
