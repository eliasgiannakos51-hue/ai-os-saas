/*
 * docs/TOOL-RULES.md, HELD TO THE OWNER'S OWN WORDS (the owner's "0. ΚΟΙΝΟ
 * ΚΕΛΥΦΟΣ ΕΡΓΑΛΕΙΩΝ ΚΑΙ ΚΑΝΟΝΕΣ", 2026-10-25, κομμάτι 1).
 *
 * Run: node scripts/tests/tool-rules.test.mjs
 *
 * «Έλεγχος: υπάρχει και είναι ίδιο» — the instruction's own check for this
 * piece is literal identity, not a summary or a paraphrase. So this gate
 * does the only thing that check can mean: it carries the owner's text
 * verbatim and compares byte for byte. A gate that hashed the file instead
 * would hide, from the next reader, exactly what the file is required to
 * say — and the next time this document is asked to change, the diff
 * against THIS literal string is the review.
 */
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const PATH = "docs/TOOL-RULES.md";

// Verbatim from the owner's message, between "--- αρχή docs/TOOL-RULES.md
// ---" and "--- τέλος docs/TOOL-RULES.md ---". Not one word changed.
const CANONICAL = `# Κανόνες για κάθε εργαλείο

## Πώς δουλεύεις
1. Ανοίγεις την εγκεκριμένη εικόνα και τον κώδικα. Γράφεις σε λίγες
   γραμμές τι υπάρχει και τι λείπει.
2. Χτίζεις τα ΚΟΜΜΑΤΙΑ ένα ένα. Δεν πιάνεις το επόμενο πριν περάσει
   ο έλεγχος του τρέχοντος.
3. Έλεγχος σημαίνει prodtest στο preview του pull request, με
   πραγματικά πατήματα, σε υπολογιστή και κινητό. Τα tests κώδικα
   δεν αρκούν.
4. Αν κάτι δουλεύει αλλά όχι καλά (αργό, άσχημο, λάθη στα ελληνικά,
   σπάει στο κινητό, δεν μοιάζει με την εικόνα, δεν πιάνει τα
   ΚΡΙΤΗΡΙΑ ΠΟΙΟΤΗΤΑΣ), ΔΕΝ ΣΤΑΜΑΤΑΣ. Το βελτιώνεις και το
   ξαναελέγχεις.
5. Αν μετά από 3 διαφορετικούς τρόπους δεν περνά: γράφεις τι
   δοκίμασες, πας στο επόμενο κομμάτι και γυρνάς σε αυτό στο τέλος.
   Αν ούτε τότε περνά, μπαίνει ❌ με τον λόγο.
6. Ό,τι θέλει τον Ηλία (κλειδί, απόφαση, λογαριασμό) μπαίνει στο
   «ΘΕΛΩ ΑΠΟ ΤΟΝ ΗΛΙΑ», με βήματα και κόστος, και συνεχίζεις.
7. Μετά από κάθε κομμάτι, μία γραμμή:
   «✅ Κομμάτι Χ: τι έλεγξα → τι βγήκε».
8. Σταματάς μόνο όταν κάθε κομμάτι έχει ✅, ❌ ή είναι στο «ΘΕΛΩ».
   Τότε: pull request, migrations σε ΕΝΑ μπλοκ με ερώτημα ελέγχου,
   οι λίστες, και πόσο κόστισαν οι έλεγχοι. Δεν κάνεις merge.

## Κανόνες που δεν σπάνε
- Ισχύουν ο Τρόπος λειτουργίας, το ΣΥΣΤΗΜΑ DESIGN και το MASTER.
- Κάθε εργαλείο πάνω στο κοινό κέλυφος. Κανένα δεν φτιάχνει δική του
  μπάρα, πεδίο, πάνελ ή συρτάρι.
- Ένα λευκό κουμπί ανά οθόνη.
- Τα κουτιά «AI photo», «AI video», «AI presenter», «Photo» στις
  εικόνες είναι θέσεις. Εκεί μπαίνει το πραγματικό αποτέλεσμα σε
  πλήρη ποιότητα, ποτέ σχήματα.
- Τιμή σε credits πριν τρέξει οτιδήποτε, περιθώριο πάνω από 4×,
  καμία χρέωση σε αποτυχία, ποτέ πάνω από το υπόλοιπο. Όλα από τον
  router, κανένα όνομα μοντέλου στην οθόνη.
- Ό,τι φτιάχνεται πάει στο My Stuff, με «Προσθήκη σε Project» και
  «Στείλ' το σε…».
- Υπολογιστής και κινητό, όλες οι γλώσσες της εφαρμογής, κανένα
  όνομα δεν κόβεται.
- Κλειδιά μόνο στο Vercel. Merge και migrations τα κάνει ο Ηλίας.
- Κανένα δεδομένο χρήστη δεν σβήνεται ή μεταφέρεται χωρίς έγκρισή
  του, με μέτρηση πριν και μετά.
- Ποτέ πρόσωπο ή φωνή πραγματικού ανθρώπου. Σήμανση AI σε κάθε
  εικόνα, βίντεο και ήχο, και στο Ρεαλιστικό.
- Όταν ένα εργαλείο περνά στη νέα οθόνη, καμία λειτουργία του δεν
  χάνεται και οι παλιές διευθύνσεις δουλεύουν.
- Το «Coming soon» φεύγει μόνο του όταν όλα τα κομμάτια έχουν ✅, ή
  όταν μπει το κλειδί που λείπει, χωρίς αλλαγή κώδικα.
`;

const onDisk = readFileSync(PATH, "utf8");

check(`${PATH} exists and is readable`, typeof onDisk === "string" && onDisk.length > 0);
check(`${PATH} is byte-identical to the owner's instruction`, onDisk === CANONICAL, (() => {
  if (onDisk === CANONICAL) return "";
  // Find the first differing line, so a real edit is easy to locate rather
  // than staring at a wall of "not equal".
  const a = onDisk.split("\n");
  const b = CANONICAL.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `first difference at line ${i + 1}:\n        on disk:    ${JSON.stringify(a[i] ?? "<missing>")}\n        canonical:  ${JSON.stringify(b[i] ?? "<missing>")}`;
    }
  }
  return "";
})());

// EVERY RULE THAT REFERENCES ANOTHER FILE OR CONCEPT STILL HAS TO RESOLVE
// — the same census self-claims.test.mjs runs over every other doc. This
// file names three things by name: ΣΥΣΤΗΜΑ DESIGN, MASTER, My Stuff. None
// of the three is a path this gate can stat (they are design documents and
// a dashboard section, not files in this repo), so this is a note for the
// next reader rather than a second check — self-claims.test.mjs is the
// gate that actually holds paths to zero unresolved.
check("the doc names the shared design references it defers to", /ΣΥΣΤΗΜΑ DESIGN/.test(onDisk) && /MASTER/.test(onDisk));

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
