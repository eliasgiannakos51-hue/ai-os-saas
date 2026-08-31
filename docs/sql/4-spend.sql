-- ΠΟΣΟ ΞΟΔΕΥΕΙ ΤΟ ΚΑΘΕ ΧΑΡΑΚΤΗΡΙΣΤΙΚΟ, από τα δικά σου δεδομένα.
--
-- ΤΟ ΚΟΣΤΟΣ ΔΕΝ ΕΙΝΑΙ ΑΟΡΑΤΟ. Και τα τέσσερα modules περνούν από
-- settleReservation, που γράφει ai_cost_log και χρεώνει credits. Αυτό που
-- λείπει είναι ο ΜΕΤΡΗΤΗΣ ΚΛΗΣΕΩΝ (daily_ai_spend_tracking.total_calls)
-- που διαβάζει ο platform breaker — δες 5-undercount.sql για την ακριβή
-- διαφορά. Καμία κατηγοριοποίηση δεν είναι γραμμένη εδώ με το χέρι: τα
-- labels είναι ό,τι έγραψε το ίδιο το προϊόν.
select
  feature,
  count(*)                     as actions,
  sum(ai_calls)                as ai_calls,
  round(sum(real_cost_eur), 2) as real_cost_eur,
  sum(credits_charged)         as credits_charged,
  round(avg(ai_calls), 1)      as avg_calls_per_action
  from public.ai_cost_log
 where created_at >= now() - interval '30 days'
 group by feature
 order by sum(ai_calls) desc nulls last;
