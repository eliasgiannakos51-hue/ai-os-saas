-- Help Centre seed, part 23 of 24 — 7 statements.
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
values ('pricing-overview', 'ar', 'كم يكلّف Ionexa؟', 'هناك خطة مجانية للتجربة، وخطط مدفوعة كلما كبرت احتياجاتك. الأسعار الحالية وما تتضمّنه كل خطة موجودة دائمًا في صفحة ‎/pricing‎ — ولا نكتبها هنا لأنها تتغيّر، ورقم قديم أسوأ من لا رقم.', 'billing', 0, true, array['كم التكلفة', 'السعر', 'الأسعار', 'الخطط', 'الاشتراك']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'ar', 'ما هي الـcredits؟', 'الـcredits هي العملة التي تدفع بها مقابل عمليات الذكاء الاصطناعي: رسالة في الدردشة، توليد موقع، تشغيل وكيل. كل خطة تتضمّن حصة شهرية تتجدّد، ويمكنك شراء باقات إضافية إن نفدت مبكرًا. ما تتضمّنه كل خطة موجود في ‎/pricing‎.', 'credits', 0, true, array['ما هي credits', 'الرصيد', 'كيف تعمل credits', 'النقاط']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'ar', 'نفدت الـcredits، ماذا أفعل؟', 'خياران: انتظار التجديد الشهري، أو شراء باقة credits تُضاف فورًا ولا تنتهي في آخر الشهر. كلاهما من الإعدادات > الفوترة.', 'credits', 2, true, array['نفدت الcredits', 'لا يوجد رصيد', 'شراء credits', 'أريد المزيد']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'ar', 'كيف أغيّر الخطة؟', 'الإعدادات > الفوترة. اختر الخطة التي تريدها ويسري التغيير فورًا. عند الترقية تدفع الفارق فقط لبقية الفترة؛ وعند النزول تحتفظ بخطتك الحالية حتى تنتهي الفترة المدفوعة.', 'billing', 1, true, array['تغيير الخطة', 'ترقية', 'تخفيض الخطة', 'تغيير الاشتراك']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'ar', 'كيف ألغي اشتراكي؟', 'الإعدادات > الفوترة > إلغاء الاشتراك. لا تفقد الوصول فورًا: تستمر خطتك حتى نهاية الفترة المدفوعة، ثم يتحوّل الحساب إلى الخطة المجانية. بياناتك تبقى — الإلغاء لا يحذف شيئًا.', 'billing', 2, true, array['إلغاء', 'إلغاء الاشتراك', 'إيقاف الاشتراك', 'أريد الإلغاء']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-website', 'ar', 'كيف أنشئ موقعًا؟', 'افتح Website Builder من القائمة الجانبية، واكتب بكلماتك ما تريد — ماذا يعمل نشاطك، ولمن، وأي أسلوب تفضّل — ثم اضغط إنشاء. يمكنك أيضًا رفع صور مرجعية، شعارًا أو صور منتجات، ليتبع هويتك. وعندما يجهز تنشره على عنوان خاص به بنقرة واحدة.', 'websites', 0, true, array['إنشاء موقع', 'عمل موقع', 'صفحة ويب', 'أريد موقعًا', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'ar', 'كيف أنشئ وكيلًا؟', 'في قائمة الوكلاء، صِف في جملة واحدة ما تريد إنجازه وكل كم مرة — مثلًا «كل صباح أرسل لي ملخّصًا لأخبار قطاعي». يبني Ionexa الوكيل بنفسه، ويشغّله في موعده، ويرسل لك النتيجة. ويمكنك إيقافه أو تعديله متى شئت.', 'agents', 0, true, array['إنشاء وكيل', 'عمل agent', 'الوكلاء', 'أتمتة', 'مهمة متكررة']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
