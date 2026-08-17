-- Help Centre seed, part 24 of 24 — 6 statements.
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
values ('create-mission', 'ar', 'كيف أنشئ مهمة؟', 'في Mission Control تكتب هدفًا كما تقوله لإنسان: «أريد عملاء أكثر قبل الربيع». يقسّمه Ionexa إلى خطوات محدّدة، ثم تنفّذها بنفسك أو تُسنِد بعضها إلى وكيل.', 'missions', 0, true, array['إنشاء مهمة', 'mission control', 'هدف', 'أهداف', 'المهام']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'ar', 'هل يمكنني رفع ملفات؟', 'نعم — PDF وWord وExcel وCSV والنصوص وMarkdown. ترفعها في Files، فيقرأ Ionexa محتواها، ثم تستطيع طرح أسئلة عليها. ملفاتك خاصة: لا يصل إليها أحد غيرك، وكل تنزيل يتم عبر رابط مؤقّت.', 'files', 0, true, array['رفع ملف', 'تحميل ملف', 'pdf', 'الملفات', 'مستندات']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'ar', 'كيف أربط Gmail أو Google Drive؟', 'الإعدادات > الاتصالات. اختر الخدمة ووافق على الوصول في نافذة Google نفسها. ترى بالضبط ما الذي سيُقرأ قبل الموافقة، ويمكنك فصل الاتصال متى شئت — وعندها تُحذف مفاتيح الوصول فورًا.', 'integrations', 0, true, array['gmail', 'google drive', 'ربط', 'اتصال', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'ar', 'ماذا تفعلون ببياناتي؟', 'بياناتك ملكك. لا نبيعها، ولا نستخدمها لتدريب النماذج، وكل حساب لا يرى إلا بياناته — وهذا مفروض في قاعدة البيانات لا في التطبيق وحده. ويمكنك تنزيلها أو حذفها متى شئت.', 'privacy', 2, true, array['بياناتي', 'الخصوصية', 'الأمان', 'هل تبيعون بياناتي', 'تدريب النماذج']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'ar', 'كيف أحذف حسابي؟', 'الإعدادات > الحساب > حذف الحساب. سيُطلب منك التأكيد، ثم يُحذف كل شيء: المحادثات والملفات والمواقع والوكلاء والسجل. ولا يمكن التراجع. وإن أردت نسخة أولًا، نزّل بياناتك من الصفحة نفسها.', 'privacy', 0, true, array['حذف الحساب', 'إلغاء الحساب', 'إغلاق الحساب', 'أريد حذف حسابي']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('chat-memory', 'ar', 'هل تتذكر المحادثة ما دار سابقًا؟', 'داخل المحادثة الواحدة يتذكّر الرسائل السابقة دائمًا. أما بين محادثة وأخرى فيحتفظ فقط بما يظل مفيدًا — اسمك، وما تعمل به، وتفضيلاتك — وهذا متاح في الخطط المدفوعة. يمكنك رؤية كل ما احتفظ به، وحذفه، من الإعدادات > الذاكرة.', 'chat', 0, true, array['يتذكر', 'الذاكرة', 'المحادثات السابقة', 'ينسى', 'لا يتذكر', 'سجل المحادثة']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
