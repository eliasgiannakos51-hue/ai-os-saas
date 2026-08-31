-- Η ΑΚΡΙΒΗΣ ΥΠΟ-ΜΕΤΡΗΣΗ: τι πιστεύει ο breaker vs τι έγινε πραγματικά.
select
  d.date,
  d.total_calls                              as breaker_thinks,
  coalesce(sum(l.ai_calls), 0)               as actually_happened,
  coalesce(sum(l.ai_calls), 0) - d.total_calls as missed,
  case when coalesce(sum(l.ai_calls), 0) = 0 then null
       else round(100.0 * (coalesce(sum(l.ai_calls), 0) - d.total_calls)
                  / coalesce(sum(l.ai_calls), 0), 1) end as missed_pct
  from public.daily_ai_spend_tracking d
  left join public.ai_cost_log l
    on (l.created_at at time zone 'utc')::date = d.date
 where d.date >= current_date - 30
 group by d.date, d.total_calls
 order by d.date desc;
