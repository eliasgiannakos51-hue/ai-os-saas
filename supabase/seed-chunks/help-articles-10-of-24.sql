-- Help Centre seed, part 10 of 24 — 7 statements.
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
values ('create-website', 'es', '¿Cómo hago una web?', 'Abra Website Builder en el menú lateral, escriba con palabras normales qué quiere —a qué se dedica su negocio, a quién se dirige, qué estilo le gusta— y pulse crear. También puede subir imágenes de referencia, un logotipo o fotos de producto, para que siga su estilo. Cuando esté lista la publica en su propia dirección con un clic.', 'websites', 0, true, array['hacer una web', 'crear web', 'página web', 'quiero un sitio', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'es', '¿Cómo creo un agente?', 'En el menú Agentes, describa en una frase qué quiere que se haga y cada cuánto: por ejemplo «cada mañana envíame un resumen de las noticias de mi sector». Ionexa construye el agente solo, lo ejecuta a su hora y le envía el resultado. Puede pausarlo o cambiarlo cuando quiera.', 'agents', 0, true, array['crear agente', 'hacer un agente', 'agentes', 'automatizar', 'automatización']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'es', '¿Cómo creo una misión?', 'En Mission Control escribe un objetivo como se lo diría a una persona: «quiero más clientes para la primavera». Ionexa lo divide en pasos concretos, y luego puede trabajarlos usted o encargar alguno a un agente.', 'missions', 0, true, array['crear misión', 'mission control', 'objetivo', 'objetivos', 'misiones']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'es', '¿Puedo subir archivos?', 'Sí: PDF, Word, Excel, CSV, texto y Markdown. Los sube en Archivos, Ionexa lee su contenido y después puede hacer preguntas sobre ellos. Sus archivos son privados: nadie más tiene acceso y cada descarga usa un enlace temporal.', 'files', 0, true, array['subir archivo', 'subir', 'pdf', 'archivos', 'documentos']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'es', '¿Cómo conecto Gmail o Google Drive?', 'Ajustes > Conexiones. Elija el servicio y apruebe el acceso en la ventana de Google. Ve exactamente qué va a leer antes de aprobarlo, y puede desconectarlo cuando quiera: las claves de acceso se borran de inmediato.', 'integrations', 0, true, array['gmail', 'google drive', 'conectar', 'conexión', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'es', '¿Qué hacen con mis datos?', 'Sus datos son suyos. No los vendemos, no los usamos para entrenar modelos, y cada cuenta ve solo los suyos: eso se aplica en la base de datos, no solo en la aplicación. Puede descargarlos o borrarlos cuando quiera.', 'privacy', 2, true, array['mis datos', 'privacidad', 'seguridad', 'venden mis datos', 'entrenar modelos']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'es', '¿Cómo borro mi cuenta?', 'Ajustes > Cuenta > Eliminar cuenta. Se le pedirá confirmación y después se borra todo: conversaciones, archivos, webs, agentes, historial. No tiene vuelta atrás. Si quiere una copia antes, descargue sus datos desde la misma página.', 'privacy', 0, true, array['borrar cuenta', 'eliminar cuenta', 'cerrar cuenta', 'darme de baja del todo']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
