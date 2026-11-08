-- ---------------------------------------------------------------------------
-- Λειτουργία: Shadow / Supervised / Auto, ανά αυτοματοποίηση — Automations
-- Κομμάτι 2a (οδηγία 55, μετά το Κομμάτι 1 στο 20261104; «χτίσε το να
-- δουλεύει και να είναι αυτόματο», ο ιδιοκτήτης, 2026-11-08).
--
-- ONE NULLABLE-BY-DEFAULT COLUMN, THREE VALUES:
--   auto        όπως σήμερα — καμία αλλαγή συμπεριφοράς. ΠΡΟΕΠΙΛΟΓΗ.
--   shadow      κάθε τρέξιμο από το πρόγραμμα ή από αρχείο (ΟΧΙ από το
--               δικό σου «Εκτέλεση τώρα») τρέχει στεγνό — "would" αντί
--               για πραγματική ενέργεια, ίδιο σχήμα με το {dry:true} της
--               «Δοκιμής» που υπάρχει ήδη (src/lib/automations/runner.ts).
--               Κανένα ρίσκο όσο δοκιμάζεις μια καινούρια αυτοματοποίηση.
--   supervised  κάθε κουτί «ενέργεια» χωρίς δικό του «έγκριση» από πριν
--               παίρνει ΕΝΑ αυτόματα, πριν εκτελεστεί — τίποτα πραγματικό
--               χωρίς δικό σου «ναι», ακόμα και αν το ξέχασες στο σχέδιο.
--
-- FAILS TOWARDS 'auto', ΟΧΙ ΤΥΧΑΙΑ: το ίδιο σχήμα με κάθε διακόπτη στο
-- src/lib/flags/flags.ts — μια στήλη που λείπει, μια τιμή που δεν
-- αναγνωρίζεται, ένας σφάλμα ανάγνωσης: όλα διαβάζονται «auto», ποτέ
-- «shadow» ή «supervised» από λάθος, που θα έκρυβε ή θα κρατούσε
-- πραγματικές ενέργειες χωρίς να το ζητήσει κανείς.
--
-- ΟΧΙ ΣΤΟ FLOW_COLUMNS (src/lib/automations/flow-access.ts): ίδιος λόγος
-- με το minutes_saved (20261114000000) — μέχρι να τρέξει αυτό το αρχείο,
-- μια select με αυτή τη στήλη θα αδειάζε την οθόνη ΚΑΘΕ αυτοματοποίησης.
-- Διαβάζεται σε ΔΙΚΗ ΤΟΥ query (src/lib/automations/flow-access.ts's
-- modeFor/modesByFlowIds), που σε λάθος ή σε λείπουσα στήλη γυρίζει
-- "auto" — η ασφαλέστερη αποτυχία, αφού "auto" είναι ήδη η συμπεριφορά
-- πριν από αυτό το Κομμάτι.
--
-- ΤΟ ΕΡΓΑΛΕΙΟ ΔΟΥΛΕΥΕΙ ΠΡΙΝ ΤΡΕΞΕΙ ΑΥΤΟ: χωρίς τη στήλη, κάθε
-- modeFor/modesByFlowIds γυρίζει "auto" και καμία αυτοματοποίηση δεν
-- αλλάζει συμπεριφορά.
--
-- Idempotent: add column if not exists, drop constraint if exists πριν.
-- How to check it after running: npm run db:pending; /api/health lists
-- automation_flows.
-- How to undo: alter table public.automation_flows drop column if
--              exists mode; (καμία αυτοματοποίηση δεν χάνεται — κάθε μία
--              διαβάζεται ξανά ως "auto", δηλαδή όπως σήμερα).
-- ---------------------------------------------------------------------------

alter table public.automation_flows
  add column if not exists mode text not null default 'auto';

alter table public.automation_flows
  drop constraint if exists automation_flows_mode_check;

alter table public.automation_flows
  add constraint automation_flows_mode_check check (mode in ('auto', 'shadow', 'supervised'));
