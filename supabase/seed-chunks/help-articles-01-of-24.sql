-- Help Centre seed, part 1 of 24 — 8 statements.
--
-- GENERATED from supabase/migrations/20260816_help_articles_seed.sql
-- by scripts/split-help-seed.mjs. Do not edit either by hand.
--
-- SPLIT ON STATEMENT BOUNDARIES, never inside one. Each part is a
-- complete, runnable script on its own: every statement is an UPSERT
-- on (slug, locale), so the parts may be run in any order, more than
-- once, and a part run twice changes nothing.
--
-- Run 20260816_help_articles.sql first — it creates the table and the
-- unique index these UPSERTs conflict on.

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'en', 'How much does Ionexa cost?', 'There is a free plan to try it with, and paid plans as your needs grow. Current prices and what each one includes are always on the /pricing page — they are not written here because they change and a stale number is worse than no number.', 'billing', 0, true, array['how much', 'how much does it cost', 'cost', 'price', 'pricing', 'what does it cost', 'plans', 'what plans', 'subscription', 'how much is it']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'en', 'How do I change plan?', 'Settings > Billing. Pick the plan you want and the change takes effect immediately. On an upgrade you pay only the difference for the rest of the period; on a downgrade you keep your current plan until the period you have already paid for ends.', 'billing', 1, true, array['change plan', 'upgrade', 'downgrade', 'switch plan', 'change subscription', 'move to a bigger plan']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'en', 'How do I cancel my subscription?', 'Settings > Billing > Cancel subscription. You do not lose access straight away: your plan runs to the end of the period you have already paid for, and the account then drops to the free plan. Your data stays — cancelling deletes nothing.', 'billing', 2, true, array['cancel', 'cancel subscription', 'unsubscribe', 'stop my subscription', 'how do i cancel', 'end subscription']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('invoices', 'en', 'Where do I find my receipts?', 'Settings > Billing > Payment history. Every charge has a PDF receipt you can download from there. Payments run through Stripe and we never store your card details.', 'billing', 3, true, array['receipt', 'receipts', 'invoice', 'invoices', 'billing history', 'payment history']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('refund', 'en', 'Can I ask for a refund?', 'Yes — tell us what happened and we will look at it. If you were charged by mistake, or something did not work as it should have, we put it right. Message us from Settings > Support with the charge reference.', 'billing', 4, true, array['refund', 'money back', 'charged by mistake', 'wrong charge', 'get my money back']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'en', 'What are credits?', 'Credits are the currency you pay for AI actions with: a chat message, generating a website, an agent run. Each plan comes with a monthly allowance that renews, and you can buy extra packs if you run out sooner. How much each plan includes is on /pricing.', 'credits', 0, true, array['what are credits', 'credits', 'what is a credit', 'how do credits work', 'units']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credit-cost-per-action', 'en', 'How many credits does each action cost?', 'The charge is not fixed per action — it is worked out from what the call actually cost, so a short message costs less than a long one. Before every expensive action you see an estimate, and once it finishes you see the real charge in your history.', 'credits', 1, true, array['how many credits', 'credit cost', 'cost per action', 'how much does it charge', 'what does an action cost']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'en', 'I have run out of credits — what now?', 'Two options: wait for the next monthly renewal, or buy a credit pack, which is added immediately and does not expire at the end of the month. Both are in Settings > Billing.', 'credits', 2, true, array['ran out of credits', 'no credits', 'out of credits', 'buy credits', 'get more credits', 'credits finished']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
