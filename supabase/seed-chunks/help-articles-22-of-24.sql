-- Help Centre seed, part 22 of 24 — 7 statements.
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
values ('create-mission', 'ja', 'ミッションはどう作りますか？', 'Mission Controlで、人に話すように目標を書きます。「春までに顧客を増やしたい」のように。Ionexaがそれを具体的な手順に分解し、そのあとは自分で進めても、いくつかをエージェントに任せてもかまいません。', 'missions', 0, true, array['ミッションを作る', 'mission control', '目標', 'ゴール', 'ミッション']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'ja', 'ファイルはアップロードできますか？', 'はい。PDF、Word、Excel、CSV、テキスト、Markdownに対応しています。Filesにアップロードすると内容が読み取られ、そのファイルについて質問できます。ファイルは非公開で、他の人はアクセスできず、ダウンロードは毎回一時リンク経由です。', 'files', 0, true, array['ファイルをアップロード', 'アップロード', 'pdf', 'ファイル', '資料']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'ja', 'GmailやGoogle Driveはどう接続しますか？', '設定 > 連携。サービスを選び、Google自身の画面で許可します。許可の前に何を読むのかが正確に表示され、いつでも接続を解除できます。解除すると、アクセスキーはただちに削除されます。', 'integrations', 0, true, array['gmail', 'google drive', '接続', '連携', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'ja', 'データはどう扱われますか？', 'あなたのデータはあなたのものです。販売しません。モデルの学習にも使いません。各アカウントは自分のデータしか見られず、それはアプリだけでなくデータベース側で強制されています。いつでもダウンロードも削除もできます。', 'privacy', 2, true, array['私のデータ', 'プライバシー', 'セキュリティ', 'データを売る', '学習に使う']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'ja', 'アカウントはどう削除しますか？', '設定 > アカウント > アカウント削除。確認を求められ、そのあとすべて削除されます。会話、ファイル、サイト、エージェント、履歴。取り消せません。先に控えが必要なら、同じページからデータを書き出してください。', 'privacy', 0, true, array['アカウント削除', '退会', 'アカウントを消す', '解約して消したい']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'ja', 'チャットは前の会話を覚えていますか？', '同じ会話の中では、前のメッセージを常に覚えています。別々の会話のあいだでは、長く役に立つことだけ——お名前、お仕事、好み——を保持します。これは有料プランの機能です。保持している内容は「設定 > メモリー」ですべて確認でき、削除もできます。', 'chat', 0, true, array['覚えている', '記憶', '前の会話', '忘れる', '覚えていない', 'チャット履歴']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'ar', 'ما هو Ionexa؟', 'مساحة عمل ينفّذ فيها الذكاء الاصطناعي العمل بدل أن يكتفي بالنصيحة: يبني موقعك، ويشغّل الوكلاء وفق جدول زمني، ويقسّم أهدافك إلى خطوات، ويقرأ ملفاتك ويجيب عنها، ويحفظ كل ما سجّلته في مكان واحد قابل للبحث.', 'getting-started', 2, true, array['ما هو ionexa', 'ما هذا', 'ما فائدته', 'ماذا يفعل', 'كيف يعمل']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
