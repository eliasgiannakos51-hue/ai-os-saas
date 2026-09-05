import { boundedPattern, foldForMatch, stem } from "@/lib/text/unicode-patterns";

/**
 * "GO TO X TO DO Y" IS AN INSTRUCTION. A BUTTON IS NOT.
 *
 * When an answer says the work belongs somewhere else, the user is left
 * to find that somewhere else by hand — in a sidebar they were told is
 * simple precisely because it does not list everything. This is the
 * registry of the places an answer can point at, and the offline reader
 * that decides which one it means.
 *
 * A CLOSED LIST, AND THAT IS THE WHOLE SAFETY MODEL. The reader returns
 * an entry from this array or null; there is no path by which it produces
 * an href. A wrong answer therefore costs exactly one click on a real
 * page of this product, never a link to nowhere and never an action.
 *
 * NOTHING HERE CALLS A MODEL. It is a fold and a regex, so it is free,
 * instant, and identical on every render — which is why it runs first and
 * why the paid detector only ever sees what this could not place.
 *
 * EVERY DESTINATION IS A ROW SOMEBODY CAN ALSO REACH BY HAND. Pointing at
 * a page that is hidden would be a button that teaches nothing;
 * scripts/tests/transition-buttons.test.mjs holds each `href` against the
 * drawn sidebar rather than against this comment.
 */
export type TransitionDestination = {
  /** Closed enum value. Also the suffix of its label key. */
  id: string;
  href: string;
  /** dashboard.transitions.<id> — the words ON the button. */
  labelKey: string;
  /**
   * Word stems, in every language this app ships, that mean the answer is
   * about this destination.
   *
   * WRITTEN FOLDED, because the text is folded before matching:
   * foldForMatch lowercases and strips accents, so "Κώδικα" arrives as
   * "κωδικα" and a cue written with its accents would never fire.
   */
  stems: string[];
  /**
   * Cues matched as PLAIN SUBSTRINGS, for the two cases where demanding a
   * word boundary is wrong rather than merely strict. Both were measured,
   * not predicted:
   *
   *   1. NO WORD SEPARATORS. 代码 and コード sit inside a sentence with no
   *      space anywhere, so WORD_END — which is "not a letter or digit" —
   *      never holds and a bounded pattern matches nothing.
   *   2. AFFIXES THAT ATTACH. Arabic writes the article onto the noun:
   *      the text says الشفرة and the stem is شفرة, with ال in front of
   *      it and no separator. `boundedPattern(stem("شفرة"))` returned
   *      false on a sentence that plainly contains the word.
   *
   * This is the same family as the `\b` is ASCII shape in docs/shapes.md,
   * one step further out: the boundary here is not ASCII, it is simply
   * absent from the writing system.
   */
  substrings: string[];
};

export const TRANSITION_DESTINATIONS: TransitionDestination[] = [
  {
    id: "coding",
    href: "/dashboard/coding",
    labelKey: "dashboard.transitions.coding",
    stems: ["code", "coding", "κωδικ", "προγραμματισμ", "codigo", "programm", "script", "συναρτησ", "function", "fonction", "funcion", "funzion"],
    substrings: ["コード", "プログラム", "代码", "程式", "الشفرة", "شفرة", "الكود", "كود", "برمج"],
  },
  {
    id: "websiteBuilder",
    href: "/dashboard/website-builder",
    labelKey: "dashboard.transitions.websiteBuilder",
    stems: ["website", "web site", "ιστοσελιδ", "ιστοτοπ", "sitio web", "site web", "webseite", "sito web", "landing page"],
    substrings: ["ウェブサイト", "ホームページ", "网站", "網站", "الموقع", "موقع"],
  },
  {
    id: "agents",
    href: "/dashboard/agents",
    labelKey: "dashboard.transitions.agents",
    stems: ["agent", "πρακτορ", "agente"],
    substrings: ["エージェント", "智能体", "代理", "الوكيل", "وكيل"],
  },
  {
    id: "automation",
    href: "/dashboard/automation",
    labelKey: "dashboard.transitions.automation",
    stems: ["automat", "αυτοματ", "automatiz", "automatis", "automazion"],
    substrings: ["自動化", "自动化", "الأتمتة", "أتمتة"],
  },
  {
    id: "deepResearch",
    href: "/dashboard/deep-research",
    labelKey: "dashboard.transitions.deepResearch",
    stems: ["research", "ερευν", "recherche", "investigacion", "pesquisa", "ricerca"],
    substrings: ["リサーチ", "調査", "研究", "调研", "البحث", "بحث"],
  },
];

/** The closed set, for the gates and for anything that has to validate an
 *  id that came from outside this module. */
export const TRANSITION_IDS: string[] = TRANSITION_DESTINATIONS.map((d) => d.id);

export function destinationById(id: string): TransitionDestination | null {
  return TRANSITION_DESTINATIONS.find((d) => d.id === id) ?? null;
}

/**
 * A CUE IS NOT ENOUGH ON ITS OWN. An answer that merely CONTAINS the word
 * "code" is not an answer telling you to go and write some — the whole
 * reason this file exists is the sentence "for that, use the Code tool",
 * and the thing that distinguishes it is a second-person suggestion.
 *
 * So a destination fires only when BOTH are present: a topic cue and a
 * pointing cue. Precision over recall, deliberately: a missing button
 * costs a user one navigation they were going to make anyway; a wrong one
 * costs the trust that makes them press the next one.
 */
const POINTING_STEMS = [
  "you can", "you could", "you might", "try the", "use the", "open the", "head to", "go to", "over in", "in the",
  // WRITTEN FOLDED, and this one cost a measured failure: foldForMatch
  // turns a final ς into σ, so the cue "μπορεις" — spelled the way a
  // Greek speaker writes it — never matched "μπορείς" in a real sentence.
  "μπορεισ", "δοκιμασ", "χρησιμοποι", "πηγαιν", "ανοιξ",
  "puedes", "prueba", "usa el", "ve a",
  "vous pouvez", "essayez", "utilisez", "allez",
  "du kannst", "probier", "nutze", "geh zu",
  "puoi", "prova", "usa il", "vai",
  "voce pode", "experimente", "use o",
  "يمكنك", "استخدم",
];
// The pointing cues for the same two cases. Japanese offers a place with
// こちら and with the -て form of 開ける; "できます" alone missed a sentence
// that said 開けます, which is the ordinary way to say it.
const POINTING_SUBSTRINGS = [
  "できます", "してみて", "使って", "こちら", "開け", "ください",
  "可以", "试试", "使用", "打开", "前往",
  "يمكنك", "جرّب", "استخدم", "افتح",
];

const stemPattern = (stems: string[]) => boundedPattern(stem(...stems));

function mentions(folded: string, destination: TransitionDestination): boolean {
  if (destination.substrings.some((c) => folded.includes(c))) return true;
  return stemPattern(destination.stems).test(folded);
}

function pointsSomewhere(folded: string): boolean {
  if (POINTING_SUBSTRINGS.some((c) => folded.includes(c))) return true;
  // Not stem(): these are phrases, and a phrase's last word is where the
  // boundary belongs. boundedPattern anchors the front; the alternation
  // supplies its own ends.
  return boundedPattern(`(?:${POINTING_STEMS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`).test(
    folded
  );
}

/**
 * The free half. Returns the ONE destination this answer points at, or
 * null — never a list, because more than one button under an answer stops
 * being a suggestion and becomes a menu, and a menu is what the sidebar
 * was just cut from 45 rows to 23 to avoid.
 *
 * FIRST MATCH IN REGISTRY ORDER when an answer mentions two. That is a
 * real limitation and it is written down rather than hidden behind a
 * scoring function nobody can predict.
 */
export function detectTransition(text: string): TransitionDestination | null {
  // EIGHT, NOT TWENTY, AND THE REASON IS A MEASUREMENT. A floor of 20
  // characters threw away "你可以打开代码工具试试。" (12) and
  // "コードはこちらで開けます。" (13) — both complete sentences that point
  // somewhere. A length floor counted in characters is a floor that
  // applies to Latin scripts and silently disables the feature in two
  // languages. The real filter is the two-cue rule below, not the length.
  if (!text || text.length < 8) return null;
  const folded = foldForMatch(text);
  if (!pointsSomewhere(folded)) return null;
  return TRANSITION_DESTINATIONS.find((d) => mentions(folded, d)) ?? null;
}
