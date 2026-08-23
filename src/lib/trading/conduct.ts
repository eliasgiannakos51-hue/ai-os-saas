import { foldForMatch } from "@/lib/text/unicode-patterns";

/**
 * RULES 3, 4 AND 5: NO ADVICE, NO PREDICTION, ALWAYS THE DISCLAIMER.
 *
 * ============================================================
 * WHY THIS IS NOT JUST A LINE IN A PROMPT
 * ============================================================
 *
 * A system prompt saying "never give investment advice" is a request. It
 * holds most of the time, which is the problem: the failure is rare,
 * silent, and lands on the one user who acts on it. This product tells
 * people about their own money, and the difference between
 *
 *     "you broke your own 2% rule eight times in March"     — a mirror
 *     "EURUSD looks oversold, consider a long"              — advice
 *
 * is not a matter of tone. The first is arithmetic over data the user
 * gave us. The second is a regulated activity we are not licensed for,
 * and it is what a model produces by default when handed a trading
 * journal, because that is what the internet's trading text looks like.
 *
 * So there are three layers, and the prompt is only the first:
 *
 *   1. THE PROMPT constrains the model (TRADING_CONDUCT_* below).
 *   2. THE OUTPUT IS SCANNED before it reaches a user (containsAdvice).
 *      A response that recommends or predicts is REPLACED, not edited —
 *      editing an advisory sentence leaves the advice and removes the
 *      evidence.
 *   3. THE FEATURE HAS NO SHAPE FOR IT. Nothing in the schema stores a
 *      recommendation, no statistic is forward-looking, and the guardian
 *      only ever compares a trade against a rule the user wrote.
 *
 * Pure: no AI import, no network. The build gate reads it.
 */

export const TRADING_DISCLAIMER_KEY = "dashboard.trading.disclaimer";

/**
 * Appended to every trading-related model call.
 *
 * IN BOTH LANGUAGES because the model answers in the user's language, and
 * a constraint the model has read in English does not reliably survive
 * being asked to answer in Greek.
 */
export const TRADING_CONDUCT_EN = `
ABSOLUTE LIMITS ON WHAT YOU MAY SAY ABOUT TRADING.

You are looking at a record of trades this person has ALREADY made, and
rules THEY wrote for themselves. You may describe what is in that record
and whether it matches their own rules. That is all.

You must NEVER:
- recommend buying, selling, holding, entering or exiting anything;
- say what any market, instrument or price will do, in any timeframe;
- describe anything as cheap, expensive, oversold, overbought, bullish,
  bearish, a good entry, or a setup;
- suggest a position size, a stop, a target or a strategy to use next;
- tell them to trade more, trade less, or stop trading.

You MAY:
- state what their trades did, using their own numbers;
- state which of their own rules a trade did not match;
- point out a pattern in their record ("trades opened after a loss won
  less often") without saying what causes it or what to do about it.

If asked for a view on a market or an instrument, say plainly that you do
not give trading advice or forecasts, and offer to look at their own
record instead. Do not soften this into a hedged opinion.
`.trim();

export const TRADING_CONDUCT_EL = `
ΑΠΟΛΥΤΑ ΟΡΙΑ ΓΙΑ ΟΣΑ ΜΠΟΡΕΙΣ ΝΑ ΠΕΙΣ ΓΙΑ ΤΟ TRADING.

Βλέπεις το ιστορικό συναλλαγών που αυτό το άτομο ΗΔΗ έκανε, και κανόνες
που ΤΟ ΙΔΙΟ έγραψε για τον εαυτό του. Μπορείς να περιγράψεις τι υπάρχει
σε αυτό το ιστορικό και αν ταιριάζει με τους δικούς του κανόνες. Τίποτα
άλλο.

ΠΟΤΕ δεν επιτρέπεται να:
- προτείνεις αγορά, πώληση, διακράτηση, είσοδο ή έξοδο σε οτιδήποτε·
- πεις τι θα κάνει οποιαδήποτε αγορά, εργαλείο ή τιμή, σε οποιονδήποτε
  ορίζοντα·
- χαρακτηρίσεις κάτι φθηνό, ακριβό, oversold, overbought, ανοδικό,
  καθοδικό, καλή είσοδο ή setup·
- προτείνεις μέγεθος θέσης, stop, target ή στρατηγική για τη συνέχεια·
- πεις να κάνει περισσότερα ή λιγότερα trades, ή να σταματήσει.

ΜΠΟΡΕΙΣ να:
- πεις τι έκαναν οι συναλλαγές του, με τους δικούς του αριθμούς·
- πεις ποιον από τους δικούς του κανόνες δεν τήρησε μια συναλλαγή·
- επισημάνεις μοτίβο στο ιστορικό του («οι συναλλαγές μετά από ζημιά
  κέρδισαν λιγότερο συχνά») χωρίς να πεις τι το προκαλεί ή τι να κάνει.

Αν σου ζητηθεί άποψη για μια αγορά ή ένα εργαλείο, πες καθαρά ότι δεν
δίνεις επενδυτικές συμβουλές ούτε προβλέψεις, και πρόσφερε να κοιτάξεις
το δικό του ιστορικό. Μην το μετατρέψεις σε επιφυλακτική άποψη.
`.trim();

export type ConductBreach = "recommendation" | "prediction" | "valuation";

/**
 * Patterns that mean the model gave advice or a forecast.
 *
 * DELIBERATELY BLUNT. This runs on generated prose, and the cost of a
 * false positive is one regenerated paragraph; the cost of a false
 * negative is a person acting on a machine's trading tip. The list is
 * bilingual for the reason the prompts above are.
 *
 * IT DOES NOT MATCH THE WORD "buy" ON ITS OWN. "You bought EURUSD twice
 * in March" is a description of the record and must survive — a filter
 * that eats the journal's own vocabulary makes the feature unusable and
 * gets switched off, which is worse than no filter.
 */
/**
 * EVERY PATTERN BELOW IS RUN AGAINST FOLDED TEXT, and every Greek literal
 * is written in folded form.
 *
 * TWO SEPARATE BUGS LIVED HERE, both silent, both Greek-only:
 *
 *   \b IS ASCII. JavaScript's word boundary is defined against
 *   [A-Za-z0-9_], so \bπροτείνω\b never matches — not even with the `u`
 *   flag, because it is the BOUNDARY that is ASCII, not the pattern.
 *   Every Greek pattern was written with boundaries and every one of them
 *   matched nothing.
 *
 *   ACCENTS AND CAPITALS. Greek is routinely typed in capitals and
 *   without accents. "ΠΡΟΤΕΙΝΩ" lower-cases to "προτεινω", which is not
 *   the string "προτείνω" a pattern would naturally be written as — and
 *   "Η πρόβλεψή μου" carries a second accent the nominative does not,
 *   because the enclitic shifts it. foldForMatch strips case, diacritics
 *   and the final sigma, so all of those converge.
 *
 * NOTE THE FINAL SIGMA. Folded Greek ends in σ, never ς — the fold maps
 * the positional variant away, so a pattern written "αγορασεις" cannot
 * match folded text that reads "αγορασεισ". It looks like a typo and it
 * is the correct spelling for this file; isFolded() in the test suite is
 * what stops somebody helpfully correcting it back.
 *
 * Both were found by scripts/tests/trading-journal.test.mjs, which tests
 * this filter in both languages — because a safety filter that works in
 * one language is not a safety filter, and this product's first language
 * is the one it was failing in.
 */
const RECOMMENDATION = [
  /\b(?:you\s+should|i\s+(?:would|d)\s+(?:recommend|suggest|advise)|i\s+recommend|i\s+suggest|i\s+advise)\b/i,
  /\b(?:consider|try)\s+(?:buying|selling|shorting|longing|going\s+long|going\s+short)\b/i,
  /\b(?:it(?:'s| is)\s+(?:a\s+)?(?:good|great|ideal)\s+(?:time|entry|opportunity)\s+to)\b/i,
  /\b(?:my\s+)?(?:recommendation|advice)\s*(?:is|:)/i,
  /θα\s+(?:σου\s+)?(?:προτεινα|συστηνα|συνιστουσα)/i,
  /(?:σου\s+)?(?:προτεινω|συνιστω)/i,
  /(?:πρεπει|καλο\s+θα\s+ηταν)\s+να\s+(?:αγορασεισ|πουλησεισ|μπεισ|βγεισ|κλεισεισ|ανοιξεισ)/i,
];

const PREDICTION = [
  /\b(?:will|is\s+going\s+to|is\s+likely\s+to|expect(?:ed)?\s+to)\s+(?:rise|fall|drop|climb|rally|crash|reverse|break(?:\s+out)?|go\s+(?:up|down))\b/i,
  /\b(?:price\s+target|forecast|prediction)\b/i,
  /θα\s+(?:ανεβει|πεσει|υποχωρησει|εκτιναχθει|διορθωσει|σπασει)/i,
  // STEMS, NOT WHOLE WORDS, and Greek is why. "Η πρόβλεψή μου" carries a
  // second accent the nominative "πρόβλεψη" does not — the enclitic
  // shifts it — so matching the full word misses the most natural way
  // anybody would write it. The stem "πρόβλεψ" covers πρόβλεψη,
  // πρόβλεψή and προβλέψεις alike.
  /προβλεψ|προβλεπω|αναμενεται\s+να\s+(?:ανεβει|πεσει)/i,
];

const VALUATION = [
  /\b(?:oversold|overbought|undervalued|overvalued|bullish|bearish)\b/i,
  /\b(?:good|great|strong|weak|poor)\s+(?:entry|setup|opportunity|trade\s+idea)\b/i,
  /(?:υπερπουλημεν|υπεραγορασμεν|υποτιμημεν|υπερτιμημεν)/i,
  /(?:ανοδικ|καθοδικ)η\s+ταση\s+(?:θα|αναμεν)/i,
];

/**
 * Scans generated text. Returns every breach found, not just the first —
 * a paragraph that predicts AND recommends needs both recorded, because
 * a prompt fix that removes one and not the other must not look like a
 * fix.
 */
export function findConductBreaches(text: string): ConductBreach[] {
  if (typeof text !== "string" || !text) return [];
  // FOLDED ONCE, then every pattern runs against the folded form. See the
  // note above the pattern lists for the two bugs this fixes.
  const folded = foldForMatch(text);
  const breaches: ConductBreach[] = [];
  if (RECOMMENDATION.some((p) => p.test(folded))) breaches.push("recommendation");
  if (PREDICTION.some((p) => p.test(folded))) breaches.push("prediction");
  if (VALUATION.some((p) => p.test(folded))) breaches.push("valuation");
  return breaches;
}

export function containsAdvice(text: string): boolean {
  return findConductBreaches(text).length > 0;
}

/**
 * What the user sees instead when a breach is found.
 *
 * REPLACED, NOT REDACTED. Blanking the offending sentence leaves the rest
 * of a paragraph that was written to lead up to it, and the reader fills
 * the gap themselves. The whole answer goes, and the refusal says why —
 * which is also the only way the user learns the product does not do this,
 * rather than assuming it failed.
 */
export const CONDUCT_REFUSAL_KEY = "dashboard.trading.adviceRefused";
