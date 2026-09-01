// THE SAMPLE ACCOUNT: one small Greek design studio, ninety days of it.
//
// V4.6 #6. An empty product is an invisible product — the AI cannot
// impress anybody with nothing to read, and a new account has nothing.
// This is the something.
//
// PURE DATA AND A PURE FUNCTION, no database and no user in sight. Two
// reasons, and the second is the one that shaped the file:
//
//   1. it can be tested without a Postgres, so the shape of the data is
//      checked by the build rather than by looking at it;
//   2. the brief asks for the same dataset to serve a signed-out demo
//      later. A seeder that knew about `user_id` could not, and would
//      have had to be written twice — which is how two versions of "the
//      demo data" end up disagreeing.
//
// So rows carry `dayOffset` (days before today) rather than a timestamp,
// and `materialiseSampleData(nowMs)` turns them into rows for a specific
// moment. Nothing here imports from @/lib/supabase.
//
// WHY THESE NUMBERS. A studio invoicing between EUR 450 and EUR 3,200,
// with rent, an accountant and hosting going out every month. The
// arithmetic is meant to survive being read: income and expenses do not
// net to a round number, no two invoices are the same, and the monthly
// totals differ enough that a chart has a shape rather than a plateau.

/** A row with its date expressed as "this many days ago". */
export type SampleRow = Record<string, string | number | null> & { dayOffset: number };

export type SampleTable = {
  /** The module slug the rows show up under — where the user goes to see them. */
  slug: string;
  table: string;
  rows: SampleRow[];
};

// ---------------------------------------------------------------------
// Money in and money out. Twelve invoices, six standing costs.
// ---------------------------------------------------------------------
const FINANCE: SampleRow[] = [
  { dayOffset: 86, description: "Τιμολόγιο — Ανακαίνιση site, Καφεκοπτείο Παπαδόπουλος", type: "income", amount: 1450.0 },
  { dayOffset: 84, description: "Ενοίκιο γραφείου — Μάρτιος", type: "expense", amount: 450.0 },
  { dayOffset: 81, description: "Λογιστής — τριμηνιαία", type: "expense", amount: 120.0 },
  { dayOffset: 74, description: "Τιμολόγιο — Λογότυπο & εταιρική ταυτότητα, Ελαιώνες Μεσσηνίας", type: "income", amount: 890.0 },
  { dayOffset: 68, description: "Τιμολόγιο — Eshop, Χειροποίητα Κοσμήματα Νεφέλη", type: "income", amount: 3200.0 },
  { dayOffset: 62, description: "Συνδρομές εργαλείων (Figma, Adobe)", type: "expense", amount: 78.4 },
  { dayOffset: 57, description: "Ενοίκιο γραφείου — Απρίλιος", type: "expense", amount: 450.0 },
  { dayOffset: 55, description: "Τιμολόγιο — Συντήρηση, Καφεκοπτείο Παπαδόπουλος", type: "income", amount: 180.0 },
  { dayOffset: 49, description: "Τιμολόγιο — Καμπάνια social, Ταβέρνα Ο Στέλιος", type: "income", amount: 620.0 },
  { dayOffset: 44, description: "Hosting & domains — ετήσια ανανέωση", type: "expense", amount: 214.9 },
  { dayOffset: 38, description: "Τιμολόγιο — Redesign, Φυσικοθεραπεία Καραγιάννη", type: "income", amount: 1150.0 },
  { dayOffset: 31, description: "Ενοίκιο γραφείου — Μάιος", type: "expense", amount: 450.0 },
  { dayOffset: 27, description: "Τιμολόγιο — Landing page, Ζυθοποιία Βεργίνα", type: "income", amount: 740.0 },
  { dayOffset: 22, description: "Τιμολόγιο — Φωτογράφιση προϊόντων, Νεφέλη", type: "income", amount: 450.0 },
  { dayOffset: 16, description: "Τιμολόγιο — Eshop φάση 2, Ελαιώνες Μεσσηνίας", type: "income", amount: 2100.0 },
  { dayOffset: 12, description: "Διαφήμιση Meta — δοκιμαστική καμπάνια", type: "expense", amount: 95.6 },
  { dayOffset: 6, description: "Τιμολόγιο — Συντήρηση, Ταβέρνα Ο Στέλιος", type: "income", amount: 160.0 },
  { dayOffset: 2, description: "Τιμολόγιο — Εταιρικό προφίλ, Μελισσοκομία Δρόσος", type: "income", amount: 980.0 },
];

// ---------------------------------------------------------------------
// The people the money came from, and two who have not decided.
// ---------------------------------------------------------------------
const LEADS: SampleRow[] = [
  { dayOffset: 88, lead_name: "Καφεκοπτείο Παπαδόπουλος", score: 82, next_steps: "Πελάτης συντήρησης. Ανανέωση συμβολαίου τον επόμενο μήνα." },
  { dayOffset: 76, lead_name: "Ελαιώνες Μεσσηνίας", score: 91, next_steps: "Φάση 2 παραδόθηκε. Να προταθεί πακέτο εξαγωγών." },
  { dayOffset: 70, lead_name: "Χειροποίητα Κοσμήματα Νεφέλη", score: 95, next_steps: "Ο μεγαλύτερος πελάτης. Ζήτησε προσφορά για φωτογράφιση." },
  { dayOffset: 52, lead_name: "Ταβέρνα Ο Στέλιος", score: 64, next_steps: "Μικρά έργα, σταθερά. Πληρώνει πάντα στην ώρα του." },
  { dayOffset: 41, lead_name: "Φυσικοθεραπεία Καραγιάννη", score: 73, next_steps: "Ολοκληρώθηκε το redesign. Follow-up σε δύο εβδομάδες." },
  { dayOffset: 29, lead_name: "Ζυθοποιία Βεργίνα", score: 58, next_steps: "Landing page μόνο. Ενδιαφέρεται για eshop το φθινόπωρο." },
  { dayOffset: 18, lead_name: "Αρτοποιείο Τσιμίσκη", score: 45, next_steps: "Ζήτησε προσφορά, δεν απάντησε ακόμα. Δεύτερο email." },
  { dayOffset: 4, lead_name: "Μελισσοκομία Δρόσος", score: 69, next_steps: "Εταιρικό προφίλ έτοιμο. Συζήτηση για συσκευασία." },
];

// ---------------------------------------------------------------------
// What the owner was thinking about while doing all that.
// ---------------------------------------------------------------------
const IDEAS: SampleRow[] = [
  {
    dayOffset: 79,
    name: "Πακέτο συντήρησης με μηνιαία συνδρομή",
    problem: "Τα έργα έρχονται σε κύματα — δύο καλοί μήνες, ένας άδειος.",
    customer: "Υπάρχοντες πελάτες με site που χρειάζεται ενημερώσεις",
    mvp: "60 EUR/μήνα: ενημερώσεις, backup, μικρές αλλαγές έως 2 ώρες",
    score: 8,
  },
  {
    dayOffset: 60,
    name: "Έτοιμα templates για ταβέρνες & καφέ",
    problem: "Κάθε μικρό μαγαζί ζητά το ίδιο πράγμα και το χτίζω από την αρχή.",
    customer: "Εστίαση, 1-3 καταστήματα",
    mvp: "Τρία templates με μενού, ώρες και κρατήσεις",
    score: 7,
  },
  {
    dayOffset: 45,
    name: "Φωτογράφιση προϊόντων ως ξεχωριστή υπηρεσία",
    problem: "Οι πελάτες με eshop φέρνουν κακές φωτογραφίες και το site φαίνεται φθηνό.",
    customer: "Eshop με χειροποίητα ή τοπικά προϊόντα",
    mvp: "Μισή μέρα studio, 20 φωτογραφίες, 450 EUR",
    score: 9,
  },
  {
    dayOffset: 24,
    name: "Συνεργασία με λογιστικό γραφείο για συστάσεις",
    problem: "Οι νέοι πελάτες έρχονται μόνο από στόμα σε στόμα.",
    customer: "Νέες επιχειρήσεις που μόλις άνοιξαν ΑΦΜ",
    mvp: "Προμήθεια 10% στον λογιστή για κάθε σύσταση",
    score: 6,
  },
  {
    dayOffset: 9,
    name: "Πακέτο εξαγωγών για παραγωγούς τροφίμων",
    problem: "Οι Ελαιώνες ρώτησαν για αγγλικό site και δεν είχα τιμή έτοιμη.",
    customer: "Παραγωγοί λαδιού, μελιού, κρασιού που κοιτούν εξωτερικό",
    mvp: "Δίγλωσσο site + περιγραφές προϊόντων στα αγγλικά",
    score: 8,
  },
];

// ---------------------------------------------------------------------
// What the customers said back.
// ---------------------------------------------------------------------
const FEEDBACK: SampleRow[] = [
  { dayOffset: 66, summary: "Η Νεφέλη είπε ότι οι πωλήσεις τριπλασιάστηκαν τον πρώτο μήνα μετά το eshop.", sentiment: "positive", category: "αποτέλεσμα" },
  { dayOffset: 51, summary: "Ο Παπαδόπουλος παραπονέθηκε ότι άργησα τρεις μέρες στη συντήρηση.", sentiment: "negative", category: "χρόνος παράδοσης" },
  { dayOffset: 36, summary: "Η Καραγιάννη ζήτησε να μπορεί να αλλάζει η ίδια τα ραντεβού.", sentiment: "neutral", category: "αίτημα" },
  { dayOffset: 20, summary: "Οι Ελαιώνες σύστησαν το studio σε δύο άλλους παραγωγούς.", sentiment: "positive", category: "σύσταση" },
  { dayOffset: 7, summary: "Η Ζυθοποιία βρήκε ακριβό το eshop, προτίμησε μόνο landing.", sentiment: "negative", category: "τιμή" },
];

/**
 * Every table the sample writes into, in the order it is written.
 *
 * FOUR MODULES, THIRTY-SIX ROWS. The brief asked for 30-40 across 3-4
 * modules; this is 18 + 8 + 5 + 5. Money first because it is what the
 * charts read and what a question about the business is most likely to
 * be about.
 */
export const SAMPLE_TABLES: SampleTable[] = [
  { slug: "finance", table: "finance_entries", rows: FINANCE },
  { slug: "sales", table: "leads", rows: LEADS },
  { slug: "ideas", table: "ideas", rows: IDEAS },
  { slug: "feedback", table: "feedback", rows: FEEDBACK },
];

export const SAMPLE_ROW_COUNT = SAMPLE_TABLES.reduce((n, t) => n + t.rows.length, 0);

/** The oldest row's age in days — how far back the sample reaches. */
export const SAMPLE_SPAN_DAYS = Math.max(
  ...SAMPLE_TABLES.flatMap((t) => t.rows.map((r) => r.dayOffset))
);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turns the offsets into real timestamps for a given moment.
 *
 * `nowMs` is a parameter rather than a Date.now() call inside, so the
 * same input always produces the same output and a test can assert the
 * spread without racing the clock.
 *
 * Times are nudged to a plausible working hour (09:00–18:00, derived
 * from the row's own index) instead of all landing at the same instant:
 * a day's rows stacking at exactly midnight makes every "by hour" view
 * look broken, and it is the kind of detail that tells somebody the data
 * is fake before they have read a word of it.
 */
export function materialiseSampleData(nowMs: number): {
  slug: string;
  table: string;
  rows: Record<string, string | number | null>[];
}[] {
  return SAMPLE_TABLES.map((t) => ({
    slug: t.slug,
    table: t.table,
    rows: t.rows.map((row, i) => {
      const { dayOffset, ...fields } = row;
      const day = new Date(nowMs - dayOffset * DAY_MS);
      day.setUTCHours(9 + (i % 10), (i * 7) % 60, 0, 0);
      return { ...fields, created_at: day.toISOString() };
    }),
  }));
}
