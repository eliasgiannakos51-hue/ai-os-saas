-- Help Centre seed, part 6 of 24 — 5 statements.
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
values ('create-website', 'el', 'Πώς φτιάχνω website;', 'Πήγαινε στο Website Builder από το πλαϊνό μενού, γράψε με απλά λόγια τι θέλεις (τι κάνει η επιχείρησή σου, σε ποιον απευθύνεται, τι ύφος θες) και πάτα δημιουργία. Μπορείς να ανεβάσεις και εικόνες αναφοράς — λογότυπο, φωτογραφίες προϊόντων — για να ακολουθήσει το στυλ σου. Όταν είναι έτοιμο, το δημοσιεύεις σε δική του διεύθυνση με ένα κλικ.', 'websites', 0, true, array['πως φτιαχνω website', 'πως φτιαχνω ιστοσελιδα', 'δημιουργια website', 'create website', 'θελω ενα site', 'website builder', 'ιστοσελιδα']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('publish-website', 'el', 'Πώς δημοσιεύω το website μου;', 'Από το Website Builder, άνοιξε το site και πάτα Δημοσίευση. Διαλέγεις ένα όνομα για τη διεύθυνση και το site γίνεται αμέσως ζωντανό. Κάθε δημοσίευση κρατιέται σαν έκδοση, οπότε μπορείς να γυρίσεις πίσω σε προηγούμενη αν χρειαστεί.', 'websites', 1, true, array['πως δημοσιευω', 'publish', 'να το ανεβασω', 'live site', 'δημοσιευση site']::text[], '/dashboard/website-builder')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-agent', 'el', 'Πώς φτιάχνω agent;', 'Στο μενού Agents, περίγραψε σε μία πρόταση τι θέλεις να κάνει και κάθε πότε — π.χ. «κάθε πρωί στείλε μου περίληψη των νέων του κλάδου μου». Το Ionexa φτιάχνει τον agent μόνο του, τον τρέχει στην ώρα του και σου στέλνει το αποτέλεσμα. Μπορείς να τον σταματήσεις ή να τον αλλάξεις όποτε θες.', 'agents', 0, true, array['πως φτιαχνω agent', 'δημιουργια agent', 'create agent', 'αυτοματοποιηση', 'agents', 'θελω εναν agent']::text[], '/dashboard/agents')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('create-mission', 'el', 'Πώς φτιάχνω mission;', 'Στο Mission Control γράφεις έναν στόχο όπως θα τον έλεγες σε άνθρωπο — «θέλω περισσότερους πελάτες μέχρι την άνοιξη». Το Ionexa τον σπάει σε συγκεκριμένα βήματα, και μετά μπορείς να τα δουλέψεις μόνος σου ή να αναθέσεις κάποια σε agent.', 'missions', 0, true, array['πως φτιαχνω mission', 'mission control', 'στοχος', 'στοχους', 'create mission', 'missions']::text[], '/dashboard/mission')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('invite-code', 'el', 'Πού βάζω τον κωδικό πρόσκλησης;', 'Στη φόρμα εγγραφής υπάρχει πεδίο για κωδικό πρόσκλησης. Αν έχεις ήδη λογαριασμό, τον καταχωρείς από τις Ρυθμίσεις > Λογαριασμός. Μόλις περάσει, τα προνόμια που δίνει ενεργοποιούνται αμέσως στον λογαριασμό σου.', 'account', 0, true, array['κωδικος προσκλησης', 'invite code', 'beta code', 'κωδικο beta', 'που βαζω τον κωδικο', 'προσκληση']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
