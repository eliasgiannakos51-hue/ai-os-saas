/**
 * THE ONE SENTENCE, AND THE THREE PLACES IT MUST APPEAR.
 *
 * Seven people used the product and gave SIX different answers to "what
 * does it do". That is not a memory problem: the three screens that could
 * have told them said three different things.
 *
 *   landing.hero          "Your business, organized — with AI that
 *                          actually helps."
 *   overview greeting     "Good evening, Elias 👋" — the line above the
 *                          largest heading in the product, spent on the
 *                          time of day
 *   onboarding step 1     nothing; it opened by asking what their goal is
 *
 * A person who reads all three has been told three things. A person who
 * reads one has been told the wrong one. So there is one key now, and
 * these are the files that must render it — checked by
 * scripts/tests/one-sentence.test.mjs rather than remembered.
 *
 * WHAT THE SENTENCE HAD TO SAY, from the same feedback. Five of the seven
 * said they would cancel ChatGPT, and the reason they gave was not that
 * this builds things — ChatGPT builds things. It was that it already
 * knows their own data. That is the claim, so that is the sentence.
 *
 * CHANGING IT is one string in messages/*.json under `promise`. Nothing
 * else needs touching, which is the point of it being one key.
 */
export const ONE_SENTENCE_KEY = "promise.oneSentence";

/**
 * Every file that must render it, and where a reader meets it.
 *
 * Kept as data so the gate reads the same list a person would, and so
 * adding a fourth surface is one line here plus a failing test until it
 * is wired.
 */
export const ONE_SENTENCE_SURFACES: readonly { file: string; when: string }[] = [
  { file: "src/app/page.tsx", when: "the landing page, before anyone has an account" },
  {
    file: "src/components/overview/greeting-header.tsx",
    when: "the first line after signing in, where the greeting used to be",
  },
  {
    file: "src/components/onboarding/onboarding-flow.tsx",
    when: "the first step of onboarding, above the first question",
  },
];
