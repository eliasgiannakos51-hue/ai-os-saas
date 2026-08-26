import { foldForMatch, NOT_LETTER_OR_DIGIT } from "@/lib/text/unicode-patterns";

/**
 * What an idea's free-text verdict amounts to, for colouring its badge.
 *
 * WHAT WENT WRONG, AND IT WENT WRONG TWICE.
 *
 * 1. THE BADGE SAID THE OPPOSITE OF WHAT THE USER WROTE. The old classifier
 *    was three `includes` calls in this order:
 *
 *        if (v.includes("pursue") || v.includes("go") || v.includes("build"))
 *          -> green
 *        if (v.includes("kill") || v.includes("no")) -> red
 *
 *    "no-go" contains "go", and the green branch is FIRST, so "no-go" was
 *    painted green. So were "no go", "not going ahead" and "don't go". The
 *    one verdict a user is most likely to want to see at a glance was shown
 *    to them in the colour of its opposite. `includes` also matched "go"
 *    inside "ongoing" and "no" inside "unknown" and "economics".
 *
 * 2. IN NINE LANGUAGES OUT OF TEN IT MATCHED NOTHING AT ALL. The field's own
 *    placeholder tells the user, in their language, exactly what to type:
 *
 *        en  pursue / kill / watch          el  προχωράμε / ακύρωση / παρακολούθηση
 *        es  seguir / descartar / observar  fr  poursuivre / abandonner / surveiller
 *        de  verfolgen / verwerfen / …      it  procedere / scartare / osservare
 *        pt  seguir / descartar / observar  ar  المتابعة / الإلغاء / المراقبة
 *        ja  進める / 中止 / 様子見           zh  推进 / 放弃 / 观望
 *
 *    Not one of the eighteen non-English words appears in those three
 *    `includes` calls. Every verdict a Greek, Spanish, French, German,
 *    Italian, Portuguese, Arabic, Japanese or Chinese user was invited to
 *    type fell through to the "some other text" colour. The badge was
 *    decorative outside English.
 *
 * HOW THIS ONE WORKS.
 *
 * NEGATIVE IS TESTED FIRST, and that alone is what fixes "no-go": the text
 * is split into words, "no-go" yields ["no", "go"], and "no" is a negative
 * word. A mixed sentence — "no doubt, build it" — therefore resolves to the
 * negative. That is deliberate: showing a kill as a pursue is the expensive
 * direction, and a user who reads "kill" in green acts on it.
 *
 * MATCHING IS ON WHOLE WORDS, not substrings, for every language written
 * with spaces. The text is split on non-letter/non-digit runs — with
 * \p{L}\p{N}, because JavaScript's \w and \b are ASCII-only with or without
 * the u flag, so \bgo\b does not see word edges in Greek or Arabic at all.
 *
 * JAPANESE AND CHINESE ARE MATCHED AS SUBSTRINGS, because they are written
 * without spaces and splitting on non-letters would return the whole
 * sentence as one token. Their terms are long enough not to collide: 中止
 * is not a fragment of 推进.
 *
 * Everything is compared after foldForMatch, so "SÍ", "si", "Não", "nao",
 * "ΌΧΙ" and "όχι" are the same word.
 */
export type VerdictTone = "go" | "no" | "watch" | "unclear" | "none";

/**
 * The words each language's own placeholder suggests, plus the handful of
 * synonyms a person actually types instead. Folded at module load rather
 * than written folded, so the list stays readable and a contributor cannot
 * add an accented entry that could never match.
 *
 * Deliberately NOT a machine translation of the English list: the entries
 * are taken from messages/*.json's own ideas.verdictPlaceholder, which is
 * what the app tells the user to type. A gate reads those files and fails
 * if a placeholder word is missing here — see
 * scripts/tests/idea-verdict.test.mjs.
 */
const SPACED_TERMS: Record<Exclude<VerdictTone, "unclear" | "none">, string[]> = {
  no: [
    // en
    "kill", "no", "nope", "drop", "stop", "abandon", "reject", "shelve", "not", "never",
    // el
    "ακύρωση", "ακυρώνουμε", "άκυρο", "όχι", "σταματάμε", "απόρριψη", "δεν",
    // es
    "descartar", "descartado", "no", "cancelar", "parar", "rechazar",
    // fr
    "abandonner", "abandon", "non", "arrêter", "rejeter", "annuler",
    // de
    "verwerfen", "verworfen", "nein", "stoppen", "ablehnen", "abbrechen",
    // it
    "scartare", "scartato", "no", "fermare", "rifiutare", "annullare",
    // pt
    "descartar", "não", "parar", "rejeitar", "cancelar",
    // ar
    "الإلغاء", "إلغاء", "لا", "رفض", "إيقاف",
  ],
  go: [
    // en
    "pursue", "go", "build", "ship", "yes", "proceed", "do",
    // el
    "προχωράμε", "προχώρα", "προχωράω", "ναι", "ξεκινάμε", "φτιάχνουμε",
    // es
    "seguir", "adelante", "sí", "hacerlo", "proceder", "construir",
    // fr
    "poursuivre", "oui", "continuer", "avancer", "construire",
    // de
    "verfolgen", "ja", "weitermachen", "umsetzen", "starten", "bauen",
    // it
    "procedere", "sì", "avanti", "farlo", "costruire",
    // pt
    "seguir", "sim", "avançar", "prosseguir", "construir",
    // ar
    "المتابعة", "متابعة", "نعم", "نبدأ",
  ],
  watch: [
    // en
    "watch", "wait", "monitor", "later", "hold", "maybe",
    // el
    "παρακολούθηση", "παρακολουθούμε", "αναμονή", "περιμένουμε", "ίσως",
    // es
    "observar", "esperar", "vigilar", "quizás",
    // fr
    "surveiller", "attendre", "peut-être",
    // de
    "beobachten", "warten", "später", "vielleicht",
    // it
    "osservare", "aspettare", "forse",
    // pt
    "observar", "esperar", "talvez",
    // ar
    "المراقبة", "مراقبة", "انتظار", "ربما",
  ],
};

/** ja + zh — no spaces, so these are matched as substrings of the folded text. */
const UNSPACED_TERMS: Record<Exclude<VerdictTone, "unclear" | "none">, string[]> = {
  no: ["中止", "却下", "見送り", "やめる", "いいえ", "放弃", "否", "拒绝", "停止"],
  go: ["進める", "進行", "はい", "実行", "推进", "进行", "执行", "继续"],
  watch: ["様子見", "保留", "待つ", "观望", "等待"],
};

const FOLDED_SPACED = {
  no: new Set(SPACED_TERMS.no.map(foldForMatch)),
  go: new Set(SPACED_TERMS.go.map(foldForMatch)),
  watch: new Set(SPACED_TERMS.watch.map(foldForMatch)),
};
const FOLDED_UNSPACED = {
  no: UNSPACED_TERMS.no.map(foldForMatch),
  go: UNSPACED_TERMS.go.map(foldForMatch),
  watch: UNSPACED_TERMS.watch.map(foldForMatch),
};

const SPLIT_ON_NON_WORD = new RegExp(`${NOT_LETTER_OR_DIGIT}+`, "u");

export function classifyVerdict(verdict: string | null | undefined): VerdictTone {
  const raw = String(verdict ?? "").trim();
  if (!raw) return "none";
  const folded = foldForMatch(raw);
  const words = folded.split(SPLIT_ON_NON_WORD).filter(Boolean);

  // ORDER MATTERS AND IT IS THE FIX. "no-go" splits to ["no", "go"]; testing
  // the negative first is what stops the positive branch claiming it.
  for (const tone of ["no", "go", "watch"] as const) {
    if (words.some((w) => FOLDED_SPACED[tone].has(w))) return tone;
    if (FOLDED_UNSPACED[tone].some((term) => folded.includes(term))) return tone;
  }
  return "unclear";
}

/** The badge's classes, kept as the single place the tone becomes a colour. */
export function verdictBadgeClasses(verdict: string | null | undefined): string {
  switch (classifyVerdict(verdict)) {
    case "go":
      return "border-emerald-800 bg-emerald-950/30 text-emerald-400";
    case "no":
      return "border-red-900 bg-red-950/30 text-red-400";
    case "watch":
    case "unclear":
      return "border-orange-800 bg-orange-950/30 text-orange-400";
    default:
      return "border-border bg-input text-muted";
  }
}
