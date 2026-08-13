// What an agent can and cannot be asked to do — decided BEFORE any money
// moves.
//
// THE INCIDENT THIS EXISTS FOR. A user asked for an agent that "builds an
// MVP, runs tests, fixes errors". The builder designed one, the account
// was charged, the agent was created, it ran on schedule, and it replied
// "I don't produce executable source code in this context". Every layer
// behaved exactly as written and the user paid for a refusal.
//
// Nothing in the pipeline was asking the only question that mattered: is
// this something an agent can do at all? The builder's `unsupported`
// field came close, but it was free text with no effect — the draft was
// returned as `ok: true` no matter what went in it.
//
// THREE LAYERS, and the order is the point:
//
//   1. THIS FILE — deterministic, offline, runs before the reservation.
//      No AI call, so a request it rejects costs the user nothing at all.
//      It is deliberately high-precision rather than exhaustive: a false
//      block is worse than a miss, because layers 2 and 3 catch the miss
//      and nothing catches a wrongly-refused user.
//   2. THE BUILDER's `feasibility` enum (lib/agents/agent-builder.ts).
//      A model reading the actual request, in any language, deciding
//      full/partial/none. `none` refunds the whole reservation.
//   3. THE RUNNER's refusal detector (detectCapabilityRefusal below).
//      The backstop for a request that got past both: if the agent's own
//      output is a refusal, the run refunds and the agent switches off
//      instead of billing the same refusal every morning.
//
// This module is client-safe on purpose — the create screen renders the
// same capability lists this classifier enforces, so what the user is
// told and what the server does cannot drift apart.

/**
 * The kinds of work an agent cannot do.
 *
 * These are ids, not prose: every one has a matching i18n key under
 * `dashboard.agents.capability.*`, so the reason a request was refused is
 * shown in the user's own language rather than in whatever language the
 * matcher happened to fire on.
 */
export const AGENT_BLOCKED_CATEGORIES = [
  "code",
  "system_access",
  "other_platforms",
  "physical",
  "financial",
  "phone",
] as const;
export type AgentBlockedCategory = (typeof AGENT_BLOCKED_CATEGORIES)[number];

/** The capability lists rendered on the create screen. Ids, i18n'd in the
 *  component — see AGENT_BLOCKED_CATEGORIES for why. */
export const AGENT_CAN_IDS = ["search", "analyse", "summarise", "monitor", "schedule"] as const;
export const AGENT_CANNOT_IDS = AGENT_BLOCKED_CATEGORIES;

export type CapabilityEvidence = {
  category: AgentBlockedCategory;
  /** The words that triggered it, so a wrong block is arguable rather
   *  than mysterious. Shown to the user. */
  matched: string;
};

export type AgentCapabilityVerdict = {
  /**
   * supported   — nothing outside the envelope. Proceed.
   * partial     — some of it is doable, some is not. Confirm first.
   * unsupported — every part of it is outside the envelope. Refuse, free.
   */
  verdict: "supported" | "partial" | "unsupported";
  blocked: AgentBlockedCategory[];
  evidence: CapabilityEvidence[];
  /** The clauses that ARE doable, verbatim, so "the agent will do Y
   *  instead" quotes the user rather than paraphrasing them. */
  doableParts: string[];
};

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Lowercase, accent-stripped, final-sigma-normalised.
 *
 * Greek is why this is not just toLowerCase(). "κώδικα" and "κωδικα" are
 * the same word typed by two people, "τρέχεις" ends in a different sigma
 * than "τρέχεις " mid-word, and a matcher that misses either one lets the
 * exact reported request through. NFD splits the accent off as a
 * combining mark, which the range below removes.
 */
export function normaliseForMatching(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ς/g, "σ") // final sigma -> sigma
    // Curly apostrophes, which phones insert by default. Without this,
    // "I can’t run tests" and "I can't run tests" are different strings
    // and only one of them is a refusal.
    .replace(/[’‘‛]/g, "'")
    .replace(/\s+/g, " ");
}

// `\b` IS ASCII-ONLY, AND THAT MAKES IT USELESS HERE.
//
// JavaScript defines a word boundary against `\w`, which is
// [A-Za-z0-9_]. Every Greek letter is therefore a NON-word character, so
// `\bκωδικα\b` asks for a transition that can never happen and matches
// nothing, ever — silently, with no error. Written with `\b`, this entire
// classifier passed its English cases and let every Greek one through,
// including the exact request from the reported incident. It was caught
// by running the cases, not by reading the code.
//
// These build the boundary out of the Unicode letter/number properties
// instead. Deliberately WITHOUT lookbehind: `(?<!x)` is unsupported on
// older Safari, and a SyntaxError at module load in a client-safe file
// would take the whole create screen down. Consuming the preceding
// character costs one leading separator on the matched text, which the
// evidence formatting trims.
const NOT_WORD_BEFORE = String.raw`(?:^|[^\p{L}\p{N}])`;
const NOT_WORD_AFTER = String.raw`(?![\p{L}\p{N}])`;

/** A whole word: bounded on both sides. */
function word(inner: string): RegExp {
  return new RegExp(`${NOT_WORD_BEFORE}(?:${inner})${NOT_WORD_AFTER}`, "u");
}

/** A stem: bounded at the start, free to run into a suffix. Greek and
 *  English both inflect, and "διορθώνει"/"διορθώσει" are the same verb. */
function stem(inner: string): RegExp {
  return new RegExp(`${NOT_WORD_BEFORE}(?:${inner})`, "u");
}

/** Drops the separator character a boundary-free match consumes, so the
 *  evidence shown to the user reads as words rather than " post". */
function cleanMatch(hit: string): string {
  return hit.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

/**
 * Markers that mean "this is code work" on their own.
 *
 * Reserved for phrases with no innocent reading. "source code" is never a
 * topic someone wants monitored in the sense of being WRITTEN; "news
 * about source code" would not phrase itself that way. Anything with an
 * innocent reading goes in the action+object table instead.
 */
const STRONG: { category: AgentBlockedCategory; patterns: RegExp[] }[] = [
  {
    category: "code",
    patterns: [
      word("source code"),
      stem("πηγαιο(?:σ|υ|ν)? κωδικ"),
      stem("γραψιμο κωδικ"),
      word("executable code"),
      word("unit test(?:s|ing)?"),
      word("pull request"),
      word("git (?:commit|push|merge|branch|repo)"),
      word("code review"),
      word("debugg?(?:ing|er)?"),
      stem("αποσφαλματωσ"),
      word("mvp"),
      word("boilerplate"),
      word("codebase"),
      word("compile(?:s|d|r)?"),
      stem("μεταγλωττισ"),
      word("refactor(?:s|ing|ed)?"),
      word("ci ?/ ?cd"),
    ],
  },
  {
    category: "system_access",
    patterns: [
      word("ssh"),
      word("remote desktop"),
      word("my (?:computer|laptop|machine|server|hard drive|desktop)"),
      stem("(?:τον|στον|στο|το) (?:υπολογιστη|λαπτοπ|σερβερ|server) μου"),
      word("log ?in(?:to)? my"),
      // συνδεθ- and συνδεσ- are both real stems of the same verb
      // ("συνδέσου", "συνδεθεί"), and a user writes whichever comes to
      // mind.
      stem("συνδε(?:θ|σ)[a-zα-ω]* στο(?:ν)? λογαριασμο μου"),
      word("my password(?:s)?"),
      stem("(?:τουσ )?κωδικουσ (?:προσβασησ )?μου"),
    ],
  },
  {
    category: "phone",
    patterns: [
      word("(?:make|place) a (?:phone )?call"),
      word("phone call"),
      word("call (?:them|him|her|the|my|customers?|clients?)"),
      stem("τηλεφων(?:ησ|ημα|ικ|ο σ)"),
      stem("παρ(?:ε|ει|εισ) τηλεφωνο"),
      stem("καλεσ(?:ε|ει) (?:στο|τον|την|τουσ)"),
    ],
  },
  {
    category: "physical",
    patterns: [
      word("(?:print|scan) (?:it|them|the|a|my)"),
      stem("τυπωσ(?:ει|ε) (?:το|τα|την)"),
      word("deliver (?:it|them|the|a) (?:to|in person)"),
      word("in person"),
      stem("αυτοπροσωπ"),
      word("pick(?: it)? up from"),
    ],
  },
];

/**
 * Action + object. BOTH have to be present in the same clause.
 *
 * This is the whole reason the classifier can be trusted near money.
 * Keyword-only matching on "python" or "trade" blocks "send me news about
 * Python releases" and "track my trades" — two of the most obviously
 * legitimate agents this product can build. Requiring a verb that DOES
 * something to an object that IS the forbidden thing is what separates
 * "watch X" from "do X".
 */
const PAIRS: {
  category: AgentBlockedCategory;
  actions: RegExp;
  objects: RegExp;
}[] = [
  {
    category: "code",
    actions: stem(
      "write|writes|writing|code|codes|coding|build|builds|building|create|creates|develop|develops|developing|implement|implements|run|runs|running|execute|executes|fix|fixes|fixing|repair|repairs|deploy|deploys|test|tests|testing|program|programs|" +
        "γραψ|γραφ|φτιαξ|φτιαχν|φτιαχ|δημιουργ|αναπτυξ|αναπτυσ|υλοποι|τρεξ|τρεχ|εκτελ|διορθω|διορθν|προγραμματισ|κατασκευασ|χτισ|επισκευασ"
    ),
    objects: word(
      "code|script|scripts|program|programs|application|app|apps|prototype|software|website|websites|web ?site|site|sites|tests?|bugs?|errors?|repository|repositories|repo|api|endpoint|database|migration|function|algorithm|feature|features|frontend|backend|component|" +
        "κωδικα|κωδικασ|σκριπτ|προγραμμα|εφαρμογη|εφαρμογεσ|πρωτοτυπο|λογισμικο|ιστοσελιδα|ιστοσελιδεσ|σαιτ|τεστ|σφαλμα|σφαλματα|λαθη|αποθετηριο|βαση δεδομενων|συναρτηση|αλγοριθμο"
    ),
  },
  {
    category: "system_access",
    actions: stem(
      "access|accesses|open|opens|read|reads|edit|edits|delete|deletes|install|installs|upload|uploads|download|downloads|connect|connects|" +
        "προσπελασ|ανοιξ|διαβασ|επεξεργασ|σβησ|διαγραψ|εγκαταστησ|ανεβασ|κατεβασ|συνδεθ|συνδεσ"
    ),
    objects: word(
      "my (?:files?|folders?|drive|photos?|contacts?|inbox|mailbox|database|system|network|vpn|router|nas)|my documents? on|my calendar on|" +
        "τα αρχεια μου|τουσ φακελουσ μου|το δικτυο μου|το συστημα μου|τη βαση μου|τη βαση δεδομενων μου"
    ),
  },
  {
    category: "other_platforms",
    actions: stem(
      "post|posts|posting|publish|publishes|tweet|tweets|share|shares|comment|comments|repl(?:y|ies)|message|messages|send|sends|dm|book|books|order|orders|cancel|cancels|subscribe|" +
        "δημοσιευ|αναρτ|μοιρασ|σχολιασ|απαντησ|στειλ|στελν|παραγγειλ|παραγγελ|ακυρωσ|εγγραψ|κλεισ"
    ),
    objects: word(
      "(?:on|to) (?:twitter|x|instagram|facebook|linkedin|reddit|tiktok|youtube|discord|whatsapp|telegram|slack)|" +
        "(?:στο|στα) (?:twitter|x|instagram|facebook|linkedin|reddit|tiktok|youtube|discord|whatsapp|telegram|slack)|" +
        "a (?:tweet|post|comment|dm)|ενα (?:tweet|post|σχολιο)|" +
        "to (?:my )?(?:customers?|clients?|subscribers?|followers?|contacts?|colleagues?|suppliers?)|" +
        "σε (?:πελατεσ|συνεργατεσ|συναδελφουσ|προμηθευτεσ|επαφεσ)|(?:τουσ|στουσ) πελατεσ μου|" +
        "ραντεβου|appointment|reservation|κρατηση"
    ),
  },
  {
    category: "financial",
    actions: stem(
      "buy|buys|buying|purchase|purchases|sell|sells|selling|pay|pays|paying|transfer|transfers|invest|invests|withdraw|withdraws|" +
        "αγορασ|αγοραζ|πουλησ|πωλ|πληρωσ|πληρων|μεταφερ|επενδυσ|επενδυ|αναληψ|εμβασμα"
    ),
    objects: word(
      "stocks?|shares?|crypto|cryptocurrency|bitcoin|etf|bonds?|money|funds|invoices?|bills?|subscriptions?|my (?:card|account|wallet)|" +
        "μετοχ(?:η|εσ|ων)|κρυπτονομισμα(?:τα)?|ομολογα|χρηματα|τιμολογι(?:ο|α)|λογαριασμο(?:υσ)?|συνδρομ(?:η|εσ)|την καρτα μου|το πορτοφολι μου"
    ),
  },
  {
    category: "physical",
    actions: stem(
      "drive|drives|deliver|delivers|collect|collects|water|waters|clean|cleans|" +
        "οδηγησ|παραδωσ|παραδιδ|μαζεψ|ποτισ|καθαρισ"
    ),
    objects: word(
      "to my (?:house|office|address)|the (?:package|parcel|car|office|plants?)|" +
        "στο σπιτι μου|στο γραφειο μου|το (?:δεμα|αυτοκινητο|γραφειο)|τα φυτα"
    ),
  },
];

/**
 * Verbs that describe work an agent genuinely does.
 *
 * Used only to tell "unsupported" from "partial": a clause with one of
 * these and no block is a real deliverable, so the request is worth
 * offering to build in reduced form rather than refusing outright.
 */
const DOABLE_ACTION = stem(
  "search|find|look up|research|monitor|watch|track|follow|check|analyse|analyze|compare|summaris|summariz|report|list|collect|gather|" +
    "tell me|send me|email me|update me|brief|digest|news|alert|" +
    "ψαξ|ψαχν|βρεσ|βρισκ|ερευν|παρακολουθ|ελεγχ|ελεγξ|αναλυ|συγκριν|συγκρι|συνοψι|περιληψ|αναφορ|λιστα|συλλεξ|" +
    "στειλε μου|στελνει μου|πεσ μου|ενημερωσε με|ενημερων|νεα|ειδησεισ"
);

/**
 * Split into clauses.
 *
 * "builds an MVP, runs tests, fixes errors" is three requests wearing one
 * coat, and treating it as one string can only produce one verdict for
 * all three. Splitting is what lets the classifier say "these two parts
 * are impossible, this one is fine" — which is the difference between a
 * refusal and a counter-offer.
 */
// Built the same Unicode-aware way as the matchers, and for the same
// reason: written with `\b`, the Greek connectives below would never
// split anything, and "στείλε μου τα νέα και φτιάξε ένα script" would be
// judged as one clause instead of a doable one and an impossible one.
const CLAUSE_SPLIT = new RegExp(
  `[,;.!?\\n]+|${NOT_WORD_BEFORE}(?:and then|and also|and|then|plus|also|` +
    `και μετα|και επισησ|και|μετα|επισησ|επιπλεον)${NOT_WORD_AFTER}`,
  "gu"
);

function clausesOf(normalised: string): string[] {
  return normalised
    .split(CLAUSE_SPLIT)
    .map((c) => (c ?? "").trim())
    .filter((c) => c.length > 2);
}

function categoriesInClause(clause: string): CapabilityEvidence[] {
  const found: CapabilityEvidence[] = [];

  for (const { category, patterns } of STRONG) {
    for (const pattern of patterns) {
      const hit = clause.match(pattern);
      if (hit) {
        found.push({ category, matched: cleanMatch(hit[0]) });
        break;
      }
    }
  }

  for (const { category, actions, objects } of PAIRS) {
    if (found.some((f) => f.category === category)) continue;
    const action = clause.match(actions);
    const object = clause.match(objects);
    if (action && object) {
      found.push({ category, matched: `${cleanMatch(action[0])} … ${cleanMatch(object[0])}` });
    }
  }

  return found;
}

/**
 * The pre-charge gate.
 *
 * Called from api/agents/build BEFORE the reservation, so an "unsupported"
 * verdict costs the user nothing whatsoever — not a credit, not an AI
 * call, not a job row.
 */
export function classifyAgentRequest(request: string): AgentCapabilityVerdict {
  const normalised = normaliseForMatching(String(request ?? ""));
  if (!normalised.trim()) {
    return { verdict: "supported", blocked: [], evidence: [], doableParts: [] };
  }

  const clauses = clausesOf(normalised);
  // A request with no clause separators is still one clause.
  const parts = clauses.length > 0 ? clauses : [normalised.trim()];

  const evidence: CapabilityEvidence[] = [];
  const doableParts: string[] = [];
  let blockedClauses = 0;

  for (const clause of parts) {
    const hits = categoriesInClause(clause);
    if (hits.length > 0) {
      blockedClauses++;
      for (const hit of hits) {
        if (!evidence.some((e) => e.category === hit.category)) evidence.push(hit);
      }
    } else if (DOABLE_ACTION.test(clause)) {
      doableParts.push(clause);
    }
  }

  if (evidence.length === 0) {
    return { verdict: "supported", blocked: [], evidence: [], doableParts };
  }

  const blocked = [...new Set(evidence.map((e) => e.category))];

  // "partial" needs a clause that survives on its own merits — a doable
  // VERB, not merely the absence of a forbidden one. Without that test,
  // "build an MVP for my startup" splits into a blocked clause and the
  // fragment "for my startup", and the fragment would make the whole
  // thing look half-buildable. It is not: there is nothing there to
  // build instead.
  const verdict = doableParts.length > 0 ? "partial" : "unsupported";
  return { verdict, blocked, evidence, doableParts };
}

// ---------------------------------------------------------------------------
// Layer 3: the run-time backstop
// ---------------------------------------------------------------------------

/**
 * Did the agent's own output turn out to be a refusal?
 *
 * The reported incident's final form: a run that "succeeded", delivered
 * an email saying "I don't produce executable source code in this
 * context", and charged for it. validateAgentOutput passed it — it is
 * well over the length floor, leaks no fencing markers and is not the
 * NO_RESULT token — because nothing was looking for this shape.
 *
 * The primary signal is the CANNOT_COMPLETE marker the runner's system
 * prompt now asks for, which is exact. The prose patterns below are the
 * fallback for a model that explains itself instead of using the marker,
 * and they are matched only against the OPENING of the output: a research
 * summary that happens to quote someone saying "I cannot do that" halfway
 * down is not a refusal, and treating it as one would refund a run that
 * worked.
 */
// Built with the same Unicode boundaries as everything else in this file.
// Written with `\b`, the Greek entries below matched nothing — which is
// how "Δεν παράγω εκτελέσιμο πηγαίο κώδικα σε αυτό το πλαίσιο", the
// literal sentence from the incident, would have gone undetected by the
// detector written to catch it.
const REFUSAL_PROSE = [
  word("i (?:do not|don't|cannot|can't|am not able to|am unable to) (?:produce|generate|write|create|execute|run|provide|access)"),
  word("i'?m (?:not able|unable) to"),
  new RegExp(
    `${NOT_WORD_BEFORE}as an ai${NOT_WORD_AFTER}[^.]{0,80}${NOT_WORD_BEFORE}(?:cannot|can't|unable)${NOT_WORD_AFTER}`,
    "u"
  ),
  word("this (?:is )?(?:outside|beyond) (?:my|the) (?:capabilities|scope)"),
  // "δεν μπορώ" ALONE IS NOT A REFUSAL, and treating it as one is the
  // expensive mistake in this direction. A perfectly good market summary
  // says "οι αναλυτές εκτιμούν ότι δεν μπορώ να πω με βεβαιότητα…" — and
  // a false positive here refunds a working run AND switches the agent
  // off. So the verb has to be one of DOING the task, mirroring the
  // English patterns above, which require produce/generate/write/execute
  // rather than a bare "cannot".
  stem("δεν (?:παραγω|εκτελω|γραφω)"),
  stem(
    "δε(?:ν)? (?:μπορω|εχω τη δυνατοτητα|ειμαι σε θεση) να " +
      "(?:γραψω|παραξω|παραγω|εκτελεσω|τρεξω|φτιαξω|κατασκευασω|δημιουργησω|αναπτυξω|" +
      "αποκτησω προσβαση|συνδεθω|καλεσω|τηλεφωνησω|πληρωσω|αγορασω|πουλησω|δημοσιευσω|στειλω μηνυμα)"
  ),
  new RegExp(
    `${NOT_WORD_BEFORE}ωσ (?:ai|τεχνητη νοημοσυνη)[^.]{0,80}${NOT_WORD_BEFORE}δεν${NOT_WORD_AFTER}`,
    "u"
  ),
  stem("ξεφευγει απο τι[σς] δυνατοτητε"),
];

export const AGENT_CANNOT_COMPLETE_MARKER = "CANNOT_COMPLETE";

export type RefusalCheck = { refused: boolean; reason: string };

export function detectCapabilityRefusal(output: string): RefusalCheck {
  const raw = String(output ?? "").trim();
  if (!raw) return { refused: false, reason: "" };

  // The explicit marker, first and exact.
  const marker = raw.match(
    new RegExp(`^\\s*${AGENT_CANNOT_COMPLETE_MARKER}\\s*[:\\-–]?\\s*([\\s\\S]*)$`, "i")
  );
  if (marker) return { refused: true, reason: marker[1].trim().slice(0, 500) };

  // Prose fallback, opening only — see above for why not the whole text.
  const opening = normaliseForMatching(raw.slice(0, 400));
  for (const pattern of REFUSAL_PROSE) {
    if (pattern.test(opening)) return { refused: true, reason: raw.slice(0, 500) };
  }
  return { refused: false, reason: "" };
}
