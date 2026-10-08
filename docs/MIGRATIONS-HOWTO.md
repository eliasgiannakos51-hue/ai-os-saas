# Πώς τρέχεις ένα migration — βήμα προς βήμα

Για τον ιδιοκτήτη, χωρίς τεχνικές γνώσεις. Γράφτηκε 2026-10-04, για τα
δύο migrations της ημέρας. Ο τρόπος είναι ίδιος για κάθε επόμενο. Ο
κανόνας είναι του `docs/CONTEXT.md` («ΤΡΟΠΟΣ ΛΕΙΤΟΥΡΓΙΑΣ» §7.3): κάθε
migration έρχεται με περιεχόμενο, προεπισκόπηση, αντίγραφο ασφαλείας,
έλεγχο και τι κάνεις αν αποτύχει.

Κανένα migration δεν τρέχει μόνο του. Αν δεν το επικολλήσεις εσύ, δεν
τρέχει ποτέ, και τίποτα δεν το λέει (`CLAUDE.md`).

---

## 1. Πού βρίσκονται

- Branch: το branch του pull request που τα φέρνει (το γράφει πάνω πάνω
  στη σελίδα του pull request), ή `main` αφού γίνει merge, στο repository
  `eliasgiannakos51-hue/ai-os-saas`. (Μέχρι 2026-10-07 εδώ έγραφε ένα
  σταθερό branch· κάθε πακέτο έχει πια το δικό του.)
- Φάκελος: `supabase/migrations/`.
- Στο GitHub: στη σελίδα του pull request → "Files changed" → το αρχείο
  του migration → "..." → "View file" → κουμπί "Copy raw file" (δύο
  τετράγωνα, πάνω δεξιά στο περιεχόμενο). Ή, μετά το merge: άνοιξε το
  repository → φάκελος `supabase` → `migrations` → πάτησε το αρχείο →
  "Copy raw file".

## 2. Πού τα επικολλάς

1. https://supabase.com/dashboard → σύνδεση → διάλεξε το project του
   Ionexa.
2. Αριστερή στήλη: **SQL Editor**.
3. Πάνω αριστερά: **+ New query** (ή «New SQL snippet»).
4. Επικόλληση στο μεγάλο πεδίο.
5. Κάτω δεξιά: **Run** (ή Ctrl+Enter / Cmd+Enter).
6. Το αποτέλεσμα φαίνεται κάτω από το πεδίο, στην καρτέλα «Results».

Αν το Supabase σε ρωτήσει «This query has destructive operations…»
(για το migration της μνήμης θα το κάνει, γιατί σβήνει διπλές γραμμές),
πάτα «Run this query» μόνο αφού κάνεις το βήμα 0 και το 3.

## 3. Η σειρά

0. **Τι έχει ήδη τρέξει.** Ένα ερώτημα μόνο ανάγνωσης βγάζει κάθε
   αντικείμενο που λείπει από τη βάση, με το αρχείο που το φτιάχνει.
   Το παράγει το `npm run db:pending -- --sql` (είναι μεγάλο, ~63 KB·
   σου το στέλνω ως αρχείο). Επικόλληση και Run.
   - **Κενό αποτέλεσμα («Success. No rows returned»)**: ό,τι μπορεί να
     ελεγχθεί, υπάρχει. Τα δύο της ημέρας έχουν ήδη τρέξει.
   - **Γραμμές**: κάθε γραμμή λέει ένα αρχείο που δεν έχει τρέξει (ή
     έτρεξε μισό). Τρέχεις αυτά τα αρχεία, με τη σειρά του ονόματός
     τους (το όνομα αρχίζει με ημερομηνία), πριν από τα επόμενα.
   - Ειδικά για τη μνήμη: αν βγει γραμμή με
     `20261003000000_chat_memory_dedup_and_retention.sql`, αυτό τρέχει
     **πρώτο**· το migration της μνήμης παρακάτω το χρειάζεται.
1. `20261004200000_ai_jobs_timeline.sql` — το απλό. Μόνο προσθέτει μια
   στήλη, δεν αλλάζει και δεν σβήνει τίποτα. Δεν θέλει αντίγραφο.
2. `20261004100000_chat_memory_fold_matches_app.sql` — αυτό σβήνει
   γραμμές (μόνο διπλές). Πρώτα προεπισκόπηση, μετά αντίγραφο, μετά
   Run.

Η σειρά των δύο μεταξύ τους δεν έχει σημασία· το απλό πρώτο για να
δεις πώς πάει.

## 4. Προεπισκόπηση της μνήμης (πριν το migration)

Μόνο ανάγνωση. Είναι το ίδιο ερώτημα που υπάρχει σχολιασμένο στο τέλος
του αρχείου:

```sql
select user_id,
       btrim(regexp_replace(btrim(regexp_replace(
         public.search_fold(memory_text), '\s+', ' ', 'g')),
         '[.!?;··。！？؟۔]+$', '')) as fact,
       count(*) as rows_now
  from public.chat_memory
 group by 1, 2
having count(*) > 1;
```

Τι περιμένεις:
- **Κενό**: δεν υπάρχει τίποτα να ενωθεί. Το migration θα αλλάξει μόνο
  το «κλειδί» των γραμμών, τίποτα δεν σβήνεται.
- **Γραμμές**: κάθε γραμμή είναι ένα γεγονός που ένας χρήστης έχει
  γραμμένο 2 ή περισσότερες φορές, που διαφέρουν μόνο σε τελεία ή
  κενά. `rows_now` = πόσες. Μετά το migration μένει μία, με το
  άθροισμα των «φορές που ειπώθηκε».
- **Σφάλμα `function public.search_fold(text) does not exist`** ή
  **`column "memory_fold" does not exist`**: λείπει παλιότερο
  migration. Γύρνα στο βήμα 0.

## 5. Αντίγραφο ασφαλείας (πριν το migration της μνήμης)

Το Supabase κρατά δικά του αντίγραφα μόνο σε πληρωμένο πλάνο
(αριστερή στήλη → Database → Backups). Δεν έχω δει τον λογαριασμό σου
και δεν ξέρω αν τα έχεις. Ο σίγουρος τρόπος, που δουλεύει σε κάθε
πλάνο: αντίγραφο του πίνακα που αλλάζει, μέσα στην ίδια βάση.

```sql
create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table backup.chat_memory_20261004 as table public.chat_memory;
select count(*) as rows_backed_up from backup.chat_memory_20261004;
```

- Το `backup` είναι χωριστό από το `public`, άρα το API της εφαρμογής
  δεν το βλέπει. **Μην το φτιάξεις μέσα στο `public`**: εκεί ένας νέος
  πίνακας χωρίς κανόνες πρόσβασης μπορεί να διαβαστεί από έξω.
- Ο αριθμός που βγαίνει (`rows_backed_up`) πρέπει να είναι ίσος με το
  `select count(*) from public.chat_memory;`.
- Όταν βεβαιωθείς ότι όλα δουλεύουν (π.χ. μετά από μία εβδομάδα):
  `drop table backup.chat_memory_20261004;`

Για το `ai_jobs_timeline` δεν χρειάζεται: μόνο προσθέτει στήλη.

## 6. Έλεγχος ότι πέτυχαν

Μετά το Run, κάτω από το πεδίο πρέπει να δεις «Success». Το migration
της μνήμης γράφει και μια σημείωση (στην καρτέλα «Messages» ή
«Notices», αν υπάρχει) της μορφής
`chat_memory: merged N row(s), re-folded M row(s)`.

Μετά τρέξε αυτό (μόνο ανάγνωση):

```sql
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_jobs'
      and column_name = 'timeline')                         as timeline_column,      -- περιμένεις 1
  (to_regprocedure('public.chat_memory_fold(text)') is not null)
                                                            as fold_function,        -- περιμένεις true
  (select count(*) from public.chat_memory
    where memory_text is not null
      and memory_fold is distinct from public.chat_memory_fold(memory_text))
                                                            as rows_not_refolded;    -- περιμένεις 0
```

Και ξανά την προεπισκόπηση του βήματος 4: πρέπει τώρα να βγαίνει κενή.

Τέλος, το βήμα 0 ξανά: οι γραμμές των δύο αρχείων πρέπει να έχουν
φύγει.

## 7. Αν βγει σφάλμα

- **Το σφάλμα εμφανίζεται με κόκκινο κάτω από το πεδίο.** Ένα αρχείο
  που επικολλάς ολόκληρο το εκτελεί η βάση ως ένα σύνολο: αν κάτι
  αποτύχει, κανονικά δεν μένει τίποτα μισό. Μην το υποθέσεις — τρέξε
  τον έλεγχο του βήματος 6 και δες τι υπάρχει.
- **Μην ξανατρέξεις κάτι άλλο, μη διορθώσεις τίποτα με το χέρι.**
  Αντέγραψε το κόκκινο μήνυμα όπως είναι και στείλ' το μου. Και τα δύο
  αρχεία είναι φτιαγμένα ώστε να τρέχουν ξανά με ασφάλεια όταν
  διορθωθεί η αιτία.
- Τα πιθανότερα:
  - `function public.search_fold(text) does not exist` ή
    `column "memory_fold" does not exist` → λείπει το
    `20261003000000_chat_memory_dedup_and_retention.sql` (βήμα 0).
  - `relation "public.ai_jobs" does not exist` → λείπει πολύ παλιότερο
    migration· το βήμα 0 θα το δείξει.
  - `permission denied` → δεν είσαι στο σωστό project ή χρήστης· το SQL
    Editor του dashboard τρέχει ως διαχειριστής, άρα αυτό δεν θα έπρεπε
    να συμβεί. Στείλ' το μου.
- **Αν το migration της μνήμης πέτυχε αλλά θες να το αναιρέσεις**
  (π.χ. κάτι φαίνεται λάθος στη σελίδα «Τι θυμάται το AI»), με το
  αντίγραφο του βήματος 5:

  ```sql
  begin;
  update public.chat_memory m
     set memory_fold  = b.memory_fold,
         times_seen   = b.times_seen,
         last_seen_at = b.last_seen_at
    from backup.chat_memory_20261004 b
   where m.id = b.id;
  insert into public.chat_memory
  select b.* from backup.chat_memory_20261004 b
   where not exists (select 1 from public.chat_memory m where m.id = b.id);
  commit;
  ```

  Ξαναφέρνει τις γραμμές που ενώθηκαν και τα παλιά κλειδιά. Γραμμές που
  γράφτηκαν μετά το migration μένουν όπως είναι. Πες μου πριν το
  τρέξεις: θα σημαίνει ότι κάτι στη λογική μου ήταν λάθος και θέλω να
  το δω.
