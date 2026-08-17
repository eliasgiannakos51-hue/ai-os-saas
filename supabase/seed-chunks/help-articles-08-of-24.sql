-- Help Centre seed, part 8 of 24 — 6 statements.
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
values ('data-privacy', 'el', 'Τι κάνετε με τα δεδομένα μου;', 'Τα δεδομένα σου είναι δικά σου. Δεν τα πουλάμε, δεν τα χρησιμοποιούμε για εκπαίδευση μοντέλων, και κάθε λογαριασμός βλέπει μόνο τα δικά του — αυτό επιβάλλεται στη βάση, όχι μόνο στην εφαρμογή. Μπορείς να τα κατεβάσεις ή να τα διαγράψεις όποτε θες.', 'privacy', 2, true, array['δεδομενα μου', 'ιδιωτικοτητα', 'privacy', 'ασφαλεια', 'τα πουλατε', 'εκπαιδευση μοντελων']::text[], '/privacy')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('password-reset', 'el', 'Ξέχασα τον κωδικό μου.', 'Στη σελίδα σύνδεσης πάτα «Ξέχασα τον κωδικό μου» και βάλε το email σου. Θα σου έρθει σύνδεσμος επαναφοράς. Αν δεν φτάνει, κοίτα και στα ανεπιθύμητα.', 'account', 1, true, array['ξεχασα τον κωδικο', 'password', 'reset password', 'επαναφορα κωδικου', 'δεν μπορω να μπω']::text[], '/login')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('team-members', 'el', 'Μπορώ να προσθέσω άτομα από την ομάδα μου;', 'Ναι, στα πλάνα που περιλαμβάνουν ομάδα. Ρυθμίσεις > Ομάδα, προσκαλείς με email και το άτομο μπαίνει στον ίδιο χώρο εργασίας. Ποια πλάνα το έχουν και πόσες θέσεις δίνουν θα το δεις στο /pricing.', 'account', 2, true, array['ομαδα', 'team', 'συνεργατες', 'προσκληση μελους', 'collaboration', 'χρηστες']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('notifications', 'el', 'Πώς ρυθμίζω τις ειδοποιήσεις;', 'Ρυθμίσεις > Ειδοποιήσεις. Ξεχωριστά για email και για ειδοποιήσεις στο κινητό, και ανά τύπο — αποτελέσματα agent, υπενθυμίσεις, χαμηλά credits. Οι κρίσιμες ειδοποιήσεις ασφαλείας δεν απενεργοποιούνται.', 'account', 3, true, array['ειδοποιησεις', 'notifications', 'email ειδοποιησεις', 'push', 'να μη μου στελνετε']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('mobile-app', 'el', 'Υπάρχει εφαρμογή για κινητό;', 'Το Ionexa εγκαθίσταται στο κινητό σου απευθείας από τον browser — άνοιξέ το και διάλεξε «Προσθήκη στην αρχική οθόνη». Λειτουργεί σαν κανονική εφαρμογή, με εικονίδιο και ειδοποιήσεις, χωρίς να περάσεις από app store.', 'getting-started', 1, true, array['εφαρμογη κινητου', 'mobile app', 'android', 'iphone', 'ios', 'κινητο', 'app']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'el', 'Τι είναι το Ionexa;', 'Ένας χώρος εργασίας όπου λες τι θέλεις και γίνεται: φτιάχνει websites, τρέχει agents που δουλεύουν μόνοι τους σε πρόγραμμα, σπάει στόχους σε βήματα, διαβάζει τα αρχεία σου και απαντά πάνω σε αυτά. Αντί για δέκα ξεχωριστά εργαλεία που δεν μιλάνε μεταξύ τους, ένα που τα ξέρει όλα.', 'getting-started', 2, true, array['τι ειναι το ionexa', 'what is ionexa', 'τι κανει', 'τι προσφερετε', 'about']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
