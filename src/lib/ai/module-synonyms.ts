/**
 * THE WORDS PEOPLE ACTUALLY USE, per module.
 *
 * V4.6 #1. lib/ai/module-relevance.ts builds a module's vocabulary from
 * its TITLE and its FIELD LABELS, which is a reasonable free source and a
 * poor one. Measured against ten real questions:
 *
 *   "Πόσα έξοδα είχα τον τελευταίο μήνα;"   scored 0 — Finance's terms are
 *                                            Οικονομικά, Ποσό, Περιγραφή,
 *                                            Είδος. Nobody says Οικονομικά.
 *   "Which of my leads is worth chasing?"    scored 0 — the label is "Lead",
 *                                            singular, and the question says
 *                                            "leads".
 *
 * A vocabulary that misses the two most obvious questions about the two
 * fullest modules is not a vocabulary. This is the missing half: the
 * everyday word, its plural, and the Greek a Greek user writes.
 *
 * NOT A CLASSIFIER. These are single words matched whole (see scoreTerms),
 * so a term here is a claim that the word means THIS module and no other.
 * "report", "data" and "number" are deliberately absent — they are true of
 * every module and would make everything score, which is a slower way of
 * selecting nothing.
 *
 * Pure and react-free so the gate can load it.
 */
export type ModuleSynonyms = {
  /**
   * The module's own subject. A question containing one of these IS about
   * this module: "expenses" is Finance, "σχόλια" is Feedback.
   */
  primary: string[];
  /**
   * Words that travel WITH the module without belonging to it.
   * "customer" is the clearest case: it points at Sales, and it also
   * appears in every question about feedback, competitors and products.
   *
   * Measured, before this split existed: "Τι σχόλια έχω πάρει από
   * πελάτες;" scored Feedback 1 for σχόλια and Sales 1 for πελάτες and
   * tied, so a question whose subject is plainly feedback reached
   * nothing. Associated terms score half, so they decide a question that
   * has no subject word and lose to one that does.
   */
  associated: string[];
};

export const MODULE_SYNONYMS: Record<string, ModuleSynonyms> = {
  finance: {
    primary: [
    "expense", "expenses", "spend", "spending", "spent", "revenue", "income",
    "invoice", "invoices", "profit", "cost", "costs", "cashflow", "budget",
    "έξοδα", "έξοδο", "εξόδων", "έσοδα", "έσοδο", "εσόδων", "τιμολόγιο",
    "τιμολόγια", "κέρδος", "κέρδη", "κόστος", "δαπάνες",
    ],
    associated: [
    "χρήματα", "λεφτά",
    ],
  },
  sales: {
    primary: [
    "lead", "leads", "deal", "deals", "prospect", "prospects", "pipeline",
    "πώληση", "πωλήσεις", "συμφωνία", "συμφωνίες", "υποψήφιος", "υποψήφιοι",
    ],
    associated: [
    "customer", "customers", "client", "clients", "buyer", "buyers",
    "πελάτης", "πελάτες", "πελατών", "πελάτη", "αγοραστής",
    ],
  },
  ideas: {
    primary: [
    "idea", "ideas", "concept", "concepts", "brainstorm", "ιδέα", "ιδέες",
    "ιδεών",
    ],
    associated: [
    "σκέψη", "σκέψεις",
    ],
  },
  feedback: {
    primary: [
    "feedback", "review", "reviews", "complaint", "complaints", "compliment",
    "σχόλιο", "σχόλια", "σχολίων", "παράπονο", "παράπονα", "κριτική",
    "κριτικές",
    ],
    associated: [
    "γνώμη", "γνώμες",
    ],
  },
  trading: {
    primary: [
    "trade", "trades", "trading", "pnl", "συναλλαγή", "συναλλαγές",
    ],
    associated: [
    "position", "positions", "θέση", "θέσεις",
    ],
  },
  products: {
    primary: [
    "product", "products", "roadmap", "προϊόν", "προϊόντα", "προϊόντων",
    ],
    associated: [
    "launch", "launches", "κυκλοφορία",
    ],
  },
  content: {
    primary: [
    "post", "posts", "article", "articles", "newsletter", "blog", "ανάρτηση",
    "αναρτήσεις", "άρθρο", "άρθρα",
    ],
    associated: [
    "κείμενο", "κείμενα",
    ],
  },
  competitors: {
    primary: [
    "competitor", "competitors", "rival", "rivals", "ανταγωνιστής",
    "ανταγωνιστές", "ανταγωνισμός",
    ],
    associated: [

    ],
  },
  research: {
    primary: [
    "research", "study", "studies", "έρευνα", "έρευνες", "μελέτη", "μελέτες",
    ],
    associated: [
    "finding", "findings", "εύρημα", "ευρήματα",
    ],
  },
  learning: {
    primary: [
    "course", "courses", "lesson", "lessons", "learning", "μάθημα",
    "μαθήματα", "εκμάθηση", "σεμινάριο", "σεμινάρια",
    ],
    associated: [
    "studying",
    ],
  },
  decisions: {
    primary: [
    "decision", "decisions", "decided", "απόφαση", "αποφάσεις", "αποφάσεων",
    ],
    associated: [
    "choice", "choices", "επιλογή", "επιλογές",
    ],
  },
  analytics: {
    primary: [
    "traffic", "visitors", "conversion", "conversions", "επισκέψεις",
    "επισκέπτες", "μετατροπή", "μετατροπές",
    ],
    associated: [
    "sessions",
    ],
  },
  automation: {
    primary: [
    "automation", "automations", "αυτοματισμός", "αυτοματισμοί",
    ],
    associated: [
    "schedule", "scheduled", "recurring", "προγραμματισμένο",
    "επαναλαμβανόμενο",
    ],
  },
};

/** The subject words for a module, or an empty list. A module with no
 *  entry keeps exactly the vocabulary it had, so adding this file cannot
 *  make any existing match worse. These join the module vocabulary, so
 *  module narrowing gets them too. */
export function synonymsFor(slug: string): readonly string[] {
  return MODULE_SYNONYMS[slug]?.primary ?? [];
}

/** The words that travel with the module without belonging to it. Scored
 *  separately and at half weight — see lib/ai/deep-dive-load.ts. Kept out
 *  of the shared vocabulary on purpose: narrowing DROPS modules, and
 *  dropping a module because a weak word did not appear is a different
 *  and worse mistake than not deep-reading one. */
export function associatedFor(slug: string): readonly string[] {
  return MODULE_SYNONYMS[slug]?.associated ?? [];
}
