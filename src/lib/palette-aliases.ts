/**
 * THE WORDS PEOPLE TYPE, WHICH ARE NOT THE WORDS ON THE BUTTON.
 *
 * The palette matches every name an item answers to — the translated
 * label and the English one (see lib/command-palette-match.ts). That
 * fixed a real bug and it is still not enough, because a label is
 * written to be READ and a query is typed from memory of the thing you
 * want, not of the label somebody chose for it.
 *
 * THE REPORT, 2026-09-19. The owner typed «θέλω να δω τα έσοδά μου» and
 * «οικο» into ⌘K in production. «οικο» matches «Οικονομικά» and always
 * did — measured here by running the real matcher over the real
 * catalogue. «έσοδα» matched nothing, in any language, because no page
 * is called that: the module is «Οικονομικά» and its fields are Ποσό,
 * Περιγραφή, Τύπος. The palette was not broken; its vocabulary was the
 * set of names the product gave itself.
 *
 * It is worse than one word. A third of the sidebar is a friendly
 * phrase rather than a noun — «Δες τι λένε τα νούμερα» for analytics,
 * «AI που δουλεύει για σένα» for agents, «Ψάξ' το καλά» for deep
 * research. Typing «αναλυτικα» or «agent» reached none of them.
 *
 * WHY HERE AND NOT IN messages/*.json. An alias is never rendered. It
 * exists only to be matched, and lib/sidebar-label-keys.ts already
 * carries the lesson: a string written to be read and a string written
 * to be matched are not the same string. Putting these in the display
 * catalogue would also force a translation of every one into ten
 * languages to satisfy scripts/check-i18n.js — and inventing Japanese
 * business synonyms to keep a gate quiet is how a catalogue starts
 * lying.
 *
 * WHAT IS COVERED, SAID PLAINLY: **English and Greek only**, written by
 * hand on 2026-09-19. The other eight locales have none, and
 * scripts/tests/palette-aliases.test.mjs prints that coverage on every
 * run rather than leaving it to be assumed. An item with no alias in
 * the reader's language is exactly as reachable as it was before — by
 * its own displayed name, and by its English one.
 *
 * Keys are the item keys of lib/sidebar-label-keys.ts's ITEM_LABEL_KEYS,
 * checked BOTH ways by the gate so neither side can go stale.
 */
export type PaletteAliases = Record<string, Partial<Record<string, string[]>>>;

export const PALETTE_ALIASES: PaletteAliases = {
  finance: {
    en: ["revenue", "income", "money", "expenses", "profit", "cash", "earnings", "invoice", "invoices"],
    el: ["έσοδα", "εισόδημα", "έξοδα", "κέρδη", "χρήματα", "λεφτά", "τζίρος", "τιμολόγιο", "τιμολόγια", "ταμείο"],
  },
  analytics: {
    en: ["numbers", "stats", "statistics", "metrics", "charts", "reports", "dashboard"],
    el: ["αναλυτικά", "στατιστικά", "νούμερα", "αριθμοί", "μετρήσεις", "γραφήματα", "αναφορές"],
  },
  agents: {
    en: ["agents", "agent", "assistants", "workers", "bots"],
    el: ["πράκτορες", "εργάτες", "αυτόματα"],
  },
  deepResearch: {
    en: ["deep research", "investigate", "dig", "thorough"],
    el: ["βαθιά έρευνα", "ψάξιμο", "διερεύνηση"],
  },
  businessHealth: {
    en: ["business health", "how is the business", "overview", "health"],
    el: ["υγεία επιχείρησης", "πορεία", "επισκόπηση"],
  },
  dataAnalysis: {
    en: ["data analysis", "analyse", "analyze", "csv", "spreadsheet"],
    el: ["ανάλυση δεδομένων", "ανάλυση", "δεδομένα", "υπολογιστικό φύλλο"],
  },
  memory: {
    en: ["search", "find", "records", "lookup"],
    el: ["αναζήτηση", "εύρεση", "βρες", "καταχωρήσεις"],
  },
  chat: {
    en: ["chat", "ask", "assistant", "talk"],
    el: ["συνομιλία", "ρώτησε", "βοηθός", "τσατ"],
  },
  aiMemory: {
    en: ["memory", "remembers", "what it knows"],
    el: ["μνήμη", "θυμάται", "τι ξέρει"],
  },
  websiteBuilder: {
    en: ["website", "site", "web page", "landing page", "builder"],
    el: ["ιστότοπος", "ιστοσελίδα", "σάιτ", "κατασκευή"],
  },
  published: {
    en: ["published", "live", "online", "deployed"],
    el: ["δημοσιευμένα", "ζωντανά", "online"],
  },
  // MARKETPLACE'S SIX ALIASES WERE DELETED ON 2026-09-26, two days after
  // the row was `retired`. They pointed at a page the command palette no
  // longer offers, so "templates" and "έτοιμα" reached nothing at all —
  // the palette does not fall through to a retired row, it does not know
  // about it. Left here they were six words that looked like coverage.
  //
  // It took two days to notice because the gate that checks these was
  // searching a registry the palette does not use; it uses visibleGroups
  // now, and it found this the same run.
  routing: {
    en: ["model", "models", "which ai", "routing"],
    el: ["μοντέλο", "μοντέλα", "δρομολόγηση"],
  },
  costs: {
    en: ["costs", "spend", "usage", "credits", "billing"],
    el: ["κόστος", "κόστη", "χρέωση", "χρεώσεις", "μονάδες"],
  },
  team: {
    en: ["team", "members", "colleagues", "seats", "invite"],
    el: ["ομάδα", "μέλη", "συνάδελφοι", "προσκλήσεις"],
  },
  files: {
    en: ["files", "uploads", "attachments"],
    el: ["αρχεία", "επισυναπτόμενα", "μεταφορτώσεις"],
  },
  sales: {
    en: ["sales", "deals", "pipeline", "customers", "clients"],
    el: ["πωλήσεις", "συμφωνίες", "πελάτες", "πελατολόγιο"],
  },
  products: {
    en: ["products", "catalogue", "catalog", "stock", "inventory"],
    el: ["προϊόντα", "κατάλογος", "απόθεμα", "στοκ"],
  },
  competitors: {
    en: ["competitors", "competition", "rivals"],
    el: ["ανταγωνιστές", "ανταγωνισμός", "αγορά"],
  },
  settings: {
    en: ["settings", "preferences", "options", "account", "profile", "language"],
    el: ["ρυθμίσεις", "επιλογές", "λογαριασμός", "προφίλ", "γλώσσα"],
  },
  help: {
    en: ["help", "support", "documentation", "faq"],
    el: ["βοήθεια", "υποστήριξη", "οδηγίες", "συχνές ερωτήσεις"],
  },
  integrations: {
    en: ["integrations", "connect", "connections", "slack", "email"],
    el: ["συνδέσεις", "ενσωματώσεις", "σύνδεση"],
  },
  mine: {
    en: ["history", "timeline", "activity", "past", "everything"],
    el: ["ιστορικό", "χρονολόγιο", "δραστηριότητα"],
  },
  voice: {
    en: ["voice", "speak", "microphone", "audio"],
    el: ["φωνή", "μίλα", "μικρόφωνο", "ήχος"],
  },
  affiliate: {
    en: ["affiliate", "referral", "partners", "commission"],
    el: ["συνεργάτες", "παραπομπές", "προμήθεια"],
  },
  automation: {
    en: ["automation", "workflows", "schedule", "recurring"],
    el: ["αυτοματισμοί", "ροές"],
  },
  trading: {
    en: ["trades", "positions"],
    el: ["συναλλαγές", "θέσεις"],
  },
  tradingJournal: {
    en: ["trading journal", "trade log", "journal"],
    el: ["ημερολόγιο συναλλαγών", "ημερολόγιο"],
  },
  coding: {
    en: ["code", "coding", "programming", "developer"],
    el: ["κώδικας", "προγραμματισμός", "ανάπτυξη"],
  },
  documents: {
    en: ["documents", "docs", "pdf", "word"],
    el: ["έγγραφα", "κείμενα"],
  },
  presentations: {
    en: ["presentations", "slides", "deck", "powerpoint"],
    el: ["παρουσιάσεις", "διαφάνειες"],
  },
  posts: {
    en: ["posts", "social", "publish", "share"],
    el: ["αναρτήσεις", "δημοσιεύσεις", "κοινωνικά"],
  },
  campaigns: {
    en: ["campaigns", "marketing", "ads", "advertising"],
    el: ["καμπάνιες", "μάρκετινγκ", "διαφημίσεις"],
  },
  systemHealth: {
    en: ["system health", "status", "uptime", "diagnostics"],
    el: ["υγεία συστήματος", "κατάσταση", "διαγνωστικά"],
  },
  formSubmissions: {
    en: ["form submissions", "forms", "leads", "enquiries"],
    el: ["υποβολές", "φόρμες", "αιτήματα"],
  },
};

/** The locales this table actually covers. Derived, so it cannot claim more. */
export function aliasLocales(table: PaletteAliases = PALETTE_ALIASES): string[] {
  const seen = new Set<string>();
  for (const perLocale of Object.values(table)) {
    for (const locale of Object.keys(perLocale)) seen.add(locale);
  }
  return [...seen].sort();
}

/**
 * The extra words this item answers to for a reader in `locale`.
 *
 * English is always included alongside: somebody who learned the product
 * in English, or who has an English keyboard in front of them, types
 * "revenue" — the same reason command-palette-match.ts keeps the English
 * label as a candidate.
 */
export function aliasesFor(
  itemKey: string,
  locale: string,
  table: PaletteAliases = PALETTE_ALIASES
): string[] {
  const entry = table[itemKey];
  if (!entry) return [];
  const own = entry[locale] ?? [];
  const english = locale === "en" ? [] : (entry.en ?? []);
  return [...own, ...english];
}
