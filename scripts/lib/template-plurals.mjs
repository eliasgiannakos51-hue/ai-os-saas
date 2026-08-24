// ============================================================================
// TEMPLATE KEYWORDS, IN BOTH NUMBERS
// ============================================================================
//
// THE BUG THIS FILE EXISTS FOR. agent_templates matches with a tsvector
// built on the 'simple' text-search configuration, which does no stemming
// at all — deliberately, because the keywords are in ten languages and no
// single Postgres configuration stems ten languages. search_query then
// makes the LAST term of a query a prefix (`'x':*`).
//
// That combination is asymmetric, and the asymmetry is the whole bug.
// Measured against the live seed on PostgreSQL 16:
//
//     query "competitor"    -> 1 template     (keyword: competitor)
//     query "competitors"   -> 0 templates    <- a plural finds nothing
//     query "εκδηλώσεις"    -> 1 template     (keyword: εκδηλωσεις)
//     query "εκδήλωση"      -> 0 templates    <- a singular finds nothing
//
// A SHORTER query matches a LONGER keyword, because a prefix of a lexeme
// matches it. A longer query never matches a shorter keyword. So whichever
// number the seed happened to be written in, the other one fails — and it
// failed in both directions, in six languages, not just Greek.
//
// THE FIX IS DATA, NOT CODE. Both forms go in the keyword array. No
// stemmer, no per-language configuration, no fuzzy matching — those all
// trade a precise failure for an imprecise one across ten languages.
//
// THIS FILE IS THE SOURCE OF TRUTH, and scripts/tests/template-plurals.test.mjs
// fails if the migration drifts from it, if a keyword appears that is not
// classified below, or if a form group is left incomplete in a template.
// Adding a thirteenth template with a Greek singular and no plural turns
// that gate red before it reaches anybody's search box.

/** Languages where a noun changes shape in the plural. */
export const INFLECTED_LANGS = {
  el: "Ελληνικά",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  ar: "العربية",
};

/** Languages with no plural morphology on a noun. Nothing to add. */
export const UNINFLECTED_LANGS = {
  ja: "日本語",
  zh: "中文",
};

/**
 * Every form of one word. If ANY of these appears in a template's keyword
 * array, ALL of them must — that is the property the gate checks, and it
 * is checked per template rather than globally, because a keyword only
 * helps the template it is attached to.
 */
export const FORMS = [
  // ---- Ελληνικά ----
  { lang: "el", forms: ["ανταγωνιστης", "ανταγωνιστες"] },
  { lang: "el", forms: ["ανταγωνισμος", "ανταγωνισμοι"] },
  { lang: "el", forms: ["ειδηση", "ειδησεις"] },
  { lang: "el", forms: ["ημερησιο", "ημερησια"] },
  { lang: "el", forms: ["εκδηλωση", "εκδηλωσεις"] },
  { lang: "el", forms: ["συνεδριο", "συνεδρια"] },
  { lang: "el", forms: ["επιδοτηση", "επιδοτησεις"] },
  { lang: "el", forms: ["χρηματοδοτηση", "χρηματοδοτησεις"] },
  { lang: "el", forms: ["εργασια", "εργασιες"] },
  { lang: "el", forms: ["προσληψη", "προσληψεις"] },
  { lang: "el", forms: ["μισθος", "μισθοι"] },
  { lang: "el", forms: ["αγορα", "αγορες"] },
  { lang: "el", forms: ["κλαδος", "κλαδοι"] },
  { lang: "el", forms: ["ερευνα", "ερευνες"] },
  { lang: "el", forms: ["τιμη", "τιμες"] },
  { lang: "el", forms: ["κοστος", "κοστη"] },
  { lang: "el", forms: ["ισοτιμια", "ισοτιμιες"] },
  { lang: "el", forms: ["νομοθεσια", "νομοθεσιες"] },
  { lang: "el", forms: ["κανονισμος", "κανονισμοι"] },
  { lang: "el", forms: ["συμμορφωση", "συμμορφωσεις"] },
  { lang: "el", forms: ["εκδοση", "εκδοσεις"] },
  { lang: "el", forms: ["ενημερωση", "ενημερωσεις"] },
  { lang: "el", forms: ["φημη", "φημες"] },
  { lang: "el", forms: ["κριτικη", "κριτικες"] },
  { lang: "el", forms: ["προμηθευτης", "προμηθευτες"] },
  { lang: "el", forms: ["ρισκο", "ρισκα"] },
  { lang: "el", forms: ["εξηγηση", "εξηγησεις"] },
  { lang: "el", forms: ["περιληψη", "περιληψεις"] },

  // ---- English ----
  { lang: "en", forms: ["competitor", "competitors"] },
  { lang: "en", forms: ["rival", "rivals"] },
  { lang: "en", forms: ["market", "markets"] },
  { lang: "en", forms: ["briefing", "briefings"] },
  { lang: "en", forms: ["update", "updates"] },
  { lang: "en", forms: ["event", "events"] },
  { lang: "en", forms: ["conference", "conferences"] },
  { lang: "en", forms: ["exhibition", "exhibitions"] },
  { lang: "en", forms: ["calendar", "calendars"] },
  { lang: "en", forms: ["trade show", "trade shows"] },
  { lang: "en", forms: ["grant", "grants"] },
  { lang: "en", forms: ["subsidy", "subsidies"] },
  { lang: "en", forms: ["programme", "programmes"] },
  { lang: "en", forms: ["scheme", "schemes"] },
  { lang: "en", forms: ["job", "jobs"] },
  { lang: "en", forms: ["salary", "salaries"] },
  { lang: "en", forms: ["role", "roles"] },
  { lang: "en", forms: ["career", "careers"] },
  { lang: "en", forms: ["industry", "industries"] },
  { lang: "en", forms: ["sector", "sectors"] },
  { lang: "en", forms: ["overview", "overviews"] },
  { lang: "en", forms: ["price", "prices"] },
  { lang: "en", forms: ["cost", "costs"] },
  { lang: "en", forms: ["rate", "rates"] },
  { lang: "en", forms: ["quote", "quotes"] },
  { lang: "en", forms: ["value", "values"] },
  { lang: "en", forms: ["exchange", "exchanges"] },
  { lang: "en", forms: ["regulation", "regulations"] },
  { lang: "en", forms: ["law", "laws"] },
  { lang: "en", forms: ["rule", "rules"] },
  { lang: "en", forms: ["policy", "policies"] },
  { lang: "en", forms: ["release", "releases"] },
  { lang: "en", forms: ["changelog", "changelogs"] },
  { lang: "en", forms: ["version", "versions"] },
  { lang: "en", forms: ["tool", "tools"] },
  { lang: "en", forms: ["review", "reviews"] },
  { lang: "en", forms: ["mention", "mentions"] },
  { lang: "en", forms: ["brand", "brands"] },
  { lang: "en", forms: ["supplier", "suppliers"] },
  { lang: "en", forms: ["vendor", "vendors"] },
  { lang: "en", forms: ["partner", "partners"] },
  { lang: "en", forms: ["risk", "risks"] },
  { lang: "en", forms: ["summary", "summaries"] },
  { lang: "en", forms: ["primer", "primers"] },
  { lang: "en", forms: ["landscape", "landscapes"] },

  // ---- Español ----
  { lang: "es", forms: ["competencia", "competencias"] },
  { lang: "es", forms: ["noticia", "noticias"] },
  { lang: "es", forms: ["evento", "eventos"] },
  { lang: "es", forms: ["subvención", "subvenciones"] },
  { lang: "es", forms: ["empleo", "empleos"] },
  { lang: "es", forms: ["mercado", "mercados"] },
  { lang: "es", forms: ["precio", "precios"] },
  { lang: "es", forms: ["regulación", "regulaciones"] },
  { lang: "es", forms: ["versión", "versiones"] },
  { lang: "es", forms: ["reputación", "reputaciones"] },
  { lang: "es", forms: ["proveedor", "proveedores"] },

  // ---- Français ----
  { lang: "fr", forms: ["concurrent", "concurrents"] },
  { lang: "fr", forms: ["nouvelle", "nouvelles"] },
  { lang: "fr", forms: ["événement", "événements"] },
  { lang: "fr", forms: ["subvention", "subventions"] },
  { lang: "fr", forms: ["emploi", "emplois"] },
  { lang: "fr", forms: ["marché", "marchés"] },
  { lang: "fr", forms: ["réglementation", "réglementations"] },
  { lang: "fr", forms: ["réputation", "réputations"] },
  { lang: "fr", forms: ["fournisseur", "fournisseurs"] },

  // ---- Deutsch ----
  { lang: "de", forms: ["nachricht", "nachrichten"] },
  { lang: "de", forms: ["veranstaltung", "veranstaltungen"] },
  { lang: "de", forms: ["förderung", "förderungen"] },
  { lang: "de", forms: ["stelle", "stellen"] },
  { lang: "de", forms: ["markt", "märkte"] },
  { lang: "de", forms: ["preis", "preise"] },
  { lang: "de", forms: ["vorschrift", "vorschriften"] },
  { lang: "de", forms: ["fassung", "fassungen"] },
  { lang: "de", forms: ["ruf", "rufe"] },
  { lang: "de", forms: ["lieferant", "lieferanten"] },

  // ---- Italiano ----
  { lang: "it", forms: ["concorrente", "concorrenti"] },
  { lang: "it", forms: ["notizia", "notizie"] },
  { lang: "it", forms: ["evento", "eventi"] },
  { lang: "it", forms: ["sovvenzione", "sovvenzioni"] },
  { lang: "it", forms: ["lavoro", "lavori"] },
  { lang: "it", forms: ["mercato", "mercati"] },
  { lang: "it", forms: ["prezzo", "prezzi"] },
  { lang: "it", forms: ["normativa", "normative"] },
  { lang: "it", forms: ["versione", "versioni"] },
  { lang: "it", forms: ["reputazione", "reputazioni"] },
  { lang: "it", forms: ["fornitore", "fornitori"] },

  // ---- Português ----
  { lang: "pt", forms: ["preço", "preços"] },

  // ---- العربية ----
  // Modern Standard Arabic. Sound plurals where the noun takes one
  // (منافس -> منافسون), broken plurals where it does not (سعر -> أسعار).
  { lang: "ar", forms: ["خبر", "أخبار"] },
  { lang: "ar", forms: ["منافس", "منافسون"] },
  { lang: "ar", forms: ["فعالية", "فعاليات"] },
  { lang: "ar", forms: ["منحة", "منح"] },
  { lang: "ar", forms: ["وظيفة", "وظائف"] },
  { lang: "ar", forms: ["سوق", "أسواق"] },
  { lang: "ar", forms: ["سعر", "أسعار"] },
  { lang: "ar", forms: ["لائحة", "لوائح"] },
  { lang: "ar", forms: ["إصدار", "إصدارات"] },
  { lang: "ar", forms: ["مورد", "موردون"] },
  { lang: "ar", forms: ["شرح", "شروح"] },
];

/**
 * Keywords that legitimately have no second form. Every one carries its
 * reason, because "no plural" and "nobody wrote the plural" look
 * identical in a keyword array — which is exactly how this bug survived.
 */
export const NO_PLURAL = [
  // Adjectives and adverbs: they qualify the search, they are not things.
  { lang: "en", word: "daily", why: "adjective" },
  { lang: "en", word: "weekly", why: "adjective" },
  { lang: "en", word: "monthly", why: "adjective" },
  { lang: "en", word: "latest", why: "adjective" },
  { lang: "en", word: "morning", why: "adjective in this context" },
  { lang: "en", word: "legal", why: "adjective" },
  { lang: "en", word: "software", why: "uncountable" },
  // Uncountable nouns.
  { lang: "en", word: "news", why: "uncountable" },
  { lang: "en", word: "competition", why: "uncountable in this sense" },
  { lang: "en", word: "funding", why: "uncountable" },
  { lang: "en", word: "finance", why: "uncountable" },
  { lang: "en", word: "hiring", why: "uncountable" },
  { lang: "en", word: "recruitment", why: "uncountable" },
  { lang: "en", word: "compliance", why: "uncountable" },
  { lang: "en", word: "research", why: "uncountable" },
  { lang: "en", word: "reputation", why: "uncountable in this sense" },
  { lang: "en", word: "sentiment", why: "uncountable in this sense" },
  { lang: "en", word: "feedback", why: "uncountable" },
  { lang: "en", word: "due diligence", why: "uncountable" },
  // Verbs — a user types them as a command, not as a countable thing.
  { lang: "en", word: "explain", why: "verb" },
  { lang: "en", word: "learn", why: "verb" },
  { lang: "en", word: "understand", why: "verb" },
  { lang: "es", word: "explicar", why: "verb (infinitive)" },
  { lang: "fr", word: "expliquer", why: "verb (infinitive)" },
  { lang: "de", word: "erklären", why: "verb (infinitive)" },
  { lang: "it", word: "spiegare", why: "verb (infinitive)" },
  // Invariable in the plural.
  { lang: "fr", word: "prix", why: "invariable — le prix / les prix" },
  { lang: "de", word: "wettbewerber", why: "invariable — der/die Wettbewerber" },
  { lang: "ar", word: "سمعة", why: "uncountable in this sense" },
  // Greek uncountables and adjectival forms.
  { lang: "el", word: "νεα", why: "uncountable — τα νέα, already the only form used" },
  // No plural morphology on a noun at all.
  { lang: "ja", word: "ニュース", why: "no plural morphology" },
  { lang: "ja", word: "競合", why: "no plural morphology" },
  { lang: "ja", word: "イベント", why: "no plural morphology" },
  { lang: "ja", word: "助成金", why: "no plural morphology" },
  { lang: "ja", word: "求人", why: "no plural morphology" },
  { lang: "ja", word: "市場", why: "no plural morphology" },
  { lang: "ja", word: "価格", why: "no plural morphology" },
  { lang: "ja", word: "規制", why: "no plural morphology" },
  { lang: "ja", word: "リリース", why: "no plural morphology" },
  { lang: "ja", word: "評判", why: "no plural morphology" },
  { lang: "ja", word: "仕入先", why: "no plural morphology" },
  { lang: "ja", word: "説明", why: "no plural morphology" },
  { lang: "zh", word: "新闻", why: "no plural morphology" },
  { lang: "zh", word: "竞争对手", why: "no plural morphology" },
  { lang: "zh", word: "活动", why: "no plural morphology" },
  { lang: "zh", word: "补贴", why: "no plural morphology" },
  { lang: "zh", word: "招聘", why: "no plural morphology" },
  { lang: "zh", word: "市场", why: "no plural morphology" },
  { lang: "zh", word: "价格", why: "no plural morphology" },
  { lang: "zh", word: "法规", why: "no plural morphology" },
  { lang: "zh", word: "版本", why: "no plural morphology" },
  { lang: "zh", word: "声誉", why: "no plural morphology" },
  { lang: "zh", word: "供应商", why: "no plural morphology" },
  { lang: "zh", word: "解释", why: "no plural morphology" },
];

/**
 * The corrected keyword array for each built-in template.
 * Generated from the seed in 20260826000000_agent_templates.sql by
 * expanding every FORMS group above, then committed as data.
 */
export const TEMPLATE_KEYWORDS = {
  "competitor-watch": [
    "competitor", "competitors", "rival", "rivals", "competition", "market",
    "markets", "weekly", "ανταγωνιστης", "ανταγωνιστες", "ανταγωνισμος",
    "ανταγωνισμοι", "competencia", "competencias", "concurrent",
    "concurrents", "wettbewerber", "concorrente", "concorrenti", "競合",
    "竞争对手", "منافس", "منافسون",
  ],
  "daily-news-watch": [
    "news", "daily", "updates", "update", "latest", "briefing", "briefings",
    "morning", "νεα", "ειδησεις", "ειδηση", "ημερησιο", "ημερησια",
    "noticias", "noticia", "nouvelles", "nouvelle", "nachrichten",
    "nachricht", "notizie", "notizia", "ニュース", "新闻", "أخبار", "خبر",
  ],
  "event-watch": [
    "events", "event", "conference", "conferences", "trade show",
    "trade shows", "exhibition", "exhibitions", "calendar", "calendars",
    "εκδηλωσεις", "εκδηλωση", "συνεδριο", "συνεδρια", "eventos", "evento",
    "événements", "événement", "veranstaltungen", "veranstaltung", "eventi",
    "イベント", "活动", "فعاليات", "فعالية",
  ],
  "grant-funding-watch": [
    "grant", "grants", "funding", "subsidy", "subsidies", "finance",
    "programme", "programmes", "scheme", "schemes", "επιδοτηση",
    "επιδοτησεις", "χρηματοδοτηση", "χρηματοδοτησεις", "subvención",
    "subvenciones", "subvention", "subventions", "förderung", "förderungen",
    "sovvenzione", "sovvenzioni", "助成金", "补贴", "منحة", "منح",
  ],
  "job-market-watch": [
    "jobs", "job", "hiring", "recruitment", "salary", "salaries", "roles",
    "role", "careers", "career", "εργασια", "εργασιες", "προσληψεις",
    "προσληψη", "μισθος", "μισθοι", "empleo", "empleos", "emploi",
    "emplois", "stellen", "stelle", "lavoro", "lavori", "求人", "招聘", "وظائف",
    "وظيفة",
  ],
  "market-landscape": [
    "market", "markets", "landscape", "landscapes", "industry",
    "industries", "sector", "sectors", "overview", "overviews", "research",
    "monthly", "αγορα", "αγορες", "κλαδος", "κλαδοι", "ερευνα", "ερευνες",
    "mercado", "mercados", "marché", "marchés", "markt", "märkte",
    "mercato", "mercati", "市場", "市场", "سوق", "أسواق",
  ],
  "price-check": [
    "price", "prices", "cost", "costs", "rate", "rates", "quote", "quotes",
    "value", "values", "exchange", "exchanges", "τιμη", "τιμες", "κοστος",
    "κοστη", "ισοτιμια", "ισοτιμιες", "precio", "precios", "prix", "preis",
    "preise", "prezzo", "prezzi", "preço", "preços", "価格", "价格", "سعر",
    "أسعار",
  ],
  "regulation-monitor": [
    "regulation", "regulations", "law", "laws", "compliance", "legal",
    "rules", "rule", "policy", "policies", "νομοθεσια", "νομοθεσιες",
    "κανονισμος", "κανονισμοι", "συμμορφωση", "συμμορφωσεις", "regulación",
    "regulaciones", "réglementation", "réglementations", "vorschrift",
    "vorschriften", "normativa", "normative", "規制", "法规", "لوائح", "لائحة",
  ],
  "release-notes-digest": [
    "release", "releases", "changelog", "changelogs", "version", "versions",
    "update", "updates", "software", "tool", "tools", "εκδοση", "εκδοσεις",
    "ενημερωση", "ενημερωσεις", "versión", "versiones", "fassung",
    "fassungen", "versione", "versioni", "リリース", "版本", "إصدار", "إصدارات",
  ],
  "reputation-check": [
    "reputation", "reviews", "review", "mentions", "mention", "sentiment",
    "brand", "brands", "feedback", "φημη", "φημες", "κριτικες", "κριτικη",
    "reputación", "reputaciones", "réputation", "réputations", "ruf",
    "rufe", "reputazione", "reputazioni", "評判", "声誉", "سمعة",
  ],
  "supplier-check": [
    "supplier", "suppliers", "vendor", "vendors", "partner", "partners",
    "risk", "risks", "due diligence", "προμηθευτης", "προμηθευτες", "ρισκο",
    "ρισκα", "proveedor", "proveedores", "fournisseur", "fournisseurs",
    "lieferant", "lieferanten", "fornitore", "fornitori", "仕入先", "供应商",
    "مورد", "موردون",
  ],
  "weekly-summary": [
    "explain", "summary", "summaries", "learn", "understand", "primer",
    "primers", "briefing", "briefings", "εξηγηση", "εξηγησεις", "περιληψη",
    "περιληψεις", "explicar", "expliquer", "erklären", "spiegare", "説明",
    "解释", "شرح", "شروح",
  ],
};
