-- Help Centre seed, part 5 of 24 — 6 statements.
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
values ('invoices', 'el', 'Πού βρίσκω τις αποδείξεις μου;', 'Ρυθμίσεις > Χρέωση > Ιστορικό πληρωμών. Κάθε χρέωση έχει απόδειξη σε PDF που κατεβάζεις από εκεί. Οι πληρωμές γίνονται μέσω Stripe και δεν αποθηκεύουμε ποτέ τα στοιχεία της κάρτας σου.', 'billing', 3, true, array['αποδειξη', 'αποδειξεις', 'τιμολογιο', 'invoice', 'receipt', 'ιστορικο πληρωμων']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('refund', 'el', 'Μπορώ να ζητήσω επιστροφή χρημάτων;', 'Ναι — γράψε μας τι έγινε και θα το δούμε. Αν χρεώθηκες κατά λάθος ή κάτι δεν δούλεψε όπως έπρεπε, το διορθώνουμε. Στείλε μήνυμα από τις Ρυθμίσεις > Υποστήριξη με τον αριθμό της χρέωσης.', 'billing', 4, true, array['επιστροφη χρηματων', 'refund', 'να μου επιστρεψετε', 'χρεωθηκα λαθος']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-are-credits', 'el', 'Τι είναι τα credits;', 'Τα credits είναι το νόμισμα με το οποίο πληρώνεις τις ενέργειες AI: ένα μήνυμα στο chat, μια δημιουργία website, μια εκτέλεση agent. Κάθε πλάνο δίνει ένα μηνιαίο απόθεμα που ανανεώνεται, και μπορείς να αγοράσεις έξτρα πακέτα αν τελειώσουν νωρίτερα. Πόσα δίνει το κάθε πλάνο θα το δεις στο /pricing.', 'credits', 0, true, array['τι ειναι τα credits', 'τι ειναι credits', 'credits', 'μοναδες', 'what are credits', 'πως δουλευουν τα credits']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credit-cost-per-action', 'el', 'Πόσα credits κοστίζει κάθε ενέργεια;', 'Η χρέωση δεν είναι σταθερή ανά ενέργεια — υπολογίζεται από το πραγματικό κόστος της κάθε κλήσης, οπότε ένα σύντομο μήνυμα κοστίζει λιγότερο από ένα μεγάλο. Πριν από κάθε ακριβή ενέργεια βλέπεις εκτίμηση, και μετά την ολοκλήρωση βλέπεις την πραγματική χρέωση στο ιστορικό σου.', 'credits', 1, true, array['ποσα credits κοστιζει', 'ποσο χρεωνει', 'ποσα credits χρειαζονται', 'χρεωση ανα', 'how many credits', 'credit cost']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-ran-out', 'el', 'Τελείωσαν τα credits μου — τι κάνω;', 'Δύο επιλογές: περιμένεις την επόμενη μηνιαία ανανέωση, ή αγοράζεις ένα πακέτο credits που προστίθεται αμέσως και δεν λήγει στο τέλος του μήνα. Και τα δύο γίνονται από τις Ρυθμίσεις > Χρέωση.', 'credits', 2, true, array['τελειωσαν τα credits', 'δεν εχω credits', 'εξαντληθηκαν', 'ran out of credits', 'πως αγοραζω credits', 'να παρω credits']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('credits-rollover', 'el', 'Μεταφέρονται τα credits στον επόμενο μήνα;', 'Τα μηνιαία credits του πλάνου ανανεώνονται κάθε μήνα και δεν συσσωρεύονται. Τα credits που αγοράζεις σε πακέτο είναι διαφορετικά: μένουν στον λογαριασμό σου μέχρι να τα χρησιμοποιήσεις.', 'credits', 3, true, array['μεταφερονται', 'rollover', 'χανονται τα credits', 'συσσωρευονται', 'expire credits']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
