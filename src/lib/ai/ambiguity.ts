/**
 * IS THIS REQUEST TOO VAGUE TO ACT ON — DECIDED BEFORE ANYTHING IS SPENT.
 *
 * WHY THIS EXISTS, given lib/clarification.ts already answers the same
 * question. That one is a Sonnet call. It is small and it is cheap, and
 * it is still a paid model call made in order to decide whether to make a
 * paid model call — so "the classifier decides before spending" was not
 * true of it, and could not be made true by tuning its prompt. It also
 * reaches none of the chat surfaces, which are where a user is most
 * likely to type three words and expect the product to guess.
 *
 * THREE ANSWERS, NOT TWO, and that is the whole design.
 *
 *   CLEAR   act now. No clarification call, paid or otherwise.
 *   VAGUE   ask now. No clarification call either — the evidence is
 *           already conclusive, and paying a model to agree is waste.
 *   UNSURE  the middle, and the only case that reaches the paid check.
 *
 * A binary detector has to be tuned to a threshold, and every threshold
 * on this kind of evidence is wrong for somebody: strict enough to catch
 * "κάν' το" is strict enough to interrogate a perfectly good one-line
 * brief. Three answers let the cheap thing be confident where it can be
 * and defer where it cannot, which is the only honest use of a signal
 * this weak.
 *
 * THE CUES ARE WRITTEN FOR MATCHING, NOT FOR READING. This product spent
 * a week finding out what happens otherwise: a module vocabulary built
 * from interface nouns reached 12 of 130 verb-led questions, and a
 * command palette that matched its English state key was unusable in nine
 * languages. So every list below is phrasings a person TYPES, in each of
 * the ten languages the app ships, and scripts/tests/ambiguity.test.mjs
 * measures the whole cross-product rather than sampling it.
 *
 * WHAT THIS IS NOT. It is not a language model and it does not understand
 * anything. It counts evidence. Its job is to be RIGHT WHEN IT IS
 * CONFIDENT and to say UNSURE the rest of the time, and the gate holds it
 * to exactly that: no clear request may be called vague.
 */
import { foldForMatch } from "@/lib/text/unicode-patterns";

export type AmbiguityVerdict = "clear" | "vague" | "unsure";

export type AmbiguityAssessment = {
  verdict: AmbiguityVerdict;
  /** Why, in stable machine-readable codes — never user-facing prose. */
  reasons: string[];
  /** Content words after folding. Exposed because it is the one number a
   *  caller might reasonably want to log. */
  words: number;
};

/**
 * Scripts with no space between words. A Chinese request of four
 * characters is a sentence; the same character count in Latin is one
 * word, so `words` is meaningless for these and length is measured in
 * characters instead.
 */
const NO_WORD_BREAKS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * "Do it", with no antecedent. THE single strongest free signal there is:
 * a request that is entirely a verb and a pronoun cannot be acted on
 * without knowing what "it" was.
 *
 * Matched as a WHOLE REQUEST, not as a substring — "fix it" is vague and
 * "fix it so the header stops overlapping the nav" is not, and the
 * difference is everything after the pronoun.
 */
const BARE_COMMANDS: readonly string[] = [
  // en
  "do it", "do this", "do that", "fix it", "fix this", "make it", "make this",
  "change it", "change this", "sort it", "handle it", "go", "go on", "continue",
  "help", "help me", "again", "more", "next",
  // el
  "κανε το", "καν το", "καντο", "φτιαξε το", "φτιαξ το", "αλλαξε το",
  "βοηθεια", "βοηθησε με", "συνεχισε", "παλι", "κι αλλο", "επομενο",
  // es
  "hazlo", "haz esto", "arreglalo", "cambialo", "ayuda", "ayudame",
  "continua", "otra vez", "mas", "siguiente",
  // fr
  "fais le", "fais ca", "repare le", "change le", "aide", "aide moi",
  "continue", "encore", "plus", "suivant",
  // de
  "mach es", "mach das", "repariere es", "andere es", "hilfe", "hilf mir",
  "weiter", "nochmal", "mehr", "nachste",
  // it
  "fallo", "fai questo", "sistemalo", "cambialo", "aiuto", "aiutami",
  "continua", "ancora", "altro", "prossimo",
  // pt
  "faz isso", "faca isso", "conserta", "muda isso", "ajuda", "me ajuda",
  "continua", "de novo", "mais", "proximo",
  // zh — no spaces, matched by inclusion below
  "做吧", "做这个", "帮我", "帮助", "继续", "再来", "更多", "下一个",
  // ja
  "やって", "これをやって", "助けて", "続けて", "もっと", "次",
  // ar
  "افعلها", "افعل هذا", "اصلحه", "غيره", "مساعدة", "ساعدني", "اكمل", "المزيد",
];

/**
 * Placeholders where the subject should be. "Make me something nice" has
 * a verb, an object and no information: `something` is the word a person
 * uses when they have not decided yet.
 */
const PLACEHOLDERS: readonly string[] = [
  // en
  "something", "anything", "whatever", "some stuff", "things", "some kind of",
  // el
  "κατι", "οτιδηποτε", "οτι να ναι", "καπως", "πραγματα",
  // es
  "algo", "cualquier cosa", "lo que sea", "cosas",
  // fr
  "quelque chose", "n importe quoi", "des trucs", "des choses",
  // de
  "irgendwas", "irgendetwas", "etwas", "sachen",
  // it
  "qualcosa", "qualsiasi cosa", "roba", "cose",
  // pt
  "alguma coisa", "qualquer coisa", "algo", "coisas",
  // zh
  "什么东西", "随便", "一些东西", "东西",
  // ja
  "何か", "なんでも", "適当に", "もの",
  // ar
  "شيء ما", "اي شيء", "اشياء", "حاجة",
];

/**
 * Evidence the request is REAL, and this half matters as much as the
 * other. Without it the detector is a length check, and a length check
 * calls "invoice Acme £4,200 for March" vague because it is five words.
 *
 * Every entry is something a person only writes when they have something
 * specific in mind.
 */
const SPECIFICITY = [
  { code: "url", test: (raw: string) => /https?:\/\/|www\.|\.[a-z]{2,}\//i.test(raw) },
  { code: "number", test: (raw: string) => /\d/.test(raw) },
  { code: "quoted", test: (raw: string) => /["'«»“”„]/.test(raw) },
  { code: "email", test: (raw: string) => /@[\w.-]+\.\w{2,}/.test(raw) },
  {
    // A capitalised word that is not the first — a name, a product, a
    // place. Deliberately skips the opening word, which is capitalised
    // for grammar rather than for reference, and skips scripts with no
    // case at all rather than pretending to read them.
    code: "propernoun",
    test: (raw: string) => {
      const words = raw.trim().split(/\s+/).slice(1);
      return words.some((w) => /^[A-ZΑ-ΩÀ-ÞА-Я][a-zα-ωß-öø-ÿа-я]{2,}/.test(w));
    },
  },
  { code: "list", test: (raw: string) => /(^|\n)\s*[-*•\d]+[.)\s]/.test(raw) },
] as const;

/**
 * Below this many content words a request carries no brief, in a script
 * that has spaces. Three is deliberate and is the lowest number that is
 * defensible: "cancel my subscription" is three words and perfectly
 * clear, so the floor cannot be higher than that without calling real
 * requests vague — which is the one error this must not make.
 */
export const MIN_CONTENT_WORDS = 3;

/** Characters, for Han/Kana, where `words` cannot be counted. */
export const MIN_CJK_CHARS = 6;

/**
 * Long enough that whatever it is, the user has said it. No detector
 * this cheap has any business second-guessing a paragraph.
 */
export const CLEARLY_ENOUGH_WORDS = 12;

/**
 * The same idea in characters, for Han and Kana — and it is a SEPARATE
 * number, which the first draft got wrong.
 *
 * That draft compared a character count against CLEARLY_ENOUGH_WORDS, so
 * «プライバシーポリシーを書いて» — "write a privacy policy", fourteen
 * characters and four words — was declared "long" and waved through for
 * the wrong reason. It is the flat-threshold-across-scripts mistake
 * lib/ai/module-relevance.ts already records against MIN_TERM_LENGTH:
 * a number that is right for one writing system is not a number.
 *
 * Twelve English words run about 24-36 Han characters; 24 is the low end,
 * chosen so this errs toward asking rather than toward assuming.
 */
export const CLEARLY_ENOUGH_CJK_CHARS = 24;

/** Normalised for comparing: folded, punctuation flattened to spaces. */
function normalise(input: string): string {
  return foldForMatch(String(input ?? ""))
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBareCommand(normalised: string, cjk: boolean): boolean {
  if (!normalised) return false;
  for (const cue of BARE_COMMANDS) {
    const folded = normalise(cue);
    if (!folded) continue;
    // WHOLE REQUEST for spaced scripts. "fix it" is vague; "fix it so the
    // header stops overlapping" is not, and a substring test cannot tell
    // them apart. Han and Kana have no boundaries to anchor on, so there
    // the request must also be SHORT to count — which is the same claim
    // stated in the only way that script allows.
    if (cjk) {
      if (normalised.includes(folded) && [...normalised].length <= MIN_CJK_CHARS) return true;
    } else if (normalised === folded) {
      return true;
    }
  }
  return false;
}

function hasPlaceholder(normalised: string, cjk: boolean): boolean {
  return PLACEHOLDERS.some((p) => {
    const folded = normalise(p);
    if (!folded) return false;
    if (cjk) return normalised.includes(folded);
    // Word-bounded without \b, which is ASCII-only and has already cost
    // this repository four defects — see docs/shapes.md.
    return ` ${normalised} `.includes(` ${folded} `);
  });
}

/**
 * Assess a request. Pure, free, and synchronous — no I/O, no model, no
 * key required, which is the entire point.
 *
 * `hasContext` is what a chat has and a blank Create box does not: a
 * previous turn for "it" to refer to. A bare command with context behind
 * it is not ambiguous, it is a follow-up, and treating those the same way
 * would make the feature unbearable in the one surface it is most needed.
 */
export function assessAmbiguity(
  input: string,
  { hasContext = false }: { hasContext?: boolean } = {}
): AmbiguityAssessment {
  const raw = String(input ?? "");
  const normalised = normalise(raw);
  const cjk = NO_WORD_BREAKS.test(raw);
  const words = normalised ? normalised.split(" ").filter(Boolean).length : 0;
  const length = cjk ? [...normalised].length : words;
  const floor = cjk ? MIN_CJK_CHARS : MIN_CONTENT_WORDS;

  const reasons: string[] = [];
  const specific = SPECIFICITY.filter((s) => s.test(raw)).map((s) => s.code);

  if (!normalised) {
    return { verdict: "vague", reasons: ["empty"], words: 0 };
  }

  // SPECIFICITY WINS, ALWAYS, and it is checked first on purpose. A
  // request naming a number, a URL, a quoted phrase or a proper noun has
  // told us something concrete, and no amount of brevity outweighs that.
  // Getting this order wrong is what turns a helpful feature into a
  // product that interrogates people who were perfectly clear.
  if (specific.length > 0) {
    return { verdict: "clear", reasons: specific.map((c) => `specific:${c}`), words };
  }

  if (length >= (cjk ? CLEARLY_ENOUGH_CJK_CHARS : CLEARLY_ENOUGH_WORDS)) {
    return { verdict: "clear", reasons: ["long"], words };
  }

  if (isBareCommand(normalised, cjk)) {
    // WITH CONTEXT THIS IS NOT AMBIGUOUS. "continue" after four turns of
    // conversation is the clearest thing a person can say.
    if (hasContext) return { verdict: "clear", reasons: ["bare:followup"], words };
    reasons.push("bare");
  }

  if (hasPlaceholder(normalised, cjk)) reasons.push("placeholder");
  if (length < floor) reasons.push("short");

  // TWO SIGNALS ARE CONCLUSIVE ON THEIR OWN, and the rest need company.
  //
  //   bare        the request IS a verb and a pronoun. There is nothing
  //               else in it to be wrong about.
  //   placeholder the user wrote "something" where the subject goes.
  //               Reaching here means no number, no name, no URL, no
  //               quote and fewer than twelve words have already been
  //               ruled out — so the placeholder IS the request.
  //
  // `short` alone is not, and that is deliberate: "show revenue" is two
  // words and completely actionable. A detector that treats brevity as
  // evidence interrogates the people who write well.
  if (reasons.includes("bare")) return { verdict: "vague", reasons, words };
  if (reasons.includes("placeholder")) return { verdict: "vague", reasons, words };
  if (reasons.length >= 2) return { verdict: "vague", reasons, words };

  // EVERYTHING ELSE DEFERS. This is not a failure of the detector; it is
  // the detector doing its job. The paid check is better at this than any
  // list of cues, and it should be spent on the cases where cues cannot
  // decide rather than on the ones where they can.
  return { verdict: "unsure", reasons: reasons.length ? reasons : ["no-signal"], words };
}

/**
 * Should the caller pay for lib/clarification.ts's model call?
 *
 * Only for `unsure`. Both confident verdicts are already actionable, and
 * spending to confirm them is the cost this module exists to remove.
 */
export function needsPaidClarityCheck(assessment: AmbiguityAssessment): boolean {
  return assessment.verdict === "unsure";
}
