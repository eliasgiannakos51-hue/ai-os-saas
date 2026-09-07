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
  /**
   * THE WORDS A QUESTION TURNS ON, which the other two lists cannot
   * contain.
   *
   * `primary` and `associated` are harvested the way an interface names
   * things — from titles and field labels — and an interface is named in
   * NOUNS. Every title and every label on every screen of this product is
   * a noun, so a vocabulary built from them is a list of nouns in ten
   * languages and a list of verbs in none.
   *
   * Nobody asks a question in nouns. "Expenses" is not a question.
   * Measured 2026-09-07 by scripts/tests/module-verbs.test.mjs across all
   * thirteen modules and all ten languages — 130 verb-led questions, one
   * per pair — only 12 reached the module they were plainly about, and
   * five languages (es, de, it, pt, ar) scored ZERO out of thirteen. That
   * is not a gap in one list; it is the shape of every list.
   *
   * Scored exactly like `primary`, because a verb like "ξόδεψα" is as
   * strong a claim about Finance as "έξοδα" is.
   *
   * DISTINCTIVE VERBS ONLY. "think", "do", "make", "have" are true of
   * every module and would make everything score, which is a slower way
   * of selecting nothing — the same rule that keeps "report", "data" and
   * "number" out of `primary`. Where a language's natural verb for a
   * module is that generic, nothing is added and the module-verbs scan
   * reports the honest zero rather than a term that would poison the
   * rest.
   */
  verbs: string[];
};

export const MODULE_SYNONYMS: Record<string, ModuleSynonyms> = {
  finance: {
    primary: [
    "expense", "expenses", "spend", "spending", "spent", "revenue", "income",
    "invoice", "invoices", "profit", "cost", "costs", "cashflow", "budget",
    "έξοδα", "έξοδο", "εξόδων", "έσοδα", "έσοδο", "εσόδων", "τιμολόγιο",
    "τιμολόγια", "κέρδος", "κέρδη", "κόστος", "δαπάνες",
    // THE VERBS, and they were missing while the English ones were not.
    // The list carried spend/spending/spent and, in Greek, only the
    // nouns — so "πόσο ξόδεψα" scored zero on Finance and so did its
    // greeklish "poso ejodepsa". Measured 2026-09-06 when the greeklish
    // fold was wired: the fold was working and the vocabulary was not.
    // BOTH THE AUGMENTED AND THE BARE PAST. Greek writes this verb either
    // way and a user picks one without thinking about it; "ejodepsa" is
    // the augmented one, and adding only the bare form left the owner's
    // own test case scoring zero.
    "ξόδεψα", "εξόδεψα", "ξοδεύω", "ξόδεψε", "ξοδεύει", "πλήρωσα", "πληρώνω",
    "εισέπραξα", "κοστίζει", "κόστισε",
    "gasto", "gastos", "ingreso", "ingresos", "factura", "facturas",
    "beneficio", "dépense", "dépenses", "revenu", "revenus", "facture",
    "factures", "bénéfice", "Ausgabe", "Ausgaben", "Einnahmen", "Einnahme",
    "Rechnung", "Rechnungen", "Gewinn", "spesa", "spese", "entrate",
    "fattura", "fatture", "profitto", "despesa", "despesas", "receita",
    "receitas", "fatura", "faturas", "lucro", "支出", "收入", "开支", "营收", "利润",
    "发票", "成本", "支出", "収入", "経費", "売上", "利益", "請求書", "مصروفات", "مصروف",
    "نفقات", "إيرادات", "إيراد", "فاتورة", "فواتير", "ربح", "أرباح", "تكلفة",
    ],
    associated: [
    "χρήματα", "λεφτά",
    ],
    verbs: [
    /* en */ "earned", "paid", "invoiced", "billed", "charged",
    /* el */ "κέρδισα", "τιμολόγησα", "χρεώθηκα", "πλήρωνα",
    /* es */ "gasté", "gastar", "gastado", "pagué", "cobré", "facturé", "ingresé",
    /* fr */ "dépensé", "dépenser", "payé", "facturé", "encaissé", "gagné",
    /* de */ "ausgegeben", "ausgeben", "bezahlt", "eingenommen", "verdient", "abgerechnet",
    /* it */ "speso", "spendere", "pagato", "incassato", "guadagnato", "fatturato",
    /* pt */ "gastei", "gastar", "gastou", "paguei", "recebi", "faturei",
    /* zh */ "花了", "花钱", "支付", "付款", "赚了",
    /* ja */ "使い", "支払", "稼い", "払っ",
    /* ar */ "أنفق", "دفعت", "كسبت", "صرفت",
    ],
  },
  sales: {
    primary: [
    "lead", "leads", "deal", "deals", "prospect", "prospects", "pipeline",
    "πώληση", "πωλήσεις", "συμφωνία", "συμφωνίες", "υποψήφιος", "υποψήφιοι",
    "cliente potencial", "prospecto", "prospectos", "venta", "ventas",
    "acuerdo", "prospect", "prospects", "vente", "ventes", "affaire",
    "Interessent", "Interessenten", "Verkauf", "Verkäufe", "Abschluss",
    "vendita", "vendite", "trattativa", "venda", "vendas", "negócio", "潜在客户",
    "销售", "成交", "商机", "リード", "見込み客", "販売", "商談", "عميل محتمل",
    "عملاء محتملون", "صفقة", "صفقات", "مبيعات", "بيع",
    ],
    associated: [
    "customer", "customers", "client", "clients", "buyer", "buyers",
    "πελάτης", "πελάτες", "πελατών", "πελάτη", "αγοραστής",
    "clientes", "cliente", "clients", "Kunden", "Kunde", "Kundschaft",
    "clienti", "客户", "顧客", "العملاء", "عملاء", "زبائن",
    ],
    verbs: [
    /* en */ "sell", "sold", "selling",
    /* el */ "πούλησα", "πουλάω", "πωλώ", "πουλήσει",
    /* es */ "vendí", "vender", "vendió", "vendimos", "vendido",
    /* fr */ "vendu", "vendre", "vendis",
    /* de */ "verkauft", "verkaufen",
    /* it */ "venduto", "vendere", "venduti",
    /* pt */ "vendi", "vender", "vendeu", "vendido",
    /* zh */ "卖给", "卖了", "售出", "成交了",
    /* ja */ "売り", "売っ", "販売し",
    /* ar */ "بعت", "بعنا", "أبيع",
    ],
  },
  ideas: {
    primary: [
    "idea", "ideas", "concept", "concepts", "brainstorm", "ιδέα", "ιδέες",
    "ιδεών",
    "idea", "ideas", "idée", "idées", "Idee", "Ideen", "ideia", "ideias",
    "想法", "点子", "创意", "アイデア", "着想", "فكرة", "أفكار",
    ],
    associated: [
    "σκέψη", "σκέψεις",
    ],
    verbs: [
    /* en */ "brainstorm", "brainstormed", "invented", "dreamed",
    /* el */ "επινόησα", "συνέλαβα", "φαντάστηκα",
    /* es */ "ocurrió", "ideé", "imaginé", "inventé",
    /* fr */ "imaginé", "inventé", "conçu",
    /* de */ "ausgedacht", "erfunden", "ersonnen",
    /* it */ "ideato", "inventato", "immaginato",
    /* pt */ "imaginei", "inventei", "idealizei",
    /* zh */ "想到了", "设想", "构思",
    /* ja */ "思いつき", "考案し", "発想し",
    /* ar */ "ابتكرت", "تخيلت", "اخترعت",
    ],
  },
  feedback: {
    primary: [
    "feedback", "review", "reviews", "complaint", "complaints", "compliment",
    "σχόλιο", "σχόλια", "σχολίων", "παράπονο", "παράπονα", "κριτική",
    "κριτικές",
    "comentario", "comentarios", "reseña", "reseñas", "queja", "quejas",
    "retour", "retours", "avis", "plainte", "plaintes", "Rückmeldung",
    "Rückmeldungen", "Kritik", "Beschwerde", "recensione", "recensioni",
    "reclamo", "reclamação", "reclamações", "反馈", "评价", "投诉", "フィードバック",
    "感想", "苦情", "ملاحظات", "ملاحظة", "تعليقات", "تعليق", "شكوى", "شكاوى",
    "مراجعة",
    ],
    associated: [
    "γνώμη", "γνώμες",
    ],
    verbs: [
    /* en */ "complained", "praised", "reviewed", "rated",
    /* el */ "παραπονεθεί", "παραπονέθηκαν", "σχολίασαν", "αξιολόγησαν",
    /* es */ "quejado", "quejaron", "opinaron", "valoraron",
    /* fr */ "plaints", "plaint", "reprochent", "reproché",
    /* de */ "beschwert", "bemängelt", "bewertet",
    /* it */ "lamentati", "lamentato", "recensito", "valutato",
    /* pt */ "reclamaram", "reclamei", "avaliaram",
    /* zh */ "投诉", "抱怨", "评价了",
    /* ja */ "苦情", "不満", "評価し",
    /* ar */ "اشتكى", "اشتكوا", "انتقد",
    ],
  },
  trading: {
    primary: [
    "trade", "trades", "trading", "pnl", "συναλλαγή", "συναλλαγές",
    ],
    associated: [
    "position", "positions", "θέση", "θέσεις",
    ],
    verbs: [
    /* en */ "traded", "trading", "shorted", "longed",
    /* el */ "συναλλάχθηκα", "διαπραγματεύτηκα",
    /* es */ "operé", "operar", "negocié",
    /* fr */ "tradé", "trader", "négocié",
    /* de */ "gehandelt", "handeln", "getradet",
    /* it */ "negoziato", "operato", "tradato",
    /* pt */ "negociei", "negociar", "operei",
    /* zh */ "交易了", "持仓", "做多", "做空",
    /* ja */ "取引し", "売買し",
    /* ar */ "تداولت", "تداول",
    ],
  },
  products: {
    primary: [
    "product", "products", "roadmap", "προϊόν", "προϊόντα", "προϊόντων",
    ],
    associated: [
    "launch", "launches", "κυκλοφορία",
    ],
    verbs: [
    /* en */ "ship", "shipped", "launch", "launched", "released",
    /* el */ "κυκλοφόρησα", "λάνσαρα", "παρέδωσα",
    /* es */ "lancé", "lanzar", "lanzado", "publiqué",
    /* fr */ "lancé", "lancer", "livré",
    /* de */ "veröffentlicht", "ausgeliefert", "gelauncht",
    /* it */ "lanciato", "lanciare", "rilasciato",
    /* pt */ "lancei", "lançar", "lançado", "entreguei",
    /* zh */ "发布了", "上线了", "推出了",
    /* ja */ "リリース", "出荷し", "公開し",
    /* ar */ "أطلقت", "أصدرت",
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
    verbs: [
    /* en */ "published", "wrote", "posted", "drafted",
    /* el */ "δημοσίευσα", "δημοσιεύσει", "έγραψα", "ανάρτησα",
    /* es */ "publicado", "publiqué", "escribí", "redacté",
    /* fr */ "publié", "publier", "écrit", "rédigé",
    /* de */ "veröffentlicht", "veröffentlichte", "geschrieben", "verfasst",
    /* it */ "pubblicato", "pubblicare", "scritto", "redatto",
    /* pt */ "publiquei", "publicar", "escrevi", "redigi",
    /* zh */ "发表了", "写了", "发布过",
    /* ja */ "投稿し", "執筆し", "書きました",
    /* ar */ "نشرت", "كتبت",
    ],
  },
  competitors: {
    primary: [
    "competitor", "competitors", "rival", "rivals", "ανταγωνιστής",
    "ανταγωνιστές", "ανταγωνισμός",
    ],
    associated: [

    ],
    verbs: [
    /* en */ "competing", "compete", "outranked", "benchmarked",
    /* el */ "ανταγωνίζομαι", "ανταγωνιστώ", "συγκρίθηκα",
    /* es */ "compito", "competir", "compiten",
    /* fr */ "concurrence", "concurrencent", "rivalise",
    /* de */ "konkurriere", "konkurrieren", "wettbewerb",
    /* it */ "competendo", "competere", "competo",
    /* pt */ "competindo", "competir", "concorro",
    /* zh */ "竞争", "对手", "抢客户",
    /* ja */ "競合し", "競争し",
    /* ar */ "أتنافس", "ينافس", "منافسة",
    ],
  },
  research: {
    primary: [
    "research", "study", "studies", "έρευνα", "έρευνες", "μελέτη", "μελέτες",
    ],
    associated: [
    "finding", "findings", "εύρημα", "ευρήματα",
    ],
    verbs: [
    /* en */ "investigated", "surveyed", "explored",
    /* el */ "ερευνήσει", "ερεύνησα", "μελέτησα", "διερεύνησα",
    /* es */ "investigado", "investigué", "estudié", "indagué",
    /* fr */ "recherché", "enquêté", "étudié",
    /* de */ "recherchiert", "untersucht", "erforscht",
    /* it */ "ricercato", "indagato", "studiato",
    /* pt */ "pesquisei", "pesquisar", "investiguei",
    /* zh */ "研究过", "调研", "调查了",
    /* ja */ "調査し", "研究し",
    /* ar */ "بحثت", "استقصيت",
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
    verbs: [
    /* en */ "learn", "learned", "learnt", "studied", "trained",
    /* el */ "έμαθα", "μαθαίνω", "σπούδασα", "εκπαιδεύτηκα",
    /* es */ "aprendí", "aprender", "estudié",
    /* fr */ "appris", "apprendre", "étudié",
    /* de */ "gelernt", "lernen", "studiert",
    /* it */ "imparato", "imparare", "studiato",
    /* pt */ "aprendi", "aprender", "estudei",
    /* zh */ "学到了", "学习了", "学过",
    /* ja */ "学び", "学習し", "習っ",
    /* ar */ "تعلمت", "درست",
    ],
  },
  decisions: {
    primary: [
    "decision", "decisions", "decided", "απόφαση", "αποφάσεις", "αποφάσεων",
    ],
    associated: [
    "choice", "choices", "επιλογή", "επιλογές",
    ],
    verbs: [
    /* en */ "decide", "chose", "concluded", "settled",
    /* el */ "αποφάσισα", "αποφασίζω", "επέλεξα", "κατέληξα",
    /* es */ "decidí", "decidir", "elegí", "resolví",
    /* fr */ "décidé", "décider", "choisi", "tranché",
    /* de */ "entschieden", "entscheiden", "beschlossen",
    /* it */ "deciso", "decidere", "scelto",
    /* pt */ "decidi", "decidir", "escolhi",
    /* zh */ "决定了", "选择了", "定下",
    /* ja */ "決め", "決定し", "選ん",
    /* ar */ "قررت", "اخترت",
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
    verbs: [
    /* en */ "visited", "viewed", "converted", "bounced",
    /* el */ "επισκέφτηκαν", "επισκέπτονται", "μετατράπηκαν",
    /* es */ "visitaron", "visitar", "convirtieron",
    /* fr */ "visité", "visiter", "consulté", "converti",
    /* de */ "besucht", "besuchen", "aufgerufen",
    /* it */ "visitato", "visitare", "convertito",
    /* pt */ "visitaram", "visitar", "converteram",
    /* zh */ "访问了", "浏览了", "转化",
    /* ja */ "訪れ", "閲覧し", "アクセスし",
    /* ar */ "زار", "زاروا", "تصفح",
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
    verbs: [
    /* en */ "automate", "automated", "automating",
    /* el */ "αυτοματοποίησα", "αυτοματοποιώ",
    /* es */ "automaticé", "automatizar", "automatizado",
    /* fr */ "automatisé", "automatiser",
    /* de */ "automatisiert", "automatisieren",
    /* it */ "automatizzato", "automatizzare",
    /* pt */ "automatizei", "automatizar", "automatizado",
    /* zh */ "自动化了", "自动执行",
    /* ja */ "自動化し", "自動化した",
    /* ar */ "أتمتت", "أتمتة",
    ],
  },
};

/** The subject words for a module, or an empty list. A module with no
 *  entry keeps exactly the vocabulary it had, so adding this file cannot
 *  make any existing match worse. These join the module vocabulary, so
 *  module narrowing gets them too. */
export function synonymsFor(slug: string): readonly string[] {
  const m = MODULE_SYNONYMS[slug];
  if (!m) return [];
  // VERBS JOIN primary, NOT associated. A verb is not a weaker signal
  // than a noun — "ξόδεψα" is exactly as much a claim about Finance as
  // "έξοδα" — and putting them at half weight would have left every
  // verb-led question losing to any noun that happened to appear.
  return [...m.primary, ...m.verbs];
}

/** The words that travel with the module without belonging to it. Scored
 *  separately and at half weight — see lib/ai/deep-dive-load.ts. Kept out
 *  of the shared vocabulary on purpose: narrowing DROPS modules, and
 *  dropping a module because a weak word did not appear is a different
 *  and worse mistake than not deep-reading one. */
export function associatedFor(slug: string): readonly string[] {
  return MODULE_SYNONYMS[slug]?.associated ?? [];
}
