-- Help Centre seed, part 3 of 24 — 8 statements.
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
values ('connect-gmail', 'en', 'How do I connect Gmail or Google Drive?', 'Settings > Integrations. Pick the service and approve access in Google''s own window. You see exactly what it will read before you approve, and you can disconnect whenever you like — the access keys are deleted immediately when you do.', 'integrations', 0, true, array['gmail', 'google drive', 'connect', 'integration', 'slack', 'how do i connect', 'link my email']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('languages', 'en', 'What languages does it work in?', 'The interface is available in ten languages and you change it in Settings. The AI replies in whatever language you write to it in, regardless of the interface language.', 'getting-started', 0, true, array['language', 'languages', 'english', 'greek', 'translation', 'change language']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'en', 'How do I delete my account?', 'Settings > Account > Delete account. You will be asked to confirm, and then everything goes: conversations, files, websites, agents, history. It cannot be undone. If you want a copy first, download your data from the same page.', 'privacy', 0, true, array['delete account', 'delete my account', 'close my account', 'remove my account']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('export-data', 'en', 'Can I download my data?', 'Yes. Settings > Account > Export data. You get a file with everything you have made — conversations, missions, websites, files, billing history. The access keys for connected accounts are left out for security reasons.', 'privacy', 1, true, array['download my data', 'export', 'export data', 'gdpr', 'copy of my data']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'en', 'What do you do with my data?', 'Your data is yours. We do not sell it, we do not use it to train models, and every account sees only its own — that is enforced in the database, not just in the application. You can download it or delete it whenever you want.', 'privacy', 2, true, array['my data', 'privacy', 'security', 'do you sell my data', 'train models', 'is my data safe']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('password-reset', 'en', 'I have forgotten my password.', 'On the sign-in page press "Forgot my password" and enter your email. A reset link will be sent to you. If it does not arrive, check your spam folder as well.', 'account', 1, true, array['forgot my password', 'password', 'reset password', 'cannot log in', 'cannot sign in']::text[], '/login')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('team-members', 'en', 'Can I add people from my team?', 'Yes, on the plans that include a team. Settings > Team, invite by email and that person joins the same workspace. Which plans include it and how many seats they give is on /pricing.', 'account', 2, true, array['team', 'colleagues', 'invite a member', 'collaboration', 'add users', 'share my workspace']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('notifications', 'en', 'How do I set up notifications?', 'Settings > Notifications. Separately for email and for phone notifications, and per type — agent results, reminders, low credits. Critical security notifications cannot be switched off.', 'account', 3, true, array['notifications', 'email notifications', 'push', 'stop emailing me', 'turn off notifications']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
