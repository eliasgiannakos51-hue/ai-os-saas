-- Help Centre seed, part 2 of 24 — 8 statements.
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
values ('credits-rollover', 'en', 'Do credits roll over to the next month?', 'A plan''s monthly credits renew each month and do not accumulate. Credits you buy in a pack are different: they stay on your account until you use them.', 'credits', 3, true, array['roll over', 'rollover', 'do credits expire', 'do credits carry over', 'lose my credits']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'en', 'How do I make a website?', 'Open Website Builder from the sidebar, write in plain words what you want — what your business does, who it is for, what style you like — and press create. You can upload reference images too, a logo or product photos, so it follows your look. When it is ready you publish it to its own address in one click.', 'websites', 0, true, array['make a website', 'create website', 'build a website', 'website builder', 'i want a site', 'new website']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('publish-website', 'en', 'How do I publish my website?', 'In Website Builder, open the site and press Publish. You choose a name for the address and the site goes live immediately. Every publish is kept as a version, so you can roll back to an earlier one if you need to.', 'websites', 1, true, array['publish', 'how do i publish', 'put it live', 'go live', 'make my site public']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'en', 'How do I make an agent?', 'In the Agents menu, describe in one sentence what you want done and how often — for example "every morning send me a summary of news in my industry". Ionexa builds the agent itself, runs it on time and sends you the result. You can pause or change it whenever you like.', 'agents', 0, true, array['make an agent', 'create agent', 'agents', 'automation', 'i want an agent', 'automate something']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'en', 'How do I make a mission?', 'In Mission Control you write a goal the way you would say it to a person — "I want more customers by spring". Ionexa breaks it into concrete steps, and you can then work through them yourself or hand some of them to an agent.', 'missions', 0, true, array['make a mission', 'mission control', 'goal', 'goals', 'create mission', 'missions']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('invite-code', 'en', 'Where do I enter an invite code?', 'There is a field for an invite code on the sign-up form. If you already have an account you enter it in Settings > Account. Once it is accepted, whatever it grants is active on your account straight away.', 'account', 0, true, array['invite code', 'beta code', 'where do i put the code', 'invitation', 'promo code']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'en', 'Does the chat remember earlier conversations?', 'Within one conversation it always remembers the earlier messages. Between conversations it keeps only lastingly useful details — your name, what you do, your preferences — and that is on the paid plans. You can see everything it has kept, and delete it, in Settings > Memory.', 'chat', 0, true, array['remember', 'memory', 'previous conversations', 'does it forget', 'chat history', 'it does not remember']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'en', 'Can I upload files?', 'Yes — PDF, Word, Excel, CSV, text and Markdown. You upload them in Files, Ionexa reads what is in them, and then you can ask questions about them. Your files are private: nobody else has access and every download uses a temporary link.', 'files', 0, true, array['upload a file', 'upload', 'pdf', 'files', 'documents', 'can i upload']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
