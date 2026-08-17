-- Help Centre seed, part 20 of 24 — 8 statements.
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
values ('create-agent', 'zh', '怎么创建 agent？', '在 Agents 菜单里，用一句话说明要做什么、多久做一次——比如「每天早上给我发一份行业新闻摘要」。Ionexa 会自己搭好这个 agent，按时运行，并把结果发给你。你随时可以暂停或修改。', 'agents', 0, true, array['创建agent', '做一个agent', 'agents', '自动化', '定时任务']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'zh', '怎么创建 mission？', '在 Mission Control 里，像对人说话那样写下目标：「我想在春天前多拿些客户」。Ionexa 会把它拆成具体步骤，之后你可以自己做，也可以把其中几步交给 agent。', 'missions', 0, true, array['创建mission', 'mission control', '目标', '定目标', '任务']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'zh', '可以上传文件吗？', '可以——PDF、Word、Excel、CSV、纯文本和 Markdown。在「文件」里上传，Ionexa 读取其中内容，之后你就能针对这些文件提问。你的文件是私有的：别人无法访问，每次下载都用临时链接。', 'files', 0, true, array['上传文件', '上传', 'pdf', '文件', '文档']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'zh', '怎么连接 Gmail 或 Google Drive？', '设置 > 连接。选择服务，在 Google 自己的窗口里授权。授权之前你能看清它将读取什么，而且随时可以断开——断开时访问密钥立刻删除。', 'integrations', 0, true, array['gmail', 'google drive', '连接', '集成', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'zh', '你们拿我的数据做什么？', '你的数据是你的。我们不卖，也不拿来训练模型，而且每个账号只能看到自己的——这一点在数据库层面强制执行，不只是在应用里。你随时可以下载或删除。', 'privacy', 2, true, array['我的数据', '隐私', '安全', '会卖我的数据吗', '训练模型']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'zh', '怎么注销账号？', '设置 > 账号 > 删除账号。会要求你确认，之后全部删除：对话、文件、网站、agent、历史记录。不可恢复。如果想先留一份备份，在同一页面下载你的数据。', 'privacy', 0, true, array['删除账号', '注销账号', '关闭账号', '销号']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'zh', '聊天会记得之前的对话吗？', '在同一个对话里，它始终记得前面的消息。在不同对话之间，它只保留长期有用的信息——你的名字、你的工作、你的偏好——这项功能属于付费方案。它保留的全部内容都可以在「设置 > 记忆」里查看，也可以随时删除。', 'chat', 0, true, array['记得', '记忆', '之前的对话', '会忘记吗', '不记得', '聊天记录']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'ja', 'Ionexaとは？', 'AIが助言するだけでなく実際に作業するワークスペースです。サイトを作り、エージェントを決めた頻度で走らせ、目標を手順に分け、ファイルを読んでそれについて答え、記録したすべてを検索できる一か所にまとめます。', 'getting-started', 2, true, array['ionexaとは', 'これは何', '何ができる', '何をするもの', '使い方']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
