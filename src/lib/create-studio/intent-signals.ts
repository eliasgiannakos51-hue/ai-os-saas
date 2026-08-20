/**
 * Is this a QUESTION or an INSTRUCTION?
 *
 * THE REPORT: "τι ξέρεις για μένα" ("what do you know about me") was
 * filed as a Document. Not a bad guess by the model — it was never asked
 * the question. The classifier's tool schema offered exactly two kinds of
 * answer, a module slug or "none", so "this is a question" had nowhere to
 * go and the nearest module won.
 *
 * The model now has an `intent` field to say so (lib/create-studio/
 * route-entry.ts). This file is the layer in FRONT of it: a deterministic
 * read of the text that costs nothing and runs in the browser, so an
 * obvious question can be caught before a credit is spent rather than
 * after a Document exists.
 *
 * WHY BOTH. A model call is the better judge and the worse gate: it is
 * paid for, it is slow, and it is the thing being second-guessed. A
 * regex is the reverse. So the cheap layer only ever ASKS — it never
 * silently reroutes — and the model still decides.
 *
 * Client-safe (no "server-only"): the whole point is to run before the
 * request is sent.
 */

/** What the text looks like, before any model has seen it. */
export type TextIntent = "question" | "command" | "ambiguous";

/**
 * Interrogatives, per language, as WHOLE WORDS at the start of the text
 * or right after a leading politeness.
 *
 * Not a bag of substrings: "ti" is inside "action", "was" is inside
 * "washing", and Greek "τι" is inside "τιμή" (price) — a substring match
 * would call "τιμή 50 ευρώ" a question. Every entry is matched with a
 * boundary that works for its script, which \b does NOT for Greek, Arabic,
 * Japanese or Chinese (\b is defined on [A-Za-z0-9_] only — the exact trap
 * that produced the accent-search bug).
 */
const INTERROGATIVES: Record<string, string[]> = {
  en: ["what", "how", "how many", "how much", "who", "when", "why", "where", "which", "do you know", "do you remember", "can you tell me", "tell me about", "is there", "are there"],
  el: ["τι", "πώς", "πως", "πόσα", "πόσο", "πόσες", "πόσους", "ποιος", "ποια", "ποιο", "ποιοι", "πότε", "γιατί", "πού", "που είναι", "ξέρεις", "θυμάσαι", "μπορείς", "πες μου για"],
  de: ["was", "wie", "wie viele", "wie viel", "wer", "wann", "warum", "wo", "welche", "welcher", "weißt du", "erinnerst du", "kannst du", "erzähl mir von", "hast du"],
  es: ["qué", "que", "cómo", "cuántos", "cuánto", "cuántas", "quién", "cuándo", "por qué", "dónde", "cuál", "sabes", "recuerdas", "puedes", "háblame de"],
  fr: ["quoi", "que", "qu'est-ce", "comment", "combien", "qui", "quand", "pourquoi", "où", "quel", "quelle", "sais-tu", "te souviens-tu", "peux-tu", "parle-moi de"],
  it: ["cosa", "che cosa", "come", "quanti", "quanto", "quante", "chi", "quando", "perché", "dove", "quale", "sai", "ricordi", "puoi", "parlami di"],
  pt: ["o que", "que", "como", "quantos", "quanto", "quantas", "quem", "quando", "porquê", "por que", "onde", "qual", "sabes", "lembras", "podes", "fala-me de"],
  ar: ["ما", "ماذا", "كيف", "كم", "من", "متى", "لماذا", "أين", "أي", "هل", "هل تعرف", "هل تتذكر", "أخبرني عن"],
  ja: ["何", "なに", "なん", "どう", "どの", "どれ", "いくつ", "いくら", "誰", "いつ", "なぜ", "どこ", "教えて", "知ってる", "覚えて"],
  zh: ["什么", "什麼", "怎么", "怎樣", "多少", "谁", "誰", "什么时候", "何时", "为什么", "為什麼", "哪里", "哪裡", "哪个", "哪個", "知道吗", "记得吗", "告诉我"],
};

/**
 * Imperatives — the shape of an instruction.
 *
 * Deliberately narrower than the interrogatives: a false "this is a
 * command" is worse than a false "this is a question", because the
 * question path only ASKS while the command path CREATES something.
 */
const IMPERATIVES: Record<string, string[]> = {
  en: ["make", "build", "create", "write", "draft", "log", "record", "add", "note", "save", "track", "generate", "set up", "put"],
  el: ["φτιάξε", "χτίσε", "δημιούργησε", "γράψε", "κάνε", "κατέγραψε", "καταχώρησε", "πρόσθεσε", "σημείωσε", "αποθήκευσε", "βάλε", "ετοίμασε"],
  de: ["mach", "mache", "erstelle", "baue", "schreibe", "notiere", "füge", "speichere", "lege an", "erfasse"],
  es: ["haz", "crea", "construye", "escribe", "anota", "registra", "añade", "guarda", "genera"],
  fr: ["fais", "crée", "construis", "écris", "note", "enregistre", "ajoute", "sauvegarde", "génère"],
  it: ["fai", "crea", "costruisci", "scrivi", "annota", "registra", "aggiungi", "salva", "genera"],
  pt: ["faz", "faça", "cria", "constrói", "escreve", "anota", "regista", "adiciona", "guarda", "gera"],
  ar: ["أنشئ", "اصنع", "اكتب", "سجل", "أضف", "احفظ", "ولّد", "جهز"],
  ja: ["作って", "作成", "書いて", "記録", "追加", "保存", "生成", "登録"],
  zh: ["做", "创建", "創建", "建立", "写", "寫", "记录", "記錄", "添加", "保存", "生成", "登记", "登記"],
};

/** Question marks, including the ones that are not "?" */
const QUESTION_MARKS = /[?？;؟]\s*$/;

/**
 * Does `phrase` appear in `text` as a WORD, not as a substring?
 *
 * ANYWHERE IN THE TEXT, not only at the start — which the first version
 * of this got wrong and the cross-product test caught: German puts the
 * interrogative first but the verb last ("kannst du mir etwas über meine
 * Konkurrenten sagen"), and Japanese puts it in the middle outright
 * ("先週は何をしましたか" — "what did I do last week"). A start-anchored
 * matcher reads both as statements.
 *
 * The boundary is the part that has to be right per script. For
 * Latin/Greek/Cyrillic, the neighbouring characters must not be letters —
 * "τι " is a question, "τιμή" is a price, and \b would not know the
 * difference because it is defined on [A-Za-z0-9_] only. For scripts
 * written without spaces (Han, Hiragana, Katakana) there is no such
 * boundary to test, so containment is the whole test.
 */
const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function containsWord(text: string, phrase: string): boolean {
  if (NO_SPACE_SCRIPT.test(phrase)) return text.includes(phrase);
  let from = 0;
  for (;;) {
    const at = text.indexOf(phrase, from);
    if (at === -1) return false;
    const before = at === 0 ? "" : text[at - 1];
    const after = text.slice(at + phrase.length, at + phrase.length + 1);
    const boundedLeft = before === "" || !/\p{L}/u.test(before);
    const boundedRight = after === "" || !/\p{L}/u.test(after);
    if (boundedLeft && boundedRight) return true;
    from = at + 1;
  }
}

/** The same test, but only at the very start — what an IMPERATIVE has to
 *  satisfy. "add" mid-sentence ("the price will add up") is not an
 *  instruction; "add a competitor" is. */
function startsWithWord(text: string, phrase: string): boolean {
  if (!text.startsWith(phrase)) return false;
  const rest = text.slice(phrase.length);
  if (rest.length === 0) return true;
  if (!/^\p{L}/u.test(rest)) return true;
  return NO_SPACE_SCRIPT.test(phrase);
}

/** Leading politeness and filler that sits in front of the real opener. */
const LEADING_NOISE = /^(?:please|bitte|por favor|s'il te plaît|per favore|σε παρακαλώ|παρακαλώ|من فضلك|お願い|请|請|hey|hi|γεια|ok|okay)[\s,،]+/iu;

function normalise(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase()
    .replace(LEADING_NOISE, "")
    .trim();
}

/** Every language's lists, so a Greek question typed while the UI is in
 *  English is still a question. The user's own locale is checked first
 *  only for tie-breaking, never as a filter. */
function allPhrases(map: Record<string, string[]>, locale: string): string[] {
  const own = map[locale] ?? [];
  const rest = Object.entries(map)
    .filter(([key]) => key !== locale)
    .flatMap(([, list]) => list);
  // Longest first: "how many" must win over "how".
  return [...own, ...rest].sort((a, b) => b.length - a.length);
}

/**
 * What the text looks like. Never a guess dressed as a fact:
 * "ambiguous" is a real answer and the caller must handle it.
 */
export function classifyTextIntent(raw: string, locale = "en"): TextIntent {
  const text = normalise(raw);
  if (!text) return "ambiguous";

  const hasQuestionWord = allPhrases(INTERROGATIVES, locale).some((p) => containsWord(text, p));
  const opensWithCommand = allPhrases(IMPERATIVES, locale).some((p) => startsWithWord(text, p));
  const endsWithMark = QUESTION_MARKS.test(raw.trim());

  // An imperative opener is the strongest signal there is, and it beats a
  // trailing question mark: "φτιάξε μου ένα site;" is still an
  // instruction, asked politely.
  if (opensWithCommand) return "command";
  if (hasQuestionWord) return "question";
  if (endsWithMark) return "question";
  // Neither shape. Most real entries land here ("Coffee shop in Athens,
  // €40k revenue") and they are exactly what Create Anything is for — so
  // silence means "carry on", not "interrogate the user".
  return "command";
}

/** True when the app should ASK before creating anything. Kept separate
 *  from the classifier so the threshold for interrupting somebody is one
 *  decision in one place. */
export function shouldAskBeforeCreating(raw: string, locale = "en"): boolean {
  return classifyTextIntent(raw, locale) === "question";
}
