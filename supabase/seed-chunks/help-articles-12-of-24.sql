-- Help Centre seed, part 12 of 24 — 7 statements.
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
values ('create-website', 'fr', 'Comment créer un site ?', 'Ouvrez Website Builder dans le menu latéral, écrivez en langage courant ce que vous voulez — ce que fait votre activité, à qui elle s''adresse, quel style vous plaît — et lancez la création. Vous pouvez aussi téléverser des images de référence, un logo ou des photos de produits, pour qu''il suive votre identité. Une fois prêt, vous le publiez à sa propre adresse en un clic.', 'websites', 0, true, array['créer un site', 'faire un site', 'site web', 'je veux un site', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'fr', 'Comment créer un agent ?', 'Dans le menu Agents, décrivez en une phrase ce que vous voulez faire faire et à quelle fréquence — par exemple « chaque matin, envoie-moi un résumé de l''actualité de mon secteur ». Ionexa construit l''agent lui-même, l''exécute à l''heure dite et vous envoie le résultat. Vous pouvez le mettre en pause ou le modifier quand vous voulez.', 'agents', 0, true, array['créer un agent', 'faire un agent', 'agents', 'automatiser', 'automatisation']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'fr', 'Comment créer une mission ?', 'Dans Mission Control, vous écrivez un objectif comme vous le diriez à quelqu''un : « je veux plus de clients d''ici le printemps ». Ionexa le découpe en étapes concrètes, et vous pouvez ensuite les traiter vous-même ou en confier certaines à un agent.', 'missions', 0, true, array['créer une mission', 'mission control', 'objectif', 'objectifs', 'missions']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'fr', 'Puis-je téléverser des fichiers ?', 'Oui : PDF, Word, Excel, CSV, texte et Markdown. Vous les déposez dans Fichiers, Ionexa lit leur contenu, puis vous pouvez poser des questions dessus. Vos fichiers sont privés : personne d''autre n''y a accès et chaque téléchargement passe par un lien temporaire.', 'files', 0, true, array['téléverser', 'importer un fichier', 'pdf', 'fichiers', 'documents']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'fr', 'Comment connecter Gmail ou Google Drive ?', 'Paramètres > Connexions. Choisissez le service et approuvez l''accès dans la fenêtre de Google. Vous voyez exactement ce qui sera lu avant d''approuver, et vous pouvez déconnecter quand vous voulez — les clés d''accès sont alors supprimées immédiatement.', 'integrations', 0, true, array['gmail', 'google drive', 'connecter', 'connexion', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'fr', 'Que faites-vous de mes données ?', 'Vos données sont à vous. Nous ne les vendons pas, nous ne nous en servons pas pour entraîner des modèles, et chaque compte ne voit que les siennes — c''est imposé dans la base de données, pas seulement dans l''application. Vous pouvez les télécharger ou les supprimer quand vous voulez.', 'privacy', 2, true, array['mes données', 'confidentialité', 'sécurité', 'vous vendez mes données', 'entraîner des modèles']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'fr', 'Comment supprimer mon compte ?', 'Paramètres > Compte > Supprimer le compte. Une confirmation vous est demandée, puis tout est supprimé : conversations, fichiers, sites, agents, historique. C''est irréversible. Si vous voulez une copie avant, téléchargez vos données depuis la même page.', 'privacy', 0, true, array['supprimer mon compte', 'effacer mon compte', 'fermer mon compte', 'supprimer le compte']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
