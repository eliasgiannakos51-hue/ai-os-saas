-- Help Centre seed, part 21 of 24 — 7 statements.
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
values ('pricing-overview', 'ja', 'Ionexaの料金は？', 'まず試せる無料プランがあり、必要に応じて有料プランに移れます。現在の価格と各プランの内容は常に /pricing にあります。ここに数字を書かないのは、変わるからです。古い数字は書かないより悪いものです。', 'billing', 0, true, array['いくら', '料金', '価格', 'プラン', 'サブスク']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'ja', 'クレジットとは？', 'クレジットはAIの処理に対して支払う通貨です。チャットのメッセージ、サイトの生成、エージェントの実行などに使います。各プランには毎月更新される割り当てがあり、早く使い切った場合は追加パックを購入できます。プランごとの量は /pricing にあります。', 'credits', 0, true, array['クレジットとは', 'クレジット', 'クレジットの仕組み', 'ポイント']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'ja', 'クレジットがなくなりました', '方法はふたつです。翌月の更新を待つか、クレジットパックを購入するか。パックはすぐ反映され、月末で失効しません。どちらも「設定 > 請求」から行えます。', 'credits', 2, true, array['クレジットがない', 'クレジット切れ', 'クレジットを買う', '追加したい']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'ja', 'プランはどう変更しますか？', '設定 > 請求。希望のプランを選ぶと、変更はすぐ反映されます。上位に変える場合は残り期間の差額のみ、下位に変える場合は支払い済み期間の終わりまで現在のプランのままです。', 'billing', 1, true, array['プラン変更', 'アップグレード', 'ダウングレード', '契約を変える']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'ja', '解約はどうしますか？', '設定 > 請求 > 解約。すぐに使えなくなるわけではありません。支払い済み期間の終わりまでは現在のプランが続き、その後は無料プランに切り替わります。データはそのまま残り、解約で削除されるものはありません。', 'billing', 2, true, array['解約', 'キャンセル', '退会したい', '契約をやめる']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'ja', 'サイトはどう作りますか？', 'サイドバーからWebsite Builderを開き、ふつうの言葉で書いてください。事業の内容、対象、好みの雰囲気などです。参考画像（ロゴや商品写真）も追加でき、見た目を合わせられます。完成したら、ワンクリックで専用のアドレスに公開できます。', 'websites', 0, true, array['サイトを作る', 'ホームページ', 'ウェブサイト作成', 'サイトが欲しい', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'ja', 'エージェントはどう作りますか？', 'Agentsメニューで、やってほしいことと頻度を一文で書きます。たとえば「毎朝、業界ニュースの要約を送って」。Ionexaがエージェントを組み立て、時刻どおりに実行し、結果を届けます。いつでも停止・変更できます。', 'agents', 0, true, array['エージェントを作る', 'agent作成', 'エージェント', '自動化', '定期実行']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
