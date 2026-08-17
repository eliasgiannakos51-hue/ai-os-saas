-- Help Centre seed, part 9 of 24 — 7 statements.
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
values ('contact-support', 'el', 'Πώς επικοινωνώ με άνθρωπο;', 'Ρυθμίσεις > Υποστήριξη, και γράψε μας. Αν το θέμα αφορά χρέωση, βάλε και τον αριθμό της χρέωσης για να το βρούμε γρήγορα.', 'account', 4, true, array['επικοινωνια', 'support', 'ανθρωπο', 'υποστηριξη', 'contact', 'να μιλησω με καποιον']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'es', '¿Qué es Ionexa?', 'Un espacio de trabajo donde la IA hace el trabajo en vez de solo aconsejarle: crea su web, ejecuta agentes con una periodicidad fija, divide sus objetivos en pasos, lee sus archivos y responde sobre ellos, y guarda todo lo que registra en un único sitio donde se puede buscar.', 'getting-started', 2, true, array['qué es ionexa', 'qué es esto', 'para qué sirve', 'qué hace', 'cómo funciona']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'es', '¿Cuánto cuesta Ionexa?', 'Hay un plan gratuito para probarlo y planes de pago según crecen sus necesidades. Los precios actuales y lo que incluye cada uno están siempre en la página /pricing: no se escriben aquí porque cambian y una cifra obsoleta es peor que ninguna.', 'billing', 0, true, array['cuánto cuesta', 'precio', 'precios', 'planes', 'suscripción']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'es', '¿Qué son los créditos?', 'Los créditos son la moneda con la que se pagan las acciones de IA: un mensaje de chat, generar una web, la ejecución de un agente. Cada plan incluye una asignación mensual que se renueva, y puede comprar paquetes extra si se le acaban antes. Cuánto incluye cada plan está en /pricing.', 'credits', 0, true, array['qué son los créditos', 'créditos', 'cómo funcionan los créditos', 'unidades']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'es', 'Me he quedado sin créditos, ¿y ahora?', 'Dos opciones: esperar a la renovación mensual, o comprar un paquete de créditos, que se añade al momento y no caduca a fin de mes. Ambas están en Ajustes > Facturación.', 'credits', 2, true, array['sin créditos', 'se me acabaron los créditos', 'comprar créditos', 'más créditos']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'es', '¿Cómo cambio de plan?', 'Ajustes > Facturación. Elija el plan que quiera y el cambio se aplica de inmediato. En una mejora paga solo la diferencia del resto del periodo; en una bajada mantiene el plan actual hasta que termine el periodo ya pagado.', 'billing', 1, true, array['cambiar de plan', 'mejorar plan', 'bajar de plan', 'cambiar suscripción']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'es', '¿Cómo cancelo mi suscripción?', 'Ajustes > Facturación > Cancelar suscripción. No pierde el acceso al instante: su plan sigue hasta el final del periodo ya pagado y luego la cuenta pasa al plan gratuito. Sus datos se quedan; cancelar no borra nada.', 'billing', 2, true, array['cancelar', 'cancelar suscripción', 'darme de baja', 'anular suscripción']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
