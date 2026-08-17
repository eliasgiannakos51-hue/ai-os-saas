-- Help Centre seed, part 19 of 24 — 8 statements.
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
values ('chat-memory', 'pt', 'O chat lembra-se de conversas anteriores?', 'Dentro da mesma conversa lembra-se sempre das mensagens anteriores. Entre conversas diferentes guarda apenas o que continua a ser útil — o seu nome, o que faz, as suas preferências — e isso existe nos planos pagos. Pode ver tudo o que guardou, e apagá-lo, em Definições > Memória.', 'chat', 0, true, array['lembra', 'memória', 'conversas anteriores', 'esquece', 'não se lembra', 'histórico do chat']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'zh', 'Ionexa 是什么？', '一个由 AI 直接干活、而不只是给建议的工作空间：它替你做网站、按时运行 agent、把目标拆成步骤、读你的文件并回答相关问题，还把你记录过的一切放在一个可搜索的地方。', 'getting-started', 2, true, array['ionexa是什么', '这是什么', '有什么用', '能做什么', '怎么用']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'zh', 'Ionexa 多少钱？', '有免费套餐可以先试，需求变大后再上付费套餐。当前价格和各套餐包含的内容始终在 /pricing 页面——这里不写具体数字，因为价格会变，写过时的数字比不写更糟。', 'billing', 0, true, array['多少钱', '价格', '收费', '套餐', '订阅']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'zh', '什么是额度（credits）？', '额度是你为 AI 操作付费的方式：一条聊天消息、生成一个网站、一次 agent 运行。每个套餐都含每月自动续的额度，用得快也可以另外买加量包。各套餐含多少，见 /pricing。', 'credits', 0, true, array['什么是额度', 'credits', '额度怎么算', '点数']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'zh', '额度用完了怎么办？', '两个选择：等下个月自动续，或者买一个额度包——立刻到账，而且月底不会清零。两者都在「设置 > 账单」里。', 'credits', 2, true, array['额度用完', '没额度了', '买额度', '加额度']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'zh', '怎么换套餐？', '设置 > 账单。选你想要的套餐，立即生效。升级时只补本周期剩余部分的差价；降级时保留当前套餐直到已付费的周期结束。', 'billing', 1, true, array['换套餐', '升级', '降级', '改订阅']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'zh', '怎么取消订阅？', '设置 > 账单 > 取消订阅。不会立刻失去权限：套餐会用到已付费周期结束，之后账号转为免费套餐。你的数据都在——取消不会删除任何东西。', 'billing', 2, true, array['取消', '取消订阅', '退订', '停止订阅']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'zh', '怎么做一个网站？', '从侧边栏打开 Website Builder，用大白话写清你要什么——你的生意做什么、面向谁、喜欢什么风格——然后点生成。你也可以上传参考图，比如 logo 或产品照片，让它贴合你的视觉。做好之后，一键发布到它自己的地址。', 'websites', 0, true, array['做网站', '建网站', '网页', '我想要个网站', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
