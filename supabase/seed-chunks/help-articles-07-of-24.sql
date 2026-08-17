-- Help Centre seed, part 7 of 24 — 6 statements.
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
values ('chat-memory', 'el', 'Θυμάται το chat προηγούμενες συνομιλίες;', 'Μέσα στην ίδια συνομιλία θυμάται πάντα τα προηγούμενα μηνύματα. Ανάμεσα σε διαφορετικές συνομιλίες κρατά μόνο μόνιμα χρήσιμα στοιχεία — όνομα, επάγγελμα, προτιμήσεις — και αυτό υπάρχει στα επί πληρωμή πλάνα. Μπορείς να δεις ό,τι έχει κρατήσει, και να το σβήσεις, από τις Ρυθμίσεις > Μνήμη.', 'chat', 0, true, array['θυμαται', 'μνημη', 'memory', 'προηγουμενες συνομιλιες', 'ξεχναει', 'δεν θυμαται']::text[], '/dashboard/memory')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('upload-files', 'el', 'Μπορώ να ανεβάσω αρχεία;', 'Ναι — PDF, Word, Excel, CSV, κείμενο και Markdown. Τα ανεβάζεις στο Files, το Ionexa διαβάζει το περιεχόμενό τους και μετά μπορείς να κάνεις ερωτήσεις πάνω σε αυτά. Τα αρχεία σου είναι ιδιωτικά: κανείς άλλος δεν έχει πρόσβαση και κάθε κατέβασμα γίνεται με προσωρινό σύνδεσμο.', 'files', 0, true, array['ανεβασω αρχειο', 'upload', 'pdf', 'αρχεια', 'files', 'εγγραφα']::text[], '/dashboard/files')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('connect-gmail', 'el', 'Πώς συνδέω Gmail ή Google Drive;', 'Ρυθμίσεις > Συνδέσεις. Διαλέγεις την υπηρεσία και εγκρίνεις την πρόσβαση στο παράθυρο της Google. Βλέπεις ακριβώς τι θα διαβάζει πριν το εγκρίνεις, και μπορείς να αποσυνδέσεις όποτε θες — τότε τα κλειδιά πρόσβασης διαγράφονται αμέσως.', 'integrations', 0, true, array['gmail', 'google drive', 'συνδεση', 'integration', 'slack', 'πως συνδεω', 'connect']::text[], '/dashboard/integrations')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('languages', 'el', 'Σε ποιες γλώσσες δουλεύει;', 'Το περιβάλλον υπάρχει σε δέκα γλώσσες και το αλλάζεις από τις Ρυθμίσεις. Το AI απαντά στη γλώσσα που του γράφεις, ανεξάρτητα από τη γλώσσα του περιβάλλοντος.', 'getting-started', 0, true, array['γλωσσα', 'γλωσσες', 'language', 'αγγλικα', 'ελληνικα', 'μεταφραση']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('delete-account', 'el', 'Πώς διαγράφω τον λογαριασμό μου;', 'Ρυθμίσεις > Λογαριασμός > Διαγραφή λογαριασμού. Θα σου ζητηθεί επιβεβαίωση, και μετά διαγράφονται όλα: συνομιλίες, αρχεία, websites, agents, ιστορικό. Δεν είναι αναστρέψιμο. Αν θέλεις πρώτα αντίγραφο, κατέβασε τα δεδομένα σου από την ίδια σελίδα.', 'privacy', 0, true, array['διαγραφη λογαριασμου', 'delete account', 'να σβησω τον λογαριασμο', 'κλεισιμο λογαριασμου']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('export-data', 'el', 'Μπορώ να κατεβάσω τα δεδομένα μου;', 'Ναι. Ρυθμίσεις > Λογαριασμός > Εξαγωγή δεδομένων. Παίρνεις ένα αρχείο με όλα όσα έχεις δημιουργήσει — συνομιλίες, missions, websites, αρχεία, ιστορικό χρεώσεων. Τα κλειδιά πρόσβασης των συνδεδεμένων λογαριασμών εξαιρούνται για λόγους ασφάλειας.', 'privacy', 1, true, array['κατεβασω τα δεδομενα', 'export', 'εξαγωγη', 'gdpr', 'αντιγραφο δεδομενων']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
