-- Help Centre seed, part 4 of 24 — 6 statements.
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
values ('mobile-app', 'en', 'Is there a mobile app?', 'There is no app in the stores, but Ionexa installs on your phone from the browser: open it, choose "Add to Home Screen", and it behaves like an app with its own icon and notifications. It works on the phone''s browser without installing anything too.', 'getting-started', 1, true, array['mobile app', 'app', 'android', 'iphone', 'ios', 'is there an app', 'on my phone']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('what-is-ionexa', 'en', 'What is Ionexa?', 'A workspace where the AI does the work rather than only advising you: it makes your website, runs agents on a schedule, breaks your goals into steps, reads your files and answers questions about them, and keeps everything you have logged in one searchable place.', 'getting-started', 2, true, array['what is ionexa', 'what is this', 'what does it do', 'what can it do', 'how does it work']::text[], null)
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('contact-support', 'en', 'How do I contact you?', 'Settings > Support, or reply to any email we have sent you. A person reads it — say what you were trying to do and what happened instead, and we will come back to you.', 'account', 4, true, array['contact', 'support', 'help', 'talk to a human', 'customer service', 'email you']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('pricing-overview', 'el', 'Πόσο κοστίζει το Ionexa;', 'Υπάρχει δωρεάν πλάνο για να δοκιμάσεις, και επί πληρωμή πλάνα καθώς μεγαλώνουν οι ανάγκες σου. Οι τρέχουσες τιμές και το τι περιλαμβάνει το καθένα είναι πάντα στη σελίδα /pricing — δεν τις γράφω εδώ γιατί αλλάζουν και δεν θέλω να σου δώσω παλιό νούμερο.', 'billing', 0, true, array['ποσο κοστιζει', 'τιμη', 'τιμες', 'κοστος', 'ποσο κανει', 'how much', 'pricing', 'price', 'τι πακετα υπαρχουν', 'ποια πακετα', 'πλανα', 'plans', 'συνδρομη', 'subscription']::text[], '/pricing')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('change-plan', 'el', 'Πώς αλλάζω πλάνο;', 'Από τις Ρυθμίσεις > Χρέωση. Επιλέγεις το πλάνο που θέλεις και η αλλαγή ισχύει αμέσως. Σε αναβάθμιση πληρώνεις μόνο τη διαφορά για το υπόλοιπο της περιόδου· σε υποβάθμιση κρατάς το τρέχον πλάνο μέχρι να τελειώσει η περίοδος που έχεις ήδη πληρώσει.', 'billing', 1, true, array['πως αλλαζω πλανο', 'αλλαγη πλανου', 'αναβαθμιση', 'upgrade', 'downgrade', 'υποβαθμιση', 'change plan', 'αλλαξω συνδρομη']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;

insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values ('cancel', 'el', 'Πώς ακυρώνω τη συνδρομή μου;', 'Ρυθμίσεις > Χρέωση > Ακύρωση συνδρομής. Δεν χάνεις αμέσως την πρόσβαση: το πλάνο σου συνεχίζει μέχρι το τέλος της περιόδου που έχεις ήδη πληρώσει και μετά ο λογαριασμός πέφτει στο δωρεάν πλάνο. Τα δεδομένα σου μένουν — δεν διαγράφεται τίποτα με την ακύρωση.', 'billing', 2, true, array['πως ακυρωνω', 'ακυρωση', 'να ακυρωσω', 'cancel', 'unsubscribe', 'διακοπη συνδρομης', 'σταματησω τη συνδρομη']::text[], '/dashboard/settings')
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;
