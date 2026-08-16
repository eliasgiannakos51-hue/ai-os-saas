import type { HelpArticle } from "@/lib/support/help-fallback";

// Matching a typed question to a help article, without a model call.
//
// A large share of support traffic is the same handful of questions with
// stable answers: what does it cost, how do I cancel, what are credits.
// Every one of those used to cost a full Claude call to reproduce a
// sentence that had not changed in months.
//
// WHAT CHANGED, AND WHY THIS FILE IS NOT knowledge-base.ts ANY MORE
//
// The articles used to be a Greek array in the code, and the matcher was
// allowed to run only for Greek readers — because an English trigger like
// "pricing" scored 0.975 against a 0.85 threshold and handed a Greek
// paragraph to anyone who typed one English word. Locking it to Greek
// stopped the harm; it did not give anyone else an answer.
//
// Now the articles come from help_articles, one row per (slug, locale),
// with the triggers a person types in THAT language. The matcher is a pure
// function over whatever list it is handed, and the caller hands it the
// reader's own language only — see loadHelpArticlesForLocaleOnly(). A
// French reader can be matched against French triggers and get a French
// answer; where French has no article, nothing matches and the model
// answers, in French.

/**
 * Case, accents and punctuation removed, so «Πόσο» matches "ποσο" and
 * "كَيْفَ" matches "كيف".
 *
 * THE MARK RANGE MATTERS MORE THAN IT LOOKS. This used to strip only
 * U+0300–U+036F, the combining marks that Latin and Greek decompose into.
 * Arabic harakat are U+064B–U+0652 and are NOT in that range, so they
 * survived the strip, were then caught by the punctuation rule, and were
 * replaced with SPACES: "كَيْفَ" came out as "ك ي ف", three separate letters.
 * Every Arabic message was shredded into single characters and could match
 * nothing at all. \p{M} covers every mark in every script, which is what
 * this was always trying to say.
 *
 * Greek final sigma is folded to σ as well: "ΠΩΣ" lowercases to "πως" but
 * a user typing "τιμες" and a trigger holding "τιμές" would otherwise
 * differ only in a letter that is the same letter.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ς/g, "σ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Languages whose writing has no spaces between words.
 *
 * Everywhere else a marker is matched as a whole word, because "μου" is a
 * possessive and "μουσική" is music — a substring test treats a question
 * about music as a question about the reader's own account. In Chinese and
 * Japanese there are no spaces to bound anything, so the markers there are
 * chosen to be safe as substrings.
 */
const NO_WORD_SPACES = new Set(["zh", "ja"]);

/**
 * Questions that LOOK like FAQs but are about ONE account.
 *
 * "How many credits does a website cost" is a product question with one
 * true answer. "How many credits do I have left" is nearly the same words
 * plus a first person, and answering it from a fixed string would be a lie.
 *
 * This used to exist in English and Greek only. Every other language went
 * unguarded: "combien de crédits me reste-t-il" carried no marker this
 * file knew, so a French reader asking about their own balance could be
 * handed the generic article about what credits are.
 */
const ACCOUNT_MARKERS: Record<string, { words: string[]; phrases: string[] }> = {
  en: {
    words: ["my", "me", "mine"],
    phrases: ["i have", "i am", "i was", "i bought", "i paid", "i got charged"],
  },
  el: {
    words: [
      "μου", "μας", "εχω", "ειμαι", "εγω", "εμενα",
      "χρεωθηκα", "πληρωσα", "αγορασα", "εφτιαξα", "εκανα",
    ],
    phrases: ["δικο μου", "δικα μου"],
  },
  es: {
    words: ["mi", "mis", "mio", "mia", "tengo", "soy", "estoy", "compre", "pague"],
    phrases: ["mi cuenta", "me queda", "me quedan", "me cobraron"],
  },
  fr: {
    words: ["mon", "ma", "mes", "moi", "mien"],
    phrases: ["j ai", "je suis", "mon compte", "il me reste", "on m a facture"],
  },
  de: {
    // NOT a bare "ich". German uses it in both kinds of question:
    //   "wie viele Credits habe ICH noch"   — about this account
    //   "wie erstelle ICH eine Website"     — about the product
    // What separates them is the VERB it attaches to, so the inverted
    // forms are listed as phrases. "ich habe" alone was not enough either:
    // German inverts after a question word, so the most natural way to ask
    // about one's own balance never contains it.
    words: ["mein", "meine", "meinen", "meiner", "meinem", "mir", "mich"],
    phrases: [
      "ich habe", "habe ich", "hab ich",
      "ich bin", "bin ich",
      "mein konto", "mir wurde", "wurde ich", "wurde mir",
    ],
  },
  it: {
    words: ["mio", "mia", "miei", "mie", "ho", "sono"],
    phrases: ["il mio account", "mi restano", "mi hanno addebitato"],
  },
  pt: {
    words: ["meu", "minha", "meus", "minhas", "tenho", "sou", "estou"],
    phrases: ["minha conta", "me cobraram", "me restam"],
  },
  zh: {
    words: [],
    phrases: ["我", "我的", "我账户", "我的账户", "我的额度"],
  },
  ja: {
    words: [],
    phrases: ["私", "僕", "自分", "私の", "マイアカウント"],
  },
  ar: {
    words: ["لي", "انا"],
    phrases: ["عندي", "حسابي", "رصيدي", "اشتريت", "دفعت"],
  },
};

export function isAccountSpecific(message: string, locale: string): boolean {
  const n = normalize(message);
  if (!n) return false;

  const sets = [ACCOUNT_MARKERS[locale], ACCOUNT_MARKERS.en].filter(Boolean);
  const padded = ` ${n} `;

  for (const set of sets) {
    for (const phrase of set.phrases) {
      if (n.includes(normalize(phrase))) return true;
    }
    if (NO_WORD_SPACES.has(locale)) continue;
    for (const word of set.words) {
      // Space-padded rather than \b: JavaScript's word boundary is ASCII
      // only and never matches after a Greek, Arabic or Cyrillic letter.
      // This repo has been bitten by that three times.
      if (padded.includes(` ${normalize(word)} `)) return true;
    }
  }
  return false;
}

export type CannedMatch = {
  article: HelpArticle;
  confidence: number;
};

export const CONFIDENCE_THRESHOLD = 0.85;

/**
 * Best canned answer for a message, or null to fall through to the model.
 *
 * The caller supplies the candidate articles, and is responsible for them
 * being in the reader's own language. This function does not know about
 * locales and cannot leak one into another — the only way a French reader
 * sees an English answer here is if someone hands this function English
 * articles, which loadHelpArticlesForLocaleOnly() will not do.
 *
 * Scoring is deliberately conservative. A trigger only counts when it
 * appears as a whole phrase, and confidence is scaled by how much of the
 * message the trigger accounts for — so "πόσο κοστίζει;" scores high while
 * a 300-word message that happens to contain "τιμή" somewhere does not.
 * Anything under the threshold goes to the model, because a wrong canned
 * answer is far more expensive than the call it saved.
 */
export function matchHelpArticle(
  message: string,
  articles: HelpArticle[],
  locale: string,
  threshold: number = CONFIDENCE_THRESHOLD
): CannedMatch | null {
  const n = normalize(message);
  if (!n) return null;
  // A long message is a conversation, not a lookup.
  if (n.split(" ").length > 40) return null;
  if (isAccountSpecific(message, locale)) return null;

  let best: CannedMatch | null = null;

  for (const article of articles) {
    for (const trigger of article.triggers) {
      const t = normalize(trigger);
      if (!t || !n.includes(t)) continue;

      // How much of what the user wrote is this trigger? A short question
      // that IS the trigger scores 1; a long one scores proportionally
      // less. Multi-word triggers get a bonus: "πως ακυρωνω" is a much
      // stronger signal than "τιμη".
      //
      // Chinese and Japanese have no spaces, so split(" ").length is
      // always 1 and every trigger would score as the weakest kind.
      // Length stands in for word count there: a four-character Japanese
      // trigger is as specific as a two-word European one.
      const words = NO_WORD_SPACES.has(locale)
        ? Math.max(1, Math.round(t.length / 2))
        : t.split(" ").length;
      const coverage = t.length / n.length;
      const specificity = Math.min(1, words / 2);
      const confidence = Math.min(1, coverage * 0.75 + specificity * 0.45);

      if (!best || confidence > best.confidence) {
        best = { article, confidence: Number(confidence.toFixed(4)) };
      }
    }
  }

  return best && best.confidence >= threshold ? best : null;
}
