-- Help Centre seed, part 13 of 24 — 7 statements.
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
values ('chat-memory', 'fr', 'Le chat se souvient-il des conversations précédentes ?', 'À l''intérieur d''une même conversation, il se souvient toujours des messages précédents. D''une conversation à l''autre, il ne garde que ce qui reste durablement utile — votre nom, votre métier, vos préférences — et cela existe sur les formules payantes. Vous pouvez voir tout ce qu''il a gardé, et le supprimer, dans Paramètres > Mémoire.', 'chat', 0, true, array['se souvient', 'mémoire', 'conversations précédentes', 'il oublie', 'il ne se souvient pas', 'historique du chat']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'de', 'Was ist Ionexa?', 'Ein Arbeitsbereich, in dem die KI die Arbeit macht statt nur zu beraten: sie baut deine Website, lässt Agents nach Zeitplan laufen, zerlegt deine Ziele in Schritte, liest deine Dateien und beantwortet Fragen dazu, und hält alles Erfasste an einem durchsuchbaren Ort.', 'getting-started', 2, true, array['was ist ionexa', 'was ist das', 'wofür ist das', 'was macht das', 'wie funktioniert das']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'de', 'Was kostet Ionexa?', 'Es gibt einen kostenlosen Tarif zum Ausprobieren und bezahlte Tarife, wenn die Anforderungen wachsen. Die aktuellen Preise und was jeder Tarif enthält stehen immer auf /pricing — hier nicht, weil sie sich ändern und eine veraltete Zahl schlechter ist als keine.', 'billing', 0, true, array['was kostet', 'preis', 'preise', 'tarife', 'abo', 'abonnement']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'de', 'Was sind Credits?', 'Credits sind die Währung, mit der du KI-Aktionen bezahlst: eine Chat-Nachricht, das Erzeugen einer Website, ein Agent-Lauf. Jeder Tarif enthält ein monatliches Kontingent, das sich erneuert, und du kannst Pakete nachkaufen, wenn es früher aufgebraucht ist. Wie viel jeder Tarif enthält, steht auf /pricing.', 'credits', 0, true, array['was sind credits', 'credits', 'wie funktionieren credits', 'einheiten']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'de', 'Meine Credits sind aufgebraucht — was jetzt?', 'Zwei Möglichkeiten: auf die monatliche Erneuerung warten oder ein Credit-Paket kaufen, das sofort gutgeschrieben wird und zum Monatsende nicht verfällt. Beides in Einstellungen > Abrechnung.', 'credits', 2, true, array['keine credits mehr', 'credits aufgebraucht', 'credits kaufen', 'mehr credits']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'de', 'Wie wechsle ich den Tarif?', 'Einstellungen > Abrechnung. Wähl den gewünschten Tarif, die Änderung gilt sofort. Beim Upgrade zahlst du nur die Differenz für den Rest der Periode; beim Downgrade behältst du den aktuellen Tarif bis zum Ende der bereits bezahlten Periode.', 'billing', 1, true, array['tarif wechseln', 'upgrade', 'downgrade', 'abo ändern']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'de', 'Wie kündige ich mein Abo?', 'Einstellungen > Abrechnung > Abo kündigen. Du verlierst den Zugang nicht sofort: dein Tarif läuft bis zum Ende der bereits bezahlten Periode, danach fällt das Konto auf den kostenlosen Tarif. Deine Daten bleiben — Kündigen löscht nichts.', 'billing', 2, true, array['kündigen', 'abo kündigen', 'abbestellen', 'abo beenden']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
