-- Help Centre seed, part 11 of 24 — 7 statements.
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
values ('chat-memory', 'es', '¿El chat recuerda conversaciones anteriores?', 'Dentro de una misma conversación siempre recuerda los mensajes anteriores. Entre conversaciones distintas guarda solo lo que sigue siendo útil — su nombre, a qué se dedica, sus preferencias — y eso está en los planes de pago. Puede ver todo lo que ha guardado, y borrarlo, en Ajustes > Memoria.', 'chat', 0, true, array['recuerda', 'memoria', 'conversaciones anteriores', 'se olvida', 'no recuerda', 'historial del chat']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'fr', 'Qu''est-ce qu''Ionexa ?', 'Un espace de travail où l''IA fait le travail au lieu de seulement conseiller : elle crée votre site, exécute des agents selon un calendrier, découpe vos objectifs en étapes, lit vos fichiers et répond à vos questions dessus, et conserve tout ce que vous consignez en un seul endroit consultable.', 'getting-started', 2, true, array['qu''est-ce qu''ionexa', 'c''est quoi', 'à quoi ça sert', 'que fait-il', 'comment ça marche']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'fr', 'Combien coûte Ionexa ?', 'Il y a une formule gratuite pour essayer, et des formules payantes à mesure que vos besoins grandissent. Les tarifs actuels et ce que chacune comprend sont toujours sur la page /pricing : ils ne sont pas écrits ici parce qu''ils changent, et un chiffre périmé vaut moins que pas de chiffre.', 'billing', 0, true, array['combien ça coûte', 'prix', 'tarif', 'tarifs', 'formules', 'abonnement']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'fr', 'Que sont les crédits ?', 'Les crédits sont la monnaie avec laquelle vous payez les actions d''IA : un message de chat, la génération d''un site, l''exécution d''un agent. Chaque formule comprend une allocation mensuelle qui se renouvelle, et vous pouvez acheter des packs si elle s''épuise plus tôt. Ce que comprend chaque formule est sur /pricing.', 'credits', 0, true, array['que sont les crédits', 'crédits', 'comment marchent les crédits', 'unités']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'fr', 'Je n''ai plus de crédits, que faire ?', 'Deux possibilités : attendre le renouvellement mensuel, ou acheter un pack de crédits, ajouté immédiatement et qui n''expire pas en fin de mois. Les deux se font dans Paramètres > Facturation.', 'credits', 2, true, array['plus de crédits', 'crédits épuisés', 'acheter des crédits', 'recharger']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'fr', 'Comment changer de formule ?', 'Paramètres > Facturation. Choisissez la formule voulue et le changement prend effet immédiatement. En montée de gamme vous ne payez que la différence pour le reste de la période ; en descente vous gardez la formule actuelle jusqu''à la fin de la période déjà payée.', 'billing', 1, true, array['changer de formule', 'changer d''offre', 'passer au supérieur', 'rétrograder']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'fr', 'Comment résilier mon abonnement ?', 'Paramètres > Facturation > Résilier l''abonnement. Vous ne perdez pas l''accès tout de suite : votre formule court jusqu''à la fin de la période déjà payée, puis le compte passe à la formule gratuite. Vos données restent — résilier ne supprime rien.', 'billing', 2, true, array['résilier', 'annuler l''abonnement', 'me désabonner', 'arrêter l''abonnement']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
