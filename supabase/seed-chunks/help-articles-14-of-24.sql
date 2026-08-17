-- Help Centre seed, part 14 of 24 — 7 statements.
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
values ('create-website', 'de', 'Wie baue ich eine Website?', 'Öffne Website Builder in der Seitenleiste, schreib in normalen Worten, was du willst — was dein Geschäft macht, für wen es ist, welcher Stil dir gefällt — und starte die Erzeugung. Du kannst auch Referenzbilder hochladen, ein Logo oder Produktfotos, damit sie deinem Look folgt. Wenn sie fertig ist, veröffentlichst du sie mit einem Klick unter eigener Adresse.', 'websites', 0, true, array['website bauen', 'website erstellen', 'homepage', 'ich will eine seite', 'website builder']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'de', 'Wie erstelle ich einen Agent?', 'Im Menü Agents beschreibst du in einem Satz, was getan werden soll und wie oft — zum Beispiel "schick mir jeden Morgen eine Zusammenfassung der Branchennews". Ionexa baut den Agent selbst, lässt ihn pünktlich laufen und schickt dir das Ergebnis. Du kannst ihn jederzeit pausieren oder ändern.', 'agents', 0, true, array['agent erstellen', 'agent bauen', 'agents', 'automatisieren', 'automatisierung']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'de', 'Wie erstelle ich eine Mission?', 'In Mission Control schreibst du ein Ziel so, wie du es einem Menschen sagen würdest: "ich will bis zum Frühjahr mehr Kunden". Ionexa zerlegt es in konkrete Schritte, und du kannst sie dann selbst abarbeiten oder einzelne an einen Agent übergeben.', 'missions', 0, true, array['mission erstellen', 'mission control', 'ziel', 'ziele', 'missionen']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'de', 'Kann ich Dateien hochladen?', 'Ja — PDF, Word, Excel, CSV, Text und Markdown. Du lädst sie unter Dateien hoch, Ionexa liest ihren Inhalt, und danach kannst du Fragen dazu stellen. Deine Dateien sind privat: niemand sonst hat Zugriff, und jeder Download läuft über einen temporären Link.', 'files', 0, true, array['datei hochladen', 'hochladen', 'pdf', 'dateien', 'dokumente']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'de', 'Wie verbinde ich Gmail oder Google Drive?', 'Einstellungen > Verbindungen. Wähl den Dienst und bestätige den Zugriff in Googles eigenem Fenster. Du siehst vor der Bestätigung genau, was gelesen wird, und kannst jederzeit trennen — die Zugriffsschlüssel werden dann sofort gelöscht.', 'integrations', 0, true, array['gmail', 'google drive', 'verbinden', 'integration', 'slack']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('data-privacy', 'de', 'Was macht ihr mit meinen Daten?', 'Deine Daten gehören dir. Wir verkaufen sie nicht, wir trainieren keine Modelle damit, und jedes Konto sieht nur die eigenen — das wird in der Datenbank erzwungen, nicht bloß in der Anwendung. Du kannst sie jederzeit herunterladen oder löschen.', 'privacy', 2, true, array['meine daten', 'datenschutz', 'sicherheit', 'verkauft ihr meine daten', 'modelle trainieren']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'de', 'Wie lösche ich mein Konto?', 'Einstellungen > Konto > Konto löschen. Du wirst um Bestätigung gebeten, danach ist alles weg: Unterhaltungen, Dateien, Websites, Agents, Verlauf. Das lässt sich nicht rückgängig machen. Wenn du vorher eine Kopie willst, lad deine Daten auf derselben Seite herunter.', 'privacy', 0, true, array['konto löschen', 'account löschen', 'konto schließen', 'profil löschen']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
